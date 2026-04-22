/**
 * Pre-launch state reset for the Base mainnet cutover.
 *
 *   1. Deactivate every active marketplace listing + un-mark the
 *      user_agents they reference (so the agents show up as
 *      unlisted in players' collections again).
 *   2. Zero out the PvP leaderboard — played / won / drawn / lost /
 *      goals / points all drop back to 0 across every row.
 *   3. Reset every user's ELO back to the default 1000 and XP to 0
 *      so the first mainnet match sets the tone for the new ladder.
 *
 * Agent ownership, squads, pack-purchase history, and match rows
 * are NOT touched — players keep their collections + a readable
 * history of past matches, just with fresh stats.
 *
 * Run with:
 *   cd backend && npx ts-node src/scripts/resetLaunchState.ts
 */

import { supabase } from "../lib/supabase";

async function main() {
  console.log("→ Starting launch-state reset...\n");

  // ─── 1. Marketplace listings ────────────────────────────────
  const { data: activeListings, error: listErr } = await supabase
    .from("listings")
    .select("id, user_agent_id")
    .eq("is_active", true);

  if (listErr) throw listErr;

  const activeCount = activeListings?.length ?? 0;
  console.log(`  Listings: ${activeCount} active → deactivating`);

  if (activeCount > 0) {
    const userAgentIds = (activeListings ?? [])
      .map((l) => l.user_agent_id)
      .filter(Boolean);

    // Un-mark the agents so they reappear as unlisted in collections.
    if (userAgentIds.length > 0) {
      const { error: uaErr } = await supabase
        .from("user_agents")
        .update({ is_listed: false })
        .in("id", userAgentIds);
      if (uaErr) throw uaErr;
      console.log(`    • un-listed ${userAgentIds.length} user_agents`);
    }

    const { error: deactErr } = await supabase
      .from("listings")
      .update({ is_active: false })
      .eq("is_active", true);
    if (deactErr) throw deactErr;
    console.log(`    • deactivated ${activeCount} listings`);
  }

  // ─── 2. Leaderboard ─────────────────────────────────────────
  // Keep rows intact (team names + user_id mapping) but zero the
  // numeric columns. `.neq("id", null)` is supabase-js's idiomatic
  // "match every row" filter — without a where clause the client
  // refuses to run a bare update.
  const { data: lbRows, error: lbCountErr } = await supabase
    .from("leaderboard")
    .select("id");
  if (lbCountErr) throw lbCountErr;

  console.log(`  Leaderboard: ${lbRows?.length ?? 0} rows → zeroing stats`);

  if ((lbRows?.length ?? 0) > 0) {
    const { error: lbErr } = await supabase
      .from("leaderboard")
      .update({
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goals_for: 0,
        goals_against: 0,
        points: 0,
      })
      .neq("id", "00000000-0000-0000-0000-000000000000"); // match every row
    if (lbErr) throw lbErr;
    console.log(`    • zeroed ${lbRows!.length} leaderboard rows`);
  }

  // ─── 3. User ELO + XP ───────────────────────────────────────
  const { data: userRows, error: uCountErr } = await supabase
    .from("users")
    .select("id");
  if (uCountErr) throw uCountErr;

  console.log(`  Users: ${userRows?.length ?? 0} rows → reset ELO + XP`);

  if ((userRows?.length ?? 0) > 0) {
    const { error: userErr } = await supabase
      .from("users")
      .update({ elo: 1000, xp: 0 })
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (userErr) throw userErr;
    console.log(`    • reset ${userRows!.length} users to elo=1000, xp=0`);
  }

  console.log("\n✔ Launch-state reset complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n✖ Reset failed:", err);
    process.exit(1);
  });
