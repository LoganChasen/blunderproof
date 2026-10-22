/**
 * Transport-agnostic UCI client. Mirrors src/engine.ts (one search at a time,
 * calls queued) but talks to the engine through a `send` function and an
 * `onLine` feed, so the same code drives a browser Web Worker and, in the
 * benchmark/tests, the stockfish npm module in Node.
 */
import { config } from "../../config";
import { parseInfoLine, type AnalyzeOptions, type EngineLine, type EvalResult, type UciEngine } from "../../uci";

export interface UciTransport {
  send(cmd: string): void;
  /** Register the single line handler. */
  onLine(handler: (line: string) => void): void;
}

export interface UciStartOptions {
  threads: number;
  hashMb: number;
  /** Name used by the native engine; if the WASM build reports the same one, " lite" is appended. */
  nativeName?: string;
  /** Rejects start() if the handshake takes longer than this. */
  timeoutMs?: number;
}

export class EngineStoppedError extends Error {
  constructor() {
    super("Engine stopped");
  }
}

/** Keep browser and native analysis caches apart even if both report the same id. */
export function browserEngineName(reported: string, nativeName = "Stockfish 19"): string {
  const name = reported.trim() || "Stockfish WASM";
  return name === nativeName ? `${name} lite` : name;
}

export class UciSession implements UciEngine {
  name = "unknown";
  private listeners: ((line: string) => void)[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private currentMultiPv = 0;
  private stopped = false;
  private stopWaiters: (() => void)[] = [];

  constructor(private transport: UciTransport) {
    transport.onLine((line) => {
      for (const l of [...this.listeners]) l(line);
    });
  }

  async start(opts: UciStartOptions): Promise<void> {
    const handshake = this.waitFor((l) => {
      if (l.startsWith("id name ")) this.name = browserEngineName(l.slice(8), opts.nativeName);
      return l === "uciok";
    });
    this.send("uci");
    await withTimeout(handshake, opts.timeoutMs ?? 30_000, "Engine took too long to start");
    if (opts.threads > 1) this.send(`setoption name Threads value ${opts.threads}`);
    this.send(`setoption name Hash value ${opts.hashMb}`);
    await withTimeout(this.ready(), opts.timeoutMs ?? 30_000, "Engine took too long to start");
  }

  private send(cmd: string) {
    if (!this.stopped) this.transport.send(cmd);
  }

  /** Resolves when `match` returns true for an output line; rejects if the session is stopped. */
  private waitFor(match: (line: string) => boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.stopped) return reject(new EngineStoppedError());
      const onStop = () => reject(new EngineStoppedError());
      const fn = (line: string) => {
        if (match(line)) {
          this.listeners = this.listeners.filter((l) => l !== fn);
          this.stopWaiters = this.stopWaiters.filter((w) => w !== onStop);
          resolve(line);
        }
      };
      this.listeners.push(fn);
      this.stopWaiters.push(onStop);
    });
  }

  private async ready() {
    const p = this.waitFor((l) => l === "readyok");
    this.send("isready");
    await p;
  }

  newGame(): Promise<void> {
    return this.enqueue(async () => {
      this.send("ucinewgame");
      await this.ready();
    });
  }

  analyze(fen: string, opts: AnalyzeOptions): Promise<EvalResult> {
    return this.enqueue(async () => {
      const multiPv = opts.multiPv ?? config.engine.multiPv;
      if (multiPv !== this.currentMultiPv) {
        this.send(`setoption name MultiPV value ${multiPv}`);
        this.currentMultiPv = multiPv;
      }
      this.send(`position fen ${fen}`);
      await this.ready();

      const latest = new Map<number, EngineLine & { depth: number }>();
      const collect = (line: string) => {
        const info = parseInfoLine(line);
        if (info) latest.set(info.rank, info);
      };
      this.listeners.push(collect);
      const done = this.waitFor((l) => l.startsWith("bestmove"));
      this.send(`go depth ${opts.depth}` + (opts.movetimeMs ? ` movetime ${opts.movetimeMs}` : ""));
      try {
        await done;
      } finally {
        this.listeners = this.listeners.filter((l) => l !== collect);
      }

      const lines = [...latest.values()].sort((a, b) => a.rank - b.rank);
      const depth = Math.max(0, ...lines.map((l) => l.depth));
      return { depth, lines: lines.map(({ depth: _d, ...rest }) => rest) };
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const guarded = () => (this.stopped ? Promise.reject(new EngineStoppedError()) : task());
    const run = this.queue.then(guarded, guarded);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Reject everything pending; further calls reject immediately. */
  stop(): void {
    if (this.stopped) return;
    try {
      this.transport.send("quit");
    } catch {
      // Transport already gone.
    }
    this.stopped = true;
    const waiters = this.stopWaiters;
    this.stopWaiters = [];
    this.listeners = [];
    for (const w of waiters) w();
  }

  get isStopped(): boolean {
    return this.stopped;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
