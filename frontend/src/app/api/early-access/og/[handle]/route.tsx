import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { generateCard, upgradeAvatarUrl, Rarity } from "@/lib/earlyAccess/cardGen";

export const runtime = "edge";

/**
 * GET /api/early-access/og/[handle]
 *
 * Renders a 1200×630 PNG of the user's Founder card so X unfurls
 * shared links into a rich Twitter Card preview.
 *
 * Hard rule for Satori (the engine behind next/og): every <div> with
 * multiple children needs an explicit `display: flex` (or contents /
 * none). Single-text-child divs are fine. We keep the tree shallow
 * and explicit so this stays robust to provider updates.
 *
 * Cache header is set on the response to keep X's crawler hitting
 * Vercel's CDN for popular handles instead of cold-starting the
 * edge function on every share.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ handle: string }> }
) {
  const { handle } = await ctx.params;
  const clean = decodeURIComponent(handle).toLowerCase().replace(/^@/, "");

  const card = (await fetchCard(clean)) ?? generateCard({
    handle: clean,
    displayName: clean,
    avatarUrl: `https://unavatar.io/twitter/${encodeURIComponent(clean)}`,
  });

  const avatar =
    upgradeAvatarUrl(card.avatarUrl) ||
    card.avatarUrl ||
    `https://unavatar.io/twitter/${encodeURIComponent(clean)}`;
  const theme = THEMES[card.rarity];

  const stats: Array<[string, number]> = [
    ["PAC", card.stats.pace],
    ["SHO", card.stats.shooting],
    ["PAS", card.stats.passing],
    ["DRI", card.stats.dribbling],
    ["DEF", card.stats.defending],
    ["PHY", card.stats.physical],
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          background: `linear-gradient(135deg, #061206 0%, ${theme.bgGlow} 50%, #061206 100%)`,
          fontFamily: "system-ui, sans-serif",
          padding: "0 80px",
        }}
      >
        {/* ── CARD ─────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 360,
            height: 540,
            background: theme.bg,
            border: `5px solid ${theme.border}`,
            marginRight: 60,
          }}
        >
          {/* Top stripe — single text child */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 0",
              background: theme.stripe,
              color: theme.stripeText,
              fontSize: 18,
              letterSpacing: 8,
              fontWeight: 700,
            }}
          >
            {card.rarity}
          </div>

          {/* OVR + handle row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "20px 18px 12px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: 76,
                height: 76,
                background: theme.badgeBg,
                border: `3px solid ${theme.border}`,
                marginRight: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 32,
                  fontWeight: 800,
                  color: theme.text,
                  lineHeight: 1,
                }}
              >
                {card.overall}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 11,
                  color: theme.text,
                  letterSpacing: 2,
                  marginTop: 4,
                }}
              >
                {card.position}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 18,
                  color: theme.text,
                  fontWeight: 700,
                  letterSpacing: 1,
                }}
              >
                {card.displayName.slice(0, 14).toUpperCase()}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 12,
                  color: theme.textSoft,
                  marginTop: 4,
                  letterSpacing: 2,
                }}
              >
                @{card.handle.slice(0, 18)}
              </div>
            </div>
          </div>

          {/* Avatar */}
          <div
            style={{
              display: "flex",
              padding: "0 18px",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                width: 324,
                height: 220,
                background: "#000",
                border: `3px solid ${theme.border}`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatar}
                alt=""
                width={324}
                height={220}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </div>
          </div>

          {/* Stats grid */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "14px 18px 0",
            }}
          >
            <div style={{ display: "flex", marginBottom: 6 }}>
              {stats.slice(0, 3).map(([label, value]) => (
                <StatCell
                  key={label}
                  label={label}
                  value={value}
                  theme={theme}
                />
              ))}
            </div>
            <div style={{ display: "flex" }}>
              {stats.slice(3, 6).map(([label, value]) => (
                <StatCell
                  key={label}
                  label={label}
                  value={value}
                  theme={theme}
                />
              ))}
            </div>
          </div>

          {/* Footer — single text child */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginTop: "auto",
              padding: "8px 0",
              borderTop: `2px solid ${theme.borderDark}`,
              color: theme.textSoft,
              fontSize: 11,
              letterSpacing: 4,
            }}
          >
            FOUNDER · BASE
          </div>
        </div>

        {/* ── RIGHT COPY ────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            maxWidth: 520,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 18,
              color: "#FFD700",
              letterSpacing: 6,
              fontWeight: 700,
              marginBottom: 18,
            }}
          >
            AGENTS CUP · EARLY ACCESS
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 60,
              fontWeight: 800,
              color: "#fff",
              lineHeight: 1.05,
              letterSpacing: 1,
            }}
          >
            One of one.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              color: "#d4e4d4",
              marginTop: 20,
              lineHeight: 1.4,
            }}
          >
            A founder card minted from your X handle.
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 32,
              alignSelf: "flex-start",
              padding: "14px 26px",
              background: "#1E8F4E",
              color: "#fff",
              fontSize: 18,
              letterSpacing: 4,
              fontWeight: 700,
            }}
          >
            CLAIM AT PLAY.AGENTSCUP.COM
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // X's crawler caches per URL; this header lets Vercel's CDN
        // serve the same PNG for ~1h (immutable enough for share
        // bursts) while letting an updated rarity refresh within
        // the day.
        "Cache-Control": "public, immutable, max-age=3600",
      },
    }
  );
}

// ─────────────────────────────────────────────────────────────────────

function StatCell({
  label,
  value,
  theme,
}: {
  label: string;
  value: number;
  theme: ThemePalette;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flex: 1,
        padding: "5px 8px",
        background: "rgba(0,0,0,0.4)",
        border: `1px solid ${theme.borderDark}`,
        marginRight: 4,
        color: theme.text,
      }}
    >
      <div style={{ display: "flex", fontSize: 12, color: theme.textSoft }}>
        {label}
      </div>
      <div style={{ display: "flex", fontSize: 14, fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}

async function fetchCard(handle: string) {
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
  if (!data) return null;
  return {
    handle: data.x_handle as string,
    displayName: (data.x_display_name as string | null) ?? (data.x_handle as string),
    avatarUrl: (data.x_avatar_url as string | null) ?? undefined,
    position: data.position as "ST",
    rarity: data.rarity as Rarity,
    score: data.score as number,
    overall: data.overall as number,
    stats: data.stats as {
      pace: number;
      shooting: number;
      passing: number;
      dribbling: number;
      defending: number;
      physical: number;
    },
    signalBreakdown: [],
  };
}

// Per-rarity palettes — solid colours only (Satori dislikes complex
// gradients in inline styles).
interface ThemePalette {
  bg: string;
  bgGlow: string;
  border: string;
  borderDark: string;
  stripe: string;
  stripeText: string;
  text: string;
  textSoft: string;
  badgeBg: string;
}

const THEMES: Record<Rarity, ThemePalette> = {
  COMMON: {
    bg: "#0f1a0f",
    bgGlow: "#1a2a1a",
    border: "#6b8e6b",
    borderDark: "#3b5a3b",
    stripe: "#4a6d4a",
    stripeText: "#e6f2e6",
    text: "#e6f2e6",
    textSoft: "#9abd9a",
    badgeBg: "#1a2a1a",
  },
  RARE: {
    bg: "#061020",
    bgGlow: "#0a1a2a",
    border: "#00aeef",
    borderDark: "#006080",
    stripe: "#0085b0",
    stripeText: "#e6f7ff",
    text: "#e6f7ff",
    textSoft: "#7fc8e6",
    badgeBg: "#001a33",
  },
  EPIC: {
    bg: "#0f0520",
    bgGlow: "#1a0a2a",
    border: "#b068ff",
    borderDark: "#5a2a80",
    stripe: "#7a3dd4",
    stripeText: "#f3e6ff",
    text: "#f3e6ff",
    textSoft: "#c9a0e6",
    badgeBg: "#1a0533",
  },
  LEGENDARY: {
    bg: "#0a0800",
    bgGlow: "#1a1200",
    border: "#FFD700",
    borderDark: "#8a6f00",
    stripe: "#FFD700",
    stripeText: "#1a1200",
    text: "#FFF4B0",
    textSoft: "#d4b84a",
    badgeBg: "#5a4500",
  },
};
