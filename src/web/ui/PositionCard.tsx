"use client";

import { Chess } from "chess.js";
import type { CheckpointStatus } from "@/web/types";
import { Badge, PatternBadge } from "./Badge";
import { ButtonLink } from "./Button";
import { cx, focusRing } from "./cx";
import { IconCheck, IconClock, IconExternal, IconTarget, IconX } from "./icons";
import { LazyBoard } from "./LazyBoard";
import { capitalize, formatClock, formatDate, sanForUci, type PositionRow } from "./reportStats";

const STATUS: Record<CheckpointStatus, { label: string; tone: "accent" | "danger" | "success"; ring: string }> = {
  pending: { label: "Pending", tone: "accent", ring: "" },
  failed: { label: "Failed", tone: "danger", ring: "ring-2 ring-danger/40" },
  conquered: { label: "Conquered", tone: "success", ring: "ring-2 ring-success/40" },
};

function uciToSan(fen: string, uci: string): string | null {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return null;
  }
}

export function PositionCard({ row, index, trainHref }: { row: PositionRow; index: number; trainHref: string }) {
  const cp = row.checkpoint;
  const s = STATUS[row.status];
  const toMove = cp.color === "w" ? "White" : "Black";
  const found = row.status === "conquered" && row.movesTried.length > 0 ? row.movesTried.at(-1)! : null;
  const foundSan = found ? (sanForUci(cp, found) ?? uciToSan(cp.fen, found) ?? found) : null;

  return (
    <li className={cx("flex flex-col rounded-lg bg-surface p-3 shadow-[0_2px_8px_rgb(0_0_0/0.18)]", s.ring)}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <Badge tone={s.tone} icon={row.status === "conquered" ? <IconCheck size={12} /> : row.status === "failed" ? <IconX size={12} /> : <IconTarget size={12} />}>
          {s.label}
        </Badge>
        <span className="text-xs font-semibold text-faint">
          {toMove} to play · move {cp.moveNumber}
        </span>
      </div>
      <LazyBoard
        id={`cp-${index}`}
        fen={cp.fen}
        orientation={cp.color === "w" ? "white" : "black"}
        label={`Checkpoint position from your game vs ${cp.opponent}, ${toMove} to play`}
      />
      <div className="mt-3 flex flex-1 flex-col">
        <p className="font-bold leading-snug">
          From your game vs {cp.opponent}, <span className="font-semibold text-muted">{formatDate(cp.playedAt)}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <PatternBadge pattern={cp.pattern} />
          <Badge icon={<IconClock size={12} />}>{formatClock(cp.clockMs)} on clock</Badge>
          <Badge>{capitalize(cp.timeClass)}</Badge>
          <Badge>
            {row.attempts} attempt{row.attempts === 1 ? "" : "s"}
          </Badge>
        </div>

        <div className="mt-3 text-sm">
          {row.status === "conquered" && (
            <p className="rounded-md bg-success/10 px-3 py-2 text-muted">
              You found <span className="font-mono font-bold text-success">{foundSan ?? cp.bestMoveSan}</span>
              {foundSan && foundSan !== cp.bestMoveSan ? <> (engine&apos;s top: {cp.bestMoveSan})</> : null}. In the game you played{" "}
              <span className="font-mono">{cp.movePlayedSan}</span>.
            </p>
          )}
          {row.status === "failed" && (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-muted">
              Best move <span className="font-mono font-bold text-text">{cp.bestMoveSan}</span>. In the game you played{" "}
              <span className="font-mono">{cp.movePlayedSan}</span>. It&apos;s back in your queue.
            </p>
          )}
          {row.status === "pending" && (
            <p className="rounded-md bg-accent-soft px-3 py-2 text-muted">You blundered here. Can you find the move now?</p>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <a
            href={cp.gameUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cx("inline-flex items-center gap-1 rounded text-sm font-semibold text-accent hover:text-accent-hover", focusRing)}
          >
            View game <IconExternal size={13} />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          {row.status !== "conquered" && (
            <ButtonLink href={trainHref} size="sm" variant={row.status === "failed" ? "secondary" : "primary"}>
              {row.status === "failed" ? "Retry in training" : "Train"}
            </ButtonLink>
          )}
        </div>
      </div>
    </li>
  );
}
