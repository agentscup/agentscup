import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Rarity } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getRarityColor(rarity: Rarity): string {
  switch (rarity) {
    case 'legendary': return '#FFD700';
    case 'epic': return '#C0C0C0';
    case 'rare': return '#00AEEF';
    case 'common': return '#FFFFFF';
  }
}

export function getRarityGradient(rarity: Rarity): string {
  switch (rarity) {
    case 'legendary': return 'from-yellow-600 via-yellow-400 to-yellow-600';
    case 'epic': return 'from-gray-400 via-gray-200 to-gray-400';
    case 'rare': return 'from-sky-600 via-sky-400 to-sky-600';
    case 'common': return 'from-gray-600 via-gray-400 to-gray-600';
  }
}

export function formatSol(lamports: number): string {
  return (lamports / 1_000_000_000).toFixed(2);
}

export function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}

export function solToLamports(sol: number): number {
  return Math.round(sol * 1_000_000_000);
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function calculateChemistry(agents: { techStack: string }[]): number {
  const stackCounts: Record<string, number> = {};
  agents.forEach(a => {
    stackCounts[a.techStack] = (stackCounts[a.techStack] || 0) + 1;
  });
  let chemistry = 50; // base
  Object.values(stackCounts).forEach(count => {
    if (count >= 3) chemistry += (count - 2) * 5;
    if (count >= 5) chemistry += 10;
  });
  return Math.min(100, chemistry);
}
