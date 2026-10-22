/**
 * Every tunable number lives here so we can adjust behavior after looking at
 * real games without hunting through the code.
 * Win% values are on a 0–100 scale from the mover's point of view.
 */
export const config = {
  /** How much a move must drop the mover's win% to earn each label (Lichess-style defaults). */
  labels: {
    inaccuracy: 5,
    mistake: 10,
    blunder: 15,
  },

  engine: {
    /** Fast pass over every move, used to find candidate errors. */
    fastDepth: 12,
    /** Deep pass on candidates only, to confirm before we call anything a blunder. */
    deepDepth: 16,
    /** Time cap per deep search (ms): the search stops at deepDepth or this, whichever comes first. */
    deepMaxMs: 500,
    /** Number of top moves to keep per position (needed for the checkpoint gap and pass rule). */
    multiPv: 3,
    threads: 4,
    hashMb: 128,
  },

  checkpoint: {
    /** Best move must beat the 2nd-best move by at least this many win% points... */
    minGapToSecondBest: 10,
    /** ...or win at least this much material (pawn = 1). */
    minMaterialGain: 2,
  },

  patterns: {
    /** Longer forced mates aren't something a human is expected to find, so they don't count as "missed mate". */
    maxMissedMateLength: 5,
  },

  /** A checkpoint attempt passes if it is within this many win% points of the top move. */
  passMargin: 2,

  /** Clock buckets in seconds. A blunder is tagged with the smallest bucket it fits in. */
  clockBucketsSec: [10, 30, 60] as const,

  filter: {
    minFullMoves: 10,
    allowedTimeClasses: ["bullet", "blitz", "rapid"] as const,
  },

  fetch: {
    defaultMonths: 2,
    defaultMaxGames: 20,
    userAgent: "Blunderproof/0.1 (https://github.com/LoganChasen/blunderproof; loganchasen06@gmail.com)",
  },
} as const;

export type Config = typeof config;
