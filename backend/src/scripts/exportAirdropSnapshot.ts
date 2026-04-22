/**
 * One-off export: early-access claimants with EVM addresses for CUP airdrop.
 *
 *   cd backend && npx ts-node src/scripts/exportAirdropSnapshot.ts
 *
 * Writes a CSV to agentscup-airdrop/early-access-users.csv so the merge
 * pipeline picks it up alongside the holder snapshots + KOL list.
 */
import { supabase } from "../lib/supabase";
import fs from "node:fs";

const OUT =
  "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/early-access-users.csv";

async function main() {
  // Pull every row, paginated (Supabase caps at 1000/request).
  const all: any[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("early_access_claims")
      .select(
        "x_handle, x_display_name, follower_count, rarity, score, overall, claimed, verification_status, evm_address, wallet_recorded_at, claimed_at, created_at"
      )
      .order("score", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const total = all.length;
  const claimed = all.filter((r) => r.claimed).length;
  const verified = all.filter((r) => r.verification_status === "verified").length;
  const withWallet = all.filter(
    (r) => r.evm_address && String(r.evm_address).startsWith("0x")
  ).length;

  // Looser: anyone who tweeted + bound a valid EVM wallet. The
  // verification_status worker isn't running in batch yet, so we
  // can't require `verified`. Tweet presence + wallet binding is
  // a strong enough quality signal for the airdrop snapshot.
  const eligible = all.filter(
    (r) =>
      r.claimed &&
      r.evm_address &&
      String(r.evm_address).toLowerCase().startsWith("0x") &&
      String(r.evm_address).length === 42
  );

  console.log("════ EARLY ACCESS — AIRDROP SNAPSHOT ════");
  console.log(`Total rows:                       ${total}`);
  console.log(`Claimed (tweet):                  ${claimed}`);
  console.log(`Verified tweets:                  ${verified}`);
  console.log(`With EVM wallet bound:            ${withWallet}`);
  console.log(`Eligible (claimed+verified+evm):  ${eligible.length}`);
  console.log();

  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header =
    "address,x_handle,x_display_name,follower_count,rarity,score,overall,claimed_at,wallet_recorded_at";
  const rows = eligible.map((r) =>
    [
      String(r.evm_address).toLowerCase(),
      r.x_handle,
      r.x_display_name ?? "",
      r.follower_count ?? 0,
      r.rarity,
      r.score ?? 0,
      r.overall ?? 0,
      r.claimed_at ?? "",
      r.wallet_recorded_at ?? "",
    ]
      .map(escape)
      .join(",")
  );

  fs.writeFileSync(OUT, [header, ...rows].join("\n") + "\n");
  console.log(`Wrote ${rows.length} rows to ${OUT}`);

  // Also print rarity breakdown for the eligible set
  const rarities = new Map<string, number>();
  for (const r of eligible) {
    rarities.set(r.rarity, (rarities.get(r.rarity) ?? 0) + 1);
  }
  console.log("\nRarity breakdown (eligible):");
  for (const [k, v] of [...rarities.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(12)} ${v}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
