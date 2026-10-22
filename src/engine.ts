import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { config } from "./config";
import { parseInfoLine, type AnalyzeOptions, type EngineLine, type EvalResult, type UciEngine } from "./uci";

export { parseInfoLine, type AnalyzeOptions, type EngineLine, type EvalResult, type UciEngine } from "./uci";

/**
 * Thin wrapper around a native Stockfish process speaking UCI.
 * One search at a time; calls are queued.
 */
export class Engine implements UciEngine {
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
