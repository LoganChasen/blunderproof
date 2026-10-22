/**
 * Stockfish WASM in a Web Worker, behind the core library's UciEngine interface.
 * Browser only. The worker finds its .wasm next to the .js (same basename).
 */
import type { AnalyzeOptions, EvalResult, UciEngine } from "../../uci";
import { UciSession } from "./uciCore";

export interface BrowserEngine extends UciEngine {
  /** True when the multi-threaded build is in use. */
  readonly threaded: boolean;
  readonly threads: number;
  terminate(): void;
}

export const ENGINE_MULTI = "/engine/stockfish-19-lite.js";
export const ENGINE_SINGLE = "/engine/stockfish-19-lite-single.js";

export function browserThreadCount(hardwareConcurrency: number | undefined): number {
  return Math.min(4, Math.max(1, (hardwareConcurrency ?? 1) - 1));
}

async function boot(url: string, threads: number): Promise<{ worker: Worker; session: UciSession }> {
  const worker = new Worker(url);
  let handler: (line: string) => void = () => {};
  let fail: (e: Error) => void = () => {};
  const failed = new Promise<never>((_, reject) => {
    fail = reject;
  });
  worker.onmessage = (ev: MessageEvent) => {
    // The engine also posts download-progress objects; only strings are UCI output.
    if (typeof ev.data === "string") for (const line of ev.data.split("\n")) if (line) handler(line);
  };
  worker.onerror = (ev) => {
    ev.preventDefault?.();
    fail(new Error(ev.message || "Engine worker failed to load"));
  };
  const session = new UciSession({
    send: (cmd) => worker.postMessage(cmd),
    onLine: (h) => {
      handler = h;
    },
  });
  try {
    // Fail fast on the threaded build so the single-threaded fallback kicks in quickly.
    await Promise.race([session.start({ threads, hashMb: 64, timeoutMs: url === ENGINE_MULTI ? 10_000 : 30_000 }), failed]);
  } catch (e) {
    session.stop();
    worker.terminate();
    throw e;
  }
  worker.onerror = (ev) => {
    ev.preventDefault?.();
    session.stop();
  };
  return { worker, session };
}

export async function startBrowserEngine(): Promise<BrowserEngine> {
  if (typeof Worker === "undefined") throw new Error("This browser can't run the chess engine (no Web Workers).");
  const isolated = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
  let threaded = isolated;
  let threads = threaded ? browserThreadCount(navigator.hardwareConcurrency) : 1;
  let booted: Awaited<ReturnType<typeof boot>>;
  try {
    booted = await boot(threaded ? ENGINE_MULTI : ENGINE_SINGLE, threads);
  } catch (e) {
    if (!threaded) throw e;
    // Multi-threaded build failed (e.g. SharedArrayBuffer quirks); fall back.
    threaded = false;
    threads = 1;
    booted = await boot(ENGINE_SINGLE, 1);
  }
  const { worker, session } = booted;
  return {
    get name() {
      return session.name;
    },
    threaded,
    threads,
    newGame: () => session.newGame(),
    analyze: (fen: string, opts: AnalyzeOptions): Promise<EvalResult> => session.analyze(fen, opts),
    terminate() {
      session.stop();
      worker.terminate();
    },
  };
}
