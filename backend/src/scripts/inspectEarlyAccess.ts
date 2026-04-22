/**
 * Diagnostic dump of early_access_claims rows, comparing what's in
 * the DB vs what the leaderboard endpoint exposes. Helps track down
 * "rows missing from leaderboard" reports without reaching for the
 * Supabase dashboard.
 *
 *   cd backend && npx ts-node src/scripts/inspectEarlyAccess.ts
 */
import { supabase } from "../lib/supabase";

async function main() {
  const { data, error } = await supabase
    .from("early_access_claims")
    .select(
      "id, x_handle, follower_count, score, overall, rarity, claimed, claimed_at, created_at"
    )
    .order("score", { ascending: false });

  if (error) throw error;
  const rows = data ?? [];

  const claimed = rows.filter((r) => r.claimed);
  const revealed = rows.filter((r) => !r.claimed);

  console.log(`Total rows:      ${rows.length}`);
  console.log(`  claimed=true:  ${claimed.length}   <-- leaderboard shows these`);
  console.log(`  claimed=false: ${revealed.length}  <-- revealed but no tweet yet`);
  console.log();
  console.log(
    "handle".padEnd(16) +
      "fol".padStart(8) +
      " score".padStart(6) +
      " ovr".padStart(5) +
      " rarity".padStart(11) +
      "  state    created"
  );
  console.log("-".repeat(90));
  for (const r of rows) {
    const created =
      typeof r.created_at === "string"
        ? r.created_at.slice(0, 19).replace("T", " ")
        : "";
    console.log(
      String(r.x_handle ?? "").padEnd(16) +
        String(r.follower_count ?? 0).padStart(8) +
        String(r.score ?? 0).padStart(6) +
        String(r.overall ?? 0).padStart(5) +
        String(r.rarity ?? "").padStart(11) +
        "  " +
        (r.claimed ? "claimed  " : "revealed ") +
        created
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
