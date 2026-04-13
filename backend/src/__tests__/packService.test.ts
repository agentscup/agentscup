/**
 * Pack opening probability tests.
 * We test the rarity distribution logic in isolation (no DB needed).
 */

const PACK_CONFIG = {
  starter: { cardCount: 5, rareGuarantee: 1, epicChance: 0.10, legendaryChance: 0.02 },
  pro: { cardCount: 8, rareGuarantee: 2, epicChance: 0.20, legendaryChance: 0.05 },
  elite: { cardCount: 12, rareGuarantee: 3, epicChance: 0.35, legendaryChance: 0.12 },
  legendary: { cardCount: 15, rareGuarantee: 5, epicChance: 0.50, legendaryChance: 0.25 },
};

function determineRarity(
  config: typeof PACK_CONFIG.starter,
  guaranteedRares: number,
  index: number,
  rng: () => number
): string {
  if (index < guaranteedRares) {
    const roll = rng();
    if (roll < config.legendaryChance) return "legendary";
    if (roll < config.epicChance) return "epic";
    return "rare";
  }
  const roll = rng();
  if (roll < config.legendaryChance * 0.5) return "legendary";
  if (roll < config.epicChance * 0.5) return "epic";
  if (roll < 0.3) return "rare";
  return "common";
}

function simulatePackOpening(packType: keyof typeof PACK_CONFIG, iterations: number) {
  const config = PACK_CONFIG[packType];
  const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
  let totalCards = 0;

  for (let i = 0; i < iterations; i++) {
    for (let j = 0; j < config.cardCount; j++) {
      const rarity = determineRarity(config, config.rareGuarantee, j, Math.random);
      counts[rarity as keyof typeof counts]++;
      totalCards++;
    }
  }

  return {
    counts,
    totalCards,
    rates: {
      common: counts.common / totalCards,
      rare: counts.rare / totalCards,
      epic: counts.epic / totalCards,
      legendary: counts.legendary / totalCards,
    },
  };
}

describe("Pack Opening Probabilities", () => {
  const ITERATIONS = 10000;

  test("starter pack: at least 1 rare guaranteed per pack", () => {
    const config = PACK_CONFIG.starter;
    for (let i = 0; i < 100; i++) {
      const rarities: string[] = [];
      for (let j = 0; j < config.cardCount; j++) {
        rarities.push(determineRarity(config, config.rareGuarantee, j, Math.random));
      }
      const nonCommon = rarities.filter((r) => r !== "common").length;
      expect(nonCommon).toBeGreaterThanOrEqual(1);
    }
  });

  test("pro pack: at least 2 rares guaranteed per pack", () => {
    const config = PACK_CONFIG.pro;
    for (let i = 0; i < 100; i++) {
      const rarities: string[] = [];
      for (let j = 0; j < config.cardCount; j++) {
        rarities.push(determineRarity(config, config.rareGuarantee, j, Math.random));
      }
      const nonCommon = rarities.filter((r) => r !== "common").length;
      expect(nonCommon).toBeGreaterThanOrEqual(2);
    }
  });

  test("legendary pack: at least 5 rares guaranteed per pack", () => {
    const config = PACK_CONFIG.legendary;
    for (let i = 0; i < 100; i++) {
      const rarities: string[] = [];
      for (let j = 0; j < config.cardCount; j++) {
        rarities.push(determineRarity(config, config.rareGuarantee, j, Math.random));
      }
      const nonCommon = rarities.filter((r) => r !== "common").length;
      expect(nonCommon).toBeGreaterThanOrEqual(5);
    }
  });

  test("legendary pack has higher epic/legendary rate than starter", () => {
    const starterResult = simulatePackOpening("starter", ITERATIONS);
    const legendaryResult = simulatePackOpening("legendary", ITERATIONS);

    expect(legendaryResult.rates.legendary).toBeGreaterThan(starterResult.rates.legendary);
    expect(legendaryResult.rates.epic).toBeGreaterThan(starterResult.rates.epic);
  });

  test("rarity distribution produces all 4 tiers", () => {
    const result = simulatePackOpening("elite", ITERATIONS);
    expect(result.counts.common).toBeGreaterThan(0);
    expect(result.counts.rare).toBeGreaterThan(0);
    expect(result.counts.epic).toBeGreaterThan(0);
    expect(result.counts.legendary).toBeGreaterThan(0);
  });

  test("guaranteed slots never produce common", () => {
    const config = PACK_CONFIG.elite;
    for (let i = 0; i < 1000; i++) {
      for (let j = 0; j < config.rareGuarantee; j++) {
        const rarity = determineRarity(config, config.rareGuarantee, j, Math.random);
        expect(rarity).not.toBe("common");
      }
    }
  });
});
