/**
 * Quick claim-funnel snapshot for the launch window. Prints counts
 * of revealed / claimed / verified rows plus a rolling 24h view so
 * you can tell at a glance how the early-access drop is performing.
 *
 *   cd backend && npx ts-node src/scripts/claimSnapshot.ts
 */
import { supabase } from "../lib/supabase";

async function main() {
  const { data, error } = await supabase
    .from("early_access_claims")
    .select("claimed, verification_status, claimed_at, created_at");
  if (error) throw error;
  const rows = data ?? [];

  const claimed = rows.filter((r) => r.claimed);
  const revealed = rows.filter((r) => !r.claimed);

  const verified = claimed.filter((r) => r.verification_status === "verified").length;
  const pending = claimed.filter((r) => r.verification_status === "pending").length;

  const now = Date.now();
  const within = (ms: number, arr: typeof rows, col: "claimed_at" | "created_at") =>
    arr.filter((r) => {
      const v = r[col] as string | null;
      return v && now - Date.parse(v) < ms;
    }).length;

  console.log("════ EARLY ACCESS — CLAIM SNAPSHOT ════");
  console.log("Total rows:             ", rows.length);
  console.log();
  console.log("Claimed (tweet atıldı): ", claimed.length);
  console.log("  verification=verified:", verified);
  console.log("  verification=pending :", pending);
  console.log();
  console.log("Revealed only (tweet yok):", revealed.length);
  console.log();
  console.log("Rolling windows (claimed rows):");
  console.log("  last  1h:", within(3_600_000, claimed, "claimed_at"));
  console.log("  last  6h:", within(6 * 3_600_000, claimed, "claimed_at"));
  console.log("  last 24h:", within(86_400_000, claimed, "claimed_at"));
  console.log();
  console.log("Rolling windows (all reveals):");
  console.log("  last  1h:", within(3_600_000, rows, "created_at"));
  console.log("  last  6h:", within(6 * 3_600_000, rows, "created_at"));
  console.log("  last 24h:", within(86_400_000, rows, "created_at"));
  const conv =
    rows.length > 0 ? ((claimed.length / rows.length) * 100).toFixed(1) : "0.0";
  console.log();
  console.log(`Conversion (claim / reveal): ${conv}%`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
