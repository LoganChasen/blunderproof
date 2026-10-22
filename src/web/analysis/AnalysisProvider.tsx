"use client";
// STUB: replaced by the analysis agent. Contract: AnalysisState in src/web/types.ts.
import { createContext, useContext } from "react";
import type { AnalysisState } from "../types";

const Ctx = createContext<AnalysisState | null>(null);

export function AnalysisProvider({ username, children }: { username: string; children: React.ReactNode }) {
  const state: AnalysisState = {
    username, status: "idle", error: null, profile: null,
    progress: { done: 0, total: 0, current: null }, games: [], report: null,
    analyzeMore: () => {}, refresh: () => {},
  };
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useAnalysis(): AnalysisState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAnalysis must be used inside <AnalysisProvider>");
  return v;
}
