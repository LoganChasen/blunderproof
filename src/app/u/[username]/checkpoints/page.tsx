"use client";

import { useMemo, useState } from "react";
import { useAnalysis } from "@/web/analysis/AnalysisProvider";
import type { CheckpointStatus } from "@/web/types";
import { AnalysisError, AnalysisProgressCard } from "@/web/ui/AnalysisStatus";
import { Button, ButtonLink } from "@/web/ui/Button";
import { cx, focusRing } from "@/web/ui/cx";
import { EmptyState } from "@/web/ui/EmptyState";
import { IconPositions, IconTrain } from "@/web/ui/icons";
import { PlayerHeader } from "@/web/ui/PlayerHeader";
import { PositionCard } from "@/web/ui/PositionCard";
import { ProgressBar } from "@/web/ui/ProgressBar";
import { positionRows } from "@/web/ui/reportStats";
import { useStoredActivity } from "@/web/ui/useStored";

type Tab = "all" | CheckpointStatus;
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "failed", label: "Failed" },
  { id: "conquered", label: "Conquered" },
];
const PAGE = 12;
const ORDER: Record<CheckpointStatus, number> = { failed: 0, pending: 1, conquered: 2 };

export default function CheckpointsPage() {
  const state = useAnalysis();
  const { username, profile, report, status } = state;
  const { progress } = useStoredActivity(username);
  const base = `/u/${encodeURIComponent(username)}`;
  const [tab, setTab] = useState<Tab>("all");
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(
    () =>
      positionRows(report?.checkpoints ?? [], progress).sort(
        (a, b) => ORDER[a.status] - ORDER[b.status] || b.checkpoint.playedAt.localeCompare(a.checkpoint.playedAt),
      ),
    [report, progress],
  );
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: rows.length, pending: 0, failed: 0, conquered: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);
  const visible = tab === "all" ? rows : rows.filter((r) => r.status === tab);
  const busy = status === "fetching" || status === "analyzing";

  return (
    <>
      <PlayerHeader username={username} profile={profile} title="My Positions" />
      {status === "error" ? (
        <AnalysisError state={state} />
      ) : (
        <>
          <AnalysisProgressCard state={state} />

          {rows.length > 0 && (
            <div className="mb-5 rounded-lg bg-surface p-4 shadow-[0_2px_8px_rgb(0_0_0/0.18)]">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-bold">
                  <span className="text-success">{counts.conquered}</span> of {rows.length} positions conquered
                </p>
                <p className="text-sm text-faint">Each one is the exact spot where you blundered in a real game.</p>
              </div>
              <ProgressBar tone="success" value={counts.conquered} max={rows.length} label="Positions conquered" />
            </div>
          )}

          {rows.length === 0 ? (
            busy || status === "idle" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-surface" />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<IconPositions size={26} />}
                title="No checkpoint positions yet"
                body="Checkpoints are blunders with one clear best move, so they make fair puzzles. Analyze more games to find some."
                action={
                  <Button onClick={() => state.analyzeMore(20)} disabled={!report}>
                    Analyze 20 more games
                  </Button>
                }
              />
            )
          ) : (
            <>
              <div role="tablist" aria-label="Filter positions by status" className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-surface p-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => {
                      setTab(t.id);
                      setShown(PAGE);
                    }}
                    className={cx(
                      "flex h-9 flex-1 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold whitespace-nowrap transition-colors",
                      focusRing,
                      tab === t.id ? "bg-surface-2 text-text shadow-[0_2px_0_rgb(0_0_0/0.25)]" : "text-faint hover:text-muted",
                    )}
                  >
                    {t.label}
                    <span className="rounded-full bg-black/25 px-1.5 text-xs tabular-nums">{counts[t.id]}</span>
                  </button>
                ))}
              </div>

              {visible.length === 0 ? (
                <p className="rounded-lg bg-surface p-8 text-center text-muted">
                  {tab === "conquered" ? "Nothing conquered yet. Checkpoints show up every 10 to 15 puzzles in training." : `No ${tab} positions.`}
                </p>
              ) : (
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visible.slice(0, shown).map((r, i) => (
                    <PositionCard key={r.id} row={r} index={i} trainHref={`${base}/train`} />
                  ))}
                </ul>
              )}
              {shown < visible.length && (
                <div className="mt-4 flex justify-center">
                  <Button variant="secondary" onClick={() => setShown((s) => s + PAGE)}>
                    Show more ({visible.length - shown} left)
                  </Button>
                </div>
              )}
              {counts.pending > 0 && (
                <div className="mt-6 flex justify-center">
                  <ButtonLink href={`${base}/train`} size="lg" icon={<IconTrain size={20} />}>
                    Train to unlock {counts.pending} pending
                  </ButtonLink>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
