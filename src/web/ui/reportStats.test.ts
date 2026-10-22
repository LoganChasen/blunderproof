import { describe, expect, it } from "vitest";
import type { GameAnalysis } from "../../analyze";
import { buildReport } from "../../report";
import type { AppEvent } from "../metrics";
import { checkpointId } from "../types";
import fixture from "../../../tests/fixtures/game-analysis.json";
import {
  blundersOverTime,
  formatClock,
  formatDate,
  overview,
  parseTrainingProgress,
  positionRows,
  sortedBlunders,
  summarizeEvents,
  tally,
} from "./reportStats";

const game = fixture as unknown as GameAnalysis;

describe("format helpers", () => {
  it("formats clocks and dates", () => {
    expect(formatClock(null)).toBe("?");
    expect(formatClock(9400)).toBe("9s");
    expect(formatClock(125000)).toBe("2:05");
    expect(formatDate("2026-10-21T12:00:00Z")).toBe("Oct 21, 2026");
  });
  it("tallies by count, descending", () => {
    expect(tally(["a", "b", "b"])).toEqual([["b", 2], ["a", 1]]);
  });
});

describe("overview", () => {
  it("matches the report's raw counts", () => {
    const r = buildReport(game.player, [game], {});
    const ov = overview(r);
    const blunders = r.errors.filter((e) => e.label === "blunder").length;
    expect(ov.games).toBe(1);
    expect(ov.blunders).toBe(blunders);
    expect(ov.mistakes).toBe(r.errors.length - blunders);
    expect(ov.byPattern.reduce((s, [, n]) => s + n, 0)).toBe(blunders);
    expect(ov.byClock.reduce((s, [, n]) => s + n, 0)).toBe(blunders);
    const sorted = sortedBlunders(r.errors);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1]!.winBefore - sorted[i - 1]!.winAfter).toBeGreaterThanOrEqual(sorted[i]!.winBefore - sorted[i]!.winAfter);
    }
  });
  it("handles an empty report", () => {
    const ov = overview(buildReport("x", [], {}));
    expect(ov).toMatchObject({ games: 0, blunders: 0, blundersPerGame: "0.0", unexplainedPct: 0 });
  });
});

describe("blundersOverTime", () => {
  const at = (d: string, id: string): GameAnalysis => ({ ...game, gameId: id, playedAt: `${d}T10:00:00Z` });
  it("uses one column per game when games span few days", () => {
    const { mode, points } = blundersOverTime([at("2026-10-21", "b"), at("2026-10-20", "a")]);
    expect(mode).toBe("game");
    expect(points.map((p) => p.key)).toEqual(["a", "b"]);
  });
  it("groups by day when games span several days", () => {
    const { mode, points } = blundersOverTime([at("2026-10-01", "a"), at("2026-10-01", "b"), at("2026-10-05", "c"), at("2026-10-09", "d")]);
    expect(mode).toBe("day");
    expect(points).toHaveLength(3);
    expect(points[0]!.games).toBe(2);
    expect(points[0]!.value).toBe(points[0]!.blunders / 2);
  });
});

describe("summarizeEvents", () => {
  it("counts events and return visits", () => {
    const e = (type: AppEvent["type"], at: string): AppEvent => ({ type, username: "u", payload: {}, at });
    const s = summarizeEvents([
      e("report_viewed", "2026-10-01T10:00:00Z"),
      e("session_started", "2026-10-01T10:05:00Z"),
      e("puzzle_attempted", "2026-10-01T10:06:00Z"),
      e("puzzle_solved", "2026-10-01T10:06:30Z"),
      e("report_viewed", "2026-10-03T09:00:00Z"),
    ]);
    expect(s).toMatchObject({ sessions: 1, puzzlesAttempted: 1, puzzlesSolved: 1, reportViews: 2, returnVisits: 1, activeDays: 2 });
  });
});

describe("parseTrainingProgress / positionRows", () => {
  it("rejects garbage and fills defaults", () => {
    expect(parseTrainingProgress(null)).toBeNull();
    expect(parseTrainingProgress("{not json")).toBeNull();
    expect(parseTrainingProgress("42")).toBeNull();
    const p = parseTrainingProgress(JSON.stringify({ puzzlesSolved: 3, checkpoints: { a: { status: "weird" }, b: null } }));
    expect(p).toMatchObject({ puzzlesSolved: 3, puzzlesAttempted: 0, bestStreak: 0 });
    expect(p!.checkpoints.a).toEqual({ status: "pending", attempts: 0, movesTried: [], lastAttemptAt: null });
    expect(p!.checkpoints.b).toBeUndefined();
  });
  it("joins checkpoint status and de-duplicates", () => {
    const cp = {
      gameId: "g1", gameUrl: "u", opponent: "o", playedAt: "2026-10-21T00:00:00Z", timeClass: "bullet", moveNumber: 5, color: "w" as const,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", movePlayed: "a2a3", movePlayedSan: "a3", bestMove: "e2e4",
      bestMoveSan: "e4", topMoves: [], clockMs: 1000, winBefore: 50, winAfter: 20, reasons: [], gap: 20,
      pattern: "other" as const, explanation: null,
    };
    const other = { ...cp, gameId: "g2" };
    const progress = parseTrainingProgress(
      JSON.stringify({ checkpoints: { [checkpointId(cp)]: { status: "conquered", attempts: 2, movesTried: ["a1a2", "e2e4"] } } }),
    );
    const rows = positionRows([cp, cp, other], progress);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ status: "conquered", attempts: 2 });
    expect(rows[1]).toMatchObject({ status: "pending", attempts: 0 });
  });
});
