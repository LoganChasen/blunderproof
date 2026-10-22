"use client";
/** Small presentational pieces for the training screen. */
import type { ReactNode } from "react";
import { cx } from "../ui";
import type { Color, PromotionPiece } from "./puzzleLogic";

/** Board left/center, panel right; panel stacks under the board on mobile. */
export function TrainingLayout({ board, panel, checkpoint = false }: { board: ReactNode; panel: ReactNode; checkpoint?: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 lg:flex-row lg:items-start">
      <div
        className={cx(
          "relative w-full min-w-0 lg:max-w-[min(calc(100vh-7rem),760px)] lg:flex-1",
          checkpoint && "rounded-md p-1.5 ring-2 ring-accent shadow-[0_0_32px_var(--accent-soft)]",
        )}
      >
        {board}
      </div>
      <aside
        className={cx(
          "flex w-full flex-col gap-4 rounded-lg bg-surface p-4 lg:w-[360px] lg:shrink-0",
          checkpoint && "ring-1 ring-accent/60",
        )}
      >
        {panel}
      </aside>
    </div>
  );
}

export function SideToMove({ color }: { color: Color }) {
  return (
    <div className="flex items-center gap-2 text-[15px] font-semibold">
      <span className={cx("inline-block h-4 w-4 rounded-[3px] border border-border", color === "w" ? "bg-white" : "bg-black")} />
      {color === "w" ? "White" : "Black"} to move
    </div>
  );
}

/**
 * The signature feature: a row of 10–15 segments that fill as drills complete.
 * `total` = size of the current gap, `remaining` = drills left before the checkpoint.
 */
export function CheckpointTracker({
  total,
  remaining,
  onCheckpoint,
  note,
}: {
  total: number;
  remaining: number;
  onCheckpoint: boolean;
  /** Shown when the checkpoint is due but none is available. */
  note: string | null;
}) {
  const done = Math.max(0, total - remaining);
  const label = onCheckpoint
    ? "Checkpoint now"
    : remaining <= 0
      ? note
        ? "Checkpoint due"
        : "Checkpoint next!"
      : remaining === 1
        ? "Checkpoint next!"
        : `Checkpoint in ${remaining}`;
  return (
    <div className="rounded-md bg-surface-2 p-3" aria-label={`${label}. ${done} of ${total} drills done.`}>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-bold text-accent">{label}</span>
        <span className="text-faint tabular-nums">
          {Math.min(done, total)}/{total}
        </span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => {
          const filled = onCheckpoint || i < done;
          const next = !onCheckpoint && i === done;
          return (
            <span
              key={i}
              className={cx(
                "h-2.5 flex-1 rounded-full transition-all duration-500",
                filled ? "bg-accent shadow-[0_0_8px_var(--accent-soft)]" : "bg-surface-3",
                next && "animate-pulse bg-accent/40",
              )}
            />
          );
        })}
      </div>
      {note && remaining <= 0 && !onCheckpoint && <p className="mt-2 text-xs text-muted">{note}</p>}
    </div>
  );
}

export function SessionStats({
  solved,
  attempted,
  streak,
  rating,
  delta,
}: {
  solved: number;
  attempted: number;
  streak: number;
  rating: number;
  delta: { delta: number; key: number } | null;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <Stat label="Solved" value={`${solved}/${attempted}`} />
      <Stat label="Streak" value={streak > 0 ? `🔥 ${streak}` : "0"} />
      <div className="relative rounded-md bg-surface-2 px-2 py-2">
        <div className="text-lg font-bold tabular-nums">{rating}</div>
        <div className="text-[11px] uppercase tracking-wide text-faint">Puzzle rating</div>
        {delta && delta.delta !== 0 && (
          <span
            key={delta.key}
            className={cx(
              "bp-delta absolute -top-2 right-1 rounded px-1.5 text-xs font-bold tabular-nums",
              delta.delta > 0 ? "bg-success text-white" : "bg-danger text-white",
            )}
          >
            {delta.delta > 0 ? `+${delta.delta}` : delta.delta}
          </span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-2 py-2">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
    </div>
  );
}

const PROMO: { piece: PromotionPiece; w: string; b: string; name: string }[] = [
  { piece: "q", w: "♕", b: "♛", name: "Queen" },
  { piece: "r", w: "♖", b: "♜", name: "Rook" },
  { piece: "b", w: "♗", b: "♝", name: "Bishop" },
  { piece: "n", w: "♘", b: "♞", name: "Knight" },
];

/** Overlay on the board: pick the promotion piece (underpromotion puzzles exist). */
export function PromotionPicker({ color, onPick }: { color: Color; onPick: (p: PromotionPiece | null) => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50" onClick={() => onPick(null)}>
      <div className="rounded-lg bg-surface p-3 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Choose promotion piece">
        <div className="mb-2 text-center text-sm font-semibold text-muted">Promote to</div>
        <div className="flex gap-2">
          {PROMO.map((p) => (
            <button
              key={p.piece}
              type="button"
              autoFocus={p.piece === "q"}
              title={p.name}
              aria-label={p.name}
              onClick={() => onPick(p.piece)}
              className="flex h-16 w-16 items-center justify-center rounded-md bg-surface-2 text-5xl leading-none text-text hover:bg-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              {color === "w" ? p.w : p.b}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** CSS-only confetti burst. */
export function Confetti() {
  const colors = ["bg-accent", "bg-success", "bg-warning", "bg-info", "bg-accent-hover"];
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className={cx("bp-confetti absolute top-0 h-2.5 w-1.5 rounded-[1px]", colors[i % colors.length])}
          style={{
            left: `${(i * 37) % 100}%`,
            animationDelay: `${(i % 7) * 60}ms`,
            animationDuration: `${1100 + ((i * 53) % 700)}ms`,
            ["--bp-drift" as string]: `${((i * 29) % 80) - 40}px`,
            ["--bp-rot" as string]: `${(i * 67) % 720}deg`,
          }}
        />
      ))}
    </div>
  );
}

/** Keyframes used by the training screen (globals.css is shared, so they live here). */
export function TrainingStyles() {
  return (
    <style>{`
@keyframes bp-fall { 0% { transform: translate(0,-10px) rotate(0); opacity: 1 } 100% { transform: translate(var(--bp-drift), 520px) rotate(var(--bp-rot)); opacity: 0 } }
.bp-confetti { animation-name: bp-fall; animation-timing-function: cubic-bezier(.2,.6,.4,1); animation-fill-mode: forwards; }
@keyframes bp-rise { 0% { transform: translateY(4px); opacity: 0 } 15% { transform: translateY(0); opacity: 1 } 80% { opacity: 1 } 100% { transform: translateY(-10px); opacity: 0 } }
.bp-delta { animation: bp-rise 1.8s ease-out forwards; }
@keyframes bp-pop { 0% { transform: scale(.9); opacity: 0 } 60% { transform: scale(1.04); opacity: 1 } 100% { transform: scale(1) } }
.bp-pop { animation: bp-pop .28s ease-out; }
@media (prefers-reduced-motion: reduce) { .bp-confetti, .bp-delta, .bp-pop { animation: none !important; } .bp-confetti { display: none; } }
`}</style>
  );
}

export function TargetIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
