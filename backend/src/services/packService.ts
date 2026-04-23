import { supabase } from "../lib/supabase";
import crypto from "crypto";

/**
 * Pack prices denominated in $CUP (18 decimals). The frontend reads
 * `priceCupWei` and the V2 PackStore's `buyPack(tier, requestId)`
 * pulls exactly this amount via CUP transferFrom. Verifier compares
 * the event's `amount` bit-for-bit against `priceCupWei` below.
 *
 * V2 migration (2026-04-23): economy flipped from native ETH to
 * $CUP. The V2 PackStore contract stores the price table on-chain
 * in `packPrices(tier)` — changing prices here requires calling
 * `setPackPrice(tier, newWei)` on the contract AND updating this
 * file in the same drop so the verifier stays in sync.
 */
const CUP_WEI = 10n ** 18n;

export const PACK_CONFIGS = {
  starter: {
    name: "Starter Pack",
    tier: 1,
    priceCupWei: (50_000n * CUP_WEI).toString(),
    priceCupHuman: "50,000",
    cardCount: 4,
    rareGuarantee: 0,
    epicChance: 0.02,
    legendaryChance: 0.003,
    description: "4 cards — mostly common, small rare chance",
  },
  pro: {
    name: "Pro Pack",
    tier: 2,
    priceCupWei: (100_000n * CUP_WEI).toString(),
    priceCupHuman: "100,000",
    cardCount: 7,
    rareGuarantee: 1,
    epicChance: 0.05,
    legendaryChance: 0.008,
    description: "7 cards with 1 guaranteed rare+",
  },
  elite: {
    name: "Elite Pack",
    tier: 3,
    priceCupWei: (250_000n * CUP_WEI).toString(),
    priceCupHuman: "250,000",
    cardCount: 12,
    rareGuarantee: 3,
    epicChance: 0.25,
    legendaryChance: 0.05,
    description: "12 cards with 3 guaranteed rare+ and 25% epic odds",
  },
  legendary: {
    name: "Legendary Pack",
    tier: 4,
    priceCupWei: (750_000n * CUP_WEI).toString(),
    priceCupHuman: "750,000",
    cardCount: 15,
    rareGuarantee: 5,
    epicChance: 0.35,
    legendaryChance: 0.2,
    description: "15 cards with 5 guaranteed rare+ and 20% legendary odds",
  },
} as const;

export type PackType = keyof typeof PACK_CONFIGS;

/** Reverse-lookup: given a numeric on-chain pack tier, return the key. */
export function packTypeFromTier(tier: number): PackType | null {
  for (const [key, cfg] of Object.entries(PACK_CONFIGS)) {
    if (cfg.tier === tier) return key as PackType;
  }
  return null;
}

interface AgentRow {
  id: string;
  rarity: string;
}

/**
 * Select random agent IDs based on pack rarity distribution.
 * This is a PURE function — no DB writes. DB writes happen atomically in the PostgreSQL function.
 */
export async function selectPackCards(
  packType: string
): Promise<{ agentIds: string[]; mintAddresses: string[] }> {
  const config = PACK_CONFIGS[packType as keyof typeof PACK_CONFIGS];
  if (!config) throw new Error("Invalid pack type");

  // Fetch all agents (including managers) from DB
  const { data: allAgents, error } = await supabase
    .from("agents")
    .select("id, rarity");

  if (error || !allAgents || allAgents.length === 0) {
    throw new Error("No agents found in database. Run seed first.");
  }

  const byRarity: Record<string, AgentRow[]> = {
    common: allAgents.filter((a) => a.rarity === "common"),
    rare: allAgents.filter((a) => a.rarity === "rare"),
    epic: allAgents.filter((a) => a.rarity === "epic"),
    legendary: allAgents.filter((a) => a.rarity === "legendary"),
  };

  const agentIds: string[] = [];
  const mintAddresses: string[] = [];

  for (let i = 0; i < config.cardCount; i++) {
    let rarity: string;

    if (i < config.rareGuarantee) {
      const roll = Math.random();
      if (roll < config.legendaryChance) rarity = "legendary";
      else if (roll < config.epicChance) rarity = "epic";
      else rarity = "rare";
    } else {
      const roll = Math.random();
      // Non-guaranteed slots: halved epic/legendary chance, rare chance scales with pack tier
      const rareFloor = packType === "starter" ? 0.12
                      : packType === "pro"     ? 0.18
                      : packType === "elite"   ? 0.30
                      : 0.35;
      if (roll < config.legendaryChance * 0.5) rarity = "legendary";
      else if (roll < config.epicChance * 0.5) rarity = "epic";
      else if (roll < rareFloor) rarity = "rare";
      else rarity = "common";
    }

    const pool = byRarity[rarity];
    if (pool.length === 0) {
      const fallback = byRarity.common;
      agentIds.push(fallback[Math.floor(Math.random() * fallback.length)].id);
    } else {
      agentIds.push(pool[Math.floor(Math.random() * pool.length)].id);
    }

    mintAddresses.push(`mint_${crypto.randomBytes(16).toString("hex")}`);
  }

  return { agentIds, mintAddresses };
}
