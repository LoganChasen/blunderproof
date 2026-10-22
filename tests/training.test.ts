import { afterEach, describe, expect, it } from "vitest";
import { passesCheckpoint } from "../src/checkpoints";
import { config } from "../src/config";
import type { Pattern } from "../src/patterns/types";
import {
  applyReply,
  needsPromotion,
  revealNext,
  startPuzzle,
  tryMove,
  type PuzzleRun,
} from "../src/web/training/puzzleLogic";
import {
  chooseCheckpoint,
  checkpointAvailability,
  completeCheckpoint,
  completeDrill,
  createSession,
  GAP_MAX,
  GAP_MIN,
  initialPuzzleRating,
  kFactor,
  newProgress,
  seededRng,
  takeNext,
  targetRating,
  updateRating,
  type CheckpointEntry,
  type PickPuzzles,
  type Rng,
  type Session,
} from "../src/web/training/session";
import { _clearMemoryStore, loadProgress, progressKey, saveProgress } from "../src/web/training/storage";
import { checkpointId, type Puzzle } from "../src/web/types";

// ---------- fixtures ----------

function fakeCheckpoint(i: number, pattern: Pattern = "hanging-piece"): CheckpointEntry {
  return {
    gameId: `game${i}`,
    gameUrl: `https://www.chess.com/game/live/${i}`,
    opponent: `opp${i}`,
    playedAt: "2026-09-01T12:00:00Z",
    timeClass: "blitz",
    moveNumber: 20 + i,
    color: "w",
    // Distinct positions (the halfmove counter isn't part of the id, so vary the board).
    fen: `rnbqkbnr/pppppppp/8/8/${i || ""}N${7 - i || ""}/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1`,
    movePlayed: "a2a3",
    movePlayedSan: "a3",
    bestMove: "e2e4",
    bestMoveSan: "e4",
    topMoves: [
      { move: "e2e4", san: "e4", score: { cp: 300 }, winPercent: 80, pv: ["e2e4"] },
      { move: "d2d4", san: "d4", score: { cp: 280 }, winPercent: 79, pv: ["d2d4"] },
      { move: "c2c4", san: "c4", score: { cp: 100 }, winPercent: 60, pv: ["c2c4"] },
    ],
    clockMs: 42000,
    winBefore: 80,
    winAfter: 30,
    reasons: ["only-good-move"],
    gap: 19,
    pattern,
    explanation: "Left the knight hanging.",
  } as CheckpointEntry;
}

let puzzleSeq = 0;
const THEMES = ["hangingPiece", "fork", "mateIn2", "backRankMate"];
function fakePicker(log?: { calls: number; excluded: Set<string>[] }): PickPuzzles {
  return async ({ count, exclude, rating }) => {
    log?.calls !== undefined && (log.calls++, log.excluded.push(new Set(exclude)));
    const out: { puzzle: Puzzle; theme: string }[] = [];
    for (let i = 0; i < count; i++) {
      const id = `p${++puzzleSeq}`;
      const theme = THEMES[puzzleSeq % THEMES.length]!;
      out.push({ puzzle: { id, fen: "", moves: [], rating, themes: [theme], popularity: 90 }, theme });
    }
    return out;
  };
}

const deps = (rng: Rng, pick = fakePicker()) => ({ pickPuzzles: pick, weights: { hangingPiece: 1 }, rng });

/**
 * Run a session for `drills` drills. checkpointsAt(drillIndex) gives the report's
 * checkpoints at that moment; cpAnswer decides the move played at each checkpoint.
 */
async function simulate(opts: {
  seed: number;
  drills: number;
  checkpointsAt: (drillsDone: number) => CheckpointEntry[];
  cpAnswer: (cp: CheckpointEntry, rng: Rng) => string;
  session?: Session;
}) {
  const rng = seededRng(opts.seed);
  let s = opts.session ?? createSession(newProgress(1500, rng));
  const timeline: ({ kind: "drill" } | { kind: "checkpoint"; id: string; passed: boolean; status: string | undefined })[] = [];
  const gaps: number[] = [s.progress.drillsUntilCheckpoint];
  let drillsDone = 0;
  let clock = 0;
  while (drillsDone < opts.drills) {
    const cps = opts.checkpointsAt(drillsDone);
    const r = await takeNext(s, cps, deps(rng));
    s = r.session;
    if (!r.item) throw new Error("no item");
    if (r.item.kind === "drill") {
      expect(s.progress.drillsUntilCheckpoint > 0 || checkpointAvailability(s, cps) !== "available").toBe(true);
      s = completeDrill(s, r.item, rng() < 0.6).session;
      drillsDone++;
      timeline.push({ kind: "drill" });
    } else {
      const cp = r.item.checkpoint;
      const id = checkpointId(cp);
      // Must be due and must not be conquered.
      expect(s.progress.drillsUntilCheckpoint).toBe(0);
      const statusBefore = s.progress.checkpoints[id]?.status;
      expect(statusBefore).not.toBe("conquered");
      const res = completeCheckpoint(s, cp, opts.cpAnswer(cp, rng), rng, new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString());
      s = res.session;
      gaps.push(s.progress.drillsUntilCheckpoint);
      timeline.push({ kind: "checkpoint", id, passed: res.passed, status: statusBefore });
    }
  }
  return { s, timeline, gaps };
}

/** Drill counts between consecutive checkpoints (including the first one). */
function drillRuns(timeline: { kind: string }[]): number[] {
  const runs: number[] = [];
  let n = 0;
  for (const t of timeline) {
    if (t.kind === "drill") n++;
    else {
      runs.push(n);
      n = 0;
    }
  }
  return runs;
}

// ---------- scheduler ----------

describe("checkpoint scheduler", () => {
  it("500 drills, 6 checkpoints: checkpoint after exactly the countdown, every gap in [10,15], never a conquered one", async () => {
    const cps = Array.from({ length: 6 }, (_, i) => fakeCheckpoint(i, (["hanging-piece", "missed-mate", "back-rank"] as Pattern[])[i % 3]));
    // Mostly fail so checkpoints survive long enough to be requeued, but conquer some.
    const { timeline, gaps, s } = await simulate({
      seed: 42,
      drills: 500,
      checkpointsAt: () => cps,
      cpAnswer: (_cp, rng) => (rng() < 0.15 ? "e2e4" : "a2a3"),
    });
    const runs = drillRuns(timeline);
    expect(runs.length).toBeGreaterThan(20);
    // Each run of drills equals the countdown drawn right before it.
    runs.forEach((run, i) => expect(run).toBe(gaps[i]));
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(GAP_MIN);
      expect(g).toBeLessThanOrEqual(GAP_MAX);
    }
    // Gaps actually vary across the range.
    expect(new Set(gaps).size).toBeGreaterThan(3);
    // Never a conquered checkpoint (also asserted inside simulate).
    const conquered = new Set<string>();
    for (const t of timeline) {
      if (t.kind !== "checkpoint") continue;
      expect(conquered.has(t.id)).toBe(false);
      if (t.passed) conquered.add(t.id);
    }
    expect(conquered.size).toBeGreaterThan(0);
    // Once all 6 are conquered, drills continue with the "all conquered" flag.
    if (conquered.size === 6) expect(checkpointAvailability(s, cps)).toBe("all-conquered");
  });

  it("a brand-new user's first gap is random in [10,15]", () => {
    const firsts = new Set<number>();
    for (let seed = 1; seed < 200; seed++) {
      const g = newProgress(1200, seededRng(seed)).drillsUntilCheckpoint;
      expect(g).toBeGreaterThanOrEqual(GAP_MIN);
      expect(g).toBeLessThanOrEqual(GAP_MAX);
      firsts.add(g);
    }
    expect([...firsts].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it("failed checkpoints come back; never the same one twice in a row", async () => {
    const cps = [fakeCheckpoint(0), fakeCheckpoint(1), fakeCheckpoint(2)];
    const { timeline } = await simulate({ seed: 7, drills: 300, checkpointsAt: () => cps, cpAnswer: () => "a2a3" });
    const served = timeline.filter((t) => t.kind === "checkpoint") as { id: string; status: string | undefined }[];
    for (let i = 1; i < served.length; i++) expect(served[i]!.id).not.toBe(served[i - 1]!.id);
    // All fail forever, so each comes back repeatedly.
    const counts = new Map<string, number>();
    for (const t of served) counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
    expect(counts.size).toBe(3);
    for (const n of counts.values()) expect(n).toBeGreaterThan(3);
    expect(served.some((t) => t.status === "failed")).toBe(true);
  });

  it("a player who fails everything still sees every position (retries interleave with new ones)", async () => {
    const cps = Array.from({ length: 6 }, (_, i) => fakeCheckpoint(i));
    const { timeline } = await simulate({ seed: 13, drills: 400, checkpointsAt: () => cps, cpAnswer: () => "a2a3" });
    const served = timeline.filter((t) => t.kind === "checkpoint") as { id: string }[];
    const counts = new Map<string, number>();
    for (const t of served) counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
    expect(counts.size).toBe(6);
    for (const n of counts.values()) expect(n).toBeGreaterThanOrEqual(3);
    // The first 6 slots can't all be one or two positions: a new one appears at least every other slot.
    expect(new Set(served.slice(0, 11).map((t) => t.id)).size).toBe(6);
  });

  it("a single failed checkpoint is allowed to repeat (it's the only one)", async () => {
    const cps = [fakeCheckpoint(0)];
    const { timeline } = await simulate({ seed: 3, drills: 60, checkpointsAt: () => cps, cpAnswer: () => "a2a3" });
    const served = timeline.filter((t) => t.kind === "checkpoint");
    expect(served.length).toBeGreaterThanOrEqual(4);
  });

  it("prefers a failed one that waited a full gap over a fresh one, then fresh by drilled pattern", () => {
    const rng = seededRng(1);
    const a = fakeCheckpoint(0, "hanging-piece");
    const b = fakeCheckpoint(1, "missed-mate");
    const c = fakeCheckpoint(2, "back-rank");
    let s = createSession(newProgress(1500, rng));
    s = { ...s, progress: { ...s.progress, drillsUntilCheckpoint: 0 } };
    // Fail A; next pick must not be A (no repeat) and should match drilled themes.
    s = completeCheckpoint(s, a, "a2a3", rng, "2026-01-01T00:00:00Z").session;
    for (let i = 0; i < 12; i++) s = completeDrill(s, { puzzle: { id: `x${i}`, fen: "", moves: [], rating: 1500, themes: [], popularity: 0 }, theme: "mateIn2" }, true).session;
    expect(checkpointId(chooseCheckpoint(s, [a, b, c], rng)!)).toBe(checkpointId(b));
    s = completeCheckpoint(s, b, "e2e4", rng, "2026-01-01T00:01:00Z").session; // conquer B
    for (let i = 0; i < 12; i++) s = completeDrill(s, { puzzle: { id: `y${i}`, fen: "", moves: [], rating: 1500, themes: [], popularity: 0 }, theme: "fork" }, true).session;
    // A failed and waited ≥ one gap → requeue beats fresh C.
    expect(checkpointId(chooseCheckpoint(s, [a, b, c], rng)!)).toBe(checkpointId(a));
  });

  it("0 checkpoints: drills continue past the due point; one appearing mid-session is served at once", async () => {
    const late = fakeCheckpoint(5);
    const appearAt = 23;
    const { timeline, gaps } = await simulate({
      seed: 11,
      drills: 60,
      checkpointsAt: (d) => (d >= appearAt ? [late] : []),
      cpAnswer: () => "e2e4",
    });
    const firstCp = timeline.findIndex((t) => t.kind === "checkpoint");
    // Due after gaps[0] (≤15) drills, but nothing existed until drill 23: served right then.
    expect(firstCp).toBe(appearAt);
    expect(gaps[0]).toBeLessThan(appearAt);
    // Conquered on first try: no more checkpoints, drills keep going.
    expect(timeline.filter((t) => t.kind === "checkpoint")).toHaveLength(1);
  });

  it("availability flag distinguishes none-yet vs all-conquered", () => {
    const rng = seededRng(2);
    let s = createSession(newProgress(1500, rng));
    expect(checkpointAvailability(s, [])).toBe("none-yet");
    const a = fakeCheckpoint(0);
    expect(checkpointAvailability(s, [a])).toBe("available");
    s = completeCheckpoint(s, a, "e2e4", rng, "2026-01-01T00:00:00Z").session;
    expect(checkpointAvailability(s, [a])).toBe("all-conquered");
    expect(chooseCheckpoint(s, [a], rng)).toBeNull();
  });

  it("drill blocks exclude seen and queued puzzles", async () => {
    const rng = seededRng(5);
    const log = { calls: 0, excluded: [] as Set<string>[] };
    const pick = fakePicker(log);
    let s = createSession({ ...newProgress(1500, rng), seenPuzzleIds: ["old1"] });
    for (let i = 0; i < 12; i++) {
      const r = await takeNext(s, [], { pickPuzzles: pick, weights: {}, rng });
      s = completeDrill(r.session, r.item as never, true).session;
    }
    expect(log.calls).toBe(3); // blocks of 5
    expect(log.excluded[0]!.has("old1")).toBe(true);
    expect(log.excluded[2]!.size).toBe(11); // old1 + 10 seen
  });
});

// ---------- pass rule + rating ----------

describe("checkpoint pass rule", () => {
  const cp = fakeCheckpoint(0);
  it("top move passes, within margin passes, outside margin / unknown fails", () => {
    expect(config.passMargin).toBe(2);
    expect(passesCheckpoint(cp, "e2e4")).toBe(true);
    expect(passesCheckpoint(cp, "d2d4")).toBe(true); // 1 point worse
    expect(passesCheckpoint(cp, "c2c4")).toBe(false); // 20 points worse
    expect(passesCheckpoint(cp, "a2a3")).toBe(false); // the blunder
  });
  it("completeCheckpoint wires pass → conquered, fail → failed with attempts and movesTried", () => {
    const rng = seededRng(9);
    let s = createSession(newProgress(1500, rng));
    const id = checkpointId(cp);
    let r = completeCheckpoint(s, cp, "c2c4", rng, "2026-01-01T00:00:00Z");
    expect(r.passed).toBe(false);
    expect(r.session.progress.checkpoints[id]).toEqual({ status: "failed", attempts: 1, movesTried: ["c2c4"], lastAttemptAt: "2026-01-01T00:00:00Z" });
    s = r.session;
    r = completeCheckpoint(s, cp, "d2d4", rng, "2026-01-02T00:00:00Z");
    expect(r.passed).toBe(true);
    expect(r.session.progress.checkpoints[id]).toMatchObject({ status: "conquered", attempts: 2, movesTried: ["c2c4", "d2d4"] });
  });
});

describe("adaptive rating", () => {
  it("starts from rapid, then blitz, then bullet, else 1200, clamped", () => {
    expect(initialPuzzleRating({ ratings: { rapid: 1400, blitz: 1100 } })).toBe(1400);
    expect(initialPuzzleRating({ ratings: { blitz: 1100, bullet: 900 } })).toBe(1100);
    expect(initialPuzzleRating({ ratings: { bullet: 900 } })).toBe(900);
    expect(initialPuzzleRating({ ratings: {} })).toBe(1200);
    expect(initialPuzzleRating(null)).toBe(1200);
    expect(initialPuzzleRating({ ratings: { rapid: 300 } })).toBe(600);
    expect(initialPuzzleRating({ ratings: { rapid: 3100 } })).toBe(2600);
  });
  it("Elo update with K 24 → 12", () => {
    expect(kFactor(0)).toBe(24);
    expect(kFactor(30)).toBe(12);
    expect(kFactor(100)).toBe(12);
    expect(updateRating(1500, 1500, true, 0)).toBe(1512);
    expect(updateRating(1500, 1500, false, 0)).toBe(1488);
    expect(updateRating(1500, 1500, true, 50)).toBe(1506);
    expect(updateRating(2600, 1000, true, 0)).toBe(2600);
    expect(updateRating(600, 2000, false, 0)).toBe(600);
  });
  it("targets puzzles slightly below the rating", () => {
    const s = createSession(newProgress(1500, seededRng(1)));
    expect(targetRating(s)).toBeLessThan(1500);
    expect(targetRating(s)).toBeGreaterThan(1400);
  });
});

// ---------- puzzle logic ----------

describe("puzzleLogic (Lichess rules)", () => {
  // Real Lichess puzzle 00008: mate in 3-ish with a promotion-free 3-move solution.
  const p00008 = {
    fen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
    moves: "f2g3 e6e7 b2b1 b3c1 b1c1 h6c1".split(" "),
  };

  it("applies the setup move and orients to the solver", () => {
    const run = startPuzzle(p00008);
    expect(run.playerColor).toBe("w");
    expect(run.lastMove).toEqual({ from: "f2", to: "g3" });
    expect(run.solution).toEqual(["e6e7", "b2b1", "b3c1", "b1c1", "h6c1"]);
  });

  it("multi-move solution with opponent replies solves", () => {
    let run: PuzzleRun = startPuzzle(p00008);
    let o = tryMove(run, "e6e7");
    expect(o.result).toBe("correct");
    if (o.result !== "correct") throw 0;
    expect(o.reply).toBe("b2b1");
    run = applyReply(o.run);
    expect(run.lastMove).toEqual({ from: "b2", to: "b1" });
    o = tryMove(run, "b3c1");
    expect(o.result).toBe("correct");
    run = applyReply(o.run);
    o = tryMove(run, "h6c1");
    expect(o.result).toBe("solved");
    expect(o.run.status).toBe("solved");
  });

  it("a wrong move fails and the rest of the solution can be revealed", () => {
    const run = startPuzzle(p00008);
    const o = tryMove(run, "h6h7");
    expect(o.result).toBe("wrong");
    if (o.result !== "wrong") throw 0;
    expect(o.expected).toBe("e6e7");
    expect(o.run.status).toBe("failed");
    expect(o.run.fen).toBe(run.fen); // snaps back
    let r: PuzzleRun | null = o.run;
    const shown: string[] = [];
    while ((r = revealNext(r!))) shown.push(`${r.lastMove!.from}${r.lastMove!.to}`);
    expect(shown).toEqual(["e6e7", "b2b1", "b3c1", "b1c1", "h6c1"]);
  });

  it("an illegal move changes nothing", () => {
    const run = startPuzzle(p00008);
    expect(tryMove(run, "e6e8").result).toBe("illegal");
  });

  it("an alternative checkmate is accepted and solves the puzzle", () => {
    // Black Kg8→h8; White rooks a7/b7: Ra8# expected, Rb8# also mates.
    const p = { fen: "6k1/RR6/8/8/8/8/8/K7 b - - 0 1", moves: ["g8h8", "a7a8"] };
    expect(tryMove(startPuzzle(p), "b7b8").result).toBe("solved");
    expect(tryMove(startPuzzle(p), "a7a8").result).toBe("solved");
    expect(tryMove(startPuzzle(p), "b7b6").result).toBe("wrong");
  });

  it("promotion: picker needed, exact piece required (underpromotion)", () => {
    const p = { fen: "8/P7/8/8/4k3/8/8/7K b - - 0 1", moves: ["e4e5", "a7a8n"] };
    const run = startPuzzle(p);
    expect(needsPromotion(run.fen, "a7", "a8")).toBe(true);
    expect(needsPromotion(run.fen, "h1", "g1")).toBe(false);
    expect(tryMove(run, "a7a8q").result).toBe("wrong");
    expect(tryMove(run, "a7a8n").result).toBe("solved");
  });
});

// ---------- storage ----------

describe("storage", () => {
  const orig = (globalThis as { localStorage?: unknown }).localStorage;
  afterEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = orig;
    _clearMemoryStore();
  });

  function fakeStorage(): Storage {
    const m = new Map<string, string>();
    return {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
      removeItem: (k) => void m.delete(k),
      clear: () => m.clear(),
      key: (i) => [...m.keys()][i] ?? null,
      get length() {
        return m.size;
      },
    };
  }

  it("round-trips under bp:progress:{lowercase}, versioned, seen capped at 3000", () => {
    const ls = fakeStorage();
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    const p = newProgress(1400, seededRng(1));
    p.seenPuzzleIds = Array.from({ length: 3500 }, (_, i) => `id${i}`);
    p.checkpoints["g:fen"] = { status: "failed", attempts: 2, movesTried: ["e2e4", "d2d4"], lastAttemptAt: "2026-01-01T00:00:00Z" };
    p.puzzlesAttempted = 7;
    saveProgress("ChasenRooks", p);
    expect(progressKey("ChasenRooks")).toBe("bp:progress:chasenrooks");
    const raw = JSON.parse(ls.getItem("bp:progress:chasenrooks")!);
    expect(raw.version).toBe(1);
    expect(raw.seenPuzzleIds).toHaveLength(3000);
    _clearMemoryStore();
    const back = loadProgress("chasenrooks", 1200);
    expect(back.puzzleRating).toBe(1400);
    expect(back.puzzlesAttempted).toBe(7);
    expect(back.checkpoints["g:fen"]).toEqual(p.checkpoints["g:fen"]);
    expect(back.seenPuzzleIds.at(-1)).toBe("id3499");
    expect(back.drillsUntilCheckpoint).toBe(p.drillsUntilCheckpoint);
  });

  it("new user gets the initial rating; corrupt or wrong-version data falls back to defaults", () => {
    const ls = fakeStorage();
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    expect(loadProgress("nobody", 1750).puzzleRating).toBe(1750);
    ls.setItem("bp:progress:bad", "{not json");
    expect(loadProgress("bad", 1300).puzzleRating).toBe(1300);
    ls.setItem("bp:progress:old", JSON.stringify({ version: 0, puzzleRating: 2000 }));
    expect(loadProgress("old", 1300).puzzleRating).toBe(1300);
  });

  it("storage blocked: no throw, in-memory fallback keeps progress for this tab", () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    (globalThis as { localStorage?: unknown }).localStorage = throwing;
    const p = { ...newProgress(1500, seededRng(1)), puzzlesSolved: 9 };
    expect(() => saveProgress("blocked", p)).not.toThrow();
    expect(loadProgress("blocked", 1200).puzzlesSolved).toBe(9);
  });

  it("no localStorage at all (SSR): works from memory", () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    saveProgress("ssr", { ...newProgress(1500, seededRng(1)), bestStreak: 4 });
    expect(loadProgress("ssr", 1200).bestStreak).toBe(4);
  });
});
