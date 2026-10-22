"use client";

import { Chess } from "chess.js";
import { useMemo, type CSSProperties } from "react";
import type { PlayerError } from "@/web/types";
import { Badge, LabelBadge, PatternBadge } from "./Badge";
import { cx, focusRing } from "./cx";
import { IconClock, IconExternal } from "./icons";
import { LazyBoard } from "./LazyBoard";
import { capitalize, formatClock, formatDate, moveRef } from "./reportStats";

function playedSquares(fen: string, san: string): Record<string, CSSProperties> {
  try {
    const m = new Chess(fen).move(san);
    const bg = { backgroundColor: "var(--highlight-bad)" };
    return { [m.from]: bg, [m.to]: bg };
  } catch {
    return {};
  }
}

export function BlunderRow({ error: e, index }: { error: PlayerError; index: number }) {
  const squares = useMemo(() => playedSquares(e.fenBefore, e.san), [e.fenBefore, e.san]);
  const drop = Math.round(e.winBefore - e.winAfter);
  return (
    <li className="flex flex-col gap-4 rounded-lg bg-surface p-3 shadow-[0_2px_8px_rgb(0_0_0/0.18)] sm:flex-row sm:p-4">
      <div className="w-full shrink-0 sm:w-[180px]">
        <LazyBoard
          id={`blunder-${index}`}
          fen={e.fenBefore}
          orientation={e.color === "w" ? "white" : "black"}
          squareStyles={squares}
          label={`Position before ${moveRef(e.moveNumber, e.color, e.san)} vs ${e.opponent}`}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1.5">
          <LabelBadge label={e.label} />
          <PatternBadge pattern={e.pattern} />
          <Badge>{capitalize(e.context.phase)}</Badge>
          <Badge icon={<IconClock size={12} />}>{formatClock(e.clockMs)} left</Badge>
          <Badge>{capitalize(e.timeClass)}</Badge>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-md bg-danger/10 px-3 py-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-danger">You played</div>
            <div className="font-mono text-lg font-bold">{moveRef(e.moveNumber, e.color, e.san)}</div>
          </div>
          <div className="rounded-md bg-success/10 px-3 py-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-success">Best move</div>
            <div className="font-mono text-lg font-bold">{e.bestMoveSan ?? "?"}</div>
          </div>
        </div>

        {e.explanation && <p className="mt-3 text-[15px] leading-snug text-muted">{e.explanation}</p>}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-3 text-sm">
          <span className="text-faint">
            vs <span className="font-semibold text-muted">{e.opponent}</span> · {formatDate(e.playedAt)}
          </span>
          <div className="flex items-center gap-3">
            <span className="tabular-nums text-faint" title="Your winning chances before and after the move">
              Win {Math.round(e.winBefore)}% → {Math.round(e.winAfter)}%{" "}
              <span className="font-bold text-danger">−{drop}</span>
            </span>
            <a
              href={e.gameUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cx("inline-flex items-center gap-1 rounded font-semibold text-accent hover:text-accent-hover", focusRing)}
            >
              View game
              <IconExternal size={14} />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </div>
      </div>
    </li>
  );
}
