import { describe, expect, it } from "vitest";
import { cpToWinPercent, negate, scoreToWinPercent } from "../src/winPercent";

describe("win percent", () => {
  it("is 50 at an equal position", () => {
    expect(cpToWinPercent(0)).toBeCloseTo(50, 5);
  });

  it("matches Lichess at +100cp (~59.1%)", () => {
    expect(cpToWinPercent(100)).toBeCloseTo(59.1, 1);
  });

  it("is symmetric", () => {
    expect(cpToWinPercent(250) + cpToWinPercent(-250)).toBeCloseTo(100, 5);
  });

  it("maps mates to 0 or 100", () => {
    expect(scoreToWinPercent({ mate: 3 })).toBe(100);
    expect(scoreToWinPercent({ mate: -1 })).toBe(0);
  });

  it("negates both score kinds", () => {
    expect(negate({ cp: 120 })).toEqual({ cp: -120 });
    expect(negate({ mate: 2 })).toEqual({ mate: -2 });
  });
});
