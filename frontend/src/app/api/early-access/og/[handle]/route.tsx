import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { generateCard, upgradeAvatarUrl, Rarity } from "@/lib/earlyAccess/cardGen";

export const runtime = "edge";
export const revalidate = 300;

/**
 * GET /api/early-access/og/[handle]
 *
 * Renders a 1200×630 OG image of the user's Founder card so X
 * unfurls the shared link into a rich card preview. The component
 * tree here is limited to Satori's supported CSS (no shadows on
 * text, no fancy filters) and uses system fonts only.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ handle: string }> }
) {
  const { handle } = await ctx.params;
  const clean = decodeURIComponent(handle).toLowerCase().replace(/^@/, "");

  // Look up persisted claim; fall back to generated preview.
  const card = (await fetchCard(clean)) ?? generateCard({
    handle: clean,
    displayName: clean,
    avatarUrl: `https://unavatar.io/twitter/${encodeURIComponent(clean)}`,
  });

  const avatar = upgradeAvatarUrl(card.avatarUrl) || card.avatarUrl ||
    `https://unavatar.io/twitter/${encodeURIComponent(clean)}`;
  const theme = THEMES[card.rarity];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #061206 0%, #0a2a12 50%, #061206 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Decorative glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(circle at center, ${theme.glow} 0%, transparent 65%)`,
            display: "flex",
          }}
        />

        {/* Left column — card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 440,
            background: theme.bg,
            border: `6px solid ${theme.border}`,
            marginLeft: 80,
            marginRight: 60,
          }}
        >
          {/* Top stripe */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 20px",
              background: theme.stripe,
              borderBottom: `4px solid ${theme.borderDark}`,
              color: theme.stripeText,
              fontSize: 18,
              letterSpacing: 6,
              fontWeight: 700,
            }}
          >
            <span>FOUNDER</span>
            <span>{card.rarity}</span>
          </div>

          {/* Overall + handle row */}
          <div style={{ display: "flex", padding: "24px 20px 12px", gap: 16 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: 88,
                height: 88,
                background: theme.badgeBg,
                border: `4px solid ${theme.border}`,
                color: theme.text,
              }}
            >
              <span style={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>
                {card.overall}
              </span>
              <span style={{ fontSize: 12, letterSpacing: 2, marginTop: 4 }}>
                {card.position}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
              <div
                style={{
                  fontSize: 22,
                  letterSpacing: 2,
                  color: theme.text,
                  fontWeight: 700,
                  maxWidth: 280,
                  overflow: "hidden",
                }}
              >
                {card.displayName.slice(0, 18).toUpperCase()}
              </div>
              <div style={{ fontSize: 14, color: theme.textSoft, marginTop: 6, letterSpacing: 3 }}>
                @{card.handle}
              </div>
            </div>
          </div>

          {/* Avatar */}
          <div style={{ display: "flex", padding: "0 20px" }}>
            <div
              style={{
                width: "100%",
                aspectRatio: "1",
                background: "#000",
                border: `4px solid ${theme.border}`,
                display: "flex",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatar}
                alt={card.displayName}
                width={400}
                height={400}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          </div>

          {/* Stats grid */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              padding: "20px 20px 12px",
              gap: 6,
            }}
          >
            {[
              ["PAC", card.stats.pace],
              ["SHO", card.stats.shooting],
              ["PAS", card.stats.passing],
              ["DRI", card.stats.dribbling],
              ["DEF", card.stats.defending],
              ["PHY", card.stats.physical],
            ].map(([label, value]) => (
              <div
                key={label as string}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "32%",
                  padding: "6px 10px",
                  background: "rgba(0,0,0,0.4)",
                  border: `2px solid ${theme.borderDark}`,
                  color: theme.text,
                  fontSize: 15,
                  letterSpacing: 1,
                }}
              >
                <span style={{ color: theme.textSoft }}>{label}</span>
                <span style={{ fontWeight: 700 }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 20px",
              borderTop: `3px solid ${theme.borderDark}`,
              color: theme.textSoft,
              fontSize: 12,
              letterSpacing: 3,
            }}
          >
            <span>EARLY ACCESS</span>
            <span>BASE · {card.score} PTS</span>
          </div>
        </div>

        {/* Right column — CTA */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            maxWidth: 520,
            color: "#fff",
          }}
        >
          <div
            style={{
              fontSize: 20,
              color: "#FFD700",
              letterSpacing: 6,
              fontWeight: 700,
              marginBottom: 20,
            }}
          >
            AGENTS CUP · EARLY ACCESS
          </div>
          <div
            style={{
              fontSize: 56,
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing: 1,
              color: "#fff",
            }}
          >
            One card per X account.
          </div>
          <div
            style={{
              fontSize: 26,
              marginTop: 20,
              color: "#d4e4d4",
              lineHeight: 1.35,
            }}
          >
            Follow <span style={{ color: "#00AEEF" }}>@base</span> and talk about it to roll a rarer card.
          </div>
          <div
            style={{
              marginTop: 28,
              alignSelf: "flex-start",
              padding: "14px 24px",
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
    { width: 1200, height: 630 }
  );
}

// ─────────────────────────────────────────────────────────────────────

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

// Per-rarity palettes, simplified for Satori (no linear-gradients in
// borders, no multi-stop radials — keep colors solid where possible).
const THEMES: Record<Rarity, {
  bg: string;
  border: string;
  borderDark: string;
  stripe: string;
  stripeText: string;
  text: string;
  textSoft: string;
  badgeBg: string;
  glow: string;
}> = {
  COMMON: {
    bg: "#0f1a0f",
    border: "#6b8e6b",
    borderDark: "#3b5a3b",
    stripe: "#4a6d4a",
    stripeText: "#e6f2e6",
    text: "#e6f2e6",
    textSoft: "#9abd9a",
    badgeBg: "#1a2a1a",
    glow: "rgba(106,142,107,0.20)",
  },
  RARE: {
    bg: "#061020",
    border: "#00aeef",
    borderDark: "#006080",
    stripe: "#0085b0",
    stripeText: "#e6f7ff",
    text: "#e6f7ff",
    textSoft: "#7fc8e6",
    badgeBg: "#001a33",
    glow: "rgba(0,174,239,0.25)",
  },
  EPIC: {
    bg: "#0f0520",
    border: "#b068ff",
    borderDark: "#5a2a80",
    stripe: "#7a3dd4",
    stripeText: "#f3e6ff",
    text: "#f3e6ff",
    textSoft: "#c9a0e6",
    badgeBg: "#1a0533",
    glow: "rgba(176,104,255,0.30)",
  },
  LEGENDARY: {
    bg: "#0a0800",
    border: "#FFD700",
    borderDark: "#8a6f00",
    stripe: "#FFD700",
    stripeText: "#1a1200",
    text: "#FFF4B0",
    textSoft: "#d4b84a",
    badgeBg: "#5a4500",
    glow: "rgba(255,215,0,0.35)",
  },
};
