"use client";

import { useMemo } from "react";
import { useAnalysis } from "@/web/analysis/AnalysisProvider";
import { BarList } from "@/web/ui/BarList";
import { ButtonLink } from "@/web/ui/Button";
import { Card, CardHeader } from "@/web/ui/Card";
import { ColumnChart } from "@/web/ui/ColumnChart";
import { IconFlame, IconPositions, IconPuzzle, IconStats, IconTrain } from "@/web/ui/icons";
import { PlayerHeader } from "@/web/ui/PlayerHeader";
import { blundersOverTime, formatDate, pct, summarizeEvents } from "@/web/ui/reportStats";
import { StatTile } from "@/web/ui/StatTile";
import { useStoredActivity } from "@/web/ui/useStored";

export default function StatsPage() {
  const { username, profile, games, status } = useAnalysis();
  const { ready, events, progress } = useStoredActivity(username);
  const base = `/u/${encodeURIComponent(username)}`;

  const ev = useMemo(() => summarizeEvents(events), [events]);
  const series = useMemo(() => blundersOverTime(games), [games]);

  // Prefer the training module's counters; fall back to the event log.
  const puzzlesAttempted = progress?.puzzlesAttempted || ev.puzzlesAttempted;
  const puzzlesSolved = progress?.puzzlesSolved || ev.puzzlesSolved;
  const cpRows = progress ? Object.values(progress.checkpoints) : [];
  const cpAttempted = cpRows.filter((c) => c.attempts > 0).length || ev.checkpointsAttempted;
  const cpPassed = cpRows.filter((c) => c.status === "conquered").length || ev.checkpointsPassed;
  const sessions = progress?.sessions || ev.sessions;

  const totalBlunders = series.points.reduce((s, p) => s + p.blunders, 0);
  const totalGames = series.points.reduce((s, p) => s + p.games, 0);
  const avg = totalGames ? totalBlunders / totalGames : 0;
  const trend = useMemo(() => {
    const pts = series.points;
    if (pts.length < 4) return null;
    const half = Math.floor(pts.length / 2);
    const mean = (xs: typeof pts) => xs.reduce((s, p) => s + p.blunders, 0) / Math.max(1, xs.reduce((s, p) => s + p.games, 0));
    return { early: mean(pts.slice(0, half)), late: mean(pts.slice(half)) };
  }, [series]);

  const funnel = [
    { label: "Viewed report", value: ev.reportViews },
    { label: "Started a session", value: ev.sessions },
    { label: "Attempted a puzzle", value: ev.puzzlesAttempted },
    { label: "Solved a puzzle", value: ev.puzzlesSolved },
    { label: "Attempted a checkpoint", value: ev.checkpointsAttempted },
    { label: "Passed a checkpoint", value: ev.checkpointsPassed },
  ];
  const noActivity = ready && events.length === 0 && !progress;

  return (
    <>
      <PlayerHeader username={username} profile={profile} title="Stats" />

      {noActivity && (
        <Card raised className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-extrabold">No training yet</h2>
            <p className="text-sm text-muted">Your puzzle and checkpoint numbers will show up here after your first session.</p>
          </div>
          <ButtonLink href={`${base}/train`} icon={<IconTrain size={18} />}>
            Start training
          </ButtonLink>
        </Card>
      )}

      <section aria-labelledby="training-h" className="mb-6">
        <h2 id="training-h" className="mb-3 text-lg font-extrabold">
          Training
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Sessions" value={ready ? sessions : "–"} icon={<IconTrain size={13} />} sub={ev.lastSeen ? `last ${formatDate(ev.lastSeen)}` : "none yet"} />
          <StatTile
            label="Puzzles solved"
            value={ready ? puzzlesSolved : "–"}
            icon={<IconPuzzle size={13} />}
            sub={`of ${puzzlesAttempted} attempted`}
          />
          <StatTile
            label="Puzzle accuracy"
            value={ready && puzzlesAttempted ? `${pct(puzzlesSolved, puzzlesAttempted)}%` : "–"}
            tone={puzzlesAttempted ? "success" : "neutral"}
            sub="solved ÷ attempted"
          />
          <StatTile
            label="Puzzle rating"
            value={ready && progress?.puzzleRating ? Math.round(progress.puzzleRating) : "–"}
            tone="accent"
            sub="adapts as you solve"
          />
          <StatTile
            label="Checkpoints passed"
            value={ready ? cpPassed : "–"}
            icon={<IconPositions size={13} />}
            sub={`of ${cpAttempted} attempted`}
          />
          <StatTile
            label="Checkpoint pass rate"
            value={ready && cpAttempted ? `${pct(cpPassed, cpAttempted)}%` : "–"}
            tone={cpAttempted ? "success" : "neutral"}
            sub="your own positions"
          />
          <StatTile label="Best streak" value={ready ? (progress?.bestStreak ?? 0) : "–"} icon={<IconFlame size={13} />} tone="warning" sub="puzzles in a row" />
          <StatTile label="Return visits" value={ready ? ev.returnVisits : "–"} sub={`${ev.activeDays} active day${ev.activeDays === 1 ? "" : "s"}`} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            icon={<IconStats size={20} />}
            title="Blunders per game over time"
            subtitle={
              series.points.length === 0
                ? "Waiting for analyzed games"
                : series.mode === "day"
                  ? `${totalGames} games, grouped by day`
                  : `${totalGames} games in order played (they span less than 3 days)`
            }
            action={
              trend ? (
                <span
                  className={`rounded-md px-2 py-1 text-xs font-bold ${trend.late <= trend.early ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}
                  title="Blunders per game, older half vs newer half"
                >
                  {trend.late <= trend.early ? "▼" : "▲"} {trend.early.toFixed(1)} → {trend.late.toFixed(1)}
                </span>
              ) : undefined
            }
          />
          {series.points.length === 0 ? (
            <p className="py-12 text-center text-sm text-faint">
              {status === "fetching" || status === "analyzing" ? "Analyzing your games..." : "No analyzed games yet."}
            </p>
          ) : (
            <ColumnChart
              data={series.points}
              average={avg}
              yLabel="Blunders per game"
              xLabel={series.mode === "day" ? "Date" : "Game"}
              format={(v) => (series.mode === "game" ? String(Math.round(v)) : v.toFixed(1))}
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Activity funnel" subtitle="Events logged in this browser" />
          <BarList compact items={funnel} total={Math.max(1, ...funnel.map((f) => f.value))} emptyText="No events yet." />
          <p className="mt-4 text-xs leading-relaxed text-faint">
            Share = count relative to the largest step. Metrics live in this browser&apos;s local storage until accounts arrive.
            {ev.firstSeen && <> First activity {formatDate(ev.firstSeen)}.</>}
          </p>
        </Card>
      </div>
    </>
  );
}
