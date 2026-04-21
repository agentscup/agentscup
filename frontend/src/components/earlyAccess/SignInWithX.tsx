"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

/**
 * One-button OAuth kickoff. Routes through Auth.js's Twitter provider
 * which wraps X's OAuth 2.0 PKCE flow, then returns to the early-
 * access page via the callback URL registered in the X Developer
 * Portal.
 *
 * Mobile hardening:
 *   - mouse-down/up handlers replaced with `active:` CSS so tap
 *     feedback works on touch devices without fighting the tap
 *     event order that some iOS / Android browsers use.
 *   - `touch-action: manipulation` removes Safari's 300 ms double-
 *     tap zoom detection delay so the button fires immediately.
 *   - onClick is kept purely synchronous, calling signIn() without
 *     awaiting — Auth.js handles the full redirect, our handler
 *     just kicks it off.
 *   - A state flag dims the button while the OAuth round-trip
 *     starts so the user sees immediate confirmation that the
 *     tap registered (mobile networks can have noticeable TTFB).
 */
export default function SignInWithX({ className }: { className?: string }) {
  const [loading, setLoading] = useState(false);

  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    setLoading(true);
    // Absolute callback URL so the OAuth provider / callback handler
    // doesn't get confused by the rewrite layer that maps /early →
    // /early-access.
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    signIn("twitter", { callbackUrl: `${origin}/early-access` }).catch(() => {
      // If sign-in throws synchronously (misconfig / network), release
      // the button so the user can retry instead of being stuck
      // looking at a dimmed CTA.
      setLoading(false);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`group relative font-pixel text-[10px] sm:text-[12px] tracking-[0.35em] sm:tracking-[0.4em] overflow-hidden min-h-[52px] px-10 sm:px-14 active:translate-y-[3px] disabled:opacity-70 ${className ?? ""}`}
      style={{
        padding: "18px 40px",
        background: "linear-gradient(180deg, #FFD700 0%, #B8960C 100%)",
        color: "#1a1200",
        border: "3px solid #FFF4B0",
        boxShadow:
          "inset -3px -3px 0 #8a6f00, inset 3px 3px 0 #FFF4B0, 0 6px 0 #5a4500, 0 12px 24px rgba(0,0,0,0.4)",
        textShadow: "1px 1px 0 #FFF4B0",
        imageRendering: "pixelated",
        transition: "transform 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms",
        touchAction: "manipulation",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background:
            "linear-gradient(120deg, transparent 35%, rgba(255,255,255,0.45) 50%, transparent 65%)",
          backgroundSize: "250% 250%",
          animation: "btn-shine 1.6s linear infinite",
        }}
      />
      <span className="relative">
        {loading ? "CONNECTING…" : "CONNECT WITH X"}
      </span>

      <style jsx>{`
        @keyframes btn-shine {
          0%   { background-position: 250% 250%; }
          100% { background-position: -250% -250%; }
        }
      `}</style>
    </button>
  );
}
