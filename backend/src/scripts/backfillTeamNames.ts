/**
 * One-off migration — replaces legacy "MY SQUAD" / empty team_name
 * rows with the wallet-slice default ("0x5A31…6568") used by new
 * sign-ups. Players who have already picked a custom name keep it.
 *
 *   cd backend && npx ts-node src/scripts/backfillTeamNames.ts
 *
 * Idempotent; re-running is a no-op once every row has a non-
 * default name.
 */
import { supabase } from "../lib/supabase";

function sliceFor(wallet: string): string {
  const w = (wallet ?? "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(w)) return "Player";
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

async function main() {
  const { data, error } = await supabase
    .from("leaderboard")
    .select("id, team_name, user_id, users!inner(wallet_address, evm_address)");
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    team_name: string | null;
    user_id: string;
    users: { wallet_address: string | null; evm_address: string | null };
  }>;

  const needsUpdate = rows.filter((r) => {
    const t = (r.team_name ?? "").trim().toUpperCase();
    return !t || t === "MY SQUAD" || t === "MY-SQUAD";
  });

  console.log(`Scanned ${rows.length} leaderboard rows`);
  console.log(`  Default ("MY SQUAD" / empty): ${needsUpdate.length}`);
  console.log(`  Already custom:              ${rows.length - needsUpdate.length}`);

  let updated = 0;
  let skipped = 0;
  for (const r of needsUpdate) {
    const wallet = r.users.evm_address || r.users.wallet_address || "";
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      // Legacy Solana / non-EVM row — leave team_name as "MY SQUAD"
      // so we don't fabricate a fake EVM-style name on top of it.
      skipped++;
      continue;
    }
    const name = sliceFor(wallet);
    const { error: updErr } = await supabase
      .from("leaderboard")
      .update({ team_name: name })
      .eq("id", r.id);
    if (updErr) {
      console.error(`  ! failed ${r.id}: ${updErr.message}`);
      continue;
    }
    updated++;
    console.log(`  ✓ ${wallet.slice(0, 10)} → ${name}`);
  }

  console.log(`\nDone. updated=${updated}  skipped_non_evm=${skipped}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
