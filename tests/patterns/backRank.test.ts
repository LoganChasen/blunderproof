import { readFileSync } from "node:fs";
import { Chess, validateFen } from "chess.js";
import { describe, expect, it } from "vitest";
import { detectBackRank } from "../../src/patterns/backRank";
import { lineEndsInMate } from "../../src/patterns/helpers";
import type { BlunderContext } from "../../src/patterns/types";

/** Build a context from fenBefore + played move; fenAfter is derived and both FENs are validated. */
function ctx(fenBefore: string, played: string, refutation: string[], winAfter = 0): BlunderContext {
  expect(validateFen(fenBefore).ok).toBe(true);
  const c = new Chess(fenBefore);
  const m = c.move({ from: played.slice(0, 2), to: played.slice(2, 4), promotion: played[4] });
  return {
    fenBefore,
    fenAfter: c.fen(),
    played,
    playedSan: m.san,
    topMoves: [],
    refutation,
    winBefore: 50,
    winAfter,
  };
}

describe("detectBackRank", () => {
  it("fires on a classic back-rank mate (Re8# vs Kg8, pawns f7 g7 h7)", () => {
    // Black's rook leaves the back rank; Re8 is mate.
    const r = detectBackRank(ctx("3r2k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1", "d8d2", ["e1e8"]));
    expect(r?.explanation).toBe("Weak back rank: after Rd2, Re8 is mate on the eighth rank.");
  });

  it("fires on a back-rank mate that starts with a sacrifice (Re8+ Rxe8 Qxe8#)", () => {
    const r = detectBackRank(
      ctx("3r2k1/1q3ppp/5b2/8/Q7/8/5PPP/4R1K1 b - - 0 1", "f6d4", ["e1e8", "d8e8", "a4e8"]),
    );
    expect(r?.explanation).toBe("Weak back rank: after Bd4, Re8+ leads to mate on the eighth rank.");
  });

  it("does not fire when the king has luft (h6 played)", () => {
    const r = detectBackRank(
      ctx("3r2k1/5pp1/7p/8/8/8/5PPP/4R1K1 b - - 0 1", "d8d2", ["e1e8", "g8h7", "g2g3", "f7f5"], 50),
    );
    expect(r).toBeNull();
  });

  it("does not fire on a smothered mate", () => {
    const c = ctx("6rk/6pp/8/4N3/8/8/r5PP/6K1 b - - 0 1", "a2a3", ["e5f7"]);
    expect(new Chess(c.fenAfter).move("Nf7").san).toBe("Nf7#");
    expect(detectBackRank(c)).toBeNull();
  });

  it("does not fire on a queen mate on h7", () => {
    const c = ctx("5rk1/5pp1/8/3r3Q/8/3B4/5PPP/6K1 b - - 0 1", "d5d6", ["h5h7"]);
    expect(lineEndsInMate(c.fenAfter, c.refutation)).toBe(true);
    expect(detectBackRank(c)).toBeNull();
  });

  it("fires on the threat version: the back-rank guard can't recapture", () => {
    // After ...Bd4?, Qxd4 wins the bishop: ...Rxd4 would allow Re8#.
    const c = ctx(
      "3r2k1/5ppp/q4b2/8/8/8/5PPP/3QR1K1 b - - 0 1",
      "f6d4",
      ["d1d4", "a6a8", "d4e5", "h7h5", "e5e7", "d8d3", "h2h3", "a8d8"],
      30,
    );
    const r = detectBackRank(c);
    expect(r?.explanation).toBe(
      "Back-rank threat: Qxd4 wins material because your rook on d8 can't recapture without allowing mate on the eighth rank.",
    );
  });

  it("does not throw on any real fixture", () => {
    const fixtures = JSON.parse(
      readFileSync(new URL("../fixtures/real-blunders.json", import.meta.url), "utf8"),
    ) as BlunderContext[];
    expect(fixtures.length).toBeGreaterThan(0);
    for (const f of fixtures) expect(() => detectBackRank(f)).not.toThrow();
  });
});
