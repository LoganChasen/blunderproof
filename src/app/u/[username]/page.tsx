"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PATTERN_LABEL } from "@/patterns/index";
import { OTHER_KIND_LABEL, type OtherKind } from "@/patterns/otherKind";
import { plainSummary } from "@/report";
import { useAnalysis } from "@/web/analysis/AnalysisProvider";
import { logEvent } from "@/web/metrics";
import type { Pattern } from "@/web/types";
import { AnalysisError, AnalysisProgressCard } from "@/web/ui/AnalysisStatus";
import { PATTERN_FILL } from "@/web/ui/Badge";
import { BarList } from "@/web/ui/BarList";
import { BlunderRow } from "@/web/ui/BlunderRow";
import { Button, ButtonLink } from "@/web/ui/Button";
import { Card, CardHeader } from "@/web/ui/Card";
import { cx, focusRing } from "@/web/ui/cx";
import { EmptyState } from "@/web/ui/EmptyState";
import { IconBulb, IconClock, IconPositions, IconRefresh, IconReport, IconTarget, IconTrain } from "@/web/ui/icons";
import { PlayerHeader } from "@/web/ui/PlayerHeader";
import { capitalize, overview, sortedBlunders } from "@/web/ui/reportStats";
import { StatTile } from "@/web/ui/StatTile";

const PAGE = 12;

export default function ReportPage() {
  const state = useAnalysis();
  const { username, status, profile, report } = state;
  const base = `/u/${encodeURIComponent(username)}`;

  const logged = useRef(false);
  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    logEvent("report_viewed", username);
  }, [username]);

  const busy = status === "fetching" || status === "analyzing";
  const ov = useMemo(() => (report ? overview(report) : null), [report]);
  const summary = useMemo(() => (report && report.games.length ? plainSummary(report) : null), [report]);

  const [filter, setFilter] = useState<Pattern | "all">("all");
  const [shown, setShown] = useState(PAGE);
  const blunders = useMemo(() => (report ? sortedBlunders(report.errors, filter) : []), [report, filter]);

  const header = (
    <PlayerHeader
      username={username}
      profile={profile}
      title="Blunder report"
      action={
        status === "done" && report && report.games.length > 0 ? (
          <Button variant="secondary" size="sm" onClick={state.refresh} icon={<IconRefresh size={15} />}>
            Check for new games
          </Button>
        ) : undefined
      }
    />
  );

  if (status === "error") {
    return (
      <>
        {header}
        <AnalysisError state={state} />
      </>
    );
  }

  if (status === "done" && (!report || report.games.length === 0)) {
    return (
      <>
        {header}
        <EmptyState
          icon={<IconReport size={26} />}
          title="No games to analyze yet"
          body={
            <>
              We only analyze recent rated live games (bullet, blitz and rapid) that lasted at least 10 moves. Play a few games on Chess.com,
              then come back.
            </>
          }
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={state.refresh} icon={<IconRefresh size={16} />}>
                Check again
              </Button>
              <ButtonLink href="/" variant="secondary">
                Try another username
              </ButtonLink>
            </div>
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      <AnalysisProgressCard state={state} />

      {!report || !ov ? (
        status === "idle" || busy ? <ReportSkeleton /> : null
      ) : (
        <div className="flex flex-col gap-6">
          {summary && (
            <div className="flex gap-3 rounded-lg bg-accent-soft p-4 sm:p-5">
              <IconBulb size={24} className="mt-0.5 shrink-0 text-accent" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-accent">The short version</p>
                <p className="mt-1 text-lg font-semibold leading-snug sm:text-xl">{summary}</p>
                {busy && <p className="mt-1 text-xs text-faint">Updating as more games finish.</p>}
              </div>
            </div>
          )}

          <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Games analyzed" value={ov.games} sub={busy ? "in progress" : `${totalSkipped(report.skipped)} skipped`} />
            <StatTile label="Blunders / game" value={ov.blundersPerGame} tone="danger" sub={`${ov.blunders} total`} />
            <StatTile label="Mistakes / game" value={ov.mistakesPerGame} tone="warning" sub={`${ov.mistakes} total`} />
            <StatTile label="Checkpoints" value={ov.checkpoints} tone="accent" sub="positions to beat" />
            <StatTile label="Unexplained" value={`${ov.unexplainedPct}%`} sub="of blunders are “other”" className="col-span-2 sm:col-span-1" />
          </section>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader icon={<IconTarget size={20} />} title="Why you blunder" subtitle={`${ov.blunders} blunders by pattern`} />
              <BarList
                items={ov.byPattern.map(([p, n]) => ({ label: PATTERN_LABEL[p], value: n, fillClass: PATTERN_FILL[p] }))}
                emptyText="No blunders yet."
              />
              {ov.byOtherKind.length > 0 && (
                <details className="mt-5 rounded-md bg-surface-2/60 p-3 [&[open]>summary>svg]:rotate-90">
                  <summary className={cx("flex cursor-pointer list-none items-center gap-2 rounded text-sm font-bold text-muted", focusRing)}>
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="transition-transform">
                      <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    Inside &ldquo;other&rdquo;: what we&apos;re still learning to detect
                  </summary>
                  <div className="mt-3">
                    <BarList
                      compact
                      items={ov.byOtherKind.map(([k, n]) => ({ label: OTHER_KIND_LABEL[k as OtherKind] ?? k, value: n, fillClass: "bg-faint" }))}
                    />
                  </div>
                </details>
              )}
            </Card>

            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader icon={<IconClock size={20} />} title="When" subtitle="Game phase" />
                <BarList compact items={ov.byPhase.map(([k, n]) => ({ label: capitalize(k), value: n }))} />
              </Card>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Card>
                  <h3 className="mb-3 text-sm font-extrabold">Clock left</h3>
                  <BarList compact items={ov.byClock.map(([k, n]) => ({ label: k === "unknown" ? "Unknown" : k, value: n, fillClass: "bg-info" }))} />
                </Card>
                <Card>
                  <h3 className="mb-3 text-sm font-extrabold">Time control</h3>
                  <BarList compact items={ov.byTimeClass.map(([k, n]) => ({ label: capitalize(k), value: n, fillClass: "bg-info" }))} />
                </Card>
              </div>
            </div>
          </div>

          <TrainCta base={base} checkpoints={ov.checkpoints} topPattern={ov.byPattern.find(([p]) => p !== "other")?.[0] ?? null} />

          <section aria-labelledby="your-blunders">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="your-blunders" className="text-2xl font-extrabold">
                  Your blunders
                </h2>
                <p className="text-sm text-faint">Worst first. The red squares show the move you played.</p>
              </div>
            </div>
            <div role="tablist" aria-label="Filter by pattern" className="mb-4 flex gap-2 overflow-x-auto pb-1">
              <FilterChip active={filter === "all"} onClick={() => (setFilter("all"), setShown(PAGE))} label="All" count={ov.blunders} />
              {ov.byPattern.map(([p, n]) => (
                <FilterChip key={p} active={filter === p} onClick={() => (setFilter(p), setShown(PAGE))} label={PATTERN_LABEL[p]} count={n} />
              ))}
            </div>
            {blunders.length === 0 ? (
              <Card className="text-center text-muted">No blunders here. {busy ? "Still analyzing..." : "Nice."}</Card>
            ) : (
              <>
                <ul className="flex flex-col gap-3">
                  {blunders.slice(0, shown).map((e, i) => (
                    <BlunderRow key={`${e.gameId}-${e.moveNumber}-${e.color}`} error={e} index={i} />
                  ))}
                </ul>
                {shown < blunders.length && (
                  <div className="mt-4 flex justify-center">
                    <Button variant="secondary" onClick={() => setShown((s) => s + PAGE)}>
                      Show more ({blunders.length - shown} left)
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>

          <Card raised className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-extrabold">Want a sharper picture?</h2>
              <p className="text-sm text-muted">More games means more reliable patterns and more checkpoint positions.</p>
            </div>
            <Button variant="secondary" disabled={busy} loading={busy} onClick={() => state.analyzeMore(20)}>
              Analyze 20 more games
            </Button>
          </Card>
        </div>
      )}
    </>
  );
}

function totalSkipped(s: Record<string, number>): number {
  return Object.values(s).reduce((a, b) => a + b, 0);
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-bold transition-colors",
        focusRing,
        active ? "bg-accent text-white" : "bg-surface-2 text-muted hover:bg-surface-3 hover:text-text",
      )}
    >
      {label}
      <span className={cx("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-white/20" : "bg-black/25")}>{count}</span>
    </button>
  );
}

function TrainCta({ base, checkpoints, topPattern }: { base: string; checkpoints: number; topPattern: Pattern | null }) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-surface p-5 shadow-[0_2px_8px_rgb(0_0_0/0.18)] sm:p-6">
      <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-accent-soft blur-2xl" aria-hidden="true" />
      <div className="relative flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
        <div className="flex items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-[0_3px_0_var(--accent-shade)] sm:flex">
            <IconTrain size={24} />
          </span>
          <div>
            <h2 className="text-xl font-black sm:text-2xl">Ready to fix this?</h2>
            <p className="mt-1 max-w-xl text-[15px] text-muted">
              Puzzles weighted toward {topPattern ? <strong className="text-text">{PATTERN_LABEL[topPattern].toLowerCase()}</strong> : "your weak spots"}
              , with checkpoints from your own games.{" "}
              {checkpoints > 0 && (
                <span className="inline-flex items-center gap-1 text-accent">
                  <IconPositions size={14} /> {checkpoints} positions waiting.
                </span>
              )}
            </p>
          </div>
        </div>
        <ButtonLink href={`${base}/train`} size="xl" className="w-full md:w-auto" icon={<IconTrain size={22} />}>
          Start training
        </ButtonLink>
      </div>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="h-24 animate-pulse rounded-lg bg-surface" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-surface" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="h-64 animate-pulse rounded-lg bg-surface" />
        <div className="h-64 animate-pulse rounded-lg bg-surface" />
      </div>
    </div>
  );
}
