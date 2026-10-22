/**
 * Pure helpers that turn a ReportData / event log / training progress into
 * what the dashboard, stats and positions pages display. No React, no storage.
 */
import type { GameAnalysis } from "../../analyze";
import type { AppEvent } from "../metrics";
import type { Checkpoint, CheckpointProgress, CheckpointStatus, Pattern, PlayerError, ReportData, TrainingProgress } from "../types";
import { checkpointId } from "../types";

export function tally<T extends string>(items: T[]): [T, number][] {
  const m = new Map<T, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export const pct = (n: number, d: number): number => (d === 0 ? 0 : Math.round((100 * n) / d));
export const perGame = (n: number, games: number): string => (games === 0 ? "0.0" : (n / games).toFixed(1));

export function formatClock(ms: number | null): string {
  if (ms === null) return "?";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-21T..." → "Oct 21, 2026". Timezone-independent (uses the ISO date part). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso.slice(0, 10);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
export function formatShortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!m || !d) return iso.slice(5, 10);
  return `${MONTHS[m - 1]} ${d}`;
}

export const moveRef = (moveNumber: number, color: "w" | "b", san: string): string =>
  `${moveNumber}${color === "w" ? "." : "..."} ${san}`;

export const capitalize = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export interface ReportOverview {
  games: number;
  blunders: number;
  mistakes: number;
  blundersPerGame: string;
  mistakesPerGame: string;
  checkpoints: number;
  /** Share (0–100) of blunders with pattern "other". */
  unexplainedPct: number;
  byPattern: [Pattern, number][];
  byPhase: [string, number][];
  byClock: [string, number][];
  byTimeClass: [string, number][];
  byOtherKind: [string, number][];
  otherCount: number;
}

const CLOCK_ORDER = ["<10s", "<30s", "<60s", "60s+", "unknown"];
const PHASE_ORDER = ["opening", "middlegame", "endgame"];

export function overview(r: ReportData): ReportOverview {
  const blunders = r.errors.filter((e) => e.label === "blunder");
  const mistakes = r.errors.length - blunders.length;
  const g = r.games.length;
  const others = blunders.filter((b) => b.pattern === "other");
  const byClock = tally(blunders.map((b) => b.context.clockBucket ?? "unknown")).sort(
    (a, b) => CLOCK_ORDER.indexOf(a[0]) - CLOCK_ORDER.indexOf(b[0]),
  );
  const byPhase = tally(blunders.map((b) => b.context.phase as string)).sort(
    (a, b) => PHASE_ORDER.indexOf(a[0]) - PHASE_ORDER.indexOf(b[0]),
  );
  return {
    games: g,
    blunders: blunders.length,
    mistakes,
    blundersPerGame: perGame(blunders.length, g),
    mistakesPerGame: perGame(mistakes, g),
    checkpoints: r.checkpoints.length,
    unexplainedPct: pct(others.length, blunders.length),
    byPattern: tally(blunders.map((b) => b.pattern)),
    byPhase,
    byClock,
    byTimeClass: tally(blunders.map((b) => b.timeClass)),
    byOtherKind: tally(others.flatMap((b) => (b.otherKind ? [b.otherKind as string] : []))),
    otherCount: others.length,
  };
}

/** Blunders sorted worst first (largest win% drop), then newest. */
export function sortedBlunders(errors: PlayerError[], filter: Pattern | "all" = "all"): PlayerError[] {
  return errors
    .filter((e) => e.label === "blunder" && (filter === "all" || e.pattern === filter))
    .sort((a, b) => b.winBefore - b.winAfter - (a.winBefore - a.winAfter) || b.playedAt.localeCompare(a.playedAt));
}

// ---------- Blunders over time ----------

export interface TimePoint {
  key: string;
  /** Short x-axis label. */
  label: string;
  /** Tooltip / accessible description. */
  title: string;
  blunders: number;
  games: number;
  /** Blunders per game in this bucket. */
  value: number;
}

const countBlunders = (g: GameAnalysis) => g.moves.filter((m) => m.color === g.playerColor && m.label === "blunder").length;

/**
 * Oldest → newest. Groups by day when the games span at least `minDays` days;
 * otherwise one column per game (e.g. 20 bullet games in one evening).
 */
export function blundersOverTime(games: GameAnalysis[], minDays = 3): { points: TimePoint[]; mode: "day" | "game" } {
  const sorted = [...games].sort((a, b) => a.playedAt.localeCompare(b.playedAt));
  const days = new Map<string, GameAnalysis[]>();
  for (const g of sorted) {
    const d = g.playedAt.slice(0, 10);
    days.set(d, [...(days.get(d) ?? []), g]);
  }
  if (days.size >= minDays) {
    const points = [...days.entries()].map(([d, gs]) => {
      const b = gs.reduce((s, g) => s + countBlunders(g), 0);
      return {
        key: d,
        label: formatShortDate(d),
        title: `${formatDate(d)}: ${b} blunders in ${gs.length} game${gs.length === 1 ? "" : "s"}`,
        blunders: b,
        games: gs.length,
        value: b / gs.length,
      };
    });
    return { points, mode: "day" };
  }
  const points = sorted.map((g, i) => {
    const b = countBlunders(g);
    return {
      key: g.gameId,
      label: String(i + 1),
      title: `Game ${i + 1} vs ${g.opponent} (${g.timeClass}, ${formatDate(g.playedAt)}): ${b} blunder${b === 1 ? "" : "s"}`,
      blunders: b,
      games: 1,
      value: b,
    };
  });
  return { points, mode: "game" };
}

// ---------- Events & training progress ----------

export interface EventSummary {
  sessions: number;
  puzzlesAttempted: number;
  puzzlesSolved: number;
  checkpointsAttempted: number;
  checkpointsPassed: number;
  reportViews: number;
  /** Distinct days with activity. */
  activeDays: number;
  /** Visits on days after the first one. */
  returnVisits: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

export function summarizeEvents(events: AppEvent[]): EventSummary {
  const count = (t: AppEvent["type"]) => events.filter((e) => e.type === t).length;
  const visitDays = new Set(
    events.filter((e) => e.type === "report_viewed" || e.type === "session_started").map((e) => e.at.slice(0, 10)),
  );
  const allDays = new Set(events.map((e) => e.at.slice(0, 10)));
  const times = events.map((e) => e.at).sort();
  return {
    sessions: count("session_started"),
    puzzlesAttempted: count("puzzle_attempted"),
    puzzlesSolved: count("puzzle_solved"),
    checkpointsAttempted: count("checkpoint_attempted"),
    checkpointsPassed: count("checkpoint_passed"),
    reportViews: count("report_viewed"),
    activeDays: allDays.size,
    returnVisits: Math.max(0, visitDays.size - 1),
    firstSeen: times[0] ?? null,
    lastSeen: times.at(-1) ?? null,
  };
}

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** Parse whatever is stored under bp:progress:<user>; never throws, returns null if unusable. */
export function parseTrainingProgress(raw: string | null): TrainingProgress | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const cps: Record<string, CheckpointProgress> = {};
  if (o.checkpoints && typeof o.checkpoints === "object") {
    for (const [k, c] of Object.entries(o.checkpoints as Record<string, unknown>)) {
      if (!c || typeof c !== "object") continue;
      const cc = c as Record<string, unknown>;
      const status: CheckpointStatus = cc.status === "failed" || cc.status === "conquered" ? cc.status : "pending";
      cps[k] = {
        status,
        attempts: num(cc.attempts),
        movesTried: Array.isArray(cc.movesTried) ? cc.movesTried.filter((m): m is string => typeof m === "string") : [],
        lastAttemptAt: typeof cc.lastAttemptAt === "string" ? cc.lastAttemptAt : null,
      };
    }
  }
  return {
    version: 1,
    puzzleRating: num(o.puzzleRating, 0),
    puzzlesAttempted: num(o.puzzlesAttempted),
    puzzlesSolved: num(o.puzzlesSolved),
    seenPuzzleIds: Array.isArray(o.seenPuzzleIds) ? o.seenPuzzleIds.filter((s): s is string => typeof s === "string") : [],
    checkpoints: cps,
    drillsUntilCheckpoint: num(o.drillsUntilCheckpoint),
    sessions: num(o.sessions),
    bestStreak: num(o.bestStreak),
  };
}

export type PositionCheckpoint = ReportData["checkpoints"][number];

export interface PositionRow {
  id: string;
  checkpoint: PositionCheckpoint;
  status: CheckpointStatus;
  attempts: number;
  movesTried: string[];
  lastAttemptAt: string | null;
}

/** Joins report checkpoints with their training status; de-duplicates by checkpointId. */
export function positionRows(checkpoints: PositionCheckpoint[], progress: TrainingProgress | null): PositionRow[] {
  const seen = new Set<string>();
  const out: PositionRow[] = [];
  for (const cp of checkpoints) {
    const id = checkpointId(cp);
    if (seen.has(id)) continue;
    seen.add(id);
    const p = progress?.checkpoints[id];
    out.push({
      id,
      checkpoint: cp,
      status: p?.status ?? "pending",
      attempts: p?.attempts ?? 0,
      movesTried: p?.movesTried ?? [],
      lastAttemptAt: p?.lastAttemptAt ?? null,
    });
  }
  return out;
}

/** UCI → SAN in a position via the stored top moves (no chess.js needed when it matches). */
export function sanForUci(cp: Pick<Checkpoint, "topMoves" | "bestMove" | "bestMoveSan">, uci: string): string | null {
  if (uci === cp.bestMove) return cp.bestMoveSan;
  return cp.topMoves.find((t) => t.move === uci)?.san ?? null;
}
