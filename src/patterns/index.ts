import { detectBackRank } from "./backRank.js";
import { detectHangingPiece } from "./hangingPiece.js";
import { detectMissedCapture } from "./missedCapture.js";
import { detectMissedMate } from "./missedMate.js";
import type { BlunderContext, Detector, Pattern } from "./types.js";

export type { BlunderContext, Pattern } from "./types.js";

export const PATTERN_LABEL: Record<Pattern, string> = {
  "missed-mate": "Missed mate",
  "back-rank": "Back rank",
  "hanging-piece": "Hanging piece",
  "missed-capture": "Missed capture",
  other: "Other",
};

/**
 * Priority order: when several patterns match, the first one is the primary
 * tag. Mates come first because they're the most decisive explanation.
 */
const DETECTORS: [Exclude<Pattern, "other">, Detector][] = [
  ["missed-mate", detectMissedMate],
  ["back-rank", detectBackRank],
  ["hanging-piece", detectHangingPiece],
  ["missed-capture", detectMissedCapture],
];

export interface Classification {
  primary: Pattern;
  matches: { pattern: Pattern; explanation: string }[];
}

export function classify(ctx: BlunderContext): Classification {
  const matches: Classification["matches"] = [];
  for (const [pattern, detect] of DETECTORS) {
    const r = detect(ctx);
    if (r) matches.push({ pattern, explanation: r.explanation });
  }
  return { primary: matches[0]?.pattern ?? "other", matches };
}
