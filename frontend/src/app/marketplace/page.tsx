"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Agent, Rarity } from "@/types";
import { getRarityColor } from "@/lib/utils";
import dynamic from "next/dynamic";
import AgentCard from "@/components/cards/AgentCard";

const AgentCardDetail = dynamic(() => import("@/components/cards/AgentCardDetail"), {
  ssr: false,
});
import { getListings, getUser, listAgent, cancelListing, buyAgent, getMarketplaceStats, getTradeHistory, type TradeHistoryRow } from "@/lib/api";
import { mapUserAgentsFull, mapDbAgent, MappedUserAgent, DbUserAgent, DbAgent } from "@/lib/mapAgent";
import { sendCupMarketplacePayment, connection } from "@/lib/solana";

/* Pending buy stored in ref so it survives re-renders but not page reloads */
interface PendingBuy {
  listingId: string;
  txSignature: string;
}

interface ListingRow {
  id: string;
  seller_wallet: string;
  price_cup: number;
  listing_type: string;
  created_at: string;
  expires_at: string;
  user_agent_id: string;
  user_agents?: {
    agents?: Agent;
  };
}

const SORT_OPTIONS = [
  { value: "price-asc", label: "Price: Low-High" },
  { value: "price-desc", label: "Price: High-Low" },
  { value: "rating-desc", label: "Rating: High-Low" },
  { value: "recent", label: "Recent" },
];

type Tab = "browse" | "sell" | "history";

export default function MarketplacePage() {
  const { publicKey, signTransaction } = useWallet();

  // Tab
  const [tab, setTab] = useState<Tab>("browse");

  // Browse state
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [posFilter, setPosFilter] = useState("ALL");
  const [rarityFilter, setRarityFilter] = useState("ALL");
  const [sort, setSort] = useState("recent");
  const [search, setSearch] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const pendingBuy = useRef<PendingBuy | null>(null);

  // Stats
  const [stats, setStats] = useState({ activeListings: 0, totalTrades: 0, totalVolume: 0, floorPrice: 0 });

  // History
  const [history, setHistory] = useState<TradeHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Sell state
  const [myAgents, setMyAgents] = useState<MappedUserAgent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [listingPrices, setListingPrices] = useState<Record<string, string>>({});
  const [listingInProgress, setListingInProgress] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [sellError, setSellError] = useState<string | null>(null);
  const [sellSuccess, setSellSuccess] = useState<string | null>(null);

  // Fetch listings — map nested DB agent to frontend Agent (with avatarSvg)
  const fetchListings = useCallback(() => {
    setLoading(true);
    getListings()
      .then((data) => {
        const rows = (data as ListingRow[]).map((l) => {
          if (l.user_agents?.agents && !(l.user_agents.agents as Agent).avatarSvg) {
            return {
              ...l,
              user_agents: {
                ...l.user_agents,
                agents: mapDbAgent(l.user_agents.agents as unknown as DbAgent),
              },
            };
          }
          return l;
        });
        setListings(rows);
      })
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchListings(); }, [fetchListings]);

  // Fetch stats
  useEffect(() => {
    getMarketplaceStats()
      .then(setStats)
      .catch(() => {});
  }, [listings]);

  // Fetch history when history tab is selected
  const fetchHistory = useCallback(() => {
    setHistoryLoading(true);
    getTradeHistory(30)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    if (tab === "history") fetchHistory();
  }, [tab, fetchHistory]);

  // Fetch user agents for sell tab
  const fetchMyAgents = useCallback(() => {
    if (!publicKey) { setMyAgents([]); return; }
    setLoadingAgents(true);
    getUser(publicKey.toBase58())
      .then((data: unknown) => {
        const userData = data as { agents?: DbUserAgent[] };
        setMyAgents(mapUserAgentsFull(userData.agents || []));
      })
      .catch(() => setMyAgents([]))
      .finally(() => setLoadingAgents(false));
  }, [publicKey]);

  useEffect(() => {
    if (tab === "sell") fetchMyAgents();
  }, [tab, fetchMyAgents]);

  // Browse filters
  const filtered = useMemo(() => {
    let items = [...listings].filter((l) => l.user_agents?.agents);
    if (posFilter !== "ALL") items = items.filter((l) => l.user_agents?.agents?.position === posFilter);
    if (rarityFilter !== "ALL") items = items.filter((l) => l.user_agents?.agents?.rarity === rarityFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((l) => l.user_agents?.agents?.name?.toLowerCase().includes(q));
    }
    switch (sort) {
      case "price-asc": items.sort((a, b) => Number(a.price_cup) - Number(b.price_cup)); break;
      case "price-desc": items.sort((a, b) => Number(b.price_cup) - Number(a.price_cup)); break;
      case "rating-desc": items.sort((a, b) => (b.user_agents?.agents?.overall || 0) - (a.user_agents?.agents?.overall || 0)); break;
      default: break;
    }
    return items;
  }, [listings, posFilter, rarityFilter, sort, search]);

  // My listings (active listings I own)
  const myListings = useMemo(() => {
    if (!publicKey) return [];
    const wallet = publicKey.toBase58();
    return listings.filter(l => l.seller_wallet === wallet && l.user_agents?.agents);
  }, [listings, publicKey]);

  // Agents available to list (not already listed)
  const unlistedAgents = useMemo(() => {
    return myAgents.filter(ua => !ua.isListed && ua.agent.position !== "MGR");
  }, [myAgents]);

  // List agent for sale
  async function handleList(userAgentId: string) {
    if (!publicKey) return;
    const price = Math.floor(parseFloat(listingPrices[userAgentId] || "0"));
    if (!price || price <= 0) {
      setSellError("Enter a valid price in $CUP (whole tokens)");
      return;
    }
    setSellError(null);
    setSellSuccess(null);
    setListingInProgress(userAgentId);
    try {
      await listAgent({
        walletAddress: publicKey.toBase58(),
        userAgentId,
        priceCup: price,
      });
      setSellSuccess("Agent listed successfully!");
      setListingPrices(prev => { const n = { ...prev }; delete n[userAgentId]; return n; });
      fetchListings();
      fetchMyAgents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to list agent";
      setSellError(msg);
    } finally {
      setListingInProgress(null);
    }
  }

  // Cancel listing
  async function handleCancel(listingId: string) {
    if (!publicKey) return;
    setCancellingId(listingId);
    setSellError(null);
    try {
      await cancelListing(listingId, publicKey.toBase58());
      setSellSuccess("Listing cancelled!");
      fetchListings();
      fetchMyAgents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel";
      setSellError(msg);
    } finally {
      setCancellingId(null);
    }
  }

  // Claim a pending buy (retry backend call only — $CUP already sent)
  async function claimPendingBuy(pending: PendingBuy) {
    if (!publicKey) return;
    setBuyingId(pending.listingId);
    setBuyError(null);
    try {
      await buyAgent({
        buyerWallet: publicKey.toBase58(),
        listingId: pending.listingId,
        txSignature: pending.txSignature,
      });
      pendingBuy.current = null;
      setBuyError(null);
      fetchListings();
      if (tab === "sell") fetchMyAgents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Claim failed";
      setBuyError(`Backend error: ${msg}. Your payment is safe — click BUY again to retry.`);
    } finally {
      setBuyingId(null);
    }
  }

  // Buy agent with retry-safe flow (paid in $CUP)
  async function handleBuy(listing: ListingRow) {
    if (!publicKey || !signTransaction) return;
    const agent = listing.user_agents?.agents;
    if (!agent) return;

    // If there's a pending buy for this listing, retry the backend call only
    if (pendingBuy.current && pendingBuy.current.listingId === listing.id) {
      await claimPendingBuy(pendingBuy.current);
      return;
    }

    setBuyingId(listing.id);
    setBuyError(null);
    try {
      // Step 1: Send $CUP payment (buyer → seller + treasury fee)
      const sellerPubkey = new PublicKey(listing.seller_wallet);
      const signature = await sendCupMarketplacePayment(
        connection,
        publicKey,
        sellerPubkey,
        signTransaction,
        Number(listing.price_cup)
      );

      // Step 2: Store pending buy IMMEDIATELY after tx is sent
      pendingBuy.current = { listingId: listing.id, txSignature: signature };

      // Step 3: Notify backend to transfer ownership
      await buyAgent({
        buyerWallet: publicKey.toBase58(),
        listingId: listing.id,
        txSignature: signature,
      });

      // Success — clear pending
      pendingBuy.current = null;
      setBuyError(null);
      fetchListings();
      if (tab === "sell") fetchMyAgents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Purchase failed";
      if (pendingBuy.current) {
        // $CUP was sent but backend call failed — show retry message
        setBuyError(`Payment sent but transfer failed: ${msg}. Click BUY again to claim your agent.`);
      } else {
        // TX itself failed (user rejected, insufficient balance, etc.)
        setBuyError(msg);
      }
    } finally {
      setBuyingId(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="font-pixel text-sm sm:text-base text-white tracking-wider" style={{ textShadow: "3px 3px 0 #0B6623" }}>
            MARKETPLACE
          </h1>
          <p className="font-pixel text-[7px] text-white/40 mt-2 tracking-wider">
            {tab === "browse" ? `${filtered.length} LISTINGS` : tab === "history" ? "RECENT TRADES" : "SELL YOUR AGENTS"}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(["browse", "sell", "history"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="font-pixel text-[8px] px-5 py-2 tracking-wider transition-colors"
              style={{
                background: tab === t ? "#1E8F4E" : "#111",
                color: tab === t ? "#000" : "#ffffff",
                border: `2px solid ${tab === t ? "#1E8F4E" : "#333"}`,
                boxShadow: tab === t
                  ? "inset -2px -2px 0 #0B6623, inset 2px 2px 0 #2eb060"
                  : "inset -2px -2px 0 #222, inset 2px 2px 0 #444",
              }}
            >
              {t === "browse" ? "BROWSE" : t === "sell" ? "SELL" : "HISTORY"}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="pixel-card p-3 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center">
            <div className="font-pixel text-[6px] text-white/40 tracking-wider mb-1">ACTIVE LISTINGS</div>
            <div className="font-pixel text-[10px] text-white">{stats.activeListings}</div>
          </div>
          <div className="text-center">
            <div className="font-pixel text-[6px] text-white/40 tracking-wider mb-1">TOTAL TRADES</div>
            <div className="font-pixel text-[10px] text-[#1E8F4E]">{stats.totalTrades}</div>
          </div>
          <div className="text-center">
            <div className="font-pixel text-[6px] text-white/40 tracking-wider mb-1">VOLUME</div>
            <div className="font-pixel text-[10px] text-[#FFD700]">{stats.totalVolume.toLocaleString()} $CUP</div>
          </div>
          <div className="text-center">
            <div className="font-pixel text-[6px] text-white/40 tracking-wider mb-1">FLOOR PRICE</div>
            <div className="font-pixel text-[10px] text-[#00E5FF]">{stats.floorPrice > 0 ? `${stats.floorPrice.toLocaleString()} $CUP` : "—"}</div>
          </div>
        </div>
      </div>

      {/* Buy error banner */}
      {buyError && (
        <div className="pixel-card p-3 mb-4 text-center" style={{ borderColor: "#ef4444" }}>
          <p className="font-pixel text-[7px] text-[#ef4444] tracking-wider">{buyError}</p>
        </div>
      )}

      {/* ═══════════ BROWSE TAB ═══════════ */}
      {tab === "browse" && (
        <>
          {/* Filters */}
          <div className="pixel-card p-4 mb-6">
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                placeholder="SEARCH AGENTS..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pixel-input flex-1 min-w-0 sm:min-w-[180px]"
              />
              <select value={posFilter} onChange={(e) => setPosFilter(e.target.value)} className="pixel-select">
                <option value="ALL">ALL POS</option>
                {["GK","CB","LB","RB","CDM","CM","CAM","LW","RW","ST"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)} className="pixel-select">
                <option value="ALL">ALL RARITY</option>
                {(["common","rare","epic","legendary"] as Rarity[]).map((r) => (
                  <option key={r} value={r}>{r.toUpperCase()}</option>
                ))}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="pixel-select">
                {SORT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Listings grid */}
          {loading ? (
            <div className="text-center py-20">
              <div className="font-pixel text-lg text-white/30 mb-4 animate-pulse">...</div>
              <p className="font-pixel text-[7px] text-white/40 tracking-wider">LOADING MARKETPLACE</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <div className="font-pixel text-2xl text-white/30 mb-4">?</div>
              <h3 className="font-pixel text-[10px] text-white mb-2 tracking-wider">NO LISTINGS FOUND</h3>
              <p className="font-pixel text-[7px] text-white/40 tracking-wider">
                THE MARKETPLACE IS EMPTY. BE THE FIRST TO LIST AN AGENT!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtered.map((listing) => {
                const agent = listing.user_agents?.agents;
                if (!agent) return null;
                const isMine = publicKey && listing.seller_wallet === publicKey.toBase58();
                const isBuying = buyingId === listing.id;
                return (
                  <div key={listing.id} className="pixel-card p-3 hover:border-[#1E8F4E] transition-colors">
                    <div className="flex justify-center mb-3">
                      <AgentCard agent={agent} size="sm" onClick={() => setSelectedAgent(agent)} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-pixel text-[6px] text-white/40 tracking-wider">PRICE</span>
                        <span className="font-pixel text-[8px] text-white">{Number(listing.price_cup).toLocaleString()} $CUP</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-pixel text-[5px] text-white/25 tracking-wider">
                          {listing.seller_wallet.slice(0, 4)}...{listing.seller_wallet.slice(-4)}
                        </span>
                      </div>
                      {isMine ? (
                        <div className="font-pixel text-[6px] text-white/30 text-center py-2 tracking-wider">YOUR LISTING</div>
                      ) : (() => {
                        const hasPending = pendingBuy.current?.listingId === listing.id;
                        return (
                          <button
                            onClick={() => handleBuy(listing)}
                            disabled={!publicKey || isBuying}
                            className="w-full py-2 font-pixel text-[7px] tracking-wider transition-colors disabled:opacity-40"
                            style={{
                              backgroundColor: hasPending ? "#ef444415" : getRarityColor(agent.rarity) + "15",
                              color: hasPending ? "#ef4444" : getRarityColor(agent.rarity),
                              border: `2px solid ${hasPending ? "#ef4444" : getRarityColor(agent.rarity)}`,
                              boxShadow: `inset -2px -2px 0 ${hasPending ? "#ef444430" : getRarityColor(agent.rarity) + "30"}`,
                            }}
                          >
                            {isBuying ? "PROCESSING..." : hasPending ? "RETRY CLAIM" : "BUY NOW"}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══════════ SELL TAB ═══════════ */}
      {tab === "sell" && (
        <>
          {!publicKey ? (
            <div className="text-center py-20">
              <div className="font-pixel text-2xl text-white/30 mb-4">!</div>
              <h3 className="font-pixel text-[10px] text-white mb-2 tracking-wider">WALLET NOT CONNECTED</h3>
              <p className="font-pixel text-[7px] text-white/40 tracking-wider">CONNECT YOUR WALLET TO SELL AGENTS</p>
            </div>
          ) : loadingAgents ? (
            <div className="text-center py-20">
              <div className="font-pixel text-lg text-white/30 mb-4 animate-pulse">...</div>
              <p className="font-pixel text-[7px] text-white/40 tracking-wider">LOADING YOUR AGENTS</p>
            </div>
          ) : (
            <>
              {/* Status messages */}
              {sellError && (
                <div className="pixel-card p-3 mb-4 text-center" style={{ borderColor: "#ef4444" }}>
                  <p className="font-pixel text-[7px] text-[#ef4444] tracking-wider">{sellError}</p>
                </div>
              )}
              {sellSuccess && (
                <div className="pixel-card p-3 mb-4 text-center" style={{ borderColor: "#1E8F4E" }}>
                  <p className="font-pixel text-[7px] text-[#1E8F4E] tracking-wider">{sellSuccess}</p>
                </div>
              )}

              {/* My active listings */}
              {myListings.length > 0 && (
                <div className="mb-8">
                  <h2 className="font-pixel text-[9px] text-white mb-4 tracking-wider">
                    YOUR ACTIVE LISTINGS ({myListings.length})
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {myListings.map(listing => {
                      const agent = listing.user_agents?.agents;
                      if (!agent) return null;
                      const isCancelling = cancellingId === listing.id;
                      return (
                        <div key={listing.id} className="pixel-card p-3" style={{ borderColor: "#1E8F4E" }}>
                          <div className="flex justify-center mb-3">
                            <AgentCard agent={agent} size="sm" />
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-pixel text-[6px] text-white/40 tracking-wider">PRICE</span>
                              <span className="font-pixel text-[8px] text-white">{Number(listing.price_cup).toLocaleString()} $CUP</span>
                            </div>
                            <button
                              onClick={() => handleCancel(listing.id)}
                              disabled={isCancelling}
                              className="w-full py-2 font-pixel text-[7px] tracking-wider transition-colors disabled:opacity-40"
                              style={{
                                backgroundColor: "#ef444415",
                                color: "#ef4444",
                                border: "2px solid #ef4444",
                                boxShadow: "inset -2px -2px 0 #ef444430",
                              }}
                            >
                              {isCancelling ? "CANCELLING..." : "CANCEL LISTING"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Unlisted agents to sell */}
              <h2 className="font-pixel text-[9px] text-white mb-4 tracking-wider">
                YOUR AGENTS ({unlistedAgents.length})
              </h2>

              {unlistedAgents.length === 0 ? (
                <div className="text-center py-16">
                  <div className="font-pixel text-2xl text-white/20 mb-4">?</div>
                  <h3 className="font-pixel text-[10px] text-white mb-2 tracking-wider">NO AGENTS TO SELL</h3>
                  <p className="font-pixel text-[7px] text-white/40 tracking-wider">
                    OPEN PACKS TO GET AGENTS OR ALL YOUR AGENTS ARE ALREADY LISTED
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {unlistedAgents.map(ua => {
                    const isListing = listingInProgress === ua.userAgentId;
                    const price = listingPrices[ua.userAgentId] || "";
                    return (
                      <div key={ua.userAgentId} className="pixel-card p-3 hover:border-[#1E8F4E] transition-colors">
                        <div className="flex justify-center mb-3">
                          <AgentCard agent={ua.agent} size="sm" onClick={() => setSelectedAgent(ua.agent)} />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="1"
                              min="1"
                              placeholder="$CUP"
                              value={price}
                              onChange={(e) => setListingPrices(prev => ({ ...prev, [ua.userAgentId]: e.target.value }))}
                              className="pixel-input flex-1 text-[8px] py-1.5"
                            />
                            <span className="font-pixel text-[6px] text-white/40 tracking-wider">$CUP</span>
                          </div>
                          <button
                            onClick={() => handleList(ua.userAgentId)}
                            disabled={isListing || !price || parseFloat(price) <= 0}
                            className="w-full py-2 font-pixel text-[7px] tracking-wider transition-colors disabled:opacity-40"
                            style={{
                              backgroundColor: "#1E8F4E15",
                              color: "#1E8F4E",
                              border: "2px solid #1E8F4E",
                              boxShadow: "inset -2px -2px 0 #1E8F4E30",
                            }}
                          >
                            {isListing ? "LISTING..." : "LIST FOR SALE"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ═══════════ HISTORY TAB ═══════════ */}
      {tab === "history" && (
        <>
          {historyLoading ? (
            <div className="text-center py-20">
              <div className="font-pixel text-lg text-white/30 mb-4 animate-pulse">...</div>
              <p className="font-pixel text-[7px] text-white/40 tracking-wider">LOADING TRADE HISTORY</p>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-20">
              <div className="font-pixel text-2xl text-white/30 mb-4">?</div>
              <h3 className="font-pixel text-[10px] text-white mb-2 tracking-wider">NO TRADES YET</h3>
              <p className="font-pixel text-[7px] text-white/40 tracking-wider">
                COMPLETED TRADES WILL APPEAR HERE
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Header */}
              <div className="hidden sm:grid grid-cols-[1fr_80px_80px_100px_80px] gap-3 px-4 py-2">
                <span className="font-pixel text-[6px] text-white/30 tracking-wider">AGENT</span>
                <span className="font-pixel text-[6px] text-white/30 tracking-wider text-center">RARITY</span>
                <span className="font-pixel text-[6px] text-white/30 tracking-wider text-center">POSITION</span>
                <span className="font-pixel text-[6px] text-white/30 tracking-wider text-center">PRICE</span>
                <span className="font-pixel text-[6px] text-white/30 tracking-wider text-center">DATE</span>
              </div>

              {history.map((trade) => {
                const agent = trade.user_agents?.agents;
                if (!agent) return null;
                const date = new Date(trade.created_at);
                const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
                const timeStr = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
                return (
                  <div
                    key={trade.id}
                    className="pixel-card p-3 sm:grid sm:grid-cols-[1fr_80px_80px_100px_80px] sm:items-center gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-2 h-2 shrink-0"
                        style={{ backgroundColor: getRarityColor(agent.rarity as Rarity) }}
                      />
                      <span className="font-pixel text-[8px] text-white tracking-wider">{agent.name}</span>
                    </div>
                    <div className="text-center">
                      <span
                        className="font-pixel text-[7px] tracking-wider"
                        style={{ color: getRarityColor(agent.rarity as Rarity) }}
                      >
                        {agent.rarity.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="font-pixel text-[7px] text-white/60 tracking-wider">{agent.position}</span>
                    </div>
                    <div className="text-center">
                      <span className="font-pixel text-[8px] text-[#FFD700] tracking-wider">{Number(trade.price_cup).toLocaleString()} $CUP</span>
                    </div>
                    <div className="text-center">
                      <span className="font-pixel text-[6px] text-white/40 tracking-wider">{dateStr} {timeStr}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {selectedAgent && (
        <AgentCardDetail agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}
    </div>
  );
}
