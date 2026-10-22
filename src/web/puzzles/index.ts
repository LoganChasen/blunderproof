/**
 * Browser-safe access to the themed Lichess puzzle packs in /public/puzzles
 * (built by scripts/build-puzzles.ts).
 */
import { Chess } from "chess.js";
import type { OtherKind } from "../../patterns/otherKind";
import type { Pattern } from "../../patterns/types";
import type { Puzzle } from "../types";
import { DEFAULT_THEMES, OTHER_KIND_THEMES, PATTERN_THEMES } from "./themes";

export { ALL_THEMES, DEFAULT_THEMES, OTHER_KIND_THEMES, PATTERN_THEMES, THEME_LABEL, themeLabel } from "./themes";

/** One row of public/puzzles/{theme}.json. */
export type PuzzleRow = [id: string, fen: string, moves: string, rating: number, popularity: number, themes: string];

export function parsePuzzleRow(r: PuzzleRow): Puzzle {
  return { id: r[0], fen: r[1], moves: r[2].split(" "), rating: r[3], popularity: r[4], themes: r[5].split(" ") };
}

// ---------- Loading ----------

/** theme -> puzzles sorted by rating (ascending). Holds the in-flight promise so concurrent loads share one fetch. */
const cache = new Map<string, Promise<Puzzle[]>>();

/** Fetch `/puzzles/{theme}.json` (cached in memory). Rejects on network/HTTP errors; a failed load is not cached. */
export function loadTheme(theme: string): Promise<Puzzle[]> {
  let p = cache.get(theme);
  if (!p) {
    p = (async () => {
      const res = await fetch(`/puzzles/${encodeURIComponent(theme)}.json`);
      if (!res.ok) throw new Error(`Couldn't load puzzles for "${theme}" (HTTP ${res.status})`);
      const rows = (await res.json()) as PuzzleRow[];
      return rows.map(parsePuzzleRow).sort((a, b) => a.rating - b.rating);
    })();
    cache.set(theme, p);
    p.catch(() => cache.delete(theme));
  }
  return p;
}

/** Drop the in-memory cache (tests). */
export function clearPuzzleCache(): void {
  cache.clear();
}

// ---------- Picking ----------

export interface PickOptions {
  /** theme -> weight (any non-negative scale). Themes with weight <= 0 are ignored. */
  weights: Record<string, number>;
  /** Target puzzle rating. */
  rating: number;
  count: number;
  /** Puzzle ids to skip (already seen). */
  exclude: Set<string>;
  /** Deterministic RNG in [0, 1). Defaults to Math.random. */
  rng?: () => number;
}

export interface PickedPuzzle {
  puzzle: Puzzle;
  theme: string;
}

/** Rating windows tried in order: prefer close puzzles, widen when a theme runs dry near the target. */
export const RATING_WINDOWS = [150, 300, 500, Infinity] as const;

/** First index with rating >= x (puzzles sorted ascending). */
function lowerBound(ps: Puzzle[], x: number): number {
  let lo = 0;
  let hi = ps.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ps[mid]!.rating < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function pickFrom(ps: Puzzle[], rating: number, skip: (id: string) => boolean, rng: () => number): Puzzle | null {
  for (const w of RATING_WINDOWS) {
    const lo = w === Infinity ? 0 : lowerBound(ps, rating - w);
    const hi = w === Infinity ? ps.length : lowerBound(ps, rating + w + 1);
    const cands: Puzzle[] = [];
    for (let i = lo; i < hi; i++) if (!skip(ps[i]!.id)) cands.push(ps[i]!);
    if (cands.length) return cands[Math.floor(rng() * cands.length)] ?? cands[0]!;
  }
  return null;
}

/**
 * Pick `count` puzzles: themes are sampled by weight, and within a theme the puzzle is
 * drawn near `rating` (±150, widening to ±300, ±500, then any). Never returns an excluded
 * id or a duplicate. May return fewer than `count` if every weighted theme runs out.
 * Theme files are loaded lazily. Deterministic for a given `rng` (and same files).
 */
export async function pickPuzzles(opts: PickOptions): Promise<PickedPuzzle[]> {
  const rng = opts.rng ?? Math.random;
  const live = Object.entries(opts.weights)
    .filter(([, w]) => Number.isFinite(w) && w > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const used = new Set<string>();
  const skip = (id: string) => used.has(id) || opts.exclude.has(id);
  const out: PickedPuzzle[] = [];
  let lastError: unknown = null;

  while (out.length < opts.count && live.length) {
    const total = live.reduce((s, [, w]) => s + w, 0);
    let r = rng() * total;
    let idx = live.length - 1;
    for (let i = 0; i < live.length; i++) {
      r -= live[i]![1];
      if (r < 0) {
        idx = i;
        break;
      }
    }
    const theme = live[idx]![0];
    let puzzles: Puzzle[];
    try {
      puzzles = await loadTheme(theme);
    } catch (err) {
      lastError = err;
      live.splice(idx, 1);
      continue;
    }
    const p = pickFrom(puzzles, opts.rating, skip, rng);
    if (!p) {
      live.splice(idx, 1); // theme exhausted
      continue;
    }
    used.add(p.id);
    out.push({ puzzle: p, theme });
  }
  if (out.length === 0 && opts.count > 0 && lastError) throw lastError;
  return out;
}

// ---------- Weights ----------

/** Share of the total weight reserved as a floor spread across the whole mix (variety). */
export const WEIGHT_FLOOR_SHARE = 0.25;

export function themesForWeakness(pattern: Pattern, otherKind: OtherKind | null): string[] {
  if (pattern === "other" && otherKind) return OTHER_KIND_THEMES[otherKind];
  return PATTERN_THEMES[pattern];
}

/**
 * Turn the player's blunder distribution into theme weights (summing to 1).
 * Each blunder adds 1 split evenly across its themes ("other" uses its otherKind's themes).
 * Every theme in the mix (DEFAULT_THEMES plus any weakness theme) gets a floor so the
 * player still sees variety. No blunders -> a balanced default mix.
 */
export function weightsFromWeaknesses(blunders: { pattern: Pattern; otherKind: OtherKind | null }[]): Record<string, number> {
  const raw = new Map<string, number>();
  for (const b of blunders) {
    const themes = themesForWeakness(b.pattern, b.otherKind);
    for (const t of themes) raw.set(t, (raw.get(t) ?? 0) + 1 / themes.length);
  }
  const mix = [...new Set([...DEFAULT_THEMES, ...raw.keys()])];
  const out: Record<string, number> = {};
  if (raw.size === 0) {
    for (const t of mix) out[t] = 1 / mix.length;
    return out;
  }
  const rawTotal = [...raw.values()].reduce((s, v) => s + v, 0);
  const floor = WEIGHT_FLOOR_SHARE / mix.length;
  for (const t of mix) out[t] = floor + (1 - WEIGHT_FLOOR_SHARE) * ((raw.get(t) ?? 0) / rawTotal);
  return out;
}

// ---------- Start position ----------

export interface PuzzleStart {
  /** Position the player solves from (after the opponent's setup move). */
  fenAfterSetup: string;
  /** The opponent's setup move, UCI (animate this first). */
  setupMove: string;
  /** Expected moves from fenAfterSetup, UCI, alternating player / opponent; the player plays the even indices. */
  solution: string[];
  /** Side the player plays. */
  playerColor: "w" | "b";
}

/** Split a UCI move into chess.js move input. */
export function uciToMove(uci: string): { from: string; to: string; promotion?: string } {
  const m = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
  return uci.length > 4 ? { ...m, promotion: uci.slice(4, 5) } : m;
}

/** Apply the setup move. Throws if the FEN or setup move is invalid. */
export function puzzleStartPosition(p: Puzzle): PuzzleStart {
  const setupMove = p.moves[0];
  if (!setupMove) throw new Error(`Puzzle ${p.id} has no moves`);
  const chess = new Chess(p.fen);
  chess.move(uciToMove(setupMove));
  return { fenAfterSetup: chess.fen(), setupMove, solution: p.moves.slice(1), playerColor: chess.turn() };
}
