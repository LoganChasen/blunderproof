/**
 * Per-username analysis controller. Lives outside React so analysis survives
 * re-renders and client-side navigation; the provider just subscribes to it.
 * A small ref-counted registry keeps one controller per username, which also
 * makes StrictMode's mount → unmount → mount a no-op instead of a restart.
 */
import { analysisCacheKey, analyzeGame, gameIdOf, type GameAnalysis } from "../../analyze";
import type { ChessComGame } from "../../chesscom";
import { buildReport } from "../../report";
import { logEvent } from "../metrics";
import type { AnalysisState, ApiError, PlayerApiResponse } from "../types";
import { startBrowserEngine, type BrowserEngine } from "../engine/browserEngine";
import { EngineStoppedError } from "../engine/uciCore";
import { getManyCachedAnalyses, putCachedAnalysis } from "./cache";
import { DEFAULT_BATCH, gameLabel, markAccountConnected, mergeAnalyses, pickUncached } from "./queue";

class FriendlyError extends Error {}

const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function initialState(username: string): AnalysisState {
  return {
    username,
    status: "idle",
    error: null,
    profile: null,
    progress: { done: 0, total: 0, current: null },
    games: [],
    report: null,
    analyzeMore: () => {},
    refresh: () => {},
  };
}

export class AnalysisController {
  private state: AnalysisState;
  private listeners = new Set<() => void>();
  private enginePromise: Promise<BrowserEngine> | null = null;
  private engine: BrowserEngine | null = null;
  private allGames: ChessComGame[] = [];
  private skipped: Record<string, number> = {};
  private analyzed = new Map<string, GameAnalysis>();
  private failed = new Set<string>();
  private queue: ChessComGame[] = [];
  private inFlight: string | null = null;
  private running = false;
  private disposed = false;
  private generation = 0;

  constructor(private username: string) {
    this.state = {
      ...initialState(username),
      analyzeMore: (n) => this.analyzeMore(n),
      refresh: () => void this.load(),
    };
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = (): AnalysisState => this.state;

  private set(patch: Partial<AnalysisState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const l of [...this.listeners]) l();
  }

  private getEngine(): Promise<BrowserEngine> {
    if (!this.enginePromise) {
      this.enginePromise = startBrowserEngine().then((e) => {
        if (this.disposed) e.terminate();
        this.engine = e;
        return e;
      });
      // A failed start can be retried by refresh().
      this.enginePromise.catch(() => {
        this.enginePromise = null;
      });
    }
    return this.enginePromise;
  }

  /** Fetch games (initial load and refresh()), load cache hits, queue the newest uncached games. */
  async load(): Promise<void> {
    if (this.disposed) return;
    const gen = ++this.generation;
    this.set({ status: "fetching", error: null });
    // Boot the engine while the network request is in flight.
    const engineP: Promise<BrowserEngine | Error> = this.getEngine().catch((e: unknown) =>
      e instanceof Error ? e : new Error(String(e)),
    );

    try {
      const data = await this.fetchPlayer();
      if (gen !== this.generation || this.disposed) return;
      this.allGames = [...data.games].sort((a, b) => b.end_time - a.end_time);
      this.skipped = data.skipped;
      this.set({ profile: data.profile });
      if (markAccountConnected(this.username, safeLocalStorage())) {
        logEvent("account_connected", this.username, { games: data.games.length });
      }

      if (this.allGames.length === 0) {
        this.queue = [];
        this.set({ status: this.running ? "analyzing" : "done", progress: { done: 0, total: 0, current: null } });
        return;
      }

      const engine = await engineP;
      if (gen !== this.generation || this.disposed) return;
      if (engine instanceof Error) {
        throw new FriendlyError("Couldn't start the chess engine in this browser. Try reloading, or use a recent Chrome, Edge, Firefox or Safari.");
      }

      const keys = this.allGames.map((g) => analysisCacheKey(g, engine.name));
      const hits = await getManyCachedAnalyses(keys);
      if (gen !== this.generation || this.disposed) return;
      for (const a of hits.values()) this.analyzed.set(a.gameId, a);
      this.publishGames();

      const exclude = new Set([...this.failed, ...(this.inFlight ? [this.inFlight] : [])]);
      this.queue = pickUncached(this.allGames, new Set(this.analyzed.keys()), DEFAULT_BATCH, exclude);
      const done = this.analyzedCount();
      this.set({
        progress: { done, total: done + this.queue.length + (this.inFlight ? 1 : 0), current: this.state.progress.current },
      });
      // If a batch is already running (refresh mid-analysis) it picks up the new queue.
      if (this.running) this.set({ status: "analyzing" });
      else void this.runQueue();
    } catch (e) {
      if (gen !== this.generation || this.disposed) return;
      this.set({
        status: "error",
        error: e instanceof FriendlyError ? e.message : "Something went wrong loading your games. Please try again.",
        progress: { ...this.state.progress, current: null },
      });
    }
  }

  private async fetchPlayer(): Promise<PlayerApiResponse> {
    let res: Response;
    try {
      res = await fetch(`/api/player/${encodeURIComponent(this.username)}`, { cache: "no-store" });
    } catch {
      throw new FriendlyError("Couldn't connect. Check your internet connection and try again.");
    }
    let body: PlayerApiResponse | ApiError | null = null;
    try {
      body = (await res.json()) as PlayerApiResponse | ApiError;
    } catch {
      // Non-JSON error page.
    }
    if (!res.ok || !body || "error" in body) {
      const msg = body && "error" in body ? body.error : null;
      throw new FriendlyError(msg ?? "Couldn't load games from Chess.com right now. Please try again in a minute.");
    }
    return body;
  }

  private analyzedCount(): number {
    let n = 0;
    for (const g of this.allGames) if (this.analyzed.has(gameIdOf(g))) n++;
    return n;
  }

  private publishGames() {
    const games = mergeAnalyses([], [...this.analyzed.values()]);
    this.set({ games, report: games.length ? buildReport(this.username, games, this.skipped) : null });
  }

  analyzeMore(count: number): void {
    if (this.disposed || count <= 0 || this.allGames.length === 0) return;
    const exclude = new Set([...this.failed, ...this.queue.map(gameIdOf), ...(this.inFlight ? [this.inFlight] : [])]);
    const more = pickUncached(this.allGames, new Set(this.analyzed.keys()), count, exclude);
    if (more.length === 0) return;
    this.queue.push(...more);
    this.set({ progress: { ...this.state.progress, total: this.state.progress.total + more.length } });
    if (this.state.status !== "fetching" && this.state.status !== "error") void this.runQueue();
  }

  private async runQueue(): Promise<void> {
    if (this.running || this.disposed) return;
    this.running = true;
    this.set({ status: "analyzing" });
    try {
      while (this.queue.length > 0 && !this.disposed) {
        const engine = this.engine ?? (await this.getEngine());
        const game = this.queue.shift()!;
        const id = gameIdOf(game);
        this.inFlight = id;
        this.set({ progress: { ...this.state.progress, current: gameLabel(game, this.username) } });
        try {
          const analysis = await analyzeGame(game, this.username, engine);
          if (this.disposed) return;
          this.analyzed.set(id, analysis);
          await putCachedAnalysis(analysisCacheKey(game, engine.name), analysis);
          this.publishGames();
        } catch (e) {
          if (this.disposed) return;
          if (e instanceof EngineStoppedError) {
            throw new FriendlyError("The chess engine stopped unexpectedly. Reload the page to continue.");
          }
          // One unparseable game shouldn't stop the batch.
          this.failed.add(id);
          console.warn("[analysis] skipped game", id, e);
        } finally {
          this.inFlight = null;
        }
        this.set({ progress: { ...this.state.progress, done: this.state.progress.done + 1, current: null } });
        await yieldToMain();
      }
      if (!this.disposed && this.state.status === "analyzing") this.set({ status: "done" });
    } catch (e) {
      this.engine?.terminate();
      this.engine = null;
      this.enginePromise = null;
      this.queue = [];
      this.set({
        status: "error",
        error: e instanceof FriendlyError ? e.message : "Analysis failed. Reload the page to try again.",
        progress: { ...this.state.progress, current: null },
      });
    } finally {
      this.running = false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.queue = [];
    this.listeners.clear();
    this.engine?.terminate();
    this.engine = null;
    // If the engine is still booting, getEngine() terminates it on arrival.
  }
}

// ---------- registry ----------

const registry = new Map<string, { ctrl: AnalysisController; refs: number; timer: ReturnType<typeof setTimeout> | null }>();

export function acquireController(username: string): AnalysisController {
  const key = username.toLowerCase();
  const entry = registry.get(key);
  if (entry) {
    entry.refs++;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    return entry.ctrl;
  }
  const ctrl = new AnalysisController(username);
  registry.set(key, { ctrl, refs: 1, timer: null });
  void ctrl.load();
  return ctrl;
}

/** Disposal is deferred one tick so StrictMode's immediate re-mount reuses the same controller. */
export function releaseController(username: string): void {
  const key = username.toLowerCase();
  const entry = registry.get(key);
  if (!entry) return;
  entry.refs--;
  if (entry.refs > 0) return;
  entry.timer = setTimeout(() => {
    if (entry.refs > 0) return;
    entry.ctrl.dispose();
    registry.delete(key);
  }, 0);
}
