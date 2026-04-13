"use client";

import { Rarity } from "@/types";
import { getRarityColor } from "@/lib/utils";

export default function RarityBadge({ rarity }: { rarity: Rarity }) {
  const color = getRarityColor(rarity);
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{ backgroundColor: color + "20", color, border: `1px solid ${color}40` }}
    >
      {rarity}
    </span>
  );
}
