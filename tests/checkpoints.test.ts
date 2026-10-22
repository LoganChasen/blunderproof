import { describe, expect, it } from "vitest";
import type { MoveAnalysis, TopMove } from "../src/analyze";
import { judgeCheckpoint, passesCheckpoint } from "../src/checkpoints";
import { cpToWinPercent } from "../src/winPercent";

function top(move: string, san: string, cp: number, pv: string[] = [move]): TopMove {
  return { move, san, score: { cp }, winPercent: cpToWinPercent(cp), pv };
}

/** Minimal deep-checked MoveAnalysis for tests. */
function move(over: Partial<MoveAnalysis>): MoveAnalysis {
  return {
    ply: 1,
    moveNumber: 10,
    color: "w",
    san: "a3",
    uci: "a2a3",
    fenBefore: "",
    fenAfter: "",
    clockMs: 30_000,
    bestMove: null,
    bestMoveSan: null,
    topMoves: [],
    winBefore: 60,
    winAfter: 30,
    drop: 30,
    label: "blunder",
    deep: true,
    refutation: [],
    ...over,
  };
}

// White to move: Black's knight on e5 is free (Nxe5).
const FREE_KNIGHT = "r1bqkb1r/pppp1ppp/5n2/4n3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4";

describe("judgeCheckpoint", () => {
  it("accepts a free piece capture", () => {
    const v = judgeCheckpoint(
      move({
        fenBefore: FREE_KNIGHT,
        fenAfter: FREE_KNIGHT.replace(" w ", " b "),
        topMoves: [top("f3e5", "Nxe5", 300, ["f3e5"]), top("d2d4", "d4", 0), top("b1c3", "Nc3", -10)],
      }),
    );
    expect(v.ok).toBe(true);
    expect(v.reasons).toContain("wins-material");
  });

  it("rejects when several moves are about equally good", () => {
    const v = judgeCheckpoint(
      move({
        fenBefore: FREE_KNIGHT,
        topMoves: [top("d2d4", "d4", 30), top("b1c3", "Nc3", 25), top("d2d3", "d3", 20)],
      }),
    );
    expect(v.ok).toBe(false);
    expect(v.rejectedBecause).toBe("no-clear-best");
  });

  it("rejects a quiet best move with nothing concrete at stake", () => {
    const v = judgeCheckpoint(
      move({
        fenBefore: FREE_KNIGHT,
        fenAfter: FREE_KNIGHT.replace(" w ", " b "),
        topMoves: [top("d2d4", "d4", 200, ["d2d4"]), top("b1c3", "Nc3", 0), top("d2d3", "d3", -20)],
        refutation: [],
      }),
    );
    expect(v.ok).toBe(false);
    expect(v.rejectedBecause).toBe("quiet-positional");
  });

  it("rejects moves that weren't deep-checked", () => {
    expect(judgeCheckpoint(move({ deep: false })).rejectedBecause).toBe("not-deep-checked");
  });
});

describe("passesCheckpoint", () => {
  const cp = { topMoves: [top("f3e5", "Nxe5", 300), top("e4e5", "e5", 290), top("d2d4", "d4", 0)] };
  it("passes the top move", () => expect(passesCheckpoint(cp, "f3e5")).toBe(true));
  it("passes a move within the margin", () => expect(passesCheckpoint(cp, "e4e5")).toBe(true));
  it("fails a clearly worse top-3 move", () => expect(passesCheckpoint(cp, "d2d4")).toBe(false));
  it("fails a move outside the top lines", () => expect(passesCheckpoint(cp, "h2h3")).toBe(false));
});
