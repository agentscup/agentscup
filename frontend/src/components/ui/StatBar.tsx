"use client";

interface StatBarProps {
  label: string;
  value: number;
  maxValue?: number;
}

function getStatColor(value: number): string {
  if (value >= 90) return "#FFD700";
  if (value >= 70) return "#1E8F4E";
  if (value >= 50) return "#eab308";
  return "#ef4444";
}

export default function StatBar({
  label,
  value,
  maxValue = 99,
}: StatBarProps) {
  const pct = Math.min(100, (value / maxValue) * 100);
  const color = getStatColor(value);

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="font-pixel text-[6px] text-white/60 uppercase w-8 shrink-0 tracking-wider">
        {label}
      </span>
      <div
        className="flex-1 h-[4px] bg-[#222]"
        style={{ imageRendering: "pixelated" }}
      >
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-pixel text-[7px] text-white w-6 text-right">
        {value}
      </span>
    </div>
  );
}
