import { calculateElo } from "../services/eloService";

describe("ELO Service", () => {
  test("winner gains rating, loser loses rating", () => {
    const { newWinnerElo, newLoserElo } = calculateElo(1000, 1000);
    expect(newWinnerElo).toBeGreaterThan(1000);
    expect(newLoserElo).toBeLessThan(1000);
  });

  test("equal ratings: winner gains 16, loser loses 16 (K=32)", () => {
    const { newWinnerElo, newLoserElo } = calculateElo(1000, 1000);
    expect(newWinnerElo).toBe(1016);
    expect(newLoserElo).toBe(984);
  });

  test("underdog wins: gains more rating", () => {
    const { newWinnerElo: underdogWin } = calculateElo(800, 1200);
    const { newWinnerElo: favoriteWin } = calculateElo(1200, 800);
    // Underdog should gain more than favorite for winning
    expect(underdogWin - 800).toBeGreaterThan(favoriteWin - 1200);
  });

  test("draw: ratings move toward each other", () => {
    const { newWinnerElo: higher, newLoserElo: lower } = calculateElo(1200, 800, true);
    expect(higher).toBeLessThan(1200); // Higher rated drops
    expect(lower).toBeGreaterThan(800); // Lower rated gains
  });

  test("draw between equals: no change", () => {
    const { newWinnerElo, newLoserElo } = calculateElo(1000, 1000, true);
    expect(newWinnerElo).toBe(1000);
    expect(newLoserElo).toBe(1000);
  });

  test("total ELO is conserved (win)", () => {
    const { newWinnerElo, newLoserElo } = calculateElo(1300, 1100);
    // Due to rounding, allow ±1
    expect(Math.abs((newWinnerElo + newLoserElo) - (1300 + 1100))).toBeLessThanOrEqual(1);
  });

  test("total ELO is conserved (draw)", () => {
    const { newWinnerElo, newLoserElo } = calculateElo(1300, 1100, true);
    expect(Math.abs((newWinnerElo + newLoserElo) - (1300 + 1100))).toBeLessThanOrEqual(1);
  });
});
