import { describe, expect, it } from "vitest";
import { baseTimeMs, clockBucket, gamePhase, moveContext } from "../src/context.js";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MIDDLEGAME = "r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQ - 0 14";
const ROOK_ENDING = "8/5pk1/6p1/8/3R4/6P1/r4PK1/8 w - - 0 40";

describe("game phase", () => {
  it("is the opening early on", () => {
    expect(gamePhase(START, 1)).toBe("opening");
  });
  it("is the middlegame after move 12 with pieces on", () => {
    expect(gamePhase(MIDDLEGAME, 14)).toBe("middlegame");
  });
  it("is an endgame with few pieces, whatever the move number", () => {
    expect(gamePhase(ROOK_ENDING, 40)).toBe("endgame");
    expect(gamePhase(ROOK_ENDING, 8)).toBe("endgame");
  });
});

describe("clock", () => {
  it("buckets remaining time", () => {
    expect(clockBucket(5_000)).toBe("<10s");
    expect(clockBucket(10_000)).toBe("<30s");
    expect(clockBucket(45_000)).toBe("<60s");
    expect(clockBucket(120_000)).toBe("60s+");
    expect(clockBucket(null)).toBeNull();
  });
  it("parses base time with or without increment", () => {
    expect(baseTimeMs("180")).toBe(180_000);
    expect(baseTimeMs("180+2")).toBe(180_000);
    expect(baseTimeMs("1/86400")).toBeNull();
  });
  it("computes the share of the clock left", () => {
    expect(moveContext(START, 1, 30_000, "60").clockFraction).toBeCloseTo(0.5);
  });
});
