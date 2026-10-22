import { describe, expect, it } from "vitest";
import type { GameAnalysis } from "../src/analyze.js";
import { buildReport, plainSummary, renderMarkdown, renderTerminal } from "../src/report.js";
import game from "./fixtures/game-analysis.json" with { type: "json" };

const g = game as unknown as GameAnalysis;

describe("report", () => {
  const report = buildReport("chasenrooks", [g], { abandoned: 1 });

  it("collects only the player's mistakes and blunders", () => {
    expect(report.errors.length).toBeGreaterThan(0);
    for (const e of report.errors) {
      expect(e.color).toBe(g.playerColor);
      expect(["mistake", "blunder"]).toContain(e.label);
    }
  });

  it("tags the known back-rank blunder (20. d5, Re1+ mates)", () => {
    const d5 = report.errors.find((e) => e.moveNumber === 20 && e.san === "d5");
    expect(d5?.pattern).toBe("back-rank");
    expect(d5?.explanation).toMatch(/Re1\+/);
  });

  it("gives every unexplained blunder a diagnostic sub-group", () => {
    for (const e of report.errors) expect(e.otherKind === null).toBe(e.pattern !== "other");
  });

  it("renders the markdown sections and a readable summary", () => {
    const md = renderMarkdown(report);
    for (const heading of ["## Summary", "## Why you blunder", "## When you blunder", "## Checkpoint candidates", "## All blunders"]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain("Skipped: 1 abandoned.");
    expect(plainSummary(report)).toMatch(/^[A-Z0-9].*\.$/);
    expect(renderTerminal(report)).toContain("Blunders by pattern:");
  });
});
