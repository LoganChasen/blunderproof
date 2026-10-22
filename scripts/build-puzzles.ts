/**
 * Build themed puzzle packs from the Lichess puzzle database (CC0).
 *
 *   npx tsx scripts/build-puzzles.ts [path/to/lichess_db_puzzle.csv.zst]
 *
 * Streams `zstd -dc` line by line (never loads the file into memory), keeps
 * well-tested popular puzzles, and for every theme in ALL_THEMES keeps up to
 * PER_BAND puzzles in each 100-point rating band (500..2900), preferring the most
 * popular. Writes public/puzzles/{theme}.json as compact rows
 * [id, fen, moves, rating, popularity, themes] sorted by rating, plus index.json.
 */
import { spawn } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ALL_THEMES } from "../src/web/puzzles/themes";

const SRC = process.argv[2] ?? ".cache/puzzles/lichess_db_puzzle.csv.zst";
const OUT = "public/puzzles";
const MIN_POPULARITY = 85;
const MIN_PLAYS = 300;
const MAX_RD = 100;
const RATING_MIN = 500;
const RATING_MAX = 2900;
const BAND = 100;
const PER_BAND = 75;
const NBANDS = (RATING_MAX - RATING_MIN) / BAND;

type Row = [id: string, fen: string, moves: string, rating: number, popularity: number, themes: string];
interface Entry {
  row: Row;
  score: number;
}

/** Higher is better: popularity first, play count as tie-break. */
function score(popularity: number, plays: number): number {
  return popularity * 1e7 + Math.min(plays, 9_999_999);
}

/** Bounded "keep the best N" bucket. Tracks its current worst so most rejects are O(1). */
class Bucket {
  items: Entry[] = [];
  private minIdx = -1;
  constructor(private cap: number) {}
  offer(e: Entry): void {
    if (this.items.length < this.cap) {
      this.items.push(e);
      if (this.items.length === this.cap) this.recomputeMin();
      return;
    }
    const worst = this.items[this.minIdx]!;
    if (e.score <= worst.score) return;
    this.items[this.minIdx] = e;
    this.recomputeMin();
  }
  private recomputeMin(): void {
    let m = 0;
    for (let i = 1; i < this.items.length; i++) if (this.items[i]!.score < this.items[m]!.score) m = i;
    this.minIdx = m;
  }
}

const wanted = new Set(ALL_THEMES);
const buckets = new Map<string, Bucket[]>();
for (const t of ALL_THEMES) buckets.set(t, Array.from({ length: NBANDS }, () => new Bucket(PER_BAND)));

async function main(): Promise<void> {
  const t0 = Date.now();
  const zstd = spawn("zstd", ["-dc", SRC], { stdio: ["ignore", "pipe", "inherit"] });
  const rl = createInterface({ input: zstd.stdout, crlfDelay: Infinity });
  let lines = 0;
  let kept = 0;
  let header = true;
  for await (const line of rl) {
    if (header) {
      header = false;
      if (!line.startsWith("PuzzleId,")) throw new Error(`Unexpected header: ${line}`);
      continue;
    }
    lines++;
    if (lines % 1_000_000 === 0) console.log(`  ${(lines / 1e6).toFixed(0)}M rows...`);
    // No field before GameUrl contains a comma, so a plain split is safe for the columns we use.
    const f = line.split(",");
    const [id, fen, moves, ratingS, rdS, popS, playsS, themesS] = f;
    if (!id || !fen || !moves || !ratingS || !rdS || !popS || !playsS || themesS === undefined) continue;
    const popularity = Number(popS);
    const plays = Number(playsS);
    const rd = Number(rdS);
    const rating = Number(ratingS);
    if (!(popularity >= MIN_POPULARITY && plays >= MIN_PLAYS && rd <= MAX_RD)) continue;
    if (!(rating >= RATING_MIN && rating < RATING_MAX)) continue;
    const band = Math.floor((rating - RATING_MIN) / BAND);
    const themes = themesS.split(" ");
    let entry: Entry | null = null;
    for (const t of themes) {
      if (!wanted.has(t)) continue;
      entry ??= { row: [id, fen, moves, rating, popularity, themesS], score: score(popularity, plays) };
      buckets.get(t)![band]!.offer(entry);
    }
    if (entry) kept++;
  }
  const code: number | null = await new Promise((res) =>
    zstd.exitCode !== null ? res(zstd.exitCode) : zstd.on("close", (c) => res(c)),
  );
  if (code !== 0) throw new Error(`zstd exited with code ${code}`);

  mkdirSync(OUT, { recursive: true });
  const counts: Record<string, number> = {};
  let totalBytes = 0;
  let totalPuzzles = 0;
  const unique = new Set<string>();
  console.log(`\nScanned ${lines} rows (${kept} passed filters with a wanted theme) in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
  console.log("theme".padEnd(20) + "count".padStart(7) + "  KB".padStart(8) + "  empty bands");
  for (const t of ALL_THEMES) {
    const bands = buckets.get(t)!;
    const rows = bands.flatMap((b) => b.items.map((e) => e.row));
    rows.sort((a, b) => a[3] - b[3] || (a[0] < b[0] ? -1 : 1));
    const json = JSON.stringify(rows);
    const file = join(OUT, `${t}.json`);
    writeFileSync(file, json);
    const bytes = statSync(file).size;
    counts[t] = rows.length;
    totalBytes += bytes;
    totalPuzzles += rows.length;
    for (const r of rows) unique.add(r[0]);
    const empty = bands
      .map((b, i) => (b.items.length === 0 ? RATING_MIN + i * BAND : null))
      .filter((x) => x !== null);
    console.log(
      t.padEnd(20) +
        String(rows.length).padStart(7) +
        (bytes / 1024).toFixed(0).padStart(8) +
        "  " +
        (empty.length ? `${empty.length} (${empty[0]}..${empty[empty.length - 1]})` : "-"),
    );
  }
  const index = {
    builtAt: new Date().toISOString(),
    source: "Lichess puzzle database (CC0), https://database.lichess.org/#puzzles",
    filters: { minPopularity: MIN_POPULARITY, minPlays: MIN_PLAYS, maxRatingDeviation: MAX_RD, ratingMin: RATING_MIN, ratingMax: RATING_MAX, bandSize: BAND, perBand: PER_BAND },
    format: ["id", "fen", "moves", "rating", "popularity", "themes"],
    counts,
  };
  writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 2) + "\n");
  console.log(
    `\nTotal: ${totalPuzzles} rows (${unique.size} unique puzzles), ${(totalBytes / 1024 / 1024).toFixed(2)} MB across ${ALL_THEMES.length} files`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
