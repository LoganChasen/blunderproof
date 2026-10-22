import { Chess } from "chess.js";
import { config } from "./config";

export type GamePhase = "opening" | "middlegame" | "endgame";

/** "<10s" | "<30s" | "<60s" | "60s+" (from config.clockBucketsSec). */
export type ClockBucket = string;

/** Moves up to this full-move number count as the opening (unless it's already an endgame). */
const OPENING_LAST_MOVE = 12;
/** At most this many knights/bishops/rooks/queens left on the board (both sides) means an endgame. */
const ENDGAME_MAX_PIECES = 6;

/** Count non-pawn, non-king pieces for both sides. */
function minorAndMajorPieces(fen: string): number {
  let n = 0;
  for (const row of new Chess(fen).board()) {
    for (const sq of row) if (sq && sq.type !== "p" && sq.type !== "k") n++;
  }
  return n;
}

export function gamePhase(fen: string, moveNumber: number): GamePhase {
  if (minorAndMajorPieces(fen) <= ENDGAME_MAX_PIECES) return "endgame";
  if (moveNumber <= OPENING_LAST_MOVE) return "opening";
  return "middlegame";
}

export function clockBucket(clockMs: number | null): ClockBucket | null {
  if (clockMs === null) return null;
  for (const sec of config.clockBucketsSec) if (clockMs < sec * 1000) return `<${sec}s`;
  return `${config.clockBucketsSec.at(-1)}s+`;
}

/** Base time in ms from a Chess.com time control like "180" or "180+2". */
export function baseTimeMs(timeControl: string): number | null {
  const base = Number(timeControl.split("+")[0]);
  return Number.isFinite(base) && base > 0 ? base * 1000 : null;
}

export interface MoveContext {
  phase: GamePhase;
  clockBucket: ClockBucket | null;
  /** Share of the starting clock left (0–1), useful across time controls. */
  clockFraction: number | null;
  moveNumber: number;
}

export function moveContext(fenBefore: string, moveNumber: number, clockMs: number | null, timeControl: string): MoveContext {
  const base = baseTimeMs(timeControl);
  return {
    phase: gamePhase(fenBefore, moveNumber),
    clockBucket: clockBucket(clockMs),
    clockFraction: clockMs !== null && base ? Math.min(1, clockMs / base) : null,
    moveNumber,
  };
}
