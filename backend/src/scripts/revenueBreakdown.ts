/**
 * Revenue breakdown by pack tier + time window, plus treasury
 * wallet reconciliation. Useful when the on-chain balance "feels
 * wrong" — surfaces whether revenue went to the old operator
 * wallet, the new treasury, or both (treasury cutover split).
 *
 *   cd backend && npx ts-node src/scripts/revenueBreakdown.ts
 */
import dotenv from "dotenv";
dotenv.config();

import { createPublicClient, http, formatEther } from "viem";
import { base } from "viem/chains";
import { supabase } from "../lib/supabase";
import { PACK_CONFIGS } from "../services/packService";

const OLD_TREASURY = "0x5A31f465064Cb00a99F0885c480927B5ea906568";
const NEW_TREASURY = "0x1d4333f725ee240aea939cbAD3216332FB8495EB";
// setTreasury(PackStore) confirmed block 45034571 at 11:48:09 UTC
// (14:48 Istanbul). Packs opened before this timestamp routed pack
// revenue to the OLD treasury (operator hot wallet 0x5A31…),
// after it to 0x1d43… .
const TREASURY_CUTOVER_ISO = "2026-04-22T11:48:09Z";

async function main() {
  const { data: purchases, error } = await supabase
    .from("pack_purchases")
    .select("pack_type, amount_cup, created_at, tx_signature")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const allRows = purchases ?? [];

  // Ignore Solana-era rows (tx_signature is base58, not 0x-hex).
  // Those paid in $CUP SPL token to a Solana treasury — pre-Base
  // economy, not relevant for on-chain ETH reconciliation.
  const rows = allRows.filter((r) =>
    /^0x[a-fA-F0-9]{64}$/.test((r.tx_signature as string) || "")
  );
  const solanaRows = allRows.length - rows.length;
  if (solanaRows > 0) {
    console.log(
      `(ignoring ${solanaRows} legacy Solana-era pack rows — that pre-Base $CUP revenue never reached a Base wallet)\n`
    );
  }

  // Tier → on-chain price lookup. We recompute revenue from pack
  // TIER rather than DB `amount_cup` because Node's Number() loses
  // precision above 2^53 (legendary 0.05 ETH = 5e16 wei rounds),
  // and the pack-purchase row writes amount_cup as Number. The
  // canonical pack prices live in PACK_CONFIGS — tier × price gives
  // exact wei totals.
  const priceWeiFor = (tier: string): bigint => {
    const cfg = PACK_CONFIGS[tier as keyof typeof PACK_CONFIGS];
    // V2 economy stores prices in CUP wei — legacy ETH rows will have
    // no price in the CUP table but their tx_signature filter keeps
    // Solana-era rows out above, so the remaining rows were priced in
    // wei or (post-migration) CUP. Display-wise this report is now a
    // lifetime CUP total, historical ETH rows just show 0.
    return cfg ? BigInt(cfg.priceCupWei) : 0n;
  };

  // ── By tier ──────────────────────────────────────────────────────
  const byTier: Record<string, { count: number; wei: bigint }> = {
    starter: { count: 0, wei: 0n },
    pro: { count: 0, wei: 0n },
    elite: { count: 0, wei: 0n },
    legendary: { count: 0, wei: 0n },
  };
  for (const p of rows) {
    const t = (p.pack_type as string) || "starter";
    if (!(t in byTier)) continue;
    byTier[t].count++;
    byTier[t].wei += priceWeiFor(t);
  }

  // ── Cutover split ────────────────────────────────────────────────
  const cutoverMs = Date.parse(TREASURY_CUTOVER_ISO);
  let preCount = 0,
    postCount = 0;
  let preWei = 0n,
    postWei = 0n;
  for (const p of rows) {
    const t = (p.pack_type as string) || "starter";
    const wei = priceWeiFor(t);
    const when = Date.parse((p.created_at as string) ?? "");
    if (isNaN(when)) continue;
    if (when < cutoverMs) {
      preCount++;
      preWei += wei;
    } else {
      postCount++;
      postWei += wei;
    }
  }

  // ── Today only (UTC day) ─────────────────────────────────────────
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayMs = dayStart.getTime();
  let todayCount = 0;
  let todayWei = 0n;
  for (const p of rows) {
    const when = Date.parse((p.created_at as string) ?? "");
    if (when < dayMs) continue;
    todayCount++;
    todayWei += priceWeiFor((p.pack_type as string) || "starter");
  }

  // ── On-chain balances (reality check) ────────────────────────────
  const client = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
  });
  const [oldBal, newBal] = await Promise.all([
    client.getBalance({ address: OLD_TREASURY as `0x${string}` }),
    client.getBalance({ address: NEW_TREASURY as `0x${string}` }),
  ]);

  // ── Print ────────────────────────────────────────────────────────
  const totalCount = rows.length;
  const totalWei = Object.values(byTier).reduce((s, t) => s + t.wei, 0n);

  console.log("═════════════════════════════════════════════════════════");
  console.log("  AGENTS CUP — REVENUE BREAKDOWN");
  console.log("═════════════════════════════════════════════════════════");

  console.log("\nBy pack tier (lifetime):");
  for (const [tier, stats] of Object.entries(byTier)) {
    const cfg = PACK_CONFIGS[tier as keyof typeof PACK_CONFIGS];
    console.log(
      `  ${tier.padEnd(10)} × ${String(stats.count).padStart(4)}  = ${formatEther(stats.wei).padStart(14)} CUP   (${cfg.priceCupHuman} CUP each)`
    );
  }

  console.log(`\nTOTAL lifetime:    ${totalCount} packs = ${formatEther(totalWei)} ETH`);
  console.log(`Today (UTC):       ${todayCount} packs = ${formatEther(todayWei)} ETH`);
  console.log();
  console.log(
    `Pre-cutover (to ${OLD_TREASURY.slice(0, 10)}):  ${preCount} packs = ${formatEther(preWei)} ETH`
  );
  console.log(
    `Post-cutover (to ${NEW_TREASURY.slice(0, 10)}): ${postCount} packs = ${formatEther(postWei)} ETH`
  );

  console.log("\nOn-chain wallet balances RIGHT NOW:");
  console.log(`  ${OLD_TREASURY}  →  ${formatEther(oldBal)} ETH   (operator hot wallet)`);
  console.log(`  ${NEW_TREASURY}  →  ${formatEther(newBal)} ETH   (revenue treasury)`);

  console.log("\nReconciliation:");
  console.log(
    `  Expected in NEW treasury (post-cutover): ${formatEther(postWei)} ETH`
  );
  console.log(`  Actual balance there:                    ${formatEther(newBal)} ETH`);
  const diff =
    newBal > postWei ? newBal - postWei : postWei - newBal;
  const tag = newBal === postWei ? "✓ exact match" : `Δ ${formatEther(diff)} ETH`;
  console.log(`  ${tag}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
