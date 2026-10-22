import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Engine, parseInfoLine } from "../src/engine";

describe("parseInfoLine", () => {
  it("parses a multipv cp line", () => {
    const info = parseInfoLine(
      "info depth 14 seldepth 20 multipv 2 score cp -35 nodes 1000 nps 1 hashfull 1 tbhits 0 time 5 pv e7e5 g1f3 b8c6",
    );
    expect(info).toEqual({ depth: 14, rank: 2, move: "e7e5", score: { cp: -35 }, pv: ["e7e5", "g1f3", "b8c6"] });
  });

  it("parses mate scores", () => {
    expect(parseInfoLine("info depth 5 multipv 1 score mate -2 pv h7h6 d1h5")?.score).toEqual({ mate: -2 });
  });

  it("ignores non-pv and bound lines", () => {
    expect(parseInfoLine("info string NNUE enabled")).toBeNull();
    expect(parseInfoLine("info depth 10 multipv 1 score cp 20 lowerbound pv e2e4")).toBeNull();
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

describe.skipIf(!hasStockfish)("Engine (real stockfish)", () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await Engine.start();
  });
  afterAll(async () => {
    await engine.quit();
  });

  it("finds mate in one with 3 lines", async () => {
    // Scholar's-mate setup: Qxf7# is available.
    const fen = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
    const res = await engine.analyze(fen, { depth: 10, multiPv: 3 });
    expect(res.lines).toHaveLength(3);
    expect(res.lines[0]).toMatchObject({ move: "h5f7", score: { mate: 1 } });
  });

  it("handles positions with no legal moves", async () => {
    const mated = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
    const res = await engine.analyze(mated, { depth: 5 });
    expect(res.lines).toHaveLength(0);
  });

  it("queues concurrent calls safely", async () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const [a, b] = await Promise.all([
      engine.analyze(start, { depth: 8, multiPv: 1 }),
      engine.analyze(start, { depth: 8, multiPv: 2 }),
    ]);
    expect(a.lines).toHaveLength(1);
    expect(b.lines).toHaveLength(2);
  });
});
