import { Chess, type Color, type Move, type Square } from "chess.js";
import { materialSwing, playLine, playUci, PIECE_NAME } from "./helpers";
import type { BlunderContext, Detector } from "./types";

/** Longest refutation (in plies) we accept as a "back-rank mate" line. */
const MAX_MATE_PLIES = 11;
/** The back-rank check of a threat line must come this early (plies). */
const MAX_THREAT_CHECK_PLY = 6;
/** Opponent captures we test for an "overloaded back-rank guard" (plies). */
const MAX_GUARD_CAPTURE_PLY = 4;
/** Net material the opponent must win for the threat version. */
const MIN_THREAT_GAIN = 3;

const FILES = "abcdefgh";

function backRank(color: Color): string {
  return color === "w" ? "1" : "8";
}

function rankWord(color: Color): string {
  return color === "w" ? "first" : "eighth";
}

function kingSquare(chess: Chess, color: Color): Square | null {
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.type === "k" && sq.color === color) return sq.square;
    }
  }
  return null;
}

/** The (up to 3) squares directly in front of the king, toward the centre of the board. */
function forwardSquares(king: Square, color: Color): Square[] {
  const file = FILES.indexOf(king[0]!);
  const rank = color === "w" ? "2" : "7";
  const out: Square[] = [];
  for (const df of [-1, 0, 1]) {
    const f = file + df;
    if (f >= 0 && f < 8) out.push(`${FILES[f]}${rank}` as Square);
  }
  return out;
}

/**
 * True when `color` (to move) is in check from a rook/queen along its own back
 * rank, its king sits on that rank, and the squares in front of the king are
 * mostly its own pieces with no way for the king to step off the rank.
 */
function isBackRankCheck(chess: Chess, color: Color): boolean {
  if (chess.turn() !== color || !chess.inCheck()) return false;
  const king = kingSquare(chess, color);
  if (!king || king[1] !== backRank(color)) return false;

  const enemy: Color = color === "w" ? "b" : "w";
  const rankChecker = chess.attackers(king, enemy).some((sq) => {
    const p = chess.get(sq);
    return !!p && (p.type === "r" || p.type === "q") && sq[1] === king[1];
  });
  if (!rankChecker) return false;

  const fwd = forwardSquares(king, color);
  const ownBlockers = fwd.filter((sq) => chess.get(sq)?.color === color).length;
  if (ownBlockers < 2 || ownBlockers * 2 < fwd.length) return false;

  const kingMoves = chess.moves({ square: king, verbose: true });
  return kingMoves.every((m) => m.to[1] === backRank(color));
}

/** True if `color`'s king has no legal moves at all (only blocks/captures answer the check). */
function kingIsStuck(chess: Chess, color: Color): boolean {
  const king = kingSquare(chess, color);
  return !!king && chess.moves({ square: king, verbose: true }).length === 0;
}

/** A back-rank mate-in-1 the side to move has against `victim`, if any. */
function backRankMateInOne(chess: Chess, victim: Color): Move | null {
  for (const m of chess.moves({ verbose: true })) {
    if (!m.san.endsWith("#")) continue;
    chess.move(m);
    const ok = chess.isCheckmate() && isBackRankCheck(chess, victim);
    chess.undo();
    if (ok) return m;
  }
  return null;
}

function playerOf(ctx: BlunderContext): Color {
  return new Chess(ctx.fenBefore).turn();
}

export const detectBackRank: Detector = (ctx) => {
  const line = ctx.refutation ?? [];
  if (line.length === 0) return null;
  const player = playerOf(ctx);
  const rank = rankWord(player);

  let chess: Chess;
  try {
    chess = new Chess(ctx.fenAfter);
  } catch {
    return null;
  }
  if (chess.turn() === player) return null;

  // Replay the refutation, remembering every back-rank check against the player.
  const moves: Move[] = [];
  const brChecks: { ply: number; move: Move; stuck: boolean }[] = [];
  for (const uci of line) {
    const m = playUci(chess, uci);
    if (!m) break;
    moves.push(m);
    if (m.color !== player && isBackRankCheck(chess, player)) {
      brChecks.push({ ply: moves.length - 1, move: m, stuck: kingIsStuck(chess, player) });
    }
  }
  if (moves.length === 0) return null;
  const firstCheck = brChecks[0];

  // (a) The line ends in a back-rank mate.
  if (chess.isCheckmate() && chess.turn() === player && moves.length <= MAX_MATE_PLIES) {
    if (isBackRankCheck(chess, player)) {
      const mating = moves[moves.length - 1]!;
      const lead = firstCheck ?? { move: mating };
      const verb = lead.move === mating ? "is mate" : "leads to mate";
      return {
        explanation: `Weak back rank: after ${ctx.playedSan}, ${lead.move.san.replace("#", "")} ${verb} on the ${rank} rank.`,
      };
    }
    return null; // A mate, but not a back-rank one.
  }

  // (a') Truncated PV with a mate evaluation: trust a forcing back-rank check in the line.
  const mateEval = ctx.winAfter < 0.5 && !chess.isCheckmate();
  if (mateEval && moves.length <= MAX_MATE_PLIES) {
    const forcing = brChecks.find((c) => c.stuck);
    if (forcing) {
      return {
        explanation: `Weak back rank: after ${ctx.playedSan}, ${forcing.move.san} leads to mate on the ${rank} rank.`,
      };
    }
  }

  const opp: Color = player === "w" ? "b" : "w";
  const used = line.slice(0, moves.length);
  if (materialSwing(ctx.fenAfter, used, opp) < MIN_THREAT_GAIN) return null;

  // (b1) A forcing back-rank check early in the line wins material shortly after.
  for (const c of brChecks) {
    if (c.ply > MAX_THREAT_CHECK_PLY || !c.stuck) continue;
    const window = used.slice(0, Math.min(used.length, c.ply + 5));
    if (materialSwing(ctx.fenAfter, window, opp) < MIN_THREAT_GAIN) continue;
    return {
      explanation: `Back-rank threat: ${c.move.san} wins material because your king has no escape square.`,
    };
  }

  // (b2) An opponent capture can't be answered because the recapturing piece guards the back rank.
  const replay = new Chess(ctx.fenAfter);
  for (let i = 0; i < moves.length && i <= MAX_GUARD_CAPTURE_PLY; i++) {
    const m = moves[i]!;
    replay.move(m);
    if (m.color === player || !m.captured || replay.inCheck()) continue;
    const next = moves[i + 1];
    if (next && next.to === m.to) continue; // The player did recapture in the line.
    const recaptures = replay.moves({ verbose: true }).filter((r) => r.to === m.to && r.piece !== "k");
    if (recaptures.length === 0) continue;
    let guard: Move | null = null;
    const allLose = recaptures.every((r) => {
      replay.move(r);
      const mate = backRankMateInOne(replay, player);
      replay.undo();
      if (mate && !guard) guard = r;
      return !!mate;
    });
    if (allLose && guard) {
      const g = guard as Move;
      return {
        explanation: `Back-rank threat: ${m.san} wins material because your ${PIECE_NAME[g.piece]} on ${g.from} can't recapture without allowing mate on the ${rank} rank.`,
      };
    }
  }

  return null;
};
