import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { analyzeGame, type GameAnalysis } from "../src/analyze";
import type { ChessComGame } from "../src/chesscom";
import { browserThreadCount } from "../src/web/engine/browserEngine";
import { browserEngineName, EngineStoppedError, UciSession, type UciTransport } from "../src/web/engine/uciCore";
import { gameLabel, markAccountConnected, mergeAnalyses, pickRecentUncached, pickUncached, sortNewestFirst } from "../src/web/analysis/queue";
import { toProfile } from "../src/web/analysis/profile";

function game(id: string, endTime: number, white = "me", black = "opp"): ChessComGame {
  return {
    url: `https://www.chess.com/game/live/${id}`,
    uuid: `u${id}`,
    pgn: "1. e4 e5",
    time_control: "60",
    time_class: "bullet",
    rules: "chess",
    end_time: endTime,
    rated: true,
    white: { username: white, rating: 1000, result: "win" },
    black: { username: black, rating: 1000, result: "resigned" },
  };
}

const ga = (gameId: string, playedAt: string) => ({ gameId, playedAt }) as GameAnalysis;

describe("queue helpers", () => {
  it("sorts and merges newest first, replacing by gameId", () => {
    const a = ga("1", "2026-10-01T00:00:00Z");
    const b = ga("2", "2026-10-03T00:00:00Z");
    const c = ga("3", "2026-10-02T00:00:00Z");
    expect(sortNewestFirst([a, b, c]).map((g) => g.gameId)).toEqual(["2", "3", "1"]);
    const a2 = { ...a, analysisMs: 5 } as GameAnalysis;
    const merged = mergeAnalyses([a, b], [c, a2]);
    expect(merged.map((g) => g.gameId)).toEqual(["2", "3", "1"]);
    expect(merged[2]).toBe(a2);
  });

  it("picks the newest uncached games, skipping excluded ones", () => {
    const games = [game("1", 100), game("3", 300), game("2", 200), game("4", 400)];
    const picked = pickUncached(games, new Set(["4"]), 2, new Set(["3"]));
    expect(picked.map((g) => g.uuid)).toEqual(["u2", "u1"]);
    expect(pickUncached(games, new Set(), 0)).toEqual([]);
  });

  it("on page load, only fills gaps in the newest window (doesn't dig older every visit)", () => {
    const games = [game("1", 100), game("2", 200), game("3", 300), game("4", 400)];
    // The newest 2 are cached, so nothing to do, even though older games are uncached.
    expect(pickRecentUncached(games, new Set(["4", "3"]), 2)).toEqual([]);
    // A newly played game shows up in the window and gets analyzed.
    const withNew = [...games, game("5", 500)];
    expect(pickRecentUncached(withNew, new Set(["4", "3"]), 2).map((g) => g.uuid)).toEqual(["u5"]);
  });

  it("labels the opponent from either side", () => {
    expect(gameLabel(game("1", 1, "Me", "Knuuuugen"), "me")).toBe("vs Knuuuugen (bullet)");
    expect(gameLabel(game("1", 1, "Knuuuugen", "ME"), "me")).toBe("vs Knuuuugen (bullet)");
  });

  it("reports account_connected once per username", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(markAccountConnected("Alice", storage)).toBe(true);
    expect(markAccountConnected("alice", storage)).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };
    expect(markAccountConnected("bob", throwing)).toBe(true);
    expect(markAccountConnected("bob", throwing)).toBe(false);
  });
});

describe("toProfile", () => {
  it("maps Chess.com profile + stats", () => {
    const p = toProfile(
      "chasenrooks",
      {
        username: "chasenrooks",
        url: "https://www.chess.com/member/ChasenRooks",
        avatar: "https://img/x.png",
        country: "https://api.chess.com/pub/country/US",
      },
      { chess_bullet: { last: { rating: 1200 } }, chess_blitz: { last: { rating: 1100 } } },
    );
    expect(p).toEqual({
      username: "chasenrooks",
      displayName: "ChasenRooks",
      avatarUrl: "https://img/x.png",
      country: "US",
      ratings: { bullet: 1200, blitz: 1100 },
    });
  });

  it("tolerates missing fields", () => {
    expect(toProfile("Bob", {}, null)).toEqual({
      username: "bob",
      displayName: "Bob",
      avatarUrl: null,
      country: null,
      ratings: {},
    });
  });
});

describe("engine helpers", () => {
  it("keeps browser engine names distinct from native", () => {
    expect(browserEngineName("Stockfish 19")).toBe("Stockfish 19 lite");
    expect(browserEngineName("Stockfish 19 Lite WASM")).toBe("Stockfish 19 Lite WASM");
  });

  it("uses 1–4 threads", () => {
    expect(browserThreadCount(undefined)).toBe(1);
    expect(browserThreadCount(2)).toBe(1);
    expect(browserThreadCount(4)).toBe(3);
    expect(browserThreadCount(16)).toBe(4);
  });
});

/** Fake UCI engine: answers the handshake and returns a canned search. */
function fakeTransport(log: string[]): UciTransport {
  let out: (l: string) => void = () => {};
  return {
    onLine: (h) => (out = h),
    send: (cmd) => {
      log.push(cmd);
      queueMicrotask(() => {
        if (cmd === "uci") ["id name Stockfish 19", "uciok"].forEach(out);
        else if (cmd === "isready") out("readyok");
        else if (cmd.startsWith("go ")) {
          out("info depth 5 seldepth 6 multipv 1 score cp 30 nodes 10 pv e2e4 e7e5");
          out("info depth 5 seldepth 6 multipv 2 score mate -3 nodes 10 pv d2d4");
          out("bestmove e2e4");
        }
      });
    },
  };
}

describe("UciSession", () => {
  it("handshakes, sets options, and parses searches", async () => {
    const log: string[] = [];
    const s = new UciSession(fakeTransport(log));
    await s.start({ threads: 3, hashMb: 64 });
    expect(s.name).toBe("Stockfish 19 lite");
    expect(log).toContain("setoption name Threads value 3");
    expect(log).toContain("setoption name Hash value 64");
    const [r1, r2] = await Promise.all([
      s.analyze("startfen", { depth: 5, multiPv: 2 }),
      s.analyze("startfen2", { depth: 5, multiPv: 2, movetimeMs: 100 }),
    ]);
    expect(r1.depth).toBe(5);
    expect(r1.lines.map((l) => l.move)).toEqual(["e2e4", "d2d4"]);
    expect(r2.lines[1]?.score).toEqual({ mate: -3 });
    expect(log.filter((c) => c.startsWith("setoption name MultiPV"))).toHaveLength(1);
    expect(log).toContain("go depth 5 movetime 100");
  });

  it("skips Threads for single-threaded builds and rejects after stop", async () => {
    const log: string[] = [];
    const s = new UciSession(fakeTransport(log));
    await s.start({ threads: 1, hashMb: 64 });
    expect(log.some((c) => c.includes("Threads"))).toBe(false);
    s.stop();
    await expect(s.analyze("x", { depth: 1 })).rejects.toBeInstanceOf(EngineStoppedError);
  });

  it("drives the real lite-single WASM engine through analyzeGame", async () => {
    const require = createRequire(import.meta.url);
    let handler: (l: string) => void = () => {};
    const sf = require("stockfish")("lite-single", (l: string) => handler(l)) as { processCommand(c: string): void };
    const s = new UciSession({ send: (c) => sf.processCommand(c), onLine: (h) => (handler = h) });
    await s.start({ threads: 1, hashMb: 16 });
    expect(s.name).toMatch(/Stockfish/);
    const g: ChessComGame = {
      ...game("9", 1, "me", "them"),
      pgn: '[White "me"]\n[Black "them"]\n\n1. f3 {[%clk 0:01:00]} 1... e5 {[%clk 0:01:00]} 2. g4 {[%clk 0:00:59]} 2... Qh4# {[%clk 0:00:59]} 0-1',
    };
    const a = await analyzeGame(g, "me", s);
    expect(a.engine).toBe(s.name);
    expect(a.moves[2]?.label).toBe("blunder");
    s.stop();
  }, 60_000);
});
