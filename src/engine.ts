import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { config } from "./config.js";
import type { Score } from "./winPercent.js";

/** One of the engine's top lines. Score is from the side-to-move's perspective. */
export interface EngineLine {
  /** 1 = best. */
  rank: number;
  move: string;
  score: Score;
  pv: string[];
}

export interface EvalResult {
  depth: number;
  /** Best first. May be shorter than MultiPV if there are few legal moves (or none). */
  lines: EngineLine[];
}

export interface AnalyzeOptions {
  depth: number;
  multiPv?: number;
  /** Optional time cap; the search stops at `depth` or this, whichever is first. */
  movetimeMs?: number;
}

/** Parse a UCI "info ... multipv K score cp X ... pv m1 m2" line. Returns null for other info lines. */
export function parseInfoLine(line: string): (EngineLine & { depth: number }) | null {
  if (!line.startsWith("info ") || !line.includes(" pv ") || !line.includes(" score ")) return null;
  if (line.includes(" lowerbound") || line.includes(" upperbound")) return null;
  const tok = line.split(" ");
  const at = (key: string) => tok.indexOf(key);
  const depth = Number(tok[at("depth") + 1]);
  const rank = at("multipv") >= 0 ? Number(tok[at("multipv") + 1]) : 1;
  const kind = tok[at("score") + 1];
  const value = Number(tok[at("score") + 2]);
  const score: Score = kind === "mate" ? { mate: value } : { cp: value };
  const pv = tok.slice(at("pv") + 1);
  return { depth, rank, move: pv[0]!, score, pv };
}

/**
 * Thin wrapper around a native Stockfish process speaking UCI.
 * One search at a time; calls are queued.
 */
export class Engine {
  private proc: ChildProcessWithoutNullStreams;
  private listeners: ((line: string) => void)[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private currentMultiPv = 0;
  name = "unknown";

  private constructor(binary: string) {
    this.proc = spawn(binary, [], { stdio: "pipe" });
    createInterface({ input: this.proc.stdout }).on("line", (line) => {
      for (const l of [...this.listeners]) l(line);
    });
  }

  static async start(binary = process.env.STOCKFISH_PATH ?? "stockfish"): Promise<Engine> {
    const engine = new Engine(binary);
    await new Promise<void>((resolve, reject) => {
      engine.proc.once("error", reject);
      engine.waitFor((l) => {
        if (l.startsWith("id name ")) engine.name = l.slice(8);
        return l === "uciok";
      }).then(() => resolve());
      engine.send("uci");
    });
    engine.send(`setoption name Threads value ${config.engine.threads}`);
    engine.send(`setoption name Hash value ${config.engine.hashMb}`);
    await engine.ready();
    return engine;
  }

  private send(cmd: string) {
    this.proc.stdin.write(cmd + "\n");
  }

  /** Resolves when `match` returns true for an output line. */
  private waitFor(match: (line: string) => boolean): Promise<string> {
    return new Promise((resolve) => {
      const fn = (line: string) => {
        if (match(line)) {
          this.listeners = this.listeners.filter((l) => l !== fn);
          resolve(line);
        }
      };
      this.listeners.push(fn);
    });
  }

  private async ready() {
    const p = this.waitFor((l) => l === "readyok");
    this.send("isready");
    await p;
  }

  /** Start a fresh game (clears the hash so earlier games can't leak into results). */
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
      await done;
      this.listeners = this.listeners.filter((l) => l !== collect);

      const lines = [...latest.values()].sort((a, b) => a.rank - b.rank);
      const depth = Math.max(0, ...lines.map((l) => l.depth));
      return { depth, lines: lines.map(({ depth: _d, ...rest }) => rest) };
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  async quit(): Promise<void> {
    this.send("quit");
    await new Promise((r) => this.proc.once("exit", r));
  }
}
