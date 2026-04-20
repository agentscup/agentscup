"use client";

import { signIn } from "next-auth/react";

/**
 * One-button OAuth kickoff. Routes through Auth.js's Twitter provider
 * which wraps X's OAuth 2.0 PKCE flow, then returns to the early-
 * access page via the callback URL registered in the X Developer
 * Portal.
 *
 * Rendered by the LandingHero when `X_CLIENT_ID` is configured.
 * Before those env vars land the page falls back to the legacy
 * handle-input form so the funnel keeps working.
 */
export default function SignInWithX({ className }: { className?: string }) {
  function onClick() {
    void signIn("twitter", { callbackUrl: "/early-access" });
  }

  return (
    <button
      onClick={onClick}
      className={`group relative font-pixel text-[10px] sm:text-[12px] tracking-[0.3em] overflow-hidden ${className ?? ""}`}
      style={{
        padding: "18px 48px",
        background: "linear-gradient(180deg, #FFD700 0%, #B8960C 100%)",
        color: "#1a1200",
        border: "4px solid #FFF4B0",
        boxShadow:
          "inset -4px -4px 0 #8a6f00, inset 4px 4px 0 #FFF4B0, 0 6px 0 #5a4500, 8px 8px 0 rgba(0,0,0,0.6)",
        textShadow: "1px 1px 0 #FFF4B0",
        imageRendering: "pixelated",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(4px)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
    >
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          background:
            "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.5) 50%, transparent 60%)",
          backgroundSize: "200% 200%",
          animation: "btn-shine 1.2s linear infinite",
        }}
      />
      <span className="relative">CONNECT WITH X ↗</span>

      <style jsx>{`
        @keyframes btn-shine {
          0%   { background-position: 200% 200%; }
          100% { background-position: -200% -200%; }
        }
      `}</style>
    </button>
  );
}
