"use client";

import { useEffect, useState } from "react";

/**
 * Target launch timestamp, ISO-8601. Overridable via
 * `NEXT_PUBLIC_LAUNCH_AT` in Vercel (build-time constant) so we can
 * shift the date without a code change. Default lands 24 hours after
 * the current preview so copy reads "24:00 HOURS" out of the box.
 */
const DEFAULT_LAUNCH_AT = "2026-04-22T18:00:00Z";
const LAUNCH_AT_ISO =
  process.env.NEXT_PUBLIC_LAUNCH_AT?.trim() || DEFAULT_LAUNCH_AT;

/**
 * Returns the countdown string in `HH:MM` form, where HH may exceed
 * 24 if launch is more than a day out. Shows `00:00` once the
 * deadline has passed.
 *
 * Re-renders every 10 seconds — plenty for a minute-granularity
 * display, cheap enough that thousands of mounted banners won't
 * meaningfully touch the main thread.
 */
export function useLaunchCountdown() {
  const targetMs = Date.parse(LAUNCH_AT_ISO);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  // `tick` is a no-op dep; we just need the hook to re-run.
  void tick;

  const ms = Math.max(0, targetMs - Date.now());
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    past: ms === 0,
    hours,
    minutes,
    label: `${pad(hours)}:${pad(minutes)}`,
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
            style={{ color: "#FFF4B0" }}
          >
            {label}
          </span>{" "}
          HOURS
        </span>
      )}
    </div>
  );
}
