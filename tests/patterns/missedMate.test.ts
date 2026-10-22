import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { detectMissedMate } from "../../src/patterns/missedMate";
import type { BlunderContext } from "../../src/patterns/types";
import type { TopMove } from "../../src/analyze";
import realBlunders from "../fixtures/real-blunders.json" with { type: "json" };

function sanOf(fen: string, uci: string): string {
  const c = new Chess(fen);
  return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
}

function top(fen: string, pv: string[], score: TopMove["score"], winPercent: number): TopMove {
  return { move: pv[0]!, san: sanOf(fen, pv[0]!), score, winPercent, pv };
}

function ctx(fenBefore: string, played: string, topMoves: TopMove[], winAfter: number, refutation: string[] = []): BlunderContext {
  const c = new Chess(fenBefore);
  const playedSan = c.move({ from: played.slice(0, 2), to: played.slice(2, 4), promotion: played[4] }).san;
  return { fenBefore, fenAfter: c.fen(), played, playedSan, topMoves, refutation, winBefore: 100, winAfter };
}

// Stockfish depth 16, MultiPV 3.
const SCHOLAR = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
const SCHOLAR_TOP = [
  top(SCHOLAR, ["f3f7"], { mate: 1 }, 100),
  top(SCHOLAR, ["c4f7", "e8e7", "b1c3", "g8f6"], { cp: 226 }, 80),
  top(SCHOLAR, ["g1e2", "g8f6", "b1c3", "f8e7"], { cp: 27 }, 52),
];

const KING_HUNT = "r1b1kb1r/pppp1ppp/5q2/4n3/3KP3/2N3PN/PPP4P/R1BQ1B1R b kq - 0 1";
const KING_HUNT_TOP = [
  top(KING_HUNT, ["f8c5", "d4c5", "f6b6", "c5d5", "b6d6"], { mate: 3 }, 100),
  top(KING_HUNT, ["d7d5", "c3d5", "f6d6", "d4e3"], { cp: 69 }, 56),
  top(KING_HUNT, ["b7b6", "c3d5", "f6d6", "c2c4"], { cp: 46 }, 54),
];

const SAC = "r2qk2r/pb4pp/1n2Pb2/2B2Q2/p1p5/2P5/2B2PPP/RN2R1K1 w - - 1 1";
const SAC_TOP = [
  top(SAC, ["f5g6", "h7g6", "c2g6"], { mate: 2 }, 100),
  top(SAC, ["f5h5", "g7g6", "c2g6", "h7g6", "h5g6"], { mate: 3 }, 100),
  top(SAC, ["f5h7", "d8d6", "h7h8", "e8e7"], { cp: 1241 }, 99),
];

describe("detectMissedMate", () => {
  it("fires on a missed mate in 1", () => {
    const r = detectMissedMate(ctx(SCHOLAR, "c4f7", SCHOLAR_TOP, 80, ["e8e7"]));
    expect(r?.explanation).toBe("Missed mate in 1: Qxf7#.");
  });

  it("fires on a missed mate in 3 the player didn't see", () => {
    const r = detectMissedMate(ctx(KING_HUNT, "b7b5", KING_HUNT_TOP, 46, ["c3b5", "c7c6"]));
    expect(r?.explanation).toBe("Missed mate in 3 starting with Bc5+.");
  });

  it("ignores mates longer than the configured cap", () => {
    const longMate = [{ ...KING_HUNT_TOP[0]!, score: { mate: 12 } }, ...KING_HUNT_TOP.slice(1)];
    expect(detectMissedMate(ctx(KING_HUNT, "b7b5", longMate, 46, ["c3b5", "c7c6"]))).toBeNull();
  });

  it("does not fire when the player played the mating move", () => {
    expect(detectMissedMate(ctx(SCHOLAR, "f3f7", SCHOLAR_TOP, 100))).toBeNull();
  });

  it("does not fire when the player chose a slower but still forced mate", () => {
    expect(detectMissedMate(ctx(SAC, "f5h5", SAC_TOP, 100, ["g7g6"]))).toBeNull();
  });

  it("does not fire for a slower forced mate outside the top lines (winAfter 100)", () => {
    // Pretend only the fastest line was reported; the post-move search still saw mate.
    expect(detectMissedMate(ctx(SAC, "f5h5", SAC_TOP.slice(0, 1), 100, ["g7g6"]))).toBeNull();
  });

  it("fires when the player missed mate in 2 for a merely winning line", () => {
    const r = detectMissedMate(ctx(SAC, "f5h7", SAC_TOP, 99, ["d8d6"]));
    expect(r?.explanation).toBe("Missed mate in 2 starting with Qg6+.");
  });

  it("does not fire when no mate is available", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const tops = [top(fen, ["e2e4", "e7e5"], { cp: 30 }, 53), top(fen, ["d2d4", "d7d5"], { cp: 25 }, 52)];
    expect(detectMissedMate(ctx(fen, "a2a4", tops, 47, ["e7e5"]))).toBeNull();
  });

  it("does not fire when the best line is mate for the opponent", () => {
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2";
    // Not a real eval; just checks negative mate scores are ignored.
    const tops = [top(fen, ["d8h4"], { mate: -1 }, 0)];
    expect(detectMissedMate(ctx(fen, "a7a6", tops, 0))).toBeNull();
  });

  it("runs over every real fixture without throwing", () => {
    const all = realBlunders as unknown as BlunderContext[];
    expect(all.length).toBeGreaterThan(0);
    for (const b of all) expect(() => detectMissedMate(b)).not.toThrow();
  });
});
