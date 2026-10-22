import type { MoveAnalysis } from "../analyze";
import { lineEndsInMate, materialSwing } from "./helpers";

/**
 * Rough sub-groups for blunders no detector explains. This is diagnostic only:
 * it tells us which detector to build next, and isn't shown to players as a "why".
 */
export type OtherKind =
  | "allowed-mating-attack"
  | "missed-long-mate"
  | "lost-material-to-tactic"
  | "missed-winning-tactic"
  | "positional-or-endgame";

export const OTHER_KIND_LABEL: Record<OtherKind, string> = {
  "allowed-mating-attack": "Allowed a mating attack (not back rank)",
  "missed-long-mate": "Missed a long forced mate",
  "lost-material-to-tactic": "Lost material to a tactic (fork, pin, etc.)",
  "missed-winning-tactic": "Missed a tactic that wins material",
  "positional-or-endgame": "Positional / endgame (no material swing)",
};

/** Plies of a line to look at when checking for material swings. */
const WINDOW = 6;

export function otherKind(mv: MoveAnalysis): OtherKind {
  const opp = mv.color === "w" ? "b" : "w";
  const refutation = mv.refutation ?? [];
  const best = mv.topMoves[0];
  if (mv.winAfter < 1 || lineEndsInMate(mv.fenAfter, refutation)) return "allowed-mating-attack";
  if (best && "mate" in best.score && best.score.mate > 0) return "missed-long-mate";
  if (materialSwing(mv.fenAfter, refutation.slice(0, WINDOW), opp) >= 2) return "lost-material-to-tactic";
  if (best && materialSwing(mv.fenBefore, best.pv.slice(0, WINDOW), mv.color) >= 2) return "missed-winning-tactic";
  return "positional-or-endgame";
}
