"use client";
/** A checkpoint: the exact position from the player's own game right before they blundered. One move. */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Board, type BoardArrow } from "../board/Board";
import { Button, ButtonLink, IconArrowRight, IconExternal } from "../ui";
import { applyUci, sanOf, uciToPair, type SquarePair } from "./puzzleLogic";
import { FeedbackLine, focusLabel } from "./DrillPlayer";
import { Confetti, PromotionPicker, SideToMove, TargetIcon, TrainingLayout } from "./parts";
import type { CheckpointEntry } from "./session";
import { lastMoveStyles, mergeStyles, useMoveInput } from "./useMoveInput";

export function formatClock(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function formatGameDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const TIME_CLASS: Record<string, string> = { bullet: "Bullet", blitz: "Blitz", rapid: "Rapid", daily: "Daily" };

export function checkpointBanner(cp: CheckpointEntry): string {
  const parts = [`From your game vs ${cp.opponent}, ${formatGameDate(cp.playedAt)}`, TIME_CLASS[cp.timeClass] ?? cp.timeClass];
  const clock = formatClock(cp.clockMs);
  if (clock) parts.push(`${clock} on your clock`);
  return parts.join(" · ");
}

export function CheckpointPlayer({
  checkpoint: cp,
  onAttempt,
  onNext,
  tracker,
  stats,
  notes,
}: {
  checkpoint: CheckpointEntry;
  /** Records the attempt (pass rule applied by the session). Returns whether it passed. */
  onAttempt: (uci: string) => boolean;
  onNext: () => void;
  tracker: ReactNode;
  stats: ReactNode;
  notes?: ReactNode;
}) {
  const [played, setPlayed] = useState<{ uci: string; passed: boolean } | null>(null);
  const [showGameMove, setShowGameMove] = useState(false);
  const [fen, setFen] = useState(cp.fen);
  const [lastMove, setLastMove] = useState<SquarePair | null>(null);

  const onMove = useCallback(
    (uci: string): boolean => {
      if (played) return false;
      const after = applyUci(cp.fen, uci);
      if (!after) return false;
      const passed = onAttempt(uci);
      setPlayed({ uci, passed });
      setFen(after.fen);
      setLastMove(uciToPair(uci));
      return true;
    },
    [played, cp, onAttempt],
  );

  // After a failed attempt, return to the position to show the arrows.
  useEffect(() => {
    if (!played || played.passed) return;
    const t = setTimeout(() => {
      setFen(cp.fen);
      setLastMove(null);
    }, 900);
    return () => clearTimeout(t);
  }, [played, cp.fen]);

  // "Replay my game move" toggle.
  useEffect(() => {
    if (!played) return;
    if (showGameMove) {
      const after = applyUci(cp.fen, cp.movePlayed);
      if (after) {
        setFen(after.fen);
        setLastMove(uciToPair(cp.movePlayed));
      }
    } else if (!played.passed) {
      setFen(cp.fen);
      setLastMove(null);
    } else {
      const after = applyUci(cp.fen, played.uci);
      if (after) {
        setFen(after.fen);
        setLastMove(uciToPair(played.uci));
      }
    }
  }, [showGameMove, played, cp.fen, cp.movePlayed]);

  const input = useMoveInput({ fen, color: cp.color, interactive: !played, onMove });

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.key === "ArrowRight" || e.key === "Enter") && played && !input.pendingPromotion) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [played, onNext, input.pendingPromotion]);

  const arrows: BoardArrow[] = [];
  if (played && !played.passed && !showGameMove && fen === cp.fen) {
    arrows.push({ ...uciToPair(cp.bestMove), color: "var(--success)" });
    if (played.uci !== cp.movePlayed) arrows.push({ ...uciToPair(played.uci), color: "var(--danger)" });
    arrows.push({ ...uciToPair(cp.movePlayed), color: "var(--warning)" });
  }

  const flash =
    played && lastMove && fen !== cp.fen && !showGameMove
      ? { [lastMove.to]: { background: played.passed ? "var(--highlight-good)" : "var(--highlight-bad)" } }
      : null;
  const squareStyles = mergeStyles(lastMoveStyles(lastMove), input.inputStyles, flash);

  const board = (
    <div className="relative">
      <Board
        id={`checkpoint-${cp.gameId}`}
        fen={fen}
        orientation={cp.color === "w" ? "white" : "black"}
        onMove={(from, to) => input.onDrop(from, to)}
        onSquareClick={input.onSquareClick}
        squareStyles={squareStyles}
        arrows={arrows}
        interactive={!played}
      />
      {input.pendingPromotion && <PromotionPicker color={cp.color} onPick={input.choosePromotion} />}
      {played?.passed && <Confetti />}
    </div>
  );

  const yourSan = played ? sanOf(cp.fen, played.uci) : "";
  const panel = (
    <>
      <div className="flex items-center gap-2 text-accent">
        <TargetIcon />
        <h1 className="text-xl font-extrabold tracking-wide">CHECKPOINT</h1>
      </div>
      {tracker}
      <div className="rounded-md border border-accent/50 bg-accent-soft px-3 py-2 text-sm font-semibold text-text">{checkpointBanner(cp)}</div>
      <div className="space-y-1.5">
        <SideToMove color={cp.color} />
        <div className="text-sm text-muted">
          Pattern: <span className="font-semibold text-text">{focusLabel(cp.pattern)}</span>
        </div>
      </div>

      {!played && <p className="text-[15px] font-semibold">You blundered here. Find the best move.</p>}
      {played?.passed && (
        <div className="bp-pop rounded-md bg-success/15 px-3 py-3">
          <div className="text-xl font-extrabold text-success">Conquered!</div>
          <p className="mt-1 text-sm text-muted">
            {yourSan === cp.bestMoveSan ? `${yourSan} is the best move.` : `${yourSan} is right up there with the best move, ${cp.bestMoveSan}.`} In the game you played{" "}
            {cp.movePlayedSan}.
          </p>
        </div>
      )}
      {played && !played.passed && (
        <FeedbackLine feedback={{ kind: "wrong", text: `Not quite. The best move was ${cp.bestMoveSan}.` }} />
      )}
      {played && (
        <div className="space-y-2 text-sm">
          {cp.explanation && (
            <p className="text-muted">
              <span className="font-semibold text-text">Your blunder: </span>
              {cp.explanation}
            </p>
          )}
          {!played.passed && (
            <ul className="space-y-1 text-muted">
              <Legend tone="bg-success" text={`Best move: ${cp.bestMoveSan}`} />
              {played.uci !== cp.movePlayed && <Legend tone="bg-danger" text={`Your move: ${yourSan}`} />}
              <Legend tone="bg-warning" text={`Played in the game: ${cp.movePlayedSan}`} />
            </ul>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-muted">
            <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={showGameMove} onChange={(e) => setShowGameMove(e.target.checked)} />
            Replay my game move ({cp.movePlayedSan})
          </label>
          {!played.passed && <p className="font-semibold text-accent">Back in the queue: this position will return.</p>}
        </div>
      )}

      {stats}

      <div className="flex flex-col gap-2">
        {played && (
          <ButtonLink href={cp.gameUrl} variant="secondary" icon={<IconExternal size={16} />}>
            View the game
          </ButtonLink>
        )}
        <Button variant="primary" size="lg" block onClick={onNext} disabled={!played} icon={<IconArrowRight size={18} />}>
          Next
        </Button>
      </div>
      {notes}
    </>
  );

  return <TrainingLayout board={board} panel={panel} checkpoint />;
}

function Legend({ tone, text }: { tone: string; text: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${tone}`} />
      {text}
    </li>
  );
}
