/**
 * Phase 0 prototype: analyze a Chess.com player's recent games and print a
 * blunder report plus checkpoint candidates.
 *
 *   npm run phase0 -- <username> [--months 2] [--games 20]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { GameAnalysis } from "../src/analyze.js";
import { analyzeGameCached } from "../src/analyzeCache.js";
import { fetchRecentGames, PlayerNotFoundError } from "../src/chesscom.js";
import { config } from "../src/config.js";
import { Engine } from "../src/engine.js";
import { filterGames } from "../src/filter.js";
import { buildReport, renderMarkdown, renderTerminal } from "../src/report.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    months: { type: "string", default: String(config.fetch.defaultMonths) },
    games: { type: "string", default: String(config.fetch.defaultMaxGames) },
  },
});

const username = positionals[0];
if (!username) {
  console.error("Usage: npm run phase0 -- <chess.com username> [--months 2] [--games 20]");
  process.exit(1);
}
const months = Number(values.months);
const maxGames = Number(values.games);

async function main() {
  console.log(`Fetching the last ${months} month(s) of games for ${username}...`);
  const all = await fetchRecentGames(username!, months, { cacheDir: ".cache/chesscom" });
  const { kept, skipped } = filterGames(all);
  const games = kept.slice(0, maxGames);
  console.log(`${all.length} games found, ${kept.length} usable, analyzing the ${games.length} most recent.\n`);

  const engine = await Engine.start();
  const analyses: GameAnalysis[] = [];
  const started = Date.now();
  try {
    for (const [i, g] of games.entries()) {
      const a = await analyzeGameCached(g, username!, engine, ".cache/analysis");
      analyses.push(a);
      const mine = a.moves.filter((m) => m.color === a.playerColor);
      const blunders = mine.filter((m) => m.label === "blunder").length;
      const tag = a.cached ? "cached" : `${(a.analysisMs / 1000).toFixed(1)}s`;
      console.log(
        `[${String(i + 1).padStart(String(games.length).length)}/${games.length}] ${a.timeClass.padEnd(6)} vs ${a.opponent.padEnd(22)} ${a.result.padEnd(11)} ${blunders} blunder(s)  (${tag})`,
      );
    }
  } finally {
    await engine.quit();
  }

  const report = buildReport(username!, analyses, skipped);
  const outDir = join("out", username!.toLowerCase());
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "report.md"), renderMarkdown(report));
  await writeFile(join(outDir, "checkpoints.json"), JSON.stringify(report.checkpoints, null, 2));
  await writeFile(join(outDir, "blunders.json"), JSON.stringify(report.errors, null, 2));

  console.log(renderTerminal(report));
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(0)}s. Full report: ${join(outDir, "report.md")}`);
}

main().catch((err) => {
  if (err instanceof PlayerNotFoundError) {
    console.error(err.message);
    process.exit(2);
  }
  throw err;
});
