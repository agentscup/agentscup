"use client";

import { useEffect, useState } from "react";

/**
 * Target launch timestamp, ISO-8601 UTC.
 *
 * Fixed: 22 April 2026, 19:00 Turkey time (UTC+3) → 16:00 UTC.
 * Overridable via `NEXT_PUBLIC_LAUNCH_AT` in Vercel if the schedule
 * shifts without wanting to redeploy on a code change.
 */
const DEFAULT_LAUNCH_AT = "2026-04-22T16:00:00Z";
const LAUNCH_AT_ISO =
  process.env.NEXT_PUBLIC_LAUNCH_AT?.trim() || DEFAULT_LAUNCH_AT;

/**
 * Returns the countdown in `HH:MM:SS` form, where HH may exceed 24
 * if launch is more than a day out. Shows `00:00:00` once the
 * deadline has passed.
 *
 * Re-renders every second so the seconds digit ticks visibly — the
 * extra interval work is trivial (the banner only mounts on the
 * claimed screen, one per tab). Uses `tabular-nums` on the label
 * so the digits don't jitter as they change.
 */
export function useLaunchCountdown() {
  const targetMs = Date.parse(LAUNCH_AT_ISO);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  // `tick` is a no-op dep; we just need the hook to re-run.
  void tick;

  const ms = Math.max(0, targetMs - Date.now());
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    past: ms === 0,
    hours,
    minutes,
    seconds,
    label: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
  };
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Drop-in banner rendered inside the claimed state. Keeps the
 * visual language of the earlier SPOT LOCKED chip but now reads
 * `SEE YOU IN HH:MM HOURS` where the timer ticks down in-place.
 */
export default function LaunchCountdownBadge() {
  const { past, label } = useLaunchCountdown();

  return (
    <div
      className="mt-8 inline-flex items-center gap-2 px-4 py-2 font-pixel text-[9px] tracking-[0.3em] animate-[fade-up_0.5s_ease-out]"
      style={{
        background: "#1a1200",
        color: "#FFD700",
        border: "2px solid #FFD700",
        boxShadow:
          "inset -2px -2px 0 #8a6f00, inset 2px 2px 0 #FFF4B0, 3px 3px 0 rgba(0,0,0,0.5)",
      }}
    >
      <span style={{ color: "#FFD700" }}>✓ SPOT LOCKED</span>
      <span style={{ opacity: 0.4 }}>—</span>
      {past ? (
        <span style={{ letterSpacing: "0.2em" }}>WE ARE LIVE</span>
      ) : (
        <span>
          SEE YOU IN{" "}
          <span
            className="tabular-nums"
            style={{
              color: "#FFF4B0",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {label}
          </span>
        </span>
      )}
    </div>
  );
}
