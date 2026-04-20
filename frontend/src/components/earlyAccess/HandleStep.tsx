"use client";

import { useState } from "react";

interface Props {
  onSubmit: (handle: string) => void;
}

/**
 * Collects the user's X handle. Intentionally minimal — the landing
 * hero has already sold them on the idea; we just need a name.
 *
 * Swap the whole component out for a `signIn("twitter")` button once
 * NextAuth Twitter OAuth is wired.
 */
export default function HandleStep({ onSubmit }: Props) {
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = handle.trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{1,15}$/i.test(clean)) {
      setError("Handles are 1–15 letters, numbers, or underscores.");
      return;
    }
    setError(null);
    onSubmit(clean);
  }

  return (
    <div className="max-w-md mx-auto w-full animate-[fade-up_0.4s_ease-out]">
      <div
        className="p-6 sm:p-8"
        style={{
          background: "linear-gradient(180deg, #0f2a0f 0%, #0a1e0a 100%)",
          border: "3px solid #1E8F4E",
          boxShadow:
            "inset -3px -3px 0 #0B6623, inset 3px 3px 0 #2eb060, 6px 6px 0 rgba(0,0,0,0.5)",
        }}
      >
        <h2
          className="font-pixel text-[10px] sm:text-xs text-white text-center mb-2 tracking-wider"
          style={{ textShadow: "2px 2px 0 #0B6623" }}
        >
          WHAT&apos;S YOUR X HANDLE?
        </h2>
        <p className="text-[12px] sm:text-sm text-white/60 text-center mb-6 leading-relaxed">
          We mint your card from the handle — same every time.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div className="flex">
            <span
              className="font-pixel text-[14px] px-3 flex items-center shrink-0"
              style={{
                background: "#000",
                border: "2px solid #1E8F4E",
                borderRight: "none",
                color: "#2eb060",
              }}
            >
              @
            </span>
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="yourhandle"
              className="flex-1 font-pixel text-[12px] px-3 py-3 outline-none"
              style={{
                background: "#000",
                border: "2px solid #1E8F4E",
                color: "#fff",
                imageRendering: "pixelated",
              }}
              autoFocus
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {error && (
            <div className="font-pixel text-[8px] text-red-400 tracking-wider">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={!handle.trim()}
            className="w-full pixel-btn text-[10px] py-3 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            CONTINUE ↗
          </button>
        </form>
      </div>

      <style jsx>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
