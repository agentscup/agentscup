/**
 * One-time migration: rename SOL columns to CUP, drop stakes.
 * Usage:
 *   node scripts/run-cup-migration.js <DB_PASSWORD>
 * OR
 *   SUPABASE_DB_PASSWORD=xxx node scripts/run-cup-migration.js
 *
 * Get DB password from: Supabase Dashboard → Project Settings → Database → Connection string
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const PROJECT_REF = "hpjvjpcvimazxahkivrg";
const password = process.argv[2] || process.env.SUPABASE_DB_PASSWORD;

if (!password) {
  console.error("ERROR: Missing DB password.");
  console.error("Usage: node scripts/run-cup-migration.js <DB_PASSWORD>");
  console.error("Get the password from Supabase Dashboard → Settings → Database");
  process.exit(1);
}

const sqlPath = path.join(__dirname, "..", "supabase", "migrate_sol_to_cup.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const client = new Client({
  host: `aws-0-us-east-1.pooler.supabase.com`,
  port: 6543,
  database: "postgres",
  user: `postgres.${PROJECT_REF}`,
  password,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    console.log("Connecting to Supabase pooler...");
    await client.connect();
    console.log("Connected. Running migration...");
    const result = await client.query(sql);
    console.log("✅ Migration complete.");
    if (Array.isArray(result)) {
      const last = result[result.length - 1];
      if (last && last.rows) console.log("Verification:", last.rows);
    } else if (result.rows) {
      console.log("Verification:", result.rows);
    }
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    // Try direct connection as fallback
    if (err.code === "ENOTFOUND" || err.message.includes("pooler")) {
      console.log("Retrying via direct connection...");
      const direct = new Client({
        host: `db.${PROJECT_REF}.supabase.co`,
        port: 5432,
        database: "postgres",
        user: "postgres",
        password,
        ssl: { rejectUnauthorized: false },
      });
      try {
        await direct.connect();
        const result = await direct.query(sql);
        console.log("✅ Migration complete (direct).");
        if (result.rows) console.log("Verification:", result.rows);
        await direct.end();
      } catch (e2) {
        console.error("❌ Direct connection also failed:", e2.message);
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  } finally {
    try { await client.end(); } catch {}
  }
})();
