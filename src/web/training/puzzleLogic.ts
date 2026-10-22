/**
 * Lichess puzzle rules, pure (chess.js only).
 *  - puzzle.fen is the position BEFORE the opponent's setup move (moves[0]).
 *  - After the setup move, the player must play solution[0], the opponent
 *    auto-replies solution[1], and so on.
 *  - Any move that delivers checkmate is accepted in place of the expected
 *    move, and solves the puzzle (Lichess convention).
 *  - A wrong move fails the puzzle; the rest of the solution can be stepped through.
 *  - Promotions are matched exactly, including underpromotion (e7e8n ≠ e7e8q).
 */
import { Chess, type Square } from "chess.js";
import type { Puzzle } from "../types";

export type Color = "w" | "b";
export type PromotionPiece = "q" | "r" | "b" | "n";

export interface SquarePair {
  from: string;
  to: string;
}

export interface PuzzleRun {
  /** Position the player is looking at now. */
  fen: string;
  /** Position before the setup move (for the setup animation). */
  initialFen: string;
  setupMove: string;
  playerColor: Color;
  /** Moves after the setup move: [player, opponent, player, ...]. */
  solution: string[];
  /** Index in `solution` of the next move to be played. */
  ply: number;
  status: "playing" | "solved" | "failed";
  lastMove: SquarePair | null;
  /** The wrong move the player made, if failed. */
  wrongMove: string | null;
}

export function uciToPair(uci: string): SquarePair {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

/** Play a UCI move on a copy; null if illegal. */
export function applyUci(fen: string, uci: string): { fen: string; san: string; mate: boolean } | null {
  try {
    const c = new Chess(fen);
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (!m) return null;
    return { fen: c.fen(), san: m.san, mate: c.isCheckmate() };
  } catch {
    return null;
  }
}

export function sideToMove(fen: string): Color {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

/** Set up a Lichess puzzle: the opponent's setup move has been applied. */
export function startPuzzle(p: Pick<Puzzle, "fen" | "moves">): PuzzleRun {
  const [setupMove = "", ...solution] = p.moves;
  const after = applyUci(p.fen, setupMove);
  if (!after) throw new Error(`Invalid setup move ${setupMove} for ${p.fen}`);
  return {
    fen: after.fen,
    initialFen: p.fen,
    setupMove,
    playerColor: sideToMove(after.fen),
    solution,
    ply: 0,
    status: "playing",
    lastMove: uciToPair(setupMove),
    wrongMove: null,
  };
}

/** True if from→to is a legal pawn move to the last rank (needs a promotion choice). */
export function needsPromotion(fen: string, from: string, to: string): boolean {
  try {
    const moves = new Chess(fen).moves({ square: from as Square, verbose: true });
    return moves.some((m) => m.to === to && !!m.promotion);
  } catch {
    return false;
  }
}

/** Legal destination squares for the piece on `from` (for click-to-move dots). */
export function legalTargets(fen: string, from: string): { to: string; capture: boolean }[] {
  try {
    const moves = new Chess(fen).moves({ square: from as Square, verbose: true });
    const seen = new Map<string, boolean>();
    for (const m of moves) seen.set(m.to, seen.get(m.to) || m.isCapture() || m.isEnPassant());
    return [...seen].map(([to, capture]) => ({ to, capture }));
  } catch {
    return [];
  }
}

/** Piece color on a square, or null. */
export function pieceColorAt(fen: string, square: string): Color | null {
  try {
    return new Chess(fen).get(square as Square)?.color ?? null;
  } catch {
    return null;
  }
}

export function isLegal(fen: string, uci: string): boolean {
  return applyUci(fen, uci) !== null;
}

/** Build a UCI string, with the promotion suffix if given. */
export function toUci(from: string, to: string, promotion?: PromotionPiece | null): string {
  return `${from}${to}${promotion ?? ""}`;
}

export type MoveOutcome =
  /** Correct, and the opponent will reply with `reply` (call applyReply after a short delay). */
  | { result: "correct"; run: PuzzleRun; reply: string }
  /** Correct and the puzzle is complete. */
  | { result: "solved"; run: PuzzleRun }
  /** Wrong move: puzzle failed. `run.fen` shows the wrong move; `expected` is what was wanted. */
  | { result: "wrong"; run: PuzzleRun; expected: string; wrongFen: string }
  /** Not a legal move; nothing changed. */
  | { result: "illegal"; run: PuzzleRun };

/** The player tries a move (UCI, with promotion suffix when promoting). */
export function tryMove(run: PuzzleRun, uci: string): MoveOutcome {
  if (run.status !== "playing") return { result: "illegal", run };
  const played = applyUci(run.fen, uci);
  if (!played) return { result: "illegal", run };
  const expected = run.solution[run.ply];
  if (expected === undefined) return { result: "illegal", run };

  const matches = uci.toLowerCase() === expected.toLowerCase();
  if (played.mate || (matches && run.ply + 1 >= run.solution.length)) {
    return { result: "solved", run: { ...run, fen: played.fen, ply: run.solution.length, status: "solved", lastMove: uciToPair(uci) } };
  }
  if (!matches) {
    return {
      result: "wrong",
      expected,
      wrongFen: played.fen,
      run: { ...run, status: "failed", wrongMove: uci },
    };
  }
  const reply = run.solution[run.ply + 1]!;
  return { result: "correct", reply, run: { ...run, fen: played.fen, ply: run.ply + 1, lastMove: uciToPair(uci) } };
}

/** Apply the opponent's scripted reply after a correct player move. */
export function applyReply(run: PuzzleRun): PuzzleRun {
  const reply = run.solution[run.ply];
  if (run.status !== "playing" || reply === undefined) return run;
  const after = applyUci(run.fen, reply);
  if (!after) return run;
  return { ...run, fen: after.fen, ply: run.ply + 1, lastMove: uciToPair(reply) };
}

/** The move the player should play now (for Hint / Solution / after a wrong move). */
export function expectedMove(run: PuzzleRun): string | null {
  return run.solution[run.ply] ?? null;
}

/**
 * Step through the remaining solution after a failure (or to show it).
 * Returns the run with the next solution move applied, or null at the end.
 */
export function revealNext(run: PuzzleRun): PuzzleRun | null {
  const mv = run.solution[run.ply];
  if (mv === undefined) return null;
  const after = applyUci(run.fen, mv);
  if (!after) return null;
  return { ...run, fen: after.fen, ply: run.ply + 1, lastMove: uciToPair(mv) };
}

/** Restart the same puzzle from the position after the setup move. */
export function resetPuzzle(run: PuzzleRun): PuzzleRun {
  return startPuzzle({ fen: run.initialFen, moves: [run.setupMove, ...run.solution] });
}

/** SAN for a UCI move in a position (for messages like "The move was Qxe7"). */
export function sanOf(fen: string, uci: string): string {
  return applyUci(fen, uci)?.san ?? uci;
}
