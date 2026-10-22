import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Chess } from "chess.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ALL_THEMES,
  DEFAULT_THEMES,
  THEME_LABEL,
  clearPuzzleCache,
  loadTheme,
  pickPuzzles,
  puzzleStartPosition,
  uciToMove,
  weightsFromWeaknesses,
  type PuzzleRow,
} from "../src/web/puzzles";

const DIR = join(__dirname, "..", "public", "puzzles");

/** Small seeded PRNG (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string) => {
    const m = /^\/puzzles\/([^/]+)\.json$/.exec(String(url));
    const file = m ? join(DIR, `${decodeURIComponent(m[1]!)}.json`) : "";
    if (!m || !existsSync(file)) return new Response("not found", { status: 404 });
    return new Response(readFileSync(file, "utf8"), { status: 200, headers: { "content-type": "application/json" } });
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
  clearPuzzleCache();
});

describe("theme files", () => {
  const index = JSON.parse(readFileSync(join(DIR, "index.json"), "utf8")) as { counts: Record<string, number>; builtAt: string };

  it("has a label and a non-empty file for every theme, matching index.json", () => {
    for (const t of ALL_THEMES) {
      expect(THEME_LABEL[t], t).toBeTruthy();
      const rows = JSON.parse(readFileSync(join(DIR, `${t}.json`), "utf8")) as PuzzleRow[];
      expect(rows.length, t).toBeGreaterThan(500);
      expect(index.counts[t]).toBe(rows.length);
      for (let i = 1; i < rows.length; i++) expect(rows[i]![3]).toBeGreaterThanOrEqual(rows[i - 1]![3]);
      for (const r of rows) expect(r[5].split(" ")).toContain(t);
    }
    expect(Date.parse(index.builtAt)).not.toBeNaN();
  });

  it("every sampled FEN loads and every setup move is legal", () => {
    for (const t of ALL_THEMES) {
      const rows = JSON.parse(readFileSync(join(DIR, `${t}.json`), "utf8")) as PuzzleRow[];
      const step = Math.max(1, Math.floor(rows.length / 200));
      for (let i = 0; i < rows.length; i += step) {
        const [id, fen, moves] = rows[i]!;
        const chess = new Chess(fen);
        const ms = moves.split(" ");
        expect(ms.length, id).toBeGreaterThanOrEqual(2);
        expect(() => chess.move(uciToMove(ms[0]!)), `${t} ${id}`).not.toThrow();
      }
    }
  });
});

describe("puzzleStartPosition", () => {
  it("applies the setup move and gives the solver's colour (Lichess 00008)", () => {
    const s = puzzleStartPosition({
      id: "00008",
      fen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
      moves: "f2g3 e6e7 b2b1 b3c1 b1c1 h6c1".split(" "),
      rating: 1811,
      popularity: 95,
      themes: ["crushing", "hangingPiece"],
    });
    expect(s.setupMove).toBe("f2g3");
    expect(s.playerColor).toBe("w");
    expect(s.fenAfterSetup.split(" ")[1]).toBe("w");
    expect(s.solution).toEqual(["e6e7", "b2b1", "b3c1", "b1c1", "h6c1"]);
    const c = new Chess(s.fenAfterSetup);
    expect(() => c.move(uciToMove(s.solution[0]!))).not.toThrow();
  });

  it("matches the side to move on real loaded puzzles", async () => {
    const ps = await loadTheme("fork");
    for (const p of ps.slice(0, 50)) {
      const s = puzzleStartPosition(p);
      const fenSide = p.fen.split(" ")[1];
      expect(s.playerColor).toBe(fenSide === "w" ? "b" : "w");
    }
  });
});

describe("pickPuzzles", () => {
  it("respects exclude, has no duplicates, and stays near the rating", async () => {
    const forks = await loadTheme("fork");
    const exclude = new Set(forks.filter((p) => Math.abs(p.rating - 1500) <= 150).slice(0, 40).map((p) => p.id));
    const picked = await pickPuzzles({ weights: { fork: 1, pin: 1 }, rating: 1500, count: 60, exclude, rng: seeded(1) });
    expect(picked).toHaveLength(60);
    const ids = picked.map((x) => x.puzzle.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const x of picked) {
      expect(exclude.has(x.puzzle.id)).toBe(false);
      expect(Math.abs(x.puzzle.rating - 1500)).toBeLessThanOrEqual(150);
      expect(x.puzzle.themes).toContain(x.theme);
      expect(["fork", "pin"]).toContain(x.theme);
    }
  });

  it("widens the window when the near band is exhausted, and is deterministic", async () => {
    const mates = await loadTheme("mateIn1");
    const near = new Set(mates.filter((p) => Math.abs(p.rating - 900) <= 150).map((p) => p.id));
    const a = await pickPuzzles({ weights: { mateIn1: 1 }, rating: 900, count: 20, exclude: near, rng: seeded(7) });
    const b = await pickPuzzles({ weights: { mateIn1: 1 }, rating: 900, count: 20, exclude: near, rng: seeded(7) });
    expect(a.map((x) => x.puzzle.id)).toEqual(b.map((x) => x.puzzle.id));
    for (const x of a) {
      const d = Math.abs(x.puzzle.rating - 900);
      expect(d).toBeGreaterThan(150);
      expect(d).toBeLessThanOrEqual(300);
    }
  });

  it("samples themes by weight and survives a missing theme file", async () => {
    const picked = await pickPuzzles({
      weights: { fork: 9, endgame: 1, noSuchTheme: 5 },
      rating: 1600,
      count: 200,
      exclude: new Set(),
      rng: seeded(3),
    });
    expect(picked).toHaveLength(200);
    const forks = picked.filter((x) => x.theme === "fork").length;
    expect(forks).toBeGreaterThan(150);
    expect(picked.some((x) => x.theme === "endgame")).toBe(true);
  });

  it("throws if no weighted theme can be loaded", async () => {
    await expect(pickPuzzles({ weights: { nope: 1 }, rating: 1500, count: 3, exclude: new Set() })).rejects.toThrow();
  });
});

describe("weightsFromWeaknesses", () => {
  it("favours the dominant weakness but keeps a floor on every theme in the mix", () => {
    const blunders = [
      ...Array.from({ length: 8 }, () => ({ pattern: "back-rank" as const, otherKind: null })),
      { pattern: "hanging-piece" as const, otherKind: null },
      { pattern: "other" as const, otherKind: "positional-or-endgame" as const },
    ];
    const w = weightsFromWeaknesses(blunders);
    const total = Object.values(w).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1, 6);
    const top = Object.entries(w).sort((a, b) => b[1] - a[1])[0]![0];
    expect(top).toBe("backRankMate");
    expect(w.backRankMate!).toBeGreaterThan(0.5);
    for (const t of DEFAULT_THEMES) expect(w[t]!, t).toBeGreaterThan(0);
    expect(w.rookEndgame!).toBeGreaterThan(w.fork!); // otherKind themes are used for "other"
    for (const t of Object.keys(w)) expect(ALL_THEMES).toContain(t);
  });

  it("returns a balanced default mix with no blunders", () => {
    const w = weightsFromWeaknesses([]);
    const vals = Object.values(w);
    expect(Object.keys(w)).toEqual(expect.arrayContaining(["hangingPiece", "fork", "pin", "mateIn2", "backRankMate", "endgame"]));
    expect(Math.max(...vals)).toBeCloseTo(Math.min(...vals), 9);
  });
});
