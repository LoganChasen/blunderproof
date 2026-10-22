import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { detectHangingPiece } from "../../src/patterns/hangingPiece.js";
import type { BlunderContext } from "../../src/patterns/types.js";

/** Builds a context from fenBefore + a UCI move, checking legality with chess.js. */
function ctx(fenBefore: string, played: string, refutation: string[]): BlunderContext {
  const chess = new Chess(fenBefore);
  const m = chess.move({ from: played.slice(0, 2), to: played.slice(2, 4), promotion: played[4] });
  return {
    fenBefore,
    fenAfter: chess.fen(),
    played,
    playedSan: m.san,
    topMoves: [],
    refutation,
    winBefore: 50,
    winAfter: 10,
  };
}

describe("detectHangingPiece", () => {
  it("fires when a piece moves onto an attacked, undefended square", () => {
    // 1.e4 e5 2.d3 Nc6 3.Bg5?? Qxg5 (stockfish depth 14 line)
    const c = ctx("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/3P4/PPP2PPP/RNBQKBNR w KQkq - 1 3", "c1g5", [
      "d8g5", "g1e2", "g5f6", "b1c3", "f8b4", "g2g3",
    ]);
    expect(detectHangingPiece(c)?.explanation).toBe("Moved the bishop to g5 where Qxg5 takes it for free.");
  });

  it("fires when the move takes away the only defender of another piece", () => {
    // Rd1 guarded the knight on d4; Re1?? lets Bxd4 win it (stockfish line).
    const c = ctx("6k1/p4pp1/1b5p/8/3N4/7P/PP3PP1/3R2K1 w - - 0 1", "d1e1", [
      "b6d4", "e1e8", "g8h7", "b2b4", "d4c3", "e8e7",
    ]);
    expect(detectHangingPiece(c)?.explanation).toBe("Re1 stopped defending your knight on d4; Bxd4 wins it.");
  });

  it("does not fire on an even trade", () => {
    // 4.Bxc6 dxc6 in the Ruy Lopez Exchange (stockfish line).
    const c = ctx("r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4", "b5c6", [
      "d7c6", "e1g1", "f7f6", "d2d4", "e5d4", "f3d4",
    ]);
    expect(detectHangingPiece(c)).toBeNull();
  });

  it("does not fire when the attacked piece is defended and the exchange is level", () => {
    // 3...Nd4 4.Nxd4 exd4: the knight on d4 is guarded, so the swap loses nothing.
    const c = ctx("r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3", "c6d4", [
      "f3d4", "e5d4", "e1g1", "c7c6", "b5c4", "g8f6",
    ]);
    expect(detectHangingPiece(c)).toBeNull();
  });

  it("does not fire when the piece was already hanging before the move", () => {
    // The knight on d4 was already undefended; a3 didn't change anything.
    const c = ctx("6k1/p4ppp/1b6/8/3N4/7P/PP3PP1/6K1 w - - 0 1", "a2a3", [
      "b6d4", "b2b4", "d4b6", "g1f1", "g8f8",
    ]);
    expect(detectHangingPiece(c)).toBeNull();
  });

  it("does not fire when the capture is checkmate", () => {
    // 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#: the f7 pawn "hangs", but it's a mate.
    const c = ctx("r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3", "g8f6", ["h5f7"]);
    expect(detectHangingPiece(c)).toBeNull();
  });

  it("does not throw on any real blunder fixture", () => {
    const fixtures = JSON.parse(
      readFileSync(new URL("../fixtures/real-blunders.json", import.meta.url), "utf8"),
    ) as BlunderContext[];
    expect(fixtures.length).toBeGreaterThan(0);
    for (const f of fixtures) {
      const r = detectHangingPiece(f);
      if (r) expect(r.explanation.length).toBeGreaterThan(0);
    }
  });
});
