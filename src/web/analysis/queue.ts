/** Pure helpers for the client-side analysis queue (unit-tested). */
import type { GameAnalysis } from "../../analyze";
import type { ChessComGame } from "../../chesscom";
import { gameIdOf } from "../../analyze";

/** Games analyzed automatically on first load. */
export const DEFAULT_BATCH = 20;

/** Merge an analysis into the list (replacing the same gameId) and sort newest first. */
export function mergeAnalyses(list: GameAnalysis[], add: GameAnalysis[]): GameAnalysis[] {
  const byId = new Map(list.map((g) => [g.gameId, g]));
  for (const g of add) byId.set(g.gameId, g);
  return sortNewestFirst([...byId.values()]);
}

export function sortNewestFirst(list: GameAnalysis[]): GameAnalysis[] {
  return [...list].sort((a, b) => (a.playedAt < b.playedAt ? 1 : a.playedAt > b.playedAt ? -1 : 0));
}

/**
 * Next games to analyze: the `count` newest games (by end_time) that are not
 * analyzed yet and not already queued.
 */
export function pickUncached(
  games: ChessComGame[],
  analyzedIds: ReadonlySet<string>,
  count: number,
  exclude: ReadonlySet<string> = new Set(),
): ChessComGame[] {
  return [...games]
    .sort((a, b) => b.end_time - a.end_time)
    .filter((g) => {
      const id = gameIdOf(g);
      return !analyzedIds.has(id) && !exclude.has(id);
    })
    .slice(0, Math.max(0, count));
}

/** "vs Knuuuugen (bullet)" for the game being analyzed. */
export function gameLabel(game: ChessComGame, username: string): string {
  const white = game.white.username.toLowerCase() === username.toLowerCase();
  const opp = white ? game.black.username : game.white.username;
  return `vs ${opp} (${game.time_class})`;
}

const ACCOUNT_KEY = "bp:connected";

/** True the first time it is called for a username (per browser). Storage errors → true once per page load. */
const sessionSeen = new Set<string>();
export function markAccountConnected(username: string, storage: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  const u = username.toLowerCase();
  if (sessionSeen.has(u)) return false;
  sessionSeen.add(u);
  try {
    if (!storage) return true;
    const list = JSON.parse(storage.getItem(ACCOUNT_KEY) ?? "[]") as unknown;
    const arr = Array.isArray(list) ? (list as string[]) : [];
    if (arr.includes(u)) return false;
    storage.setItem(ACCOUNT_KEY, JSON.stringify([...arr, u]));
    return true;
  } catch {
    return true;
  }
}
