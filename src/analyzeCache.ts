import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analysisCacheKey, analyzeGame, type GameAnalysis } from "./analyze.js";
import type { ChessComGame } from "./chesscom.js";
import type { UciEngine } from "./uci.js";

/** analyzeGame with a permanent on-disk cache (Node only). Never re-analyzes a game. */
export async function analyzeGameCached(
  game: ChessComGame,
  username: string,
  engine: UciEngine,
  cacheDir: string,
): Promise<GameAnalysis & { cached: boolean }> {
  const file = join(cacheDir, `${analysisCacheKey(game, engine.name)}.json`);
  try {
    return { ...(JSON.parse(await readFile(file, "utf8")) as GameAnalysis), cached: true };
  } catch {
    // Not cached.
  }
  const result = await analyzeGame(game, username, engine);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(file, JSON.stringify(result));
  return { ...result, cached: false };
}
