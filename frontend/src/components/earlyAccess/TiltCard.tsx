"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 3D tilt wrapper for pointer-capable devices. Tracks the mouse over
 * the child and applies a subtle rotateX/rotateY so the card feels
 * like a physical object.
 *
 * On touch-only devices (phones, most tablets) the tilt listeners
 * are disabled entirely — they can't track cursor motion, and
 * applying transforms on tap causes the card to jitter in place.
 * The child renders untransformed in that case.
 */
export default function TiltCard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, hover: false });
  const [pointerFine, setPointerFine] = useState(false);

  // `(hover: hover) and (pointer: fine)` = mouse / trackpad device.
  // Re-evaluated once on mount — the output type of a device doesn't
  // change mid-session in any practical browser.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(hover: hover) and (pointer: fine)");
    setPointerFine(mql.matches);
  }, []);

  function onMouseMove(e: React.MouseEvent) {
    if (!pointerFine) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - rect.left) / rect.width - 0.5;
    const dy = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: dx, y: dy, hover: true });
  }

  function reset() {
    if (!pointerFine) return;
    setTilt({ x: 0, y: 0, hover: false });
  }

  // On touch devices skip the perspective wrapper entirely so we
  // avoid layout / compositing overhead for no visual gain.
  if (!pointerFine) {
    return <div className="inline-block">{children}</div>;
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
