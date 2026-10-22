"use client";

import { useEffect, useState } from "react";
import { readEvents, type AppEvent } from "../metrics";
import type { TrainingProgress } from "../types";
import { readTrainingProgress } from "./storage";

/**
 * Reads the event log and training progress after mount (so server and client
 * render the same first frame), and re-reads when another tab writes storage
 * or the window regains focus.
 */
export function useStoredActivity(username: string): { ready: boolean; events: AppEvent[]; progress: TrainingProgress | null } {
  const [state, setState] = useState<{ ready: boolean; events: AppEvent[]; progress: TrainingProgress | null }>({
    ready: false,
    events: [],
    progress: null,
  });
  useEffect(() => {
    const load = () => setState({ ready: true, events: readEvents(username), progress: readTrainingProgress(username) });
    load();
    window.addEventListener("storage", load);
    window.addEventListener("focus", load);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener("focus", load);
    };
  }, [username]);
  return state;
}
