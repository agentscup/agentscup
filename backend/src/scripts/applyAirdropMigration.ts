/**
 * Apply airdrop_applications.sql via Supabase RPC.
 * One-off — safe to re-run (statements are idempotent).
 */
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "..", "supabase", "airdrop_applications.sql"),
    "utf8"
  );
  // Supabase doesn't expose a direct SQL endpoint via JS SDK, so hit the
  // undocumented /rest/v1/rpc/query... actually use pg_meta via REST.
  // Simplest: use the `database/query` management API endpoint.
  const resp = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
  });
  if (!resp.ok) {
    console.error(`Status ${resp.status}: ${await resp.text()}`);
    console.error("exec_sql RPC likely not enabled on this project.");
    console.error("Paste the SQL into Supabase Dashboard → SQL Editor manually:");
    console.error(sql);
    process.exit(1);
  }
  console.log("migration applied");
}

main().catch((e) => { console.error(e); process.exit(1); });
