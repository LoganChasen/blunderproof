import { Chess } from "chess.js";

export type Color = "w" | "b";

/** One half-move ("ply") from a game. */
export interface ParsedMove {
  /** 1-based ply index: 1 = White's first move. */
  ply: number;
  /** Full-move number as written in the PGN ("12." / "12..."). */
  moveNumber: number;
  color: Color;
  san: string;
  /** UCI notation like "e2e4" / "e7e8q", which is what the engine speaks. */
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** Mover's clock after the move, in ms (null if the PGN has no clocks). */
  clockMs: number | null;
}

export interface ParsedGame {
  headers: Record<string, string>;
  startFen: string;
  moves: ParsedMove[];
}

/** "[%clk 0:02:59.9]" → 179900 */
export function parseClock(text: string): number {
  const m = text.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error(`Bad clock: ${text}`);
  return Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000);
}

export function parsePgn(pgn: string): ParsedGame {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const headers = chess.getHeaders() as Record<string, string>;
  const history = chess.history({ verbose: true });

  // Clock comments appear in move order, one per ply.
  const clocks = [...pgn.matchAll(/\[%clk\s+([\d:.]+)\]/g)].map((m) => parseClock(m[1]!));
  const hasClocks = clocks.length === history.length;

  const moves = history.map((mv, i): ParsedMove => {
    const fenParts = mv.before.split(" ");
    return {
      ply: i + 1,
      moveNumber: Number(fenParts[5]),
      color: mv.color,
      san: mv.san,
      uci: mv.from + mv.to + (mv.promotion ?? ""),
      fenBefore: mv.before,
      fenAfter: mv.after,
      clockMs: hasClocks ? clocks[i]! : null,
    };
  });

  return { headers, startFen: history[0]?.before ?? new Chess().fen(), moves };
}
