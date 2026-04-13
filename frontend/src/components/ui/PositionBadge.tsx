"use client";

import { Position } from "@/types";

function getPositionColor(position: Position) {
  if (position === "GK") return "bg-yellow-500 text-yellow-950";
  if (["CB", "LB", "RB"].includes(position)) return "bg-green-500 text-green-950";
  if (["CDM", "CM", "CAM"].includes(position)) return "bg-blue-500 text-blue-950";
  if (["ST", "LW", "RW"].includes(position)) return "bg-red-500 text-red-950";
  return "bg-purple-500 text-purple-950";
}

export default function PositionBadge({ position }: { position: Position }) {
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-[10px] font-bold ${getPositionColor(position)}`}>
      {position}
    </span>
  );
}
