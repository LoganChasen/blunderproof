import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fetchMonth, fetchRecentGames, PlayerNotFoundError } from "../src/chesscom";
import { countFullMoves, filterGames, skipReason } from "../src/filter";
import fixture from "./fixtures/chesscom-month.json" with { type: "json" };
import type { ChessComGame } from "../src/chesscom";

const games = fixture.games as ChessComGame[];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("filter", () => {
  it("counts full moves from movetext", () => {
    expect(countFullMoves("1. e4 {[%clk 0:00:59]} 1... e5 2. Nf3 2... Nc6 3. Bb5")).toBe(3);
  });

  it("skips variants and disconnects, keeps normal games", () => {
    const reasons = games.map(skipReason);
    expect(reasons).toContain("variant");
    expect(reasons).toContain("abandoned");
    expect(reasons.filter((r) => r === null).length).toBeGreaterThanOrEqual(3);
  });

  it("skips daily games", () => {
    const daily = { ...games[0]!, time_class: "daily" };
    expect(skipReason(daily)).toBe("time-class");
  });

  it("skips early resignations", () => {
    const g = { ...games[0]!, pgn: "1. e4 1... e5 2. Qh5 2... Nc6", white: { ...games[0]!.white, result: "resigned" } };
    expect(skipReason(g)).toBe("early-resign");
  });

  it("tallies skip reasons", () => {
    const { kept, skipped } = filterGames(games);
    expect(kept.length + Object.values(skipped).reduce((a, b) => a + b, 0)).toBe(games.length);
  });
});

describe("chess.com fetcher", () => {
  it("throws a friendly error on 404", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 404));
    await expect(fetchRecentGames("nobody", 1, { fetchFn })).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("caches past months and does not re-fetch them", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "bp-"));
    const fetchFn = vi.fn(async () => jsonResponse({ games }));
    const url = "https://api.chess.com/pub/player/x/games/2026/09";
    const now = new Date("2026-10-21T00:00:00Z");
    await fetchMonth("x", url, { cacheDir, fetchFn, now });
    await fetchMonth("x", url, { cacheDir, fetchFn, now });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(join(cacheDir, "x", "2026-09.json"), "utf8"))).toHaveLength(games.length);
  });

  it("always re-fetches the current month", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "bp-"));
    const fetchFn = vi.fn(async () => jsonResponse({ games }));
    const url = "https://api.chess.com/pub/player/x/games/2026/10";
    const now = new Date("2026-10-21T00:00:00Z");
    await fetchMonth("x", url, { cacheDir, fetchFn, now });
    await fetchMonth("x", url, { cacheDir, fetchFn, now });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("returns recent months newest-first", async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith("archives")
        ? jsonResponse({ archives: ["https://a/games/2026/08", "https://a/games/2026/09", "https://a/games/2026/10"] })
        : jsonResponse({ games }),
    );
    const result = await fetchRecentGames("x", 2, { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(result[0]!.end_time).toBeGreaterThanOrEqual(result.at(-1)!.end_time);
  });
});
