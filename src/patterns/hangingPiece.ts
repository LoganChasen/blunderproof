import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";
import type { BlunderContext, Detector, DetectorResult } from "./types.js";
import { PIECE_NAME, PIECE_VALUE, describePiece, lineEndsInMate, materialSwing, playLine } from "./helpers.js";

/** How many opponent moves of the refutation we look at for the capture. */
const OPPONENT_MOVES_SCANNED = 3;
/** Net material the opponent must win for a piece (knight or more) to count as hanging. */
const PIECE_THRESHOLD = 2;
/** A lone pawn counts only if it is taken immediately and nets at least this much. */
const PAWN_THRESHOLD = 1;

/**
 * Static exchange evaluation: material the side to move wins by starting a capture
 * sequence on `square` (each side always recaptures with its cheapest legal piece and
 * may stop at any point). Uses legal moves, so pins and x-rays are handled naturally.
 */
function see(chess: Chess, square: Square): number {
  const target = chess.get(square);
  if (!target) return 0;
  const captures = chess
    .moves({ verbose: true })
    .filter((m) => m.to === square && m.captured !== undefined && !m.isEnPassant());
  if (captures.length === 0) return 0;
  let cheapest = captures[0]!;
  for (const m of captures) if (PIECE_VALUE[m.piece] < PIECE_VALUE[cheapest.piece]) cheapest = m;
  chess.move(cheapest);
  const gain = PIECE_VALUE[target.type] - see(chess, square);
  chess.undo();
  return Math.max(0, gain);
}

/** The same position with the other side to move (en passant cleared), or null if invalid. */
function withTurn(fen: string, turn: Color): Chess | null {
  const parts = fen.split(" ");
  parts[1] = turn;
  parts[3] = "-";
  try {
    return new Chess(parts.join(" "));
  } catch {
    return null;
  }
}

function defenders(chess: Chess, square: Square, color: Color): Square[] {
  return chess.attackers(square, color);
}

export const detectHangingPiece: Detector = (ctx: BlunderContext): DetectorResult | null => {
  const before = new Chess(ctx.fenBefore);
  const player = before.turn();
  const opponent: Color = player === "w" ? "b" : "w";
  const after = new Chess(ctx.fenAfter);
  const playedFrom = ctx.played.slice(0, 2) as Square;
  const playedTo = ctx.played.slice(2, 4) as Square;

  // Forced mates belong to another detector.
  if (ctx.refutation.length === 0 || lineEndsInMate(ctx.fenAfter, ctx.refutation)) return null;

  const { moves } = playLine(ctx.fenAfter, ctx.refutation);
  const touched = new Set<Square>(); // squares the player's pieces moved from/to during the line

  for (let i = 0; i < moves.length && i < OPPONENT_MOVES_SCANNED * 2; i++) {
    const m: Move = moves[i]!;
    if (i % 2 === 1) {
      touched.add(m.from);
      touched.add(m.to);
      continue;
    }
    if (!m.captured || m.isEnPassant()) continue;
    const sq = m.to;
    // The captured piece must be one that was already sitting there in fenAfter.
    const victim = after.get(sq);
    if (!victim || victim.color !== player || victim.type !== m.captured || touched.has(sq)) continue;

    const isPawn = victim.type === "p";
    if (isPawn && i !== 0) continue; // deeper pawn grabs are usually incidental, not "hanging"
    const threshold = isPawn ? PAWN_THRESHOLD : PIECE_THRESHOLD;

    // Statically hanging in fenAfter?
    const seeAfter = see(after, sq);
    if (seeAfter < threshold) continue;

    // Does the opponent actually come out ahead (measured from before the player's move,
    // so that an even trade started by the player nets zero)? Take the worse of two windows.
    const full = [ctx.played, ...ctx.refutation];
    const short = materialSwing(ctx.fenBefore, full.slice(0, i + 3), opponent);
    const longer = materialSwing(ctx.fenBefore, full.slice(0, i + 5), opponent);
    if (Math.min(short, longer) < threshold) continue;

    // Was it already hanging just as badly before the move? Then this move didn't cause it.
    const movedPiece = sq === playedTo;
    if (!movedPiece) {
      const prev = before.get(sq);
      if (prev && prev.color === player && prev.type === victim.type) {
        const flipped = withTurn(ctx.fenBefore, opponent);
        if (flipped && see(flipped, sq) >= seeAfter) continue;
      }
    }

    return { explanation: explain(ctx, before, after, victim.type, sq, m.san, movedPiece, playedFrom, playedTo, player) };
  }
  return null;
};

function explain(
  ctx: BlunderContext,
  before: Chess,
  after: Chess,
  type: PieceSymbol,
  sq: Square,
  captureSan: string,
  movedPiece: boolean,
  playedFrom: Square,
  playedTo: Square,
  player: Color,
): string {
  const name = PIECE_NAME[type];
  const defs = defenders(after, sq, player);
  if (movedPiece) {
    const grabbed = before.get(playedTo);
    if (grabbed && grabbed.color !== player) {
      return defs.length === 0
        ? `${ctx.playedSan} grabbed a ${PIECE_NAME[grabbed.type]}, but left your ${name} on ${sq} undefended; ${captureSan} wins it.`
        : `${ctx.playedSan} grabbed a ${PIECE_NAME[grabbed.type]}, but ${captureSan} wins your ${name} on ${sq}.`;
    }
    return defs.length === 0
      ? `Moved the ${name} to ${sq} where ${captureSan} takes it for free.`
      : `Moved the ${name} to ${sq} where ${captureSan} wins it.`;
  }
  const wasDefender =
    defenders(before, sq, player).includes(playedFrom) && !defs.includes(playedTo);
  if (wasDefender) {
    return `${ctx.playedSan} stopped defending your ${describePiece(type, sq)}; ${captureSan} wins it.`;
  }
  return defs.length === 0
    ? `Left your ${describePiece(type, sq)} undefended; ${captureSan} wins it.`
    : `Left your ${describePiece(type, sq)} exposed; ${captureSan} wins it.`;
}
