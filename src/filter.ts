import { config } from "./config";
import type { ChessComGame } from "./chesscom";

export type SkipReason =
  | "variant"
  | "time-class"
  | "no-pgn"
  | "too-short"
  | "abandoned"
  | "early-resign"
  | "aborted";

/** Results that mean the game didn't really get played out. */
const DISCONNECT_RESULTS = new Set(["abandoned"]);

/** Count full moves from the PGN movetext ("1. e4 ... 23... Qxd1" → 23). */
export function countFullMoves(pgn: string): number {
  const matches = pgn.match(/(\d+)\.(?:\.\.)?\s/g);
  if (!matches) return 0;
  return Math.max(...matches.map((m) => parseInt(m, 10)));
}

/** Why a game should be skipped, or null if it's usable for analysis. */
export function skipReason(game: ChessComGame): SkipReason | null {
  if (game.rules !== "chess") return "variant";
  if (!(config.filter.allowedTimeClasses as readonly string[]).includes(game.time_class)) return "time-class";
  if (!game.pgn) return "no-pgn";

  const results = [game.white.result, game.black.result];
  if (results.some((r) => DISCONNECT_RESULTS.has(r))) return "abandoned";

  const moves = countFullMoves(game.pgn);
  if (moves === 0) return "aborted";
  if (results.includes("resigned") && moves < config.filter.minFullMoves) return "early-resign";
  if (moves < config.filter.minFullMoves) return "too-short";
  return null;
}

export interface FilterResult {
  kept: ChessComGame[];
  skipped: Partial<Record<SkipReason, number>>;
}

export function filterGames(games: ChessComGame[]): FilterResult {
  const kept: ChessComGame[] = [];
  const skipped: FilterResult["skipped"] = {};
  for (const g of games) {
    const reason = skipReason(g);
    if (reason) skipped[reason] = (skipped[reason] ?? 0) + 1;
    else kept.push(g);
  }
  return { kept, skipped };
}
