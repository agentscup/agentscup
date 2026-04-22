import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { generateCard, upgradeAvatarUrl, overallToRarity } from "@/lib/earlyAccess/cardGen";
import FounderCard from "@/components/earlyAccess/FounderCard";

interface Params {
  params: Promise<{ handle: string }>;
}

/**
 * Public share page — what a viewer sees when they click the tweeted
 * link. Renders the exact Founder card of the handle in the URL and
 * embeds OG meta so X renders the card image in-timeline.
 *
 * The page is purely informational; claiming happens on `/early-access`.
 */
export default async function FounderCardPage({ params }: Params) {
  const { handle } = await params;
  const clean = decodeURIComponent(handle).toLowerCase().replace(/^@/, "");
  const claim = await fetchClaim(clean);

  const card = claim
    ? {
        handle: claim.x_handle,
        displayName: claim.x_display_name ?? claim.x_handle,
        avatarUrl: upgradeAvatarUrl(claim.x_avatar_url ?? undefined),
        position: claim.position,
        // Rarity is derived from the visible overall at render time
        // so this page always agrees with the leaderboard — both use
        // the same overall → tier map. Prevents old rows where the
        // stored rarity was computed under the earlier overlapping
        // floor/ceil ranges from showing a mismatched label.
        rarity: overallToRarity(claim.overall),
        score: claim.score,
        overall: claim.overall,
        stats: claim.stats,
        signalBreakdown: [],
      }
    : null;

  // Fallback for handles not yet in the DB — render a generated preview
  // so links shared before the reveal persists still look right.
  const previewCard =
    card ??
    generateCard({
      handle: clean,
      displayName: clean,
      avatarUrl: `https://unavatar.io/twitter/${encodeURIComponent(clean)}`,
    });

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full border border-white/[0.04]" />
        <div className="absolute w-2 h-2 bg-[#2eb060]/20 top-[10%] left-[15%] animate-[pixel-blink_2s_step-end_infinite]" />
        <div className="absolute w-2 h-2 bg-[#2eb060]/20 top-[30%] right-[20%] animate-[pixel-blink_3s_step-end_infinite]" />
        <div className="absolute w-2 h-2 bg-[#FFD700]/10 top-[70%] right-[15%] animate-[pixel-blink_3s_step-end_infinite]" style={{ animationDelay: "1s" }} />
      </div>

      <div className="relative z-10 max-w-lg w-full text-center">
        <div
          className="inline-block px-3 py-1 mb-4 font-pixel text-[8px] tracking-[0.3em]"
          style={{
            background: "#1a1200",
            color: "#FFD700",
            border: "2px solid #FFD700",
            boxShadow: "inset -2px -2px 0 #8a6f00, inset 2px 2px 0 #FFF4B0, 3px 3px 0 rgba(0,0,0,0.5)",
          }}
        >
          <span className="inline-block w-1.5 h-1.5 bg-[#FFD700] mr-2 animate-pulse align-middle" />
          FOUNDER CARD
        </div>

        <h1
          className="font-pixel text-lg sm:text-2xl text-white mb-6 tracking-wider"
          style={{ textShadow: "3px 3px 0 #0B6623, 6px 6px 0 rgba(0,0,0,0.5)" }}
        >
          AGENTS CUP
        </h1>

        <div className="flex justify-center mb-8">
          <FounderCard card={previewCard} animated={false} />
        </div>

        <Link
          href="/early-access"
          className="inline-block pixel-btn text-[10px] px-8 py-3"
        >
          CLAIM YOUR CARD ↗
        </Link>

        <p className="mt-6 font-pixel text-[7px] text-white/40 tracking-wider">
          ONE CARD PER X ACCOUNT · BASE ENGAGEMENT BOOSTS RARITY
        </p>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params;
  const clean = decodeURIComponent(handle).toLowerCase().replace(/^@/, "");
  const title = `@${clean}'s Founder Card — Agents Cup`;
  const description = `Claim your own Founder card at agentscup.com/early-access.`;
  const ogImage = `/api/early-access/og/${encodeURIComponent(clean)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────

interface ClaimRow {
  x_handle: string;
  x_display_name: string | null;
  x_avatar_url: string | null;
  rarity: "COMMON" | "RARE" | "EPIC" | "LEGENDARY";
  score: number;
  position: "GK" | "CB" | "LB" | "RB" | "CDM" | "CM" | "CAM" | "LW" | "RW" | "ST";
  overall: number;
  stats: {
    pace: number;
    shooting: number;
    passing: number;
    dribbling: number;
    defending: number;
    physical: number;
  };
}

async function fetchClaim(handle: string): Promise<ClaimRow | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await supabase
    .from("early_access_claims")
    .select(
      "x_handle, x_display_name, x_avatar_url, rarity, score, position, overall, stats"
    )
    .eq("x_handle", handle)
    .maybeSingle();
  return (data as ClaimRow | null) ?? null;
}
