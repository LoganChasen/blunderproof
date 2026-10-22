import { Chess, type Move, type PieceSymbol } from "chess.js";
import type { BlunderContext, Detector } from "./types";
import { PIECE_NAME, PIECE_VALUE, materialSwing, playLine } from "./helpers";

/** Plies of the engine line we look at before letting captures settle. */
const WINDOW = 4;
/**
 * The played line gets a longer look, so a move that merely delays the same capture
 * (a check first, then Nxc7) isn't reported as missing it.
 */
const PLAYED_WINDOW = 6;
/** Hard cap so a long capture sequence can't run forever. */
const MAX_PLIES = 10;
/** Minimum net material (pawns) the best capture must win. */
const MIN_GAIN = 1;

/**
 * Cut a line to a short window: WINDOW plies, then keep going while the next
 * move recaptures on the same square (so a recapture just past the window is counted).
 */
function settledWindow(fen: string, line: string[], window: number): Move[] {
  const { moves } = playLine(fen, line.slice(0, MAX_PLIES));
  let n = Math.min(window, moves.length);
  while (n < moves.length && moves[n]!.captured && moves[n]!.to === moves[n - 1]!.to) n++;
  return moves.slice(0, n);
}

function toUci(m: Move): string {
  return m.from + m.to + (m.promotion ?? "");
}

/** Net material `side` wins over the settled window of `line`. */
function lineGain(fen: string, line: string[], side: "w" | "b", window: number): { gain: number; moves: Move[] } {
  const moves = settledWindow(fen, line, window);
  return { gain: materialSwing(fen, moves.map(toUci), side), moves };
}

function article(type: PieceSymbol): string {
  return type === "p" ? "a pawn" : `a ${PIECE_NAME[type]}`;
}

const COUNT_WORD = ["", "a", "two", "three", "four", "five", "six", "seven", "eight"];

/** "a knight and two pawns" (most valuable first, same types grouped). */
function list(types: PieceSymbol[]): string {
  const order: PieceSymbol[] = ["q", "r", "b", "n", "p"];
  const parts: string[] = [];
  for (const t of order) {
    const n = types.filter((x) => x === t).length;
    if (n === 0) continue;
    parts.push(n === 1 ? article(t) : `${COUNT_WORD[n] ?? n} ${PIECE_NAME[t]}s`);
  }
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Plain-English description of what the line wins, e.g. "which wins a pawn for free".
 * Even trades inside the line (bishop for knight, queen for queen) are cancelled out first.
 */
function describeWin(moves: Move[], side: "w" | "b"): string {
  const won = moves.filter((m) => m.color === side && m.captured);
  const lost = moves.filter((m) => m.color !== side && m.captured).map((m) => m.captured!);
  const hadLosses = lost.length > 0;
  // Cancel like-for-like trades first (knight for knight), then equal-value ones (bishop for knight).
  let kept: Move[] = won;
  for (const same of [(a: PieceSymbol, b: PieceSymbol) => a === b, (a: PieceSymbol, b: PieceSymbol) => PIECE_VALUE[a] === PIECE_VALUE[b]]) {
    kept = kept.filter((m) => {
      const i = lost.findIndex((t) => same(t, m.captured!));
      if (i < 0) return true;
      lost.splice(i, 1);
      return false;
    });
  }
  if (kept.length === 0) return "which wins material";
  const free = hadLosses ? "" : " for free";
  if (lost.length === 0) {
    if (kept.length === 1) {
      const m = kept[0]!;
      // The capture itself is the win ("wins a pawn"); a later capture gets named ("winning the rook on h8").
      return m === moves[0] || m.captured === "p"
        ? `which wins ${article(m.captured!)}${free}`
        : `winning the ${PIECE_NAME[m.captured!]} on ${m.to}`;
    }
    return `which wins ${list(kept.map((m) => m.captured!))}${free}`;
  }
  const what =
    kept.length === 1 ? `the ${PIECE_NAME[kept[0]!.captured!]} on ${kept[0]!.to}` : list(kept.map((m) => m.captured!));
  return `winning ${what} for ${list(lost)}`;
}

export const detectMissedCapture: Detector = (ctx: BlunderContext) => {
  const best = ctx.topMoves[0];
  if (!best || best.move === ctx.played) return null;
  if ("mate" in best.score && best.score.mate !== undefined) return null; // missed-mate detector handles it

  const side = new Chess(ctx.fenBefore).turn();
  const bestLine = best.pv.length > 0 && best.pv[0] === best.move ? best.pv : [best.move];
  const bestRes = lineGain(ctx.fenBefore, bestLine, side, WINDOW);
  const first = bestRes.moves[0];
  if (!first || !first.captured) return null; // best move must be a capture
  if (bestRes.gain < MIN_GAIN) return null; // even trade or worse

  const playedEntry = ctx.topMoves.find((t) => t.move === ctx.played);
  const playedLine =
    playedEntry && playedEntry.pv[0] === ctx.played ? playedEntry.pv : [ctx.played, ...ctx.refutation];
  const playedRes = lineGain(ctx.fenBefore, playedLine, side, PLAYED_WINDOW);
  if (playedRes.moves.length === 0) return null; // played move not legal here; bad input
  // If the player captured on the same square with a different piece, they did see the capture;
  // only call it a miss if their version cost real material (e.g. Nxe6 fxe6 instead of a free Bxe6).
  const playedFirst = playedRes.moves[0]!;
  const sameTarget = playedFirst.captured !== undefined && playedFirst.to === first.to;
  const margin = sameTarget ? 2 : 1;
  if (bestRes.gain - playedRes.gain < margin) return null; // the played move wins comparable material

  const instead = sameTarget ? ` (not ${playedFirst.san})` : "";
  return { explanation: `Missed ${first.san}${instead}, ${describeWin(bestRes.moves, side)}.` };
};
