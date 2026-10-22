import { Chess } from "chess.js";
import { config } from "./config.js";
import type { GameAnalysis, MoveAnalysis, TopMove } from "./analyze.js";
import { materialSwing, playUci } from "./patterns/helpers.js";

/** How many plies of a line count when measuring "wins material". */
const MATERIAL_WINDOW_PLIES = 4;

export type CheckpointReason = "forces-mate" | "wins-material" | "only-good-move";

export interface CheckpointVerdict {
  ok: boolean;
  reasons: CheckpointReason[];
  /** Why it was rejected (when ok = false). */
  rejectedBecause?: "not-deep-checked" | "too-few-moves" | "no-clear-best" | "quiet-positional";
  /** Win% gap between the best and 2nd-best moves (Infinity if only one legal move). */
  gap: number;
  /** Material the best line wins for the player (pawn = 1). */
  materialGain: number;
}

function isForcing(fen: string, uci: string): boolean {
  const m = playUci(new Chess(fen), uci);
  return !!m && (m.isCapture() || m.isPromotion() || m.san.includes("+") || m.san.includes("#"));
}

/**
 * Should this player error become a checkpoint puzzle?
 *  - The best move must stand out: ≥ minGapToSecondBest win% points better than
 *    the 2nd-best move, OR it wins material, OR it forces mate.
 *  - Not a quiet positional move nobody would find: if the best move isn't forcing
 *    (capture/check/promotion), there must be concrete material or mate at stake.
 * Live-only is guaranteed upstream by the game filter.
 */
export function judgeCheckpoint(mv: MoveAnalysis): CheckpointVerdict {
  const base = { reasons: [] as CheckpointReason[], gap: 0, materialGain: 0 };
  if (!mv.deep) return { ...base, ok: false, rejectedBecause: "not-deep-checked" };
  const [best, second] = mv.topMoves as [TopMove | undefined, TopMove | undefined];
  if (!best) return { ...base, ok: false, rejectedBecause: "too-few-moves" };

  const legalMoves = new Chess(mv.fenBefore).moves().length;
  if (legalMoves < 2) return { ...base, ok: false, rejectedBecause: "too-few-moves" };

  const gap = second ? best.winPercent - second.winPercent : Infinity;
  const materialGain = materialSwing(mv.fenBefore, best.pv.slice(0, MATERIAL_WINDOW_PLIES), mv.color);
  const forcesMate = "mate" in best.score && best.score.mate > 0;

  const reasons: CheckpointReason[] = [];
  if (forcesMate) reasons.push("forces-mate");
  if (materialGain >= config.checkpoint.minMaterialGain) reasons.push("wins-material");
  if (gap >= config.checkpoint.minGapToSecondBest) reasons.push("only-good-move");

  if (reasons.length === 0) return { ok: false, reasons, gap, materialGain, rejectedBecause: "no-clear-best" };

  // Quiet best move with nothing concrete at stake = positional; skip it.
  // "Concrete" includes the refutation winning material, e.g. the right move
  // was to save a hanging piece.
  const refutationWins = mv.refutation
    ? -materialSwing(mv.fenAfter, mv.refutation.slice(0, MATERIAL_WINDOW_PLIES), mv.color)
    : 0;
  const concrete = forcesMate || materialGain >= config.checkpoint.minMaterialGain || refutationWins >= config.checkpoint.minMaterialGain;
  if (!isForcing(mv.fenBefore, best.move) && !concrete) {
    return { ok: false, reasons, gap, materialGain, rejectedBecause: "quiet-positional" };
  }

  return { ok: true, reasons, gap, materialGain };
}

export interface Checkpoint {
  gameId: string;
  gameUrl: string;
  opponent: string;
  playedAt: string;
  timeClass: string;
  moveNumber: number;
  color: "w" | "b";
  fen: string;
  movePlayed: string;
  movePlayedSan: string;
  bestMove: string;
  bestMoveSan: string;
  /** Stored once so the pass rule never needs the engine again. */
  topMoves: TopMove[];
  clockMs: number | null;
  winBefore: number;
  winAfter: number;
  reasons: CheckpointReason[];
  gap: number;
}

/** The player's blunders in a game that qualify as checkpoints. */
export function selectCheckpoints(game: GameAnalysis): Checkpoint[] {
  const out: Checkpoint[] = [];
  for (const mv of game.moves) {
    if (mv.color !== game.playerColor || mv.label !== "blunder") continue;
    const v = judgeCheckpoint(mv);
    if (!v.ok) continue;
    out.push({
      gameId: game.gameId,
      gameUrl: game.url,
      opponent: game.opponent,
      playedAt: game.playedAt,
      timeClass: game.timeClass,
      moveNumber: mv.moveNumber,
      color: mv.color,
      fen: mv.fenBefore,
      movePlayed: mv.uci,
      movePlayedSan: mv.san,
      bestMove: mv.bestMove!,
      bestMoveSan: mv.bestMoveSan!,
      topMoves: mv.topMoves,
      clockMs: mv.clockMs,
      winBefore: mv.winBefore,
      winAfter: mv.winAfter,
      reasons: v.reasons,
      gap: v.gap,
    });
  }
  return out;
}

/**
 * Pass rule: the answer is the top engine move, or one of the stored top moves
 * within config.passMargin win% points of it. Moves outside the stored top
 * lines fail. With a ≥10-point gap required, that's almost always correct.
 */
export function passesCheckpoint(cp: Pick<Checkpoint, "topMoves">, uci: string): boolean {
  const best = cp.topMoves[0];
  if (!best) return false;
  if (uci === best.move) return true;
  const alt = cp.topMoves.find((t) => t.move === uci);
  return !!alt && best.winPercent - alt.winPercent <= config.passMargin;
}
