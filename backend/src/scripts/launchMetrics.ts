/**
 * Launch-day snapshot — totals for the live game (packs opened,
 * wallets connected, matches played, marketplace activity) plus
 * the pre-launch early-access funnel (revealed / claimed cards).
 *
 *   cd backend && npx ts-node src/scripts/launchMetrics.ts
 *
 * Intended for quick "how are we doing?" pings during launch
 * without needing Supabase dashboard access. Safe to re-run —
 * every query is read-only.
 */
import { supabase } from "../lib/supabase";

async function main() {
  const [packs, users, lb, claims, listings] = await Promise.all([
    supabase.from("pack_purchases").select("*", { count: "exact", head: true }),
    supabase.from("users").select("*", { count: "exact", head: true }),
    supabase.from("leaderboard").select("played"),
    supabase.from("early_access_claims").select("claimed"),
    supabase
      .from("listings")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
  ]);

  const playedSum = (lb.data ?? []).reduce(
    (s, r: { played: number | null }) => s + (r.played ?? 0),
    0
  );
  const revealed = claims.data?.length ?? 0;
  const claimed = (claims.data ?? []).filter(
    (r: { claimed: boolean | null }) => r.claimed
  ).length;

  console.log("══════════════════════════════════════════");
  console.log("  AGENTS CUP — LAUNCH METRICS SNAPSHOT");
  console.log("══════════════════════════════════════════");
  console.log("Wallets connected:          ", users.count);
  console.log("Packs opened:               ", packs.count);
  console.log("Active marketplace listings:", listings.count);
  console.log("Total matches played:       ", playedSum);
  console.log("");
  console.log("Early-access funnel (pre-launch):");
  console.log("  Revealed cards:           ", revealed);
  console.log("  Claimed (tweet posted):   ", claimed);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
