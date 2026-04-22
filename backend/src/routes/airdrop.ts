import { Router } from "express";
import crypto from "node:crypto";
import { supabase } from "../lib/supabase";

/**
 * Supplementary airdrop application endpoint.
 *
 *   POST /api/airdrop/apply { address: "0x...", x_handle?: "..." }
 *   GET  /api/airdrop/stats              (public, cached 30s)
 *
 * Anyone can submit an EVM address once. Dupes upsert silently so
 * refreshing the form doesn't reject. IP hashes are stored for post-hoc
 * spam filtering at distribution time, not per-request rate limiting
 * (Express's generalLimiter already gates that).
 */
const r = Router();

const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

function hashIp(ip: string | undefined): string {
  if (!ip) return "";
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

r.post("/apply", async (req, res) => {
  const body = req.body as { address?: string; x_handle?: string };
  const address = String(body.address ?? "").trim().toLowerCase();
  const xHandle = body.x_handle ? String(body.x_handle).trim().replace(/^@/, "") : null;

  if (!EVM_RE.test(address)) {
    return res.status(400).json({ error: "invalid_address" });
  }
  if (xHandle && !HANDLE_RE.test(xHandle)) {
    return res.status(400).json({ error: "invalid_handle" });
  }

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "";
  const ipHash = hashIp(ip);
  const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 500);

  // Upsert so re-submissions are idempotent.
  const { data, error } = await supabase
    .from("airdrop_applications")
    .upsert(
      {
        evm_address: address,
        x_handle: xHandle,
        ip_hash: ipHash,
        user_agent: userAgent,
        source: "form",
      },
      { onConflict: "evm_address", ignoreDuplicates: false }
    )
    .select("evm_address, x_handle, created_at")
    .single();

  if (error) {
    console.error("[airdrop/apply]", error);
    return res.status(500).json({ error: "db_error" });
  }
  return res.json({ ok: true, record: data });
});

r.get("/stats", async (_req, res) => {
  const { count, error } = await supabase
    .from("airdrop_applications")
    .select("id", { count: "exact", head: true });
  if (error) {
    return res.status(500).json({ error: "db_error" });
  }
  res.setHeader("Cache-Control", "public, max-age=30");
  res.json({ total: count ?? 0 });
});

export default r;
