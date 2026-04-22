import { supabase } from "../lib/supabase";

async function main() {
  const { data } = await supabase
    .from("pack_purchases")
    .select("created_at, tx_signature, pack_type")
    .order("created_at", { ascending: true });
  const rows = data ?? [];
  if (rows.length === 0) {
    console.log("no rows");
    return;
  }
  console.log("Oldest entry:", rows[0].created_at, rows[0].tx_signature?.slice(0, 18));
  console.log(
    "Newest entry:",
    rows[rows.length - 1].created_at,
    rows[rows.length - 1].tx_signature?.slice(0, 18)
  );
  console.log("Total rows:", rows.length);

  let evm = 0,
    sol = 0,
    other = 0;
  for (const r of rows) {
    const tx = (r.tx_signature as string) || "";
    if (/^0x[a-fA-F0-9]{64}$/.test(tx)) evm++;
    else if (/^[1-9A-HJ-NP-Za-km-z]{40,88}$/.test(tx)) sol++;
    else other++;
  }
  console.log("EVM-format tx  :", evm);
  console.log("Solana-format  :", sol);
  console.log("Other          :", other);

  console.log("\nBy day:");
  const byDay: Record<string, number> = {};
  for (const r of rows) {
    const day = ((r.created_at as string) ?? "").slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + 1;
  }
  for (const [day, n] of Object.entries(byDay).sort()) {
    console.log(" ", day, "→", n, "packs");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
