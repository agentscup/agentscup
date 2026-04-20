"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * 3D tilt wrapper. Tracks the pointer over the child and applies a
 * subtle rotateX/rotateY so the card feels like a physical object.
 * Falls back to a neutral transform on touch devices (no hover).
 */
export default function TiltCard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, hover: false });

  function onMouseMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - rect.left) / rect.width - 0.5;
    const dy = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: dx, y: dy, hover: true });
  }

  function reset() {
    setTilt({ x: 0, y: 0, hover: false });
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={reset}
      style={{ perspective: "1000px" }}
      className="inline-block"
    >
      <div
        style={{
          transform: `rotateY(${tilt.x * 14}deg) rotateX(${-tilt.y * 14}deg) scale(${tilt.hover ? 1.03 : 1})`,
          transition: tilt.hover ? "transform 60ms linear" : "transform 300ms ease-out",
          transformStyle: "preserve-3d",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
