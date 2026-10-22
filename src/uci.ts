import type { Score } from "./winPercent.js";

/** One of the engine's top lines. Score is from the side-to-move's perspective. */
export interface EngineLine {
  /** 1 = best. */
  rank: number;
  move: string;
  score: Score;
  pv: string[];
}

export interface EvalResult {
  depth: number;
  /** Best first. May be shorter than MultiPV if there are few legal moves (or none). */
  lines: EngineLine[];
}

export interface AnalyzeOptions {
  depth: number;
  multiPv?: number;
  /** Optional time cap; the search stops at `depth` or this, whichever is first. */
  movetimeMs?: number;
}

/** Parse a UCI "info ... multipv K score cp X ... pv m1 m2" line. Returns null for other info lines. */
export function parseInfoLine(line: string): (EngineLine & { depth: number }) | null {
  if (!line.startsWith("info ") || !line.includes(" pv ") || !line.includes(" score ")) return null;
  if (line.includes(" lowerbound") || line.includes(" upperbound")) return null;
  const tok = line.split(" ");
  const at = (key: string) => tok.indexOf(key);
  const depth = Number(tok[at("depth") + 1]);
  const rank = at("multipv") >= 0 ? Number(tok[at("multipv") + 1]) : 1;
  const kind = tok[at("score") + 1];
  const value = Number(tok[at("score") + 2]);
  const score: Score = kind === "mate" ? { mate: value } : { cp: value };
  const pv = tok.slice(at("pv") + 1);
  return { depth, rank, move: pv[0]!, score, pv };
}

/** Anything that can analyze positions over UCI: native Stockfish in Node, or the WASM build in a browser worker. */
export interface UciEngine {
  /** e.g. "Stockfish 19". Part of the analysis cache key. */
  name: string;
  newGame(): Promise<void>;
  analyze(fen: string, opts: AnalyzeOptions): Promise<EvalResult>;
}
