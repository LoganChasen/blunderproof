import { Chess } from "chess.js";
import { config } from "../config.js";
import type { Score } from "../winPercent.js";
import type { Detector } from "./types.js";

/** Positive N if the score is a forced mate for the side to move, otherwise null. */
function mateFor(score: Score | undefined): number | null {
  if (!score || !("mate" in score)) return null;
  return score.mate > 0 ? score.mate : null;
}

/** True if the position after the played move is already checkmate. */
function isMateOnBoard(fen: string): boolean {
  try {
    return new Chess(fen).isCheckmate();
  } catch {
    return false;
  }
}

/**
 * Missed mate: the engine's best move forces mate, but the move played doesn't.
 * A slower mate that is still forced (a top line with a positive mate score,
 * or a winAfter of 100 meaning the post-move search still saw mate) is not a miss.
 */
export const detectMissedMate: Detector = (ctx) => {
  const best = ctx.topMoves[0];
  const mateIn = mateFor(best?.score);
  if (!best || mateIn === null) return null;
  if (mateIn > config.patterns.maxMissedMateLength) return null;

  if (ctx.played === best.move) return null;
  const playedLine = ctx.topMoves.find((t) => t.move === ctx.played);
  if (playedLine && mateFor(playedLine.score) !== null) return null;
  // Played move wasn't in the top lines but the follow-up search still scores it as a forced mate.
  if (!playedLine && ctx.winAfter >= 100) return null;
  if (isMateOnBoard(ctx.fenAfter)) return null;

  const san = best.san;
  const explanation =
    mateIn === 1 ? `Missed mate in 1: ${san}.` : `Missed mate in ${mateIn} starting with ${san}.`;
  return { explanation };
};
