"use client";

import { getCsrfToken } from "next-auth/react";
import { useEffect, useState } from "react";

/**
 * One-button OAuth kickoff. Uses a native form POST rather than the
 * JS-driven `signIn()` helper so the browser treats the navigation
 * as part of the original user gesture.
 *
 * Background: Samsung Internet, Chrome Android and some Safari
 * versions silently drop `window.location.href = <url>` when it's
 * written inside an async callback (e.g. after an `await fetch()`),
 * because the user-gesture window has expired by the time the
 * handler returns from the network round-trip. `signIn()` from
 * `next-auth/react` does exactly that — it POSTs for a CSRF token,
 * reads the JSON response, then assigns `location.href` — which
 * manifests on mobile as "tapping the button does nothing".
 *
 * Form POST sidesteps the problem entirely: the tap triggers the
 * submit, the browser follows the server's 302 in the same
 * navigation, the gesture is never broken.
 */
export default function SignInWithX({ className }: { className?: string }) {
  const [csrfToken, setCsrfToken] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("/early-access");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Prime the CSRF token so the form POST carries a valid one.
    getCsrfToken()
      .then((t) => setCsrfToken(t ?? ""))
      .catch(() => undefined);
    // Absolute callback URL so the OAuth round-trip lands back on
    // the same origin we started on (protects against any rewrite
    // layer changing the path mid-flight).
    if (typeof window !== "undefined") {
      setCallbackUrl(`${window.location.origin}/early-access`);
    }
  }, []);

  return (
    <form
      method="POST"
      action="/api/auth/signin/twitter"
      onSubmit={() => setLoading(true)}
      style={{ display: "contents" }}
    >
      {/* NextAuth requires csrfToken + callbackUrl on the POST */}
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <button
        type="submit"
        disabled={loading || !csrfToken}
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
          cursor: loading ? "progress" : "pointer",
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
    </form>
  );
}
