import type { GameAnalysis, MoveAnalysis } from "./analyze.js";
import { selectCheckpoints, type Checkpoint } from "./checkpoints.js";
import { moveContext, type MoveContext } from "./context.js";
import { classify, PATTERN_LABEL } from "./patterns/index.js";
import type { Pattern } from "./patterns/types.js";

export interface PlayerError {
  gameId: string;
  gameUrl: string;
  opponent: string;
  playedAt: string;
  timeClass: string;
  label: "mistake" | "blunder";
  moveNumber: number;
  color: "w" | "b";
  san: string;
  bestMoveSan: string | null;
  fenBefore: string;
  winBefore: number;
  winAfter: number;
  clockMs: number | null;
  context: MoveContext;
  pattern: Pattern;
  explanation: string | null;
  /** Every pattern that matched, in priority order. */
  allPatterns: Pattern[];
}

export interface ReportData {
  username: string;
  games: GameAnalysis[];
  skipped: Record<string, number>;
  errors: PlayerError[];
  checkpoints: (Checkpoint & { pattern: Pattern; explanation: string | null })[];
}

export function collectErrors(game: GameAnalysis): PlayerError[] {
  const out: PlayerError[] = [];
  for (const mv of game.moves) {
    if (mv.color !== game.playerColor || (mv.label !== "blunder" && mv.label !== "mistake")) continue;
    const c = classifyMove(mv);
    out.push({
      gameId: game.gameId,
      gameUrl: game.url,
      opponent: game.opponent,
      playedAt: game.playedAt,
      timeClass: game.timeClass,
      label: mv.label,
      moveNumber: mv.moveNumber,
      color: mv.color,
      san: mv.san,
      bestMoveSan: mv.bestMoveSan,
      fenBefore: mv.fenBefore,
      winBefore: mv.winBefore,
      winAfter: mv.winAfter,
      clockMs: mv.clockMs,
      context: moveContext(mv.fenBefore, mv.moveNumber, mv.clockMs, game.timeControl),
      pattern: c.primary,
      explanation: c.matches[0]?.explanation ?? null,
      allPatterns: c.matches.map((m) => m.pattern),
    });
  }
  return out;
}

function classifyMove(mv: MoveAnalysis) {
  return classify({
    fenBefore: mv.fenBefore,
    fenAfter: mv.fenAfter,
    played: mv.uci,
    playedSan: mv.san,
    topMoves: mv.topMoves,
    refutation: mv.refutation ?? [],
    winBefore: mv.winBefore,
    winAfter: mv.winAfter,
  });
}

export function buildReport(username: string, games: GameAnalysis[], skipped: Record<string, number>): ReportData {
  const errors = games.flatMap(collectErrors);
  const checkpoints = games.flatMap((g) =>
    selectCheckpoints(g).map((cp) => {
      const err = errors.find((e) => e.gameId === cp.gameId && e.fenBefore === cp.fen);
      return { ...cp, pattern: err?.pattern ?? ("other" as Pattern), explanation: err?.explanation ?? null };
    }),
  );
  return { username, games, skipped, errors, checkpoints };
}

// ---------- Rendering ----------

const pct = (n: number, d: number) => (d === 0 ? "0%" : `${Math.round((100 * n) / d)}%`);
const moveRef = (moveNumber: number, color: "w" | "b", san: string) => `${moveNumber}${color === "w" ? "." : "..."} ${san}`;
const clockStr = (ms: number | null) => (ms === null ? "?" : `${Math.round(ms / 1000)}s`);
const dateStr = (iso: string) => iso.slice(0, 10);

function tally<T extends string>(items: T[]): [T, number][] {
  const m = new Map<T, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function bar(n: number, total: number, width = 20): string {
  const filled = total === 0 ? 0 : Math.round((width * n) / total);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function breakdownTable(title: string, rows: [string, number][], total: number): string {
  const lines = [`| ${title} | Count | Share | |`, "|---|---:|---:|---|"];
  for (const [k, n] of rows) lines.push(`| ${k} | ${n} | ${pct(n, total)} | \`${bar(n, total)}\` |`);
  return lines.join("\n");
}

/** One or two plain-English sentences, like the handoff's example. */
export function plainSummary(r: ReportData): string {
  const blunders = r.errors.filter((e) => e.label === "blunder");
  if (blunders.length === 0) return "No blunders found in these games. Nice. Training will use themed drills only.";
  const byPattern = tally(blunders.map((b) => b.pattern)).filter(([p]) => p !== "other");
  const byPhase = tally(blunders.map((b) => b.context.phase));
  const byClock = tally(blunders.map((b) => b.context.clockBucket ?? "unknown"));
  const parts = byPattern.slice(0, 2).map(([p, n]) => `${pct(n, blunders.length)} of your blunders are ${PATTERN_LABEL[p].toLowerCase()}`);
  const first = parts.length ? parts.join(", ") + "." : "Most of your blunders don't fit a named pattern yet.";
  const [phase] = byPhase[0]!;
  const [clock] = byClock[0]!;
  return `${first[0]!.toUpperCase()}${first.slice(1)} Most happen in the ${phase} with ${clock === "60s+" ? "over a minute" : clock.replace("<", "under ")} on the clock.`;
}

export function renderMarkdown(r: ReportData): string {
  const blunders = r.errors.filter((e) => e.label === "blunder");
  const mistakes = r.errors.filter((e) => e.label === "mistake");
  const g = r.games.length;
  const out: string[] = [];

  out.push(`# Blunderproof report: ${r.username}`, "");
  const dates = r.games.map((x) => x.playedAt).sort();
  out.push(`${g} games analyzed (${dateStr(dates[0] ?? "")} to ${dateStr(dates.at(-1) ?? "")}). Engine: ${r.games[0]?.engine ?? "?"}.`);
  const tc = tally(r.games.map((x) => x.timeClass)).map(([k, n]) => `${n} ${k}`).join(", ");
  out.push(`Time controls: ${tc}.`);
  const skipped = Object.entries(r.skipped).map(([k, n]) => `${n} ${k}`).join(", ");
  if (skipped) out.push(`Skipped: ${skipped}.`);
  out.push("");

  out.push("## Summary", "", `> ${plainSummary(r)}`, "");
  out.push(`- **${blunders.length} blunders** (${(blunders.length / Math.max(g, 1)).toFixed(1)} per game) and **${mistakes.length} mistakes** (${(mistakes.length / Math.max(g, 1)).toFixed(1)} per game).`);
  const other = blunders.filter((b) => b.pattern === "other").length;
  out.push(`- **${pct(other, blunders.length)} of blunders are "other"** (no pattern detected yet). This shows where pattern detection needs work.`);
  out.push(`- **${r.checkpoints.length} checkpoint candidates** out of ${blunders.length} blunders.`, "");

  out.push("## Why you blunder", "");
  out.push(breakdownTable("Pattern", tally(blunders.map((b) => PATTERN_LABEL[b.pattern])), blunders.length), "");
  out.push("## When you blunder", "");
  out.push(breakdownTable("Game phase", tally(blunders.map((b) => b.context.phase)), blunders.length), "");
  out.push(breakdownTable("Clock left", tally(blunders.map((b) => b.context.clockBucket ?? "unknown")), blunders.length), "");
  out.push(breakdownTable("Time control", tally(blunders.map((b) => b.timeClass)), blunders.length), "");

  out.push("## Checkpoint candidates", "", "Positions from your games right before a blunder that make fair puzzles.", "");
  out.push("| # | Game | Move | You played | Best | Clock | Pattern | Why it qualifies | FEN |", "|---:|---|---|---|---|---:|---|---|---|");
  r.checkpoints.forEach((c, i) => {
    out.push(
      `| ${i + 1} | [vs ${c.opponent}, ${dateStr(c.playedAt)}](${c.gameUrl}) | ${c.moveNumber}${c.color === "w" ? "." : "..."} | ${c.movePlayedSan} | **${c.bestMoveSan}** | ${clockStr(c.clockMs)} | ${PATTERN_LABEL[c.pattern]} | ${c.reasons.join(", ")} | \`${c.fen}\` |`,
    );
  });
  out.push("");

  out.push("## All blunders", "");
  out.push("| Game | Move | Best | Win % | Clock | Phase | Pattern | Explanation |", "|---|---|---|---|---:|---|---|---|");
  for (const b of blunders) {
    out.push(
      `| [vs ${b.opponent}](${b.gameUrl}) | ${moveRef(b.moveNumber, b.color, b.san)} | ${b.bestMoveSan ?? "?"} | ${b.winBefore.toFixed(0)} → ${b.winAfter.toFixed(0)} | ${clockStr(b.clockMs)} | ${b.context.phase} | ${PATTERN_LABEL[b.pattern]} | ${b.explanation ?? ""} |`,
    );
  }
  out.push("");
  return out.join("\n");
}

/** Short version for the terminal. */
export function renderTerminal(r: ReportData): string {
  const blunders = r.errors.filter((e) => e.label === "blunder");
  const lines = [
    "",
    `Games analyzed: ${r.games.length}   Blunders: ${blunders.length}   Mistakes: ${r.errors.length - blunders.length}   Checkpoints: ${r.checkpoints.length}`,
    "",
    plainSummary(r),
    "",
    "Blunders by pattern:",
  ];
  for (const [p, n] of tally(blunders.map((b) => PATTERN_LABEL[b.pattern]))) {
    lines.push(`  ${p.padEnd(16)} ${bar(n, blunders.length)} ${pct(n, blunders.length).padStart(4)}  (${n})`);
  }
  return lines.join("\n");
}
