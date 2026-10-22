/**
 * Mapping from Blunderproof weakness tags (Pattern / OtherKind) to Lichess puzzle themes.
 * Lichess theme names: https://github.com/lichess-org/lila/blob/master/translation/source/puzzleTheme.xml
 */
import type { OtherKind } from "../../patterns/otherKind";
import type { Pattern } from "../../patterns/types";

export const PATTERN_THEMES: Record<Pattern, string[]> = {
  // Missed winning loose/overloaded material: spot undefended pieces, remove the guard, win trapped pieces.
  "missed-capture": ["hangingPiece", "capturingDefender", "trappedPiece"],
  // Left own piece en prise: practice seeing hanging pieces and finding the saving defensive move.
  "hanging-piece": ["hangingPiece", "defensiveMove"],
  // Missed a forced mate: short mating patterns build the habit of checking checks first.
  "missed-mate": ["mateIn1", "mateIn2", "mateIn3"],
  // Back-rank weakness (allowed or missed): drill the exact pattern.
  "back-rank": ["backRankMate"],
  // Unclassified: a general tactical mix (refined by otherKind when available).
  other: ["fork", "pin", "skewer", "discoveredAttack", "hangingPiece", "mateIn2"],
};

export const OTHER_KIND_THEMES: Record<OtherKind, string[]> = {
  // Got hit by a tactic: learn the common motifs so you see them coming.
  "lost-material-to-tactic": ["fork", "pin", "skewer", "discoveredAttack", "deflection"],
  // Missed a winning tactic: same motifs, from the attacker's side.
  "missed-winning-tactic": ["fork", "pin", "skewer", "discoveredAttack", "deflection"],
  // King got mated: defend accurately and recognise kingside attacks / short mates.
  "allowed-mating-attack": ["defensiveMove", "kingsideAttack", "mateIn2"],
  // No material swing: endgame technique and quiet-move calculation.
  "positional-or-endgame": ["endgame", "rookEndgame", "pawnEndgame", "quietMove"],
  // Missed a long forced mate: deeper mating calculation.
  "missed-long-mate": ["mateIn3", "mateIn4"],
};

/** Balanced mix used when we know nothing about the player yet. */
export const DEFAULT_THEMES: string[] = [
  "hangingPiece",
  "fork",
  "pin",
  "skewer",
  "discoveredAttack",
  "mateIn1",
  "mateIn2",
  "backRankMate",
  "endgame",
  "defensiveMove",
];

export const THEME_LABEL: Record<string, string> = {
  hangingPiece: "Hanging piece",
  capturingDefender: "Capture the defender",
  trappedPiece: "Trapped piece",
  defensiveMove: "Defensive move",
  mateIn1: "Mate in 1",
  mateIn2: "Mate in 2",
  mateIn3: "Mate in 3",
  mateIn4: "Mate in 4",
  backRankMate: "Back-rank mate",
  fork: "Fork",
  pin: "Pin",
  skewer: "Skewer",
  discoveredAttack: "Discovered attack",
  deflection: "Deflection",
  kingsideAttack: "Kingside attack",
  endgame: "Endgame",
  rookEndgame: "Rook endgame",
  pawnEndgame: "Pawn endgame",
  quietMove: "Quiet move",
};

/** Every theme we ship a puzzle file for (public/puzzles/{theme}.json). */
export const ALL_THEMES: string[] = [
  ...new Set([
    ...Object.values(PATTERN_THEMES).flat(),
    ...Object.values(OTHER_KIND_THEMES).flat(),
    ...DEFAULT_THEMES,
  ]),
].sort();

export function themeLabel(theme: string): string {
  return THEME_LABEL[theme] ?? theme;
}
