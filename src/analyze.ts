import { Chess } from "chess.js";
import { config } from "./config.js";
import type { ChessComGame } from "./chesscom.js";
import type { EngineLine, EvalResult, UciEngine } from "./uci.js";
import { parsePgn, type Color, type ParsedMove } from "./pgn.js";
import { scoreToWinPercent, type Score } from "./winPercent.js";

export type MoveLabel = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export interface TopMove {
  move: string;
  san: string;
  score: Score;
  /** Mover's win% if this move is played. */
  winPercent: number;
  /** Engine's expected continuation in UCI, starting with this move. */
  pv: string[];
}

export interface MoveAnalysis extends ParsedMove {
  bestMove: string | null;
  bestMoveSan: string | null;
  /** Up to MultiPV lines; full list only on deep-checked moves. */
  topMoves: TopMove[];
  /** Mover's win% before and after the move (0–100). */
  winBefore: number;
  winAfter: number;
  /** winBefore − winAfter, floored at 0. */
  drop: number;
  label: MoveLabel;
  /** True if this move got the deep confirmation pass. */
  deep: boolean;
  /**
   * Deep-checked moves only: the engine's expected continuation after the
   * move that was actually played, starting with the opponent's reply.
   */
  refutation: string[] | null;
}

export interface GameAnalysis {
  gameId: string;
  url: string;
  playerColor: Color;
  player: string;
  opponent: string;
  opponentRating: number;
  playerRating: number;
  playedAt: string;
  timeClass: string;
  timeControl: string;
  /** "win" | "checkmated" | "timeout" | ... from the player's side. */
  result: string;
  engine: string;
  depths: { fast: number; deep: number };
  moves: MoveAnalysis[];
  analysisMs: number;
}

export function labelForDrop(drop: number): Exclude<MoveLabel, "best"> {
  const t = config.labels;
  if (drop >= t.blunder) return "blunder";
  if (drop >= t.mistake) return "mistake";
  if (drop >= t.inaccuracy) return "inaccuracy";
  return "good";
}

export function gameIdOf(game: ChessComGame): string {
  return game.url.split("/").pop() ?? game.uuid;
}

/** Win% for the side to move in a position with no legal moves. */
function terminalWin(fen: string): number {
  const c = new Chess(fen);
  return c.isCheckmate() ? 0 : 50;
}

/** Side-to-move win% from an engine result (handles finished games). */
function winFromEval(res: EvalResult, fen: string): number {
  const top = res.lines[0];
  return top ? scoreToWinPercent(top.score) : terminalWin(fen);
}

function toTopMoves(lines: EngineLine[], fen: string): TopMove[] {
  return lines.map((l) => {
    const c = new Chess(fen);
    let san = l.move;
    try {
      san = c.move({ from: l.move.slice(0, 2), to: l.move.slice(2, 4), promotion: l.move[4] }).san;
    } catch {
      // Keep UCI if chess.js disagrees (shouldn't happen).
    }
    return { move: l.move, san, score: l.score, winPercent: scoreToWinPercent(l.score), pv: l.pv };
  });
}

/**
 * Two-pass analysis of one game.
 *  1. Fast pass: every position at low depth → candidate errors for the player.
 *  2. Deep pass: candidates re-checked at high depth with MultiPV, so only
 *     errors that survive a serious search get labeled.
 */
export async function analyzeGame(game: ChessComGame, username: string, engine: UciEngine): Promise<GameAnalysis> {
  const started = Date.now();
  const parsed = parsePgn(game.pgn!);
  const playerColor: Color = game.white.username.toLowerCase() === username.toLowerCase() ? "w" : "b";
  const me = playerColor === "w" ? game.white : game.black;
  const them = playerColor === "w" ? game.black : game.white;
  const { fastDepth, deepDepth, deepMaxMs, multiPv } = config.engine;

  // Positions 0..n: before each move, plus the final position.
  const fens = [...parsed.moves.map((m) => m.fenBefore), parsed.moves.at(-1)?.fenAfter ?? parsed.startFen];

  await engine.newGame();
  const fast: EvalResult[] = [];
  for (const fen of fens) fast.push(await engine.analyze(fen, { depth: fastDepth, multiPv: 1 }));

  const moves: MoveAnalysis[] = parsed.moves.map((m, i) => {
    const winBefore = winFromEval(fast[i]!, fens[i]!);
    const winAfter = 100 - winFromEval(fast[i + 1]!, fens[i + 1]!);
    const top = toTopMoves(fast[i]!.lines, m.fenBefore);
    const drop = Math.max(0, winBefore - winAfter);
    const isBest = top[0]?.move === m.uci;
    return {
      ...m,
      bestMove: top[0]?.move ?? null,
      bestMoveSan: top[0]?.san ?? null,
      topMoves: top,
      winBefore,
      winAfter,
      drop,
      label: isBest ? "best" : labelForDrop(drop),
      deep: false,
      refutation: null,
    };
  });

  // Deep pass: the player's moves that looked like an inaccuracy or worse.
  for (const [i, mv] of moves.entries()) {
    if (mv.color !== playerColor || mv.drop < config.labels.inaccuracy) continue;
    const before = await engine.analyze(mv.fenBefore, { depth: deepDepth, multiPv, movetimeMs: deepMaxMs });
    const top = toTopMoves(before.lines, mv.fenBefore);
    const winBefore = winFromEval(before, mv.fenBefore);
    // If the played move is one of the top lines, use that same search's score
    // (more consistent); otherwise search the position after the move.
    const played = top.find((t) => t.move === mv.uci);
    let winAfter: number;
    let refutation: string[];
    if (played) {
      winAfter = played.winPercent;
      refutation = played.pv.slice(1);
    } else {
      const after = await engine.analyze(fens[i + 1]!, { depth: deepDepth, multiPv: 1, movetimeMs: deepMaxMs });
      winAfter = 100 - winFromEval(after, fens[i + 1]!);
      refutation = after.lines[0]?.pv ?? [];
    }
    const drop = Math.max(0, winBefore - winAfter);
    moves[i] = {
      ...mv,
      bestMove: top[0]?.move ?? null,
      bestMoveSan: top[0]?.san ?? null,
      topMoves: top,
      winBefore,
      winAfter,
      drop,
      label: top[0]?.move === mv.uci ? "best" : labelForDrop(drop),
      deep: true,
      refutation,
    };
  }

  return {
    gameId: gameIdOf(game),
    url: game.url,
    playerColor,
    player: me.username,
    opponent: them.username,
    opponentRating: them.rating,
    playerRating: me.rating,
    playedAt: new Date(game.end_time * 1000).toISOString(),
    timeClass: game.time_class,
    timeControl: game.time_control,
    result: me.result,
    engine: engine.name,
    depths: { fast: fastDepth, deep: deepDepth },
    moves,
    analysisMs: Date.now() - started,
  };
}

/** Cache key = game + engine version + depths, so changing any of them re-analyzes. */
export function analysisCacheKey(game: Pick<ChessComGame, "url" | "uuid">, engineName: string): string {
  const { fastDepth, deepDepth, deepMaxMs, multiPv } = config.engine;
  const engineSlug = engineName.replace(/[^a-z0-9.]+/gi, "-");
  return `${gameIdOf(game as ChessComGame)}_${engineSlug}_d${fastDepth}-${deepDepth}-${deepMaxMs}ms_pv${multiPv}_v2`;
}
