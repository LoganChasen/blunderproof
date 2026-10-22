"use client";
/**
 * React glue around the pure session planner: loads/saves progress, pulls the
 * live report from the analysis provider, fetches drill blocks, logs metrics.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnalysis } from "../analysis/AnalysisProvider";
import { logEvent } from "../metrics";
import { pickPuzzles, weightsFromWeaknesses } from "../puzzles";
import { checkpointId, type TrainingItem } from "../types";
import {
  blunderWeaknesses,
  checkpointAvailability,
  completeCheckpoint,
  completeDrill,
  createSession,
  initialPuzzleRating,
  takeNext,
  topPatterns,
  type CheckpointAvailability,
  type CheckpointEntry,
  type DrillItem,
  type Session,
} from "./session";
import { hasProgress, loadProgress, saveProgress } from "./storage";

export type TrainingPhase = "starting" | "loading" | "ready" | "error";

/** How long to wait for the profile (for a new user's starting rating) before defaulting to 1200. */
const PROFILE_WAIT_MS = 5000;

export function useTraining(username: string) {
  const analysis = useAnalysis();
  const [session, setSession] = useState<Session | null>(null);
  const [item, setItem] = useState<TrainingItem | null>(null);
  const [phase, setPhase] = useState<TrainingPhase>("starting");
  const [error, setError] = useState<string | null>(null);
  const [lastDelta, setLastDelta] = useState<{ delta: number; key: number } | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const reportRef = useRef(analysis.report);
  reportRef.current = analysis.report;
  const startedRef = useRef(false);
  const advancingRef = useRef(false);

  const commit = useCallback(
    (s: Session) => {
      sessionRef.current = s;
      setSession(s);
      saveProgress(username, s.progress);
    },
    [username],
  );

  const checkpoints: CheckpointEntry[] = analysis.report?.checkpoints ?? [];

  const advance = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || advancingRef.current) return;
    advancingRef.current = true;
    setPhase("loading");
    setError(null);
    try {
      const report = reportRef.current;
      const r = await takeNext(s, report?.checkpoints ?? [], {
        pickPuzzles,
        weights: weightsFromWeaknesses(blunderWeaknesses(report)),
        rng: Math.random,
        userPatterns: topPatterns(report),
      });
      commit(r.session);
      if (!r.item) throw new Error("No puzzles available right now.");
      setItem(r.item);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    } finally {
      advancingRef.current = false;
    }
  }, [commit]);

  // Start once per mount: wait for the profile (new users only) so the first rating matches their game rating.
  const profileReady = !!analysis.profile || analysis.status === "error" || analysis.status === "done";
  const [waitedOut, setWaitedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaitedOut(true), PROFILE_WAIT_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (startedRef.current) return;
    if (!profileReady && !waitedOut && !hasProgress(username)) return;
    startedRef.current = true;
    const progress = loadProgress(username, initialPuzzleRating(analysis.profile));
    const s = createSession(progress); // increments progress.sessions
    commit(s);
    logEvent("session_started", username, { puzzleRating: s.progress.puzzleRating, sessions: s.progress.sessions });
    void advance();
  }, [profileReady, waitedOut, username, analysis.profile, commit, advance]);

  const finishDrill = useCallback(
    (drill: DrillItem, solved: boolean) => {
      const s = sessionRef.current;
      if (!s) return;
      const r = completeDrill(s, drill, solved);
      commit(r.session);
      setLastDelta({ delta: r.delta, key: Date.now() });
      const payload = { puzzleId: drill.puzzle.id, theme: drill.theme, pattern: drill.pattern, puzzleRating: drill.puzzle.rating, rating: r.ratingAfter, delta: r.delta, solved };
      logEvent("puzzle_attempted", username, payload);
      if (solved) logEvent("puzzle_solved", username, payload);
    },
    [commit, username],
  );

  const finishCheckpoint = useCallback(
    (cp: CheckpointEntry, uci: string): boolean => {
      const s = sessionRef.current;
      if (!s) return false;
      const r = completeCheckpoint(s, cp, uci, Math.random, new Date().toISOString());
      commit(r.session);
      const payload = { checkpointId: checkpointId(cp), move: uci, bestMove: cp.bestMove, pattern: cp.pattern, gameId: cp.gameId, passed: r.passed };
      logEvent("checkpoint_attempted", username, payload);
      if (r.passed) logEvent("checkpoint_passed", username, payload);
      return r.passed;
    },
    [commit, username],
  );

  const availability: CheckpointAvailability | null = useMemo(
    () => (session ? checkpointAvailability(session, checkpoints) : null),
    [session, checkpoints],
  );

  return { analysis, session, item, phase, error, advance, finishDrill, finishCheckpoint, availability, lastDelta };
}
