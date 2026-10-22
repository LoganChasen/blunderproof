/**
 * Shared types for the web app. Every module under src/web codes against these.
 * Chess-analysis types (GameAnalysis, MoveAnalysis, Checkpoint, ReportData, ...)
 * come from the core library in src/*.ts and are re-exported here for convenience.
 */
import type { GameAnalysis } from "../analyze";
import type { ChessComGame } from "../chesscom";
import type { Checkpoint } from "../checkpoints";
import type { Pattern } from "../patterns/types";
import type { PlayerError, ReportData } from "../report";

export type { GameAnalysis, ChessComGame, Checkpoint, Pattern, PlayerError, ReportData };

// ---------- /api/player/[username] ----------

export interface PlayerProfile {
  username: string;
  /** Display-cased name from Chess.com. */
  displayName: string;
  avatarUrl: string | null;
  country: string | null;
  ratings: Partial<Record<"bullet" | "blitz" | "rapid", number>>;
}

export interface PlayerApiResponse {
  profile: PlayerProfile;
  /** Usable (filtered) games, newest first. */
  games: ChessComGame[];
  skipped: Record<string, number>;
  totalFetched: number;
}

export interface ApiError {
  error: string;
}

// ---------- Client-side analysis (src/web/analysis) ----------

export type AnalysisStatus = "idle" | "fetching" | "analyzing" | "done" | "error";

export interface AnalysisProgress {
  /** Games analyzed so far (including ones loaded from cache). */
  done: number;
  /** Games queued for analysis in total. */
  total: number;
  /** Label for the game being analyzed now, e.g. "vs Knuuuugen (bullet)". */
  current: string | null;
}

export interface AnalysisState {
  username: string;
  status: AnalysisStatus;
  error: string | null;
  profile: PlayerProfile | null;
  progress: AnalysisProgress;
  /** Finished game analyses so far, newest first. Grows while status is "analyzing". */
  games: GameAnalysis[];
  /** Report built from `games` (recomputed as games finish). Null until at least one game is done. */
  report: ReportData | null;
  /** Analyze more games beyond the default batch. */
  analyzeMore: (count: number) => void;
  /** Re-fetch games from Chess.com (picks up newly played games). */
  refresh: () => void;
}

// ---------- Puzzles (src/web/puzzles) ----------

/** A puzzle from the Lichess puzzle database (CC0). */
export interface Puzzle {
  id: string;
  /** Position BEFORE the opponent's setup move. */
  fen: string;
  /** UCI moves. moves[0] is the opponent's setup move; the player solves from the position after it. */
  moves: string[];
  rating: number;
  themes: string[];
  popularity: number;
}

// ---------- Training (src/web/training) ----------

export type TrainingItem =
  | { kind: "drill"; puzzle: Puzzle; theme: string; pattern: Pattern }
  | { kind: "checkpoint"; checkpoint: Checkpoint & { pattern: Pattern; explanation: string | null } };

/** Stable id for a checkpoint: game id + ply-ish position key. */
export function checkpointId(cp: Pick<Checkpoint, "gameId" | "fen">): string {
  return `${cp.gameId}:${cp.fen.split(" ").slice(0, 4).join(" ")}`;
}

export type CheckpointStatus = "pending" | "failed" | "conquered";

export interface CheckpointProgress {
  status: CheckpointStatus;
  attempts: number;
  /** UCI moves the user tried, oldest first. */
  movesTried: string[];
  lastAttemptAt: string | null;
}

/**
 * Per-username training progress, persisted in localStorage under `bp:progress:<username>`.
 * Written by src/web/training/storage.ts; read by the checkpoints and stats pages.
 */
export interface TrainingProgress {
  version: 1;
  /** Adaptive puzzle rating (Elo-like), starts from the player's game rating. */
  puzzleRating: number;
  puzzlesAttempted: number;
  puzzlesSolved: number;
  /** Recently seen Lichess puzzle ids, newest last (capped), to avoid repeats. */
  seenPuzzleIds: string[];
  /** Keyed by checkpointId(). Missing = never attempted (pending). */
  checkpoints: Record<string, CheckpointProgress>;
  /** Drills left before the next checkpoint (10–15 after each checkpoint). */
  drillsUntilCheckpoint: number;
  /** Size of the current gap (10–15), for the progress tracker. */
  gapSize?: number;
  sessions: number;
  bestStreak: number;
}
