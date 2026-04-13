import { simulateMatch, SquadInput, MatchResult } from "../engine/matchEngine";

function makeSquad(overallBase: number): SquadInput {
  const positions = [
    { slot: "GK", position: "GK" },
    { slot: "CB1", position: "CB" },
    { slot: "CB2", position: "CB" },
    { slot: "LB", position: "LB" },
    { slot: "RB", position: "RB" },
    { slot: "CM1", position: "CM" },
    { slot: "CM2", position: "CM" },
    { slot: "CM3", position: "CM" },
    { slot: "LW", position: "LW" },
    { slot: "ST", position: "ST" },
    { slot: "RW", position: "RW" },
  ];

  return {
    formation: "4-3-3",
    players: positions.map((p, i) => ({
      slot: p.slot,
      position: p.position,
      name: `Player_${p.slot}_${i}`,
      overall: overallBase + (i % 5),
      pace: overallBase + (i % 3),
      shooting: overallBase - 2 + (i % 4),
      passing: overallBase + 1,
      dribbling: overallBase - 1 + (i % 3),
      defending: overallBase + (p.position === "CB" || p.position === "LB" || p.position === "RB" || p.position === "GK" ? 10 : -5),
      physical: overallBase + 2,
    })),
    managerBonus: 3,
  };
}

describe("Match Engine", () => {
  test("produces a valid result", () => {
    const home = makeSquad(80);
    const away = makeSquad(75);
    const result = simulateMatch(home, away, 12345);

    expect(result.homeScore).toBeGreaterThanOrEqual(0);
    expect(result.awayScore).toBeGreaterThanOrEqual(0);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.possession.home + result.possession.away).toBeLessThanOrEqual(101); // rounding
    expect(result.possession.home + result.possession.away).toBeGreaterThanOrEqual(99);
    expect(result.manOfTheMatch.playerName).toBeTruthy();
  });

  test("is deterministic — same seed produces same result", () => {
    const home = makeSquad(80);
    const away = makeSquad(80);
    const seed = 42;

    const result1 = simulateMatch(home, away, seed);
    const result2 = simulateMatch(home, away, seed);

    expect(result1.homeScore).toBe(result2.homeScore);
    expect(result1.awayScore).toBe(result2.awayScore);
    expect(result1.events.length).toBe(result2.events.length);
    expect(result1.possession).toEqual(result2.possession);
    expect(result1.manOfTheMatch).toEqual(result2.manOfTheMatch);

    // Check every event matches
    for (let i = 0; i < result1.events.length; i++) {
      expect(result1.events[i].minute).toBe(result2.events[i].minute);
      expect(result1.events[i].type).toBe(result2.events[i].type);
      expect(result1.events[i].team).toBe(result2.events[i].team);
      expect(result1.events[i].playerName).toBe(result2.events[i].playerName);
    }
  });

  test("different seeds produce different results", () => {
    const home = makeSquad(80);
    const away = makeSquad(80);

    const result1 = simulateMatch(home, away, 100);
    const result2 = simulateMatch(home, away, 999);

    // Very unlikely same scores AND same events with different seeds
    const same =
      result1.homeScore === result2.homeScore &&
      result1.awayScore === result2.awayScore &&
      result1.events.length === result2.events.length;

    // This could theoretically match, but extremely unlikely
    if (same) {
      // At least one event should differ
      const allSame = result1.events.every(
        (e, i) => e.type === result2.events[i].type && e.minute === result2.events[i].minute
      );
      expect(allSame).toBe(false);
    }
  });

  test("stronger team tends to win over many simulations", () => {
    const strong = makeSquad(90);
    const weak = makeSquad(60);
    let strongWins = 0;

    for (let seed = 0; seed < 100; seed++) {
      const result = simulateMatch(strong, weak, seed);
      if (result.homeScore > result.awayScore) strongWins++;
    }

    // Strong team should win majority
    expect(strongWins).toBeGreaterThan(40);
  });

  test("events include kick_off and full_time", () => {
    const home = makeSquad(80);
    const away = makeSquad(80);
    const result = simulateMatch(home, away, 777);

    const types = result.events.map((e) => e.type);
    expect(types).toContain("kick_off");
    expect(types).toContain("full_time");
  });

  test("half_time event exists at minute 45", () => {
    const home = makeSquad(80);
    const away = makeSquad(80);
    const result = simulateMatch(home, away, 333);

    const ht = result.events.find((e) => e.type === "half_time");
    expect(ht).toBeDefined();
    expect(ht!.minute).toBe(45);
  });

  test("goals count matches final score", () => {
    const home = makeSquad(85);
    const away = makeSquad(75);

    for (let seed = 0; seed < 20; seed++) {
      const result = simulateMatch(home, away, seed);
      const homeGoals = result.events.filter((e) => e.type === "goal" && e.team === "home").length;
      const awayGoals = result.events.filter((e) => e.type === "goal" && e.team === "away").length;
      expect(homeGoals).toBe(result.homeScore);
      expect(awayGoals).toBe(result.awayScore);
    }
  });
});
