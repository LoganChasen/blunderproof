/**
 * Training progress persistence: localStorage under `bp:progress:{username}`,
 * versioned, with an in-memory fallback when storage is blocked (private mode,
 * disabled cookies, quota). Never throws.
 */
import type { CheckpointProgress, TrainingProgress } from "../types";
import { clampRating, GAP_MAX, GAP_MIN, newProgress, SEEN_CAP, type Rng, type SessionProgress } from "./session";

export const PROGRESS_VERSION = 1;
const memory = new Map<string, string>();

export function progressKey(username: string): string {
  return `bp:progress:${username.toLowerCase()}`;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readRaw(key: string): string | null {
  try {
    const v = storage()?.getItem(key);
    if (v != null) return v;
  } catch {
    // fall through to memory
  }
  return memory.get(key) ?? null;
}

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

function sanitizeCheckpoint(v: unknown): CheckpointProgress | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Partial<CheckpointProgress>;
  const status = c.status === "conquered" || c.status === "failed" || c.status === "pending" ? c.status : null;
  if (!status) return null;
  return {
    status,
    attempts: Math.max(0, Math.floor(num(c.attempts, 0))),
    movesTried: Array.isArray(c.movesTried) ? c.movesTried.filter((m): m is string => typeof m === "string") : [],
    lastAttemptAt: typeof c.lastAttemptAt === "string" ? c.lastAttemptAt : null,
  };
}

/** Validate a parsed object, filling anything missing or broken from defaults. */
export function sanitizeProgress(raw: unknown, initialRating: number, rng: Rng): SessionProgress {
  const d = newProgress(initialRating, rng);
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<SessionProgress>;
  if (r.version !== PROGRESS_VERSION) return d;
  const checkpoints: Record<string, CheckpointProgress> = {};
  if (r.checkpoints && typeof r.checkpoints === "object") {
    for (const [id, v] of Object.entries(r.checkpoints)) {
      const c = sanitizeCheckpoint(v);
      if (c) checkpoints[id] = c;
    }
  }
  const until = Math.floor(num(r.drillsUntilCheckpoint, d.drillsUntilCheckpoint));
  const drillsUntilCheckpoint = until < 0 || until > GAP_MAX ? d.drillsUntilCheckpoint : until;
  const gap = Math.floor(num(r.gapSize, Math.max(drillsUntilCheckpoint, GAP_MIN)));
  return {
    version: 1,
    puzzleRating: clampRating(num(r.puzzleRating, d.puzzleRating)),
    puzzlesAttempted: Math.max(0, Math.floor(num(r.puzzlesAttempted, 0))),
    puzzlesSolved: Math.max(0, Math.floor(num(r.puzzlesSolved, 0))),
    seenPuzzleIds: Array.isArray(r.seenPuzzleIds)
      ? r.seenPuzzleIds.filter((x): x is string => typeof x === "string").slice(-SEEN_CAP)
      : [],
    checkpoints,
    drillsUntilCheckpoint,
    sessions: Math.max(0, Math.floor(num(r.sessions, 0))),
    bestStreak: Math.max(0, Math.floor(num(r.bestStreak, 0))),
    gapSize: Math.min(GAP_MAX, Math.max(GAP_MIN, gap, drillsUntilCheckpoint)),
  };
}

/** Stored progress for this user, or a fresh one (rating = initialRating, first gap random 10–15). */
export function loadProgress(username: string, initialRating: number, rng: Rng = Math.random): SessionProgress {
  const raw = readRaw(progressKey(username));
  if (raw == null) return newProgress(initialRating, rng);
  try {
    return sanitizeProgress(JSON.parse(raw), initialRating, rng);
  } catch {
    return newProgress(initialRating, rng);
  }
}

/** True when a progress record exists for this user (storage or memory). */
export function hasProgress(username: string): boolean {
  return readRaw(progressKey(username)) != null;
}

export function saveProgress(username: string, progress: TrainingProgress | SessionProgress): void {
  const key = progressKey(username);
  let json: string;
  try {
    json = JSON.stringify({ ...progress, version: PROGRESS_VERSION, seenPuzzleIds: progress.seenPuzzleIds.slice(-SEEN_CAP) });
  } catch {
    return;
  }
  memory.set(key, json);
  try {
    storage()?.setItem(key, json);
  } catch {
    // Storage blocked or full: the in-memory copy keeps this tab working.
  }
}

/** Test helper. */
export function _clearMemoryStore(): void {
  memory.clear();
}
