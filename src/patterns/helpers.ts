import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";

/** Standard material values (pawn = 1). The king is 0 because it can't be won. */
export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/** Play a UCI move ("e2e4", "e7e8q") on a board. Returns the chess.js Move, or null if illegal. */
export function playUci(chess: Chess, uci: string): Move | null {
  try {
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
}

/** Play a sequence of UCI moves from a FEN. Returns the board and the moves that were legal (stops at the first illegal one). */
export function playLine(fen: string, line: string[]): { chess: Chess; moves: Move[] } {
  const chess = new Chess(fen);
  const moves: Move[] = [];
  for (const uci of line) {
    const m = playUci(chess, uci);
    if (!m) break;
    moves.push(m);
  }
  return { chess, moves };
}

/** Material balance from White's perspective (positive = White ahead). */
export function materialBalance(chess: Chess): number {
  let total = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      total += (sq.color === "w" ? 1 : -1) * PIECE_VALUE[sq.type];
    }
  }
  return total;
}

/**
 * Net material a side gains over a line (positive = `side` comes out ahead).
 * Compares the material balance at the start of the line and at its end.
 */
export function materialSwing(fen: string, line: string[], side: "w" | "b"): number {
  const start = materialBalance(new Chess(fen));
  const { chess } = playLine(fen, line);
  const diff = materialBalance(chess) - start;
  return side === "w" ? diff : -diff;
}

/** Squares of `color`'s pieces that attack `square`. */
export function attackersOf(chess: Chess, square: Square, color: "w" | "b"): Square[] {
  return chess.attackers(square, color);
}

/** True if a UCI move's PV leads to checkmate on the board. */
export function lineEndsInMate(fen: string, line: string[]): boolean {
  const { chess, moves } = playLine(fen, line);
  return moves.length === line.length && chess.isCheckmate();
}

/** "Nf6" style label for messages: "knight on f6". */
export function describePiece(type: PieceSymbol, square: Square): string {
  return `${PIECE_NAME[type]} on ${square}`;
}
