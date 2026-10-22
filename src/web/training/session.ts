/**
 * Training-session planner: decides what comes next (drill or checkpoint),
 * picks drills in blocks, and keeps the adaptive puzzle rating.
 *
 * Pure and deterministic: no React, no storage, no Date.now unless injected,
 * and every random choice goes through an injected rng. The puzzle picker is
 * injected too, so the scheduler can be simulated in tests.
 *
 * Cadence guarantee: `progress.drillsUntilCheckpoint` counts down by one per
 * completed drill (solved or failed). When it is 0 and an eligible checkpoint
 * exists, the next item IS that checkpoint. After every checkpoint attempt it
 * resets to a random integer in [GAP_MIN, GAP_MAX]. A new user's first gap is
 * drawn from the same range (see newProgress).
 */
import { passesCheckpoint } from "../../checkpoints";
import type { OtherKind } from "../../patterns/otherKind";
import { PATTERN_THEMES } from "../puzzles/themes";
import {
  checkpointId,
  type CheckpointProgress,
  type Pattern,
  type PlayerProfile,
  type Puzzle,
  type ReportData,
  type TrainingItem,
  type TrainingProgress,
} from "../types";

export const GAP_MIN = 10;
export const GAP_MAX = 15;
export const BLOCK_SIZE = 5;
export const RATING_MIN = 600;
export const RATING_MAX = 2600;
export const DEFAULT_RATING = 1200;
/** Drills are picked a little below the player's rating: the goal is pattern recognition, not struggle. */
export const TARGET_OFFSET = -75;
export const SEEN_CAP = 3000;

export type Rng = () => number;
export type CheckpointEntry = ReportData["checkpoints"][number];
export type DrillItem = Extract<TrainingItem, { kind: "drill" }>;
export type CheckpointItem = Extract<TrainingItem, { kind: "checkpoint" }>;

/** Same shape as the puzzles module's pickPuzzles. */
export type PickPuzzles = (opts: {
  weights: Record<string, number>;
  rating: number;
  count: number;
  exclude: Set<string>;
  rng?: Rng;
}) => Promise<{ puzzle: Puzzle; theme: string }[]>;

export type WeightsFromWeaknesses = (blunders: { pattern: Pattern; otherKind: OtherKind | null }[]) => Record<string, number>;

/**
 * TrainingProgress plus the size of the current gap (for the progress dots).
 * The extra field is optional so plain TrainingProgress values stay valid.
 */
export interface SessionProgress extends TrainingProgress {
  gapSize?: number;
}

export interface Session {
  progress: SessionProgress;
  /** Prefetched drills for the current block, next first. */
  queue: { puzzle: Puzzle; theme: string }[];
  /** Themes of recently completed drills, newest last (the "last block"). */
  recentThemes: string[];
  /** Last checkpoint served (never served twice in a row unless it's the only one). */
  lastCheckpointId: string | null;
  /** checkpointId -> progress.puzzlesAttempted at its last attempt in this session. */
  attemptMarks: Record<string, number>;
  /** The last checkpoint served was a retry of a failed one (used to interleave retries with new positions). */
  lastWasRetry: boolean;
  /** Session-only stats. */
  streak: number;
  solved: number;
  attempted: number;
  checkpointsPassed: number;
  checkpointsAttempted: number;
}

// ---------- helpers ----------

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function randomGap(rng: Rng): number {
  return Math.min(GAP_MAX, Math.max(GAP_MIN, randInt(rng, GAP_MIN, GAP_MAX)));
}

export function clampRating(r: number): number {
  return Math.round(Math.min(RATING_MAX, Math.max(RATING_MIN, r)));
}

/** Puzzle level ≈ game rating: rapid, else blitz, else bullet, else 1200. */
export function initialPuzzleRating(profile: Pick<PlayerProfile, "ratings"> | null | undefined): number {
  const r = profile?.ratings;
  return clampRating(r?.rapid ?? r?.blitz ?? r?.bullet ?? DEFAULT_RATING);
}

/** Seeded rng (mulberry32) for tests and reproducible sessions. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: T[], rng: Rng): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

export function newProgress(initialRating: number, rng: Rng): SessionProgress {
  const gap = randomGap(rng);
  return {
    version: 1,
    puzzleRating: clampRating(initialRating),
    puzzlesAttempted: 0,
    puzzlesSolved: 0,
    seenPuzzleIds: [],
    checkpoints: {},
    drillsUntilCheckpoint: gap,
    sessions: 0,
    bestStreak: 0,
    gapSize: gap,
  };
}

// ---------- session ----------

/** Start a session from stored progress. Increments progress.sessions. */
export function createSession(progress: SessionProgress): Session {
  // Last checkpoint attempted (across reloads), so a reload can't serve it twice in a row.
  let lastId: string | null = null;
  let lastAt = "";
  for (const [id, cp] of Object.entries(progress.checkpoints)) {
    if (cp.lastAttemptAt && cp.lastAttemptAt > lastAt) {
      lastAt = cp.lastAttemptAt;
      lastId = id;
    }
  }
  return {
    progress: { ...progress, sessions: progress.sessions + 1 },
    queue: [],
    recentThemes: [],
    lastCheckpointId: lastId,
    attemptMarks: {},
    lastWasRetry: false,
    streak: 0,
    solved: 0,
    attempted: 0,
    checkpointsPassed: 0,
    checkpointsAttempted: 0,
  };
}

export function isCheckpointDue(s: Session): boolean {
  return s.progress.drillsUntilCheckpoint <= 0;
}

/** Size of the current gap, for the "Checkpoint in N" dots (10–15). */
export function gapSize(s: Session): number {
  const p = s.progress;
  return Math.max(p.gapSize ?? GAP_MAX, p.drillsUntilCheckpoint, GAP_MIN);
}

export type CheckpointAvailability = "available" | "all-conquered" | "none-yet";

/** Why there might be no checkpoint to serve. The UI shows a note for the last two. */
export function checkpointAvailability(s: Session, checkpoints: CheckpointEntry[]): CheckpointAvailability {
  if (checkpoints.length === 0) return "none-yet";
  return eligibleCheckpoints(s, checkpoints).length > 0 ? "available" : "all-conquered";
}

/** Not conquered (pending or failed), de-duplicated by id. */
export function eligibleCheckpoints(s: Session, checkpoints: CheckpointEntry[]): CheckpointEntry[] {
  const seen = new Set<string>();
  const out: CheckpointEntry[] = [];
  for (const cp of checkpoints) {
    const id = checkpointId(cp);
    if (seen.has(id)) continue;
    seen.add(id);
    if (s.progress.checkpoints[id]?.status === "conquered") continue;
    out.push(cp);
  }
  return out;
}

/** Patterns whose drill themes overlap the given themes. */
export function patternsForThemes(themes: string[]): Set<Pattern> {
  const t = new Set(themes);
  const out = new Set<Pattern>();
  for (const [pattern, list] of Object.entries(PATTERN_THEMES) as [Pattern, string[]][]) {
    if (list.some((x) => t.has(x))) out.add(pattern);
  }
  return out;
}

/**
 * Which checkpoint to serve now, or null if none is eligible. Preference:
 *  1. failed, and at least one full gap of drills since its last attempt (requeue);
 *  2. never attempted, pattern matches the themes drilled in the last block;
 *  3. any never attempted;
 *  4. any failed.
 * Never the same checkpoint twice in a row, unless it's the only eligible one.
 *
 * Anti-starvation: if the previous checkpoint was itself a retry and a
 * never-attempted position exists, the new position goes first. Otherwise a
 * player who keeps failing would cycle the same few failed positions forever
 * and never see the rest of their blunders. Retries and new positions alternate.
 */
export function chooseCheckpoint(s: Session, checkpoints: CheckpointEntry[], rng: Rng): CheckpointEntry | null {
  const eligible = eligibleCheckpoints(s, checkpoints);
  if (eligible.length === 0) return null;
  const pool = eligible.length > 1 ? eligible.filter((c) => checkpointId(c) !== s.lastCheckpointId) : eligible;

  const prog = (c: CheckpointEntry): CheckpointProgress | undefined => s.progress.checkpoints[checkpointId(c)];
  const isFailed = (c: CheckpointEntry) => prog(c)?.status === "failed";
  const neverTried = (c: CheckpointEntry) => !prog(c) || (prog(c)!.status === "pending" && prog(c)!.attempts === 0);
  const waited = (c: CheckpointEntry) => {
    const mark = s.attemptMarks[checkpointId(c)];
    // Attempted in an earlier session: at least one gap has passed by construction.
    return mark === undefined || s.progress.puzzlesAttempted - mark >= GAP_MIN;
  };
  const oldestFirst = (a: CheckpointEntry, b: CheckpointEntry) =>
    (prog(a)?.lastAttemptAt ?? "").localeCompare(prog(b)?.lastAttemptAt ?? "");

  const fresh = pool.filter(neverTried);
  const drilled = patternsForThemes(s.recentThemes.slice(-BLOCK_SIZE));
  const pickFresh = () => pick(fresh.filter((c) => drilled.has(c.pattern)), rng) ?? pick(fresh, rng);

  const requeue = pool.filter((c) => isFailed(c) && waited(c)).sort(oldestFirst);
  if (requeue[0] && !(s.lastWasRetry && fresh.length > 0)) return requeue[0];

  const f = pickFresh();
  if (f) return f;

  const failed = pool.filter(isFailed).sort(oldestFirst);
  if (failed[0]) return failed[0];
  // Anything else still eligible (e.g. "pending" with attempts recorded).
  return pick(pool, rng) ?? null;
}

/** Map a drill theme back to the weakness it trains, preferring the player's own top patterns. */
export function patternForTheme(theme: string, userPatterns: Pattern[] = []): Pattern {
  for (const p of userPatterns) if (PATTERN_THEMES[p]?.includes(theme)) return p;
  for (const [p, list] of Object.entries(PATTERN_THEMES) as [Pattern, string[]][]) {
    if (p !== "other" && list.includes(theme)) return p;
  }
  return "other";
}

/** Blunders in the report, in the shape weightsFromWeaknesses wants. */
export function blunderWeaknesses(report: ReportData | null): { pattern: Pattern; otherKind: OtherKind | null }[] {
  return (report?.errors ?? []).filter((e) => e.label === "blunder").map((e) => ({ pattern: e.pattern, otherKind: e.otherKind }));
}

/** The player's blunder patterns, most frequent first. */
export function topPatterns(report: ReportData | null): Pattern[] {
  const counts = new Map<Pattern, number>();
  for (const b of blunderWeaknesses(report)) counts.set(b.pattern, (counts.get(b.pattern) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

/** Rating to request drills at: a little below the player's puzzle rating. */
export function targetRating(s: Session): number {
  return clampRating(s.progress.puzzleRating + TARGET_OFFSET);
}

/** Fetch the next block of drills (excluding seen + queued puzzles) and append it to the queue. */
export async function refillQueue(
  s: Session,
  deps: { pickPuzzles: PickPuzzles; weights: Record<string, number>; rng: Rng },
  count = BLOCK_SIZE,
): Promise<Session> {
  const exclude = new Set([...s.progress.seenPuzzleIds, ...s.queue.map((q) => q.puzzle.id)]);
  const picked = await deps.pickPuzzles({ weights: deps.weights, rating: targetRating(s), count, exclude, rng: deps.rng });
  const fresh = picked.filter((p) => !exclude.has(p.puzzle.id));
  return { ...s, queue: [...s.queue, ...fresh] };
}

export type NextResult =
  | { item: TrainingItem; session: Session }
  /** Queue is empty and no checkpoint is due: call refillQueue first. */
  | { item: null; session: Session };

/**
 * Decide the next item. A due checkpoint always wins over a drill; otherwise
 * the next drill in the queue is served (and removed from the queue).
 */
export function nextItem(s: Session, checkpoints: CheckpointEntry[], rng: Rng, userPatterns: Pattern[] = []): NextResult {
  if (isCheckpointDue(s)) {
    const cp = chooseCheckpoint(s, checkpoints, rng);
    if (cp) return { item: { kind: "checkpoint", checkpoint: cp }, session: s };
  }
  const [head, ...rest] = s.queue;
  if (!head) return { item: null, session: s };
  return {
    item: { kind: "drill", puzzle: head.puzzle, theme: head.theme, pattern: patternForTheme(head.theme, userPatterns) },
    session: { ...s, queue: rest },
  };
}

/** Convenience: nextItem, refilling the drill queue when needed. Null only if no puzzles could be fetched. */
export async function takeNext(
  s: Session,
  checkpoints: CheckpointEntry[],
  deps: { pickPuzzles: PickPuzzles; weights: Record<string, number>; rng: Rng; userPatterns?: Pattern[] },
): Promise<NextResult> {
  let r = nextItem(s, checkpoints, deps.rng, deps.userPatterns);
  if (r.item) return r;
  const refilled = await refillQueue(s, deps);
  r = nextItem(refilled, checkpoints, deps.rng, deps.userPatterns);
  return r;
}

// ---------- rating ----------

/** K-factor: 24 for the first puzzles, easing down to 12 by puzzle 30. */
export function kFactor(puzzlesAttempted: number): number {
  if (puzzlesAttempted >= 30) return 12;
  return 24 - (12 * puzzlesAttempted) / 30;
}

export function expectedScore(rating: number, puzzleRating: number): number {
  return 1 / (1 + 10 ** ((puzzleRating - rating) / 400));
}

export function updateRating(rating: number, puzzleRating: number, solved: boolean, puzzlesAttempted: number): number {
  const k = kFactor(puzzlesAttempted);
  return clampRating(rating + k * ((solved ? 1 : 0) - expectedScore(rating, puzzleRating)));
}

// ---------- recording results ----------

export interface DrillResult {
  session: Session;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
}

/** A drill finished (solved or failed). Counts down to the next checkpoint. */
export function completeDrill(s: Session, item: Pick<DrillItem, "puzzle" | "theme">, solved: boolean): DrillResult {
  const p = s.progress;
  const ratingBefore = p.puzzleRating;
  const ratingAfter = updateRating(ratingBefore, item.puzzle.rating, solved, p.puzzlesAttempted);
  const streak = solved ? s.streak + 1 : 0;
  const seen = [...p.seenPuzzleIds.filter((id) => id !== item.puzzle.id), item.puzzle.id].slice(-SEEN_CAP);
  const progress: SessionProgress = {
    ...p,
    puzzleRating: ratingAfter,
    puzzlesAttempted: p.puzzlesAttempted + 1,
    puzzlesSolved: p.puzzlesSolved + (solved ? 1 : 0),
    seenPuzzleIds: seen,
    drillsUntilCheckpoint: Math.max(0, p.drillsUntilCheckpoint - 1),
    bestStreak: Math.max(p.bestStreak, streak),
  };
  return {
    session: {
      ...s,
      progress,
      recentThemes: [...s.recentThemes, item.theme].slice(-BLOCK_SIZE * 3),
      streak,
      solved: s.solved + (solved ? 1 : 0),
      attempted: s.attempted + 1,
    },
    ratingBefore,
    ratingAfter,
    delta: ratingAfter - ratingBefore,
  };
}

export interface CheckpointResult {
  session: Session;
  passed: boolean;
}

/**
 * A checkpoint attempt (one move). Pass (top move or within config.passMargin) → conquered.
 * Fail → failed and requeued. Either way the next gap is a fresh random 10–15.
 */
export function completeCheckpoint(s: Session, cp: CheckpointEntry, uci: string, rng: Rng, now: string): CheckpointResult {
  const id = checkpointId(cp);
  const passed = passesCheckpoint(cp, uci);
  const prev = s.progress.checkpoints[id];
  const entry: CheckpointProgress = {
    status: passed ? "conquered" : "failed",
    attempts: (prev?.attempts ?? 0) + 1,
    movesTried: [...(prev?.movesTried ?? []), uci],
    lastAttemptAt: now,
  };
  const gap = randomGap(rng);
  return {
    passed,
    session: {
      ...s,
      progress: {
        ...s.progress,
        checkpoints: { ...s.progress.checkpoints, [id]: entry },
        drillsUntilCheckpoint: gap,
        gapSize: gap,
      },
      lastCheckpointId: id,
      lastWasRetry: (prev?.attempts ?? 0) > 0,
      attemptMarks: { ...s.attemptMarks, [id]: s.progress.puzzlesAttempted },
      checkpointsAttempted: s.checkpointsAttempted + 1,
      checkpointsPassed: s.checkpointsPassed + (passed ? 1 : 0),
    },
  };
}
