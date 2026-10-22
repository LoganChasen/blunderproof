"use client";
/** One Lichess drill: setup-move animation, player moves, opponent replies, hint/solution/retry. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PATTERN_PHRASE } from "../../patterns/index";
import { Board, type BoardArrow } from "../board/Board";
import { themeLabel } from "../puzzles";
import { Button, IconArrowRight, IconBulb, IconCheck, IconRefresh, IconX } from "../ui";
import {
  applyReply,
  expectedMove,
  resetPuzzle,
  revealNext,
  sanOf,
  startPuzzle,
  tryMove,
  uciToPair,
  type PuzzleRun,
  type SquarePair,
} from "./puzzleLogic";
import { PromotionPicker, SideToMove, TrainingLayout } from "./parts";
import type { DrillItem } from "./session";
import { lastMoveStyles, mergeStyles, useMoveInput } from "./useMoveInput";

const SETUP_DELAY_MS = 600;
const REPLY_DELAY_MS = 450;
const SNAPBACK_MS = 750;
const SOLUTION_STEP_MS = 800;

type Feedback = { kind: "correct" | "solved" | "wrong" | "info"; text: string } | null;

export function focusLabel(pattern: DrillItem["pattern"]): string {
  if (pattern === "other") return "Mixed tactics";
  const p = PATTERN_PHRASE[pattern];
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export function DrillPlayer({
  item,
  onComplete,
  onNext,
  tracker,
  stats,
  notes,
}: {
  item: DrillItem;
  /** Called once per puzzle with the counted result (hint/solution/wrong = not solved). */
  onComplete: (solved: boolean) => void;
  onNext: () => void;
  tracker: ReactNode;
  stats: ReactNode;
  notes?: ReactNode;
}) {
  const initial = useMemo(() => {
    try {
      return startPuzzle(item.puzzle);
    } catch {
      return null;
    }
  }, [item.puzzle]);

  const [run, setRun] = useState<PuzzleRun | null>(initial);
  const [fen, setFen] = useState(initial?.initialFen ?? item.puzzle.fen);
  const [lastMove, setLastMove] = useState<SquarePair | null>(null);
  const [busy, setBusy] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [flash, setFlash] = useState<{ square: string; good: boolean } | null>(null);
  const [arrows, setArrows] = useState<BoardArrow[]>([]);
  const [hintSquare, setHintSquare] = useState<string | null>(null);
  const [result, setResult] = useState<"solved" | "failed" | null>(null);
  const [practice, setPractice] = useState(false); // a retry after the counted attempt
  const counted = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const count = useCallback(
    (solved: boolean) => {
      if (counted.current) return;
      counted.current = true;
      setResult(solved ? "solved" : "failed");
      onComplete(solved);
    },
    [onComplete],
  );

  /** Show the starting position, then animate the opponent's setup move. */
  const playSetup = useCallback(
    (r: PuzzleRun) => {
      clearTimers();
      setRun(r);
      setFen(r.initialFen);
      setLastMove(null);
      setBusy(true);
      setArrows([]);
      setHintSquare(null);
      setFlash(null);
      later(SETUP_DELAY_MS, () => {
        setFen(r.fen);
        setLastMove(uciToPair(r.setupMove));
        setBusy(false);
      });
    },
    [clearTimers, later],
  );

  useEffect(() => {
    if (initial) playSetup(initial);
  }, [initial, playSetup]);

  const flashSquare = useCallback(
    (square: string, good: boolean) => {
      setFlash({ square, good });
      later(700, () => setFlash(null));
    },
    [later],
  );

  const onMove = useCallback(
    (uci: string): boolean => {
      if (!run || busy || run.status !== "playing") return false;
      const o = tryMove(run, uci);
      const to = uci.slice(2, 4);
      setHintSquare(null);
      if (o.result === "illegal") return false;
      if (o.result === "wrong") {
        setFen(o.wrongFen);
        setLastMove(uciToPair(uci));
        flashSquare(to, false);
        setFeedback({ kind: "wrong", text: "Not the move" });
        setBusy(true);
        setRun(o.run);
        if (!practice) count(false);
        later(SNAPBACK_MS, () => {
          setFen(o.run.fen);
          setLastMove(o.run.lastMove);
          setArrows([{ ...uciToPair(o.expected), color: "var(--success)" }]);
          setFeedback({ kind: "wrong", text: `Not the move. The move was ${sanOf(o.run.fen, o.expected)}.` });
          setBusy(false);
        });
        return true;
      }
      setFen(o.run.fen);
      setLastMove(uciToPair(uci));
      setRun(o.run);
      setArrows([]);
      flashSquare(to, true);
      if (o.result === "solved") {
        setFeedback({ kind: "solved", text: practice ? "Solved (practice)" : "Correct! Puzzle solved." });
        if (!practice) count(true);
        return true;
      }
      setFeedback({ kind: "correct", text: "Correct! Keep going." });
      setBusy(true);
      later(REPLY_DELAY_MS, () => {
        const next = applyReply(o.run);
        setRun(next);
        setFen(next.fen);
        setLastMove(next.lastMove);
        setBusy(false);
      });
      return true;
    },
    [run, busy, practice, flashSquare, count, later],
  );

  const playerColor = run?.playerColor ?? "w";
  const interactive = !!run && !busy && run.status === "playing";
  const input = useMoveInput({ fen, color: playerColor, interactive, onMove });

  const hint = () => {
    if (!run || run.status !== "playing") return;
    const mv = expectedMove(run);
    if (!mv) return;
    setHintSquare(mv.slice(0, 2));
    if (!practice && !counted.current) setFeedback({ kind: "info", text: "Hint: move the highlighted piece. (Counts as a miss.)" });
    if (!practice) count(false);
  };

  /** Show the arrow for the move, then play out the rest of the line. */
  const showSolution = () => {
    if (!run) return;
    if (!practice) count(false);
    clearTimers();
    setBusy(true);
    setHintSquare(null);
    // From a failed run the board is at the position where the wrong move was tried.
    let r: PuzzleRun = { ...run, status: "failed" };
    const first = expectedMove(r);
    if (!first) return;
    setArrows([{ ...uciToPair(first), color: "var(--success)" }]);
    setFeedback({ kind: "info", text: "Solution" });
    const step = () => {
      const n = revealNext(r);
      if (!n) {
        setArrows([]);
        setBusy(false);
        setFeedback({ kind: "info", text: "That's the full solution. Retry it, or go to the next puzzle." });
        return;
      }
      r = n;
      setRun(n);
      setFen(n.fen);
      setLastMove(n.lastMove);
      const nx = expectedMove(n);
      setArrows(nx && n.ply % 2 === 0 ? [{ ...uciToPair(nx), color: "var(--success)" }] : []);
      later(SOLUTION_STEP_MS, step);
    };
    later(SOLUTION_STEP_MS, step);
  };

  const retry = () => {
    if (!initial) return;
    setPractice(true);
    setFeedback(null);
    playSetup(resetPuzzle(initial));
  };

  const finished = result !== null && (run?.status !== "playing" || practice);
  const canNext = counted.current || !run;

  // Keyboard: → or Enter = Next (once the puzzle counts).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.key === "ArrowRight" || e.key === "Enter") && canNext && !input.pendingPromotion) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [canNext, onNext, input.pendingPromotion]);

  const squareStyles = mergeStyles(
    lastMoveStyles(lastMove),
    hintSquare ? { [hintSquare]: { boxShadow: "inset 0 0 0 4px var(--accent)", background: "var(--accent-soft)" } } : null,
    input.inputStyles,
    flash && { [flash.square]: { background: flash.good ? "var(--highlight-good)" : "var(--highlight-bad)" } },
  );

  const revealTheme = result !== null;
  const board = (
    <div className="relative">
      <Board
        id={`drill-${item.puzzle.id}`}
        fen={fen}
        orientation={playerColor === "w" ? "white" : "black"}
        onMove={(from, to) => input.onDrop(from, to)}
        onSquareClick={input.onSquareClick}
        squareStyles={squareStyles}
        arrows={arrows}
        interactive={interactive}
      />
      {input.pendingPromotion && <PromotionPicker color={playerColor} onPick={input.choosePromotion} />}
    </div>
  );

  const panel = (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Puzzle</h1>
        <span className="rounded bg-surface-2 px-2 py-0.5 text-sm font-semibold tabular-nums text-muted" title="Puzzle rating">
          {item.puzzle.rating}
        </span>
      </div>
      {tracker}
      <div className="space-y-1.5">
        <SideToMove color={playerColor} />
        <div className="text-sm text-muted">
          Training: <span className="font-semibold text-text">{focusLabel(item.pattern)}</span>
        </div>
        <div className="text-sm text-muted">
          Theme:{" "}
          {revealTheme ? (
            <span className="font-semibold text-text">{themeLabel(item.theme)}</span>
          ) : (
            <span className="italic text-faint">Theme revealed after solving</span>
          )}
        </div>
      </div>

      <FeedbackLine feedback={feedback} />
      {!run && <p className="text-sm text-danger">This puzzle couldn&apos;t be loaded. Skip to the next one.</p>}

      {stats}

      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" onClick={hint} disabled={!interactive} icon={<IconBulb size={16} />}>
          Hint
        </Button>
        <Button variant="secondary" onClick={showSolution} disabled={!run || busy || run.status === "solved"}>
          Solution
        </Button>
        <Button variant="secondary" onClick={retry} disabled={!finished || busy} icon={<IconRefresh size={16} />}>
          Retry
        </Button>
      </div>
      <Button variant="primary" size="lg" block onClick={onNext} disabled={!canNext} icon={<IconArrowRight size={18} />}>
        Next
      </Button>
      <p className="-mt-2 text-center text-xs text-faint">Press → or Enter for the next puzzle</p>
      {notes}
    </>
  );

  return <TrainingLayout board={board} panel={panel} />;
}

export function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return <div className="min-h-11 text-sm text-faint">Find the best move.</div>;
  const good = feedback.kind === "correct" || feedback.kind === "solved";
  const bad = feedback.kind === "wrong";
  return (
    <div
      key={feedback.text}
      className={`bp-pop flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-[15px] font-bold ${
        good ? "bg-success/15 text-success" : bad ? "bg-danger/15 text-danger" : "bg-surface-2 text-muted"
      }`}
    >
      {good && <IconCheck size={18} />}
      {bad && <IconX size={18} />}
      {feedback.text}
    </div>
  );
}
