import type { TopMove } from "../analyze";

export type Pattern = "missed-mate" | "back-rank" | "hanging-piece" | "missed-capture" | "other";

/** Everything a detector gets to look at for one player error. */
export interface BlunderContext {
  /** Position before the player's move (player to move). */
  fenBefore: string;
  /** Position after the player's move (opponent to move). */
  fenAfter: string;
  /** The move the player actually made, UCI and SAN. */
  played: string;
  playedSan: string;
  /** Engine's top moves in fenBefore, best first, each with its PV. */
  topMoves: TopMove[];
  /** Engine's expected continuation after the played move, starting with the opponent's reply (UCI). */
  refutation: string[];
  /** Player's win% before/after (0–100). */
  winBefore: number;
  winAfter: number;
}

export interface DetectorResult {
  /** Short plain-English reason, e.g. "Left the knight on f6 undefended; Bxf6 wins it." */
  explanation: string;
}

/** Returns a result when the pattern applies, otherwise null. Must be pure and fast (no engine calls). */
export type Detector = (ctx: BlunderContext) => DetectorResult | null;
