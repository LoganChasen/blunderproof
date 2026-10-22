"use client";
/**
 * Fetches a player's games and analyzes them in the browser (Stockfish WASM in
 * a Web Worker). The work lives in a per-username AnalysisController so it
 * survives re-renders, client-side navigation and StrictMode double effects.
 */
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { AnalysisState } from "../types";
import { acquireController, initialState, releaseController, type AnalysisController } from "./controller";

const Ctx = createContext<AnalysisState | null>(null);

const noopSubscribe = () => () => {};

export function AnalysisProvider({ username, children }: { username: string; children: React.ReactNode }) {
  const [ctrl, setCtrl] = useState<AnalysisController | null>(null);
  const idle = useMemo(() => initialState(username), [username]);

  useEffect(() => {
    const c = acquireController(username);
    setCtrl(c);
    return () => {
      setCtrl(null);
      releaseController(username);
    };
  }, [username]);

  const live = ctrl && ctrl.getState().username === username ? ctrl : null;
  const state = useSyncExternalStore(
    live ? live.subscribe : noopSubscribe,
    () => (live ? live.getState() : idle),
    () => idle,
  );

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useAnalysis(): AnalysisState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAnalysis must be used inside <AnalysisProvider>");
  return v;
}
