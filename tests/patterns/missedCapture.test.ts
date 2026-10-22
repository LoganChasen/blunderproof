import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import type { TopMove } from "../../src/analyze.js";
import { detectMissedCapture } from "../../src/patterns/missedCapture.js";
import type { BlunderContext } from "../../src/patterns/types.js";
import { playLine } from "../../src/patterns/helpers.js";
import { cpToWinPercent } from "../../src/winPercent.js";

/** Build a TopMove from a UCI PV (SAN computed by chess.js). */
function top(fen: string, pv: string[], score: TopMove["score"]): TopMove {
  const { moves } = playLine(fen, pv);
  expect(moves.length, `illegal PV ${pv.join(" ")} in ${fen}`).toBe(pv.length);
  const cp = "cp" in score && score.cp !== undefined ? score.cp : 10_000;
  return { move: pv[0]!, san: moves[0]!.san, score, winPercent: cpToWinPercent(cp), pv };
}

/** Build a BlunderContext; PVs come from `stockfish` at depth 14 unless noted. */
function ctx(fen: string, topMoves: TopMove[], played: string, refutation: string[]): BlunderContext {
  const chess = new Chess(fen);
  const m = chess.move({ from: played.slice(0, 2), to: played.slice(2, 4), promotion: played[4] });
  const playedEntry = topMoves.find((t) => t.move === played);
  return {
    fenBefore: fen,
    fenAfter: chess.fen(),
    played,
    playedSan: m.san,
    topMoves,
    refutation,
    winBefore: topMoves[0]!.winPercent,
    winAfter: playedEntry?.winPercent ?? 50,
  };
}

describe("detectMissedCapture", () => {
  it("fires when a free hanging piece is left on the board", () => {
    const fen = "4k3/8/8/8/6n1/8/8/3QK3 w - - 0 1";
    const c = ctx(
      fen,
      [
        top(fen, ["d1g4", "e8f8", "e1e2", "f8e7", "e2e3", "e7f7"], { cp: 555 }),
        top(fen, ["d1a4", "e8d8", "a4d4", "d8e8", "d4g4", "e8f7"], { cp: 555 }),
        top(fen, ["d1d4", "g4h6", "e1e2", "h6f7", "d4d1", "f7e5"], { cp: 532 }),
      ],
      "d1d4",
      ["g4h6", "e1e2", "h6f7", "d4d1"],
    );
    expect(detectMissedCapture(c)?.explanation).toBe("Missed Qxg4, which wins a knight for free.");
  });

  it("fires when a winning capture of a higher-value piece is missed", () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Qg5?? and White didn't take the queen.
    const fen = "r1b1kbnr/pppp1ppp/2n5/4p1q1/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
    const c = ctx(
      fen,
      [
        top(fen, ["f3g5", "g8h6", "b1c3", "d7d6", "c4f7", "h6f7"], { cp: 966 }),
        top(fen, ["c4f7", "e8f7", "f3g5", "f7e8", "d2d4", "g8f6"], { cp: 913 }),
        top(fen, ["e1g1", "g5d8", "d2d4", "e5d4", "f3g5"], { cp: 172 }),
      ],
      "e1g1",
      ["g5d8", "d2d4", "e5d4", "f3g5"],
    );
    expect(detectMissedCapture(c)?.explanation).toBe("Missed Nxg5, which wins a queen for free.");
  });

  it("does not fire when the best capture is just an even trade", () => {
    // Ruy Lopez 4.Bxc6 dxc6 as the (hand-built) best line: bishop for knight.
    const fen = "r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4";
    const c = ctx(
      fen,
      [
        top(fen, ["b5c6", "d7c6", "e1g1", "d8d6", "b1a3", "b7b5"], { cp: 40 }),
        top(fen, ["b5c4", "g8f6", "d2d3", "f8c5"], { cp: -2 }),
      ],
      "b5c4",
      ["g8f6", "d2d3", "f8c5", "e1g1"],
    );
    expect(detectMissedCapture(c)).toBeNull();
  });

  it("does not fire when the player made a different capture winning the same material", () => {
    // Two loose knights; best is Qxg4, the player took the other one with Qxd4.
    const fen = "4k3/8/8/8/3n2n1/8/8/3QK3 w - - 0 1";
    const c = ctx(
      fen,
      [
        top(fen, ["d1g4", "e8e7", "e1f2", "d4e6", "g4b4", "e7d7"], { cp: 534 }),
        top(fen, ["d1d4", "g4h6", "e1e2", "e8f7", "e2f3", "f7f8"], { cp: 531 }),
      ],
      "d1d4",
      ["g4h6", "e1e2", "e8f7", "e2f3"],
    );
    expect(detectMissedCapture(c)).toBeNull();
  });

  it("falls back to played move + refutation when the played move isn't in topMoves", () => {
    const fen = "4k3/8/8/8/3n2n1/8/8/3QK3 w - - 0 1";
    const best = top(fen, ["d1g4", "e8e7", "e1f2", "d4e6"], { cp: 534 });
    expect(detectMissedCapture(ctx(fen, [best], "d1d4", ["g4h6", "e1e2"]))).toBeNull(); // took the other knight
    expect(detectMissedCapture(ctx(fen, [best], "e1d2", ["g4f6", "d2e3"]))?.explanation).toBe(
      "Missed Qxg4, which wins a knight for free.",
    );
  });

  it("does not fire when the best capture is a forced mate", () => {
    // Scholar's mate: 4.Qxf7# is available.
    const fen = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
    const c = ctx(
      fen,
      [top(fen, ["h5f7"], { mate: 1 }), top(fen, ["h5h4", "c6d4", "c4b3", "a7a5"], { cp: -190 })],
      "h5h4",
      ["c6d4", "c4b3", "a7a5"],
    );
    expect(detectMissedCapture(c)).toBeNull();
  });

  it("does not fire when the player played the best capture", () => {
    const fen = "4k3/8/8/8/6n1/8/8/3QK3 w - - 0 1";
    const c = ctx(fen, [top(fen, ["d1g4", "e8f8", "e1e2", "f8e7"], { cp: 555 })], "d1g4", ["e8f8", "e1e2"]);
    expect(detectMissedCapture(c)).toBeNull();
  });

  it("cancels out even trades inside the line when describing the win", () => {
    // 1.e4 e5 2.Bc4 Nf6 3.d3 Ng4: Bxf7+ Kxf7 Qxg4 nets a pawn (bishop for knight in between).
    const fen = "rnbqkb1r/pppp1ppp/8/4p3/2B1P1n1/3P4/PPP2PPP/RNBQK1NR w KQkq - 1 4";
    const c = ctx(
      fen,
      [
        top(fen, ["c4f7", "e8f7", "d1g4", "b8c6", "c1g5", "f8e7", "g5e7", "d8e7"], { cp: 162 }),
        top(fen, ["g1f3", "d7d6", "h2h3", "g4f6", "f3g5", "d6d5"], { cp: 122 }),
      ],
      "g1f3",
      ["d7d6", "h2h3", "g4f6", "f3g5"],
    );
    expect(detectMissedCapture(c)?.explanation).toBe("Missed Bxf7+, which wins a pawn.");
  });

  describe("real blunders fixture", () => {
    const fixtures = JSON.parse(
      readFileSync(new URL("../fixtures/real-blunders.json", import.meta.url), "utf8"),
    ) as (BlunderContext & { game: string; moveNumber: number })[];

    it("never throws on any real entry", () => {
      for (const f of fixtures) expect(() => detectMissedCapture(f)).not.toThrow();
    });

    it("catches the missed Nxe5 in game 185713879472 (moves 5 and 12)", () => {
      for (const move of [5, 12]) {
        const f = fixtures.find((x) => x.game.endsWith("185713879472") && x.moveNumber === move)!;
        expect(detectMissedCapture(f)?.explanation).toBe("Missed Nxe5, which wins a pawn for free.");
      }
    });
  });
});
