/**
 * Day-one metrics (see docs/HANDOFF.md, "Metrics to log from day one").
 * v1 keeps an event log in localStorage per browser; Supabase replaces this later.
 * Every write is wrapped so a blocked/private storage never breaks the app.
 */
export type EventType =
  | "account_connected"
  | "session_started"
  | "puzzle_attempted"
  | "puzzle_solved"
  | "checkpoint_attempted"
  | "checkpoint_passed"
  | "report_viewed";

export interface AppEvent {
  type: EventType;
  username: string;
  payload: Record<string, unknown>;
  at: string;
}

const KEY = "bp:events";
const MAX_EVENTS = 5000;

export function logEvent(type: EventType, username: string, payload: Record<string, unknown> = {}): void {
  try {
    const events = readEvents();
    events.push({ type, username: username.toLowerCase(), payload, at: new Date().toISOString() });
    localStorage.setItem(KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Storage unavailable; metrics are best-effort.
  }
}

export function readEvents(username?: string): AppEvent[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "[]") as AppEvent[];
    return username ? all.filter((e) => e.username === username.toLowerCase()) : all;
  } catch {
    return [];
  }
}
