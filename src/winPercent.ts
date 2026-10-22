/**
 * An engine evaluation from one side's perspective: either centipawns
 * (100 = about one pawn ahead) or "mate in N" (positive = this side mates,
 * negative = this side gets mated).
 */
export type Score = { cp: number } | { mate: number };

/** Lichess formula: centipawns → win% on a 0–100 scale. */
export function cpToWinPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function scoreToWinPercent(score: Score): number {
  if ("mate" in score) return score.mate > 0 ? 100 : 0;
  return cpToWinPercent(score.cp);
}

/** Flip a score to the other side's perspective. */
export function negate(score: Score): Score {
  return "mate" in score ? { mate: -score.mate } : { cp: -score.cp };
}
