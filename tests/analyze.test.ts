import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeGame, labelForDrop } from "../src/analyze";
import { Engine } from "../src/engine";
import type { ChessComGame } from "../src/chesscom";

describe("labelForDrop", () => {
  it("uses the config thresholds", () => {
    expect(labelForDrop(2)).toBe("good");
    expect(labelForDrop(5)).toBe("inaccuracy");
    expect(labelForDrop(12)).toBe("mistake");
    expect(labelForDrop(40)).toBe("blunder");
  });
});

const hasStockfish = (() => {
  try {
    execSync("command -v stockfish");
    return true;
  } catch {
    return false;
  }
})();

/** Fool's mate: White's 2.g4?? lets Black mate. */
const foolsMate: ChessComGame = {
  url: "https://www.chess.com/game/live/1",
  uuid: "1",
  pgn: '[White "me"]\n[Black "them"]\n\n1. f3 {[%clk 0:01:00]} 1... e5 {[%clk 0:01:00]} 2. g4 {[%clk 0:00:59]} 2... Qh4# {[%clk 0:00:59]} 0-1',
  time_control: "60",
  time_class: "bullet",
  rules: "chess",
  end_time: 1_790_000_000,
  rated: true,
  white: { username: "me", rating: 1500, result: "checkmated" },
  black: { username: "them", rating: 1500, result: "win" },
};

describe.skipIf(!hasStockfish)("analyzeGame (real stockfish)", () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await Engine.start();
  });
  afterAll(async () => {
    await engine.quit();
  });

  it("flags 2.g4 as a blunder and confirms it with the deep pass", async () => {
    const a = await analyzeGame(foolsMate, "me", engine);
    expect(a.playerColor).toBe("w");
    expect(a.opponent).toBe("them");
    const g4 = a.moves[2]!;
    expect(g4.san).toBe("g4");
    expect(g4.label).toBe("blunder");
    expect(g4.deep).toBe(true);
    expect(g4.topMoves.length).toBeGreaterThan(1);
    expect(g4.winAfter).toBe(0);
    // Black's mating move is the best move.
    expect(a.moves[3]!.label).toBe("best");
  });
});
