"use client";

import { useEffect, useMemo } from "react";

/**
 * Chunky pixel-art confetti burst. Fires once on mount; auto-hides
 * via CSS animations after ~2.6s.
 */
export default function Confetti({ active }: { active: boolean }) {
  const pieces = useMemo(() => Array.from({ length: 60 }, (_, i) => buildPiece(i)), []);

  // Unused on purpose — kept so callers can re-trigger by flipping active,
  // which re-mounts the component through a parent key prop.
  useEffect(() => { /* no-op */ }, [active]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute block"
          style={{
            left: `${p.x}%`,
            top: "50%",
            width: p.size,
            height: p.size,
            background: p.color,
            imageRendering: "pixelated",
            animation: `confetti-fall ${p.duration}s cubic-bezier(0.2, 0.6, 0.4, 1) ${p.delay}s both, confetti-spin ${p.spinDur}s linear ${p.delay}s both`,
            transform: `translate3d(0, 0, 0) rotate(${p.rot}deg)`,
          }}
        />
      ))}

      <style jsx>{`
        @keyframes confetti-fall {
          0%   { transform: translate3d(0, -20vh, 0) scale(1); opacity: 0; }
          10%  { opacity: 1; }
          100% { transform: translate3d(var(--drift, 0), 120vh, 0) scale(1); opacity: 0.9; }
        }
        @keyframes confetti-spin {
          from { rotate: 0deg; }
          to   { rotate: 360deg; }
        }
      `}</style>
    </div>
  );
}

function buildPiece(i: number) {
  const colors = ["#FFD700", "#2eb060", "#00AEEF", "#b068ff", "#FF3B3B", "#fff"];
  const sizes = [6, 8, 10, 12];
  return {
    x: (i * 17) % 100,
    color: colors[i % colors.length],
    size: sizes[i % sizes.length],
    duration: 1.8 + ((i * 0.13) % 1.2),
    delay: ((i * 0.07) % 0.6),
    spinDur: 0.8 + ((i * 0.11) % 1.5),
    rot: (i * 37) % 360,
  };
}
