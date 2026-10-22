import { describe, expect, it } from "vitest";
import { parseClock, parsePgn } from "../src/pgn";
import fixture from "./fixtures/chesscom-month.json" with { type: "json" };

describe("pgn parsing", () => {
  it("parses clock comments", () => {
    expect(parseClock("0:02:59.9")).toBe(179900);
    expect(parseClock("1:00:00")).toBe(3_600_000);
  });

  it("parses a real game with one clock per ply", () => {
    const game = parsePgn(fixture.games[0]!.pgn!);
    expect(game.moves.length).toBeGreaterThan(10);
    for (const m of game.moves) expect(m.clockMs).not.toBeNull();
    expect(game.moves[0]).toMatchObject({ ply: 1, moveNumber: 1, color: "w" });
    expect(game.moves[1]).toMatchObject({ ply: 2, moveNumber: 1, color: "b" });
    expect(game.headers.Link).toMatch(/chess\.com\/game/);
  });

  it("chains positions: each move starts where the last ended", () => {
    const { moves } = parsePgn(fixture.games[1]!.pgn!);
    for (let i = 1; i < moves.length; i++) expect(moves[i]!.fenBefore).toBe(moves[i - 1]!.fenAfter);
  });

  it("produces UCI moves including promotions", () => {
    const { moves } = parsePgn('[Event "x"]\n\n1. e4 d5 2. exd5 c6 3. dxc6 Nf6 4. cxb7 Nbd7 5. bxa8=Q *');
    expect(moves.at(-1)!.uci).toBe("b7a8q");
    expect(moves.every((m) => m.clockMs === null)).toBe(true);
  });
});
