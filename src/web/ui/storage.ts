/** localStorage helpers owned by the UI. Every access is wrapped: storage may be blocked. */
import type { TrainingProgress } from "../types";
import { parseTrainingProgress } from "./reportStats";

export const USERNAME_RE = /^[A-Za-z0-9_-]{2,30}$/;

const RECENT_KEY = "bp:recent";
const RECENT_MAX = 6;

export function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && USERNAME_RE.test(s)).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(username: string): void {
  try {
    const lower = username.toLowerCase();
    const next = [username, ...readRecent().filter((u) => u.toLowerCase() !== lower)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked; recents are a convenience.
  }
}

export function readTrainingProgress(username: string): TrainingProgress | null {
  try {
    return parseTrainingProgress(localStorage.getItem(`bp:progress:${username.toLowerCase()}`) ?? localStorage.getItem(`bp:progress:${username}`));
  } catch {
    return null;
  }
}
