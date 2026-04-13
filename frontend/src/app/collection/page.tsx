"use client";

import { useState, useMemo, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import AgentCard from "@/components/cards/AgentCard";

const AgentCardDetail = dynamic(() => import("@/components/cards/AgentCardDetail"), {
  ssr: false,
});
import { Agent, Position, Rarity } from "@/types";
import { getUser } from "@/lib/api";
import { mapUserAgents, DbUserAgent } from "@/lib/mapAgent";

const POSITIONS: (Position | "ALL")[] = ["ALL", "GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"];
const RARITIES: (Rarity | "ALL")[] = ["ALL", "common", "rare", "epic", "legendary"];
const SORT_OPTIONS = [
  { value: "rating-desc", label: "Rating (High-Low)" },
  { value: "rating-asc", label: "Rating (Low-High)" },
  { value: "rarity", label: "Rarity" },
  { value: "name", label: "Name A-Z" },
];

const rarityOrder: Record<string, number> = { legendary: 4, epic: 3, rare: 2, common: 1 };

export default function CollectionPage() {
  const { publicKey } = useWallet();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [posFilter, setPosFilter] = useState<string>("ALL");
  const [rarityFilter, setRarityFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("rating-desc");

  useEffect(() => {
    if (!publicKey) {
      setAgents([]);
      return;
    }
    setLoading(true);
    getUser(publicKey.toBase58())
      .then((data: unknown) => {
        const userData = data as { agents?: DbUserAgent[] };
        setAgents(mapUserAgents(userData.agents || []));
      })
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, [publicKey]);

  const filtered = useMemo(() => {
    let items = [...agents];

    if (posFilter !== "ALL") items = items.filter((a) => a.position === posFilter);
    if (rarityFilter !== "ALL") items = items.filter((a) => a.rarity === rarityFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((a) => a.name.toLowerCase().includes(q));
    }

    switch (sort) {
      case "rating-asc":
        items.sort((a, b) => a.overall - b.overall);
        break;
      case "rarity":
        items.sort((a, b) => (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0));
        break;
      case "name":
        items.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        items.sort((a, b) => b.overall - a.overall);
    }

    return items;
  }, [agents, posFilter, rarityFilter, search, sort]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-pixel text-sm sm:text-base text-white tracking-wider" style={{ textShadow: "3px 3px 0 #0B6623" }}>
          MY COLLECTION
        </h1>
        <p className="font-pixel text-[7px] text-white/40 mt-2 tracking-wider">{filtered.length} AGENTS</p>
      </div>

      {/* Filters */}
      <div className="pixel-card p-4 mb-6">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="SEARCH AGENTS..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pixel-input flex-1 min-w-0 sm:min-w-[200px]"
          />
          <select
            value={posFilter}
            onChange={(e) => setPosFilter(e.target.value)}
            className="pixel-select"
          >
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p === "ALL" ? "ALL POS" : p}
              </option>
            ))}
          </select>
          <select
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value)}
            className="pixel-select"
          >
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {r === "ALL" ? "ALL RARITY" : r.toUpperCase()}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="pixel-select"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid */}
      {!publicKey ? (
        <div className="text-center py-20">
          <div className="font-pixel text-2xl text-white/30 mb-4">!</div>
          <h3 className="font-pixel text-[10px] text-white mb-2 tracking-wider">WALLET NOT CONNECTED</h3>
          <p className="font-pixel text-[7px] text-white/40 tracking-wider">
            CONNECT YOUR WALLET TO VIEW YOUR COLLECTION
          </p>
        </div>
      ) : loading ? (
        <div className="text-center py-20">
          <div className="font-pixel text-lg text-white/30 mb-4 animate-pulse">...</div>
          <p className="font-pixel text-[7px] text-white/40 tracking-wider">LOADING COLLECTION</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="font-pixel text-2xl text-white/30 mb-4">?</div>
          <h3 className="font-pixel text-[10px] text-white mb-2 tracking-wider">NO AGENTS FOUND</h3>
          <p className="font-pixel text-[7px] text-white/40 tracking-wider">
            OPEN PACKS IN THE PACK STORE TO START COLLECTING!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              size="md"
              onClick={() => setSelectedAgent(agent)}
            />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedAgent && (
        <AgentCardDetail agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}
    </div>
  );
}
