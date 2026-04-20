import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/early-access/stats
 *
 * Public, read-only. Returns total reveal + claim counters for the
 * hero "X founders claimed" ticker. Cached at the CDN for 30s so this
 * endpoint can be hammered without stressing the DB.
 */
export const revalidate = 30;

export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ revealed: 0, claimed: 0 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const [revealedRes, claimedRes] = await Promise.all([
    supabase
      .from("early_access_claims")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("early_access_claims")
      .select("id", { count: "exact", head: true })
      .eq("claimed", true),
  ]);

  return NextResponse.json({
    revealed: revealedRes.count ?? 0,
    claimed: claimedRes.count ?? 0,
  });
}
