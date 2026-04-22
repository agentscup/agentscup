/**
 * One-shot migration runner for base_migration_v3.sql. Widens the
 * `listings.price_cup` column from `numeric(18,0)` to `numeric(40,0)`
 * so any wei-denominated ETH listing fits. Run once per environment:
 *
 *   cd backend && npx ts-node src/scripts/applyMarketplaceFix.ts
 *
 * Uses the service-role key because the schema change requires owner
 * privileges. Safe to re-run — `alter column … type numeric(40,0)` is
 * a no-op if the column already has that type.
 *
 * Because supabase-js exposes only the REST/PostgREST surface (no DDL
 * endpoint), we reach for the Postgres wire protocol via `pg` using
 * the project's direct connection string. The alternative — calling
 * a pre-installed exec_sql RPC — doesn't exist in this project.
 */
import dotenv from "dotenv";
dotenv.config();

import { Client } from "pg";

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

  if (!url || !serviceKey) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
  }

  if (!dbUrl) {
    // Fall back to PostgREST probe so the user gets a clear next-step.
    console.error(
      "SUPABASE_DB_URL / DATABASE_URL not set. DDL requires a direct Postgres connection.\n" +
        "Either:\n" +
        "  1. Set SUPABASE_DB_URL to the project's pooler connection string\n" +
        "     (Dashboard → Project Settings → Database → Connection string → URI)\n" +
        "  2. Or paste the following SQL into the Supabase SQL editor:\n\n" +
        "     alter table listings\n" +
        "       alter column price_cup type numeric(40,0)\n" +
        "       using price_cup::numeric(40,0);\n"
    );
    process.exit(2);
  }

  const client = new Client({
    connectionString: dbUrl,
    // Supabase enforces TLS on every connection; node-postgres needs
    // this flag to accept the managed cert without a bundled CA.
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log("Connecting to Postgres…");
    await client.connect();

    console.log("Current price_cup column type:");
    const before = await client.query<{ data_type: string; numeric_precision: number | null }>(
      `select data_type, numeric_precision
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'listings'
          and column_name = 'price_cup'`
    );
    console.log(before.rows[0] ?? "(column not found!)");

    console.log("\nApplying base_migration_v3.sql…");
    await client.query(
      `alter table listings
         alter column price_cup type numeric(40,0)
         using price_cup::numeric(40,0)`
    );

    const after = await client.query<{ data_type: string; numeric_precision: number | null }>(
      `select data_type, numeric_precision
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'listings'
          and column_name = 'price_cup'`
    );
    console.log("\nNew price_cup column type:");
    console.log(after.rows[0]);

    console.log("\nDone — listings ≥ 1 ETH should now succeed.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(3);
});
