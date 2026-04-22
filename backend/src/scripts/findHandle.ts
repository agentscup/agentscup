/**
 * Look up specific X handles in early_access_claims regardless of
 * claim/verification state. For airdrop eligibility investigation.
 *
 *   cd backend && npx ts-node src/scripts/findHandle.ts
 */
import { supabase } from "../lib/supabase";

const HANDLES = ["joshqharris", "iamheci", "kingsecheeh"];

async function main() {
  for (const h of HANDLES) {
    const { data, error } = await supabase
      .from("early_access_claims")
      .select(
        "x_handle, x_display_name, follower_count, rarity, score, overall, claimed, claimed_at, evm_address, wallet_recorded_at, verification_status, created_at"
      )
      .ilike("x_handle", h);
    if (error) {
      console.error(`[err] @${h}: ${error.message}`);
      continue;
    }
    console.log(`\n=== @${h} ===`);
    if (!data || data.length === 0) {
      console.log("NOT FOUND in early_access_claims");
      continue;
    }
    for (const r of data) {
      console.log(JSON.stringify(r, null, 2));
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
