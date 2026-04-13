export function calculateElo(winnerElo: number, loserElo: number, isDraw: boolean = false): { newWinnerElo: number; newLoserElo: number } {
  const K = 32;
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLoser = 1 / (1 + Math.pow(10, (winnerElo - loserElo) / 400));

  if (isDraw) {
    return {
      newWinnerElo: Math.round(winnerElo + K * (0.5 - expectedWinner)),
      newLoserElo: Math.round(loserElo + K * (0.5 - expectedLoser)),
    };
  }

  return {
    newWinnerElo: Math.round(winnerElo + K * (1 - expectedWinner)),
    newLoserElo: Math.round(loserElo + K * (0 - expectedLoser)),
  };
}
