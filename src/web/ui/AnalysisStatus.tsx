"use client";

import type { AnalysisState } from "@/web/types";
import { ButtonLink, Button } from "./Button";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { IconAlert, IconRefresh, IconSearch } from "./icons";
import { ProgressBar } from "./ProgressBar";
import { Spinner } from "./Spinner";

/** "Analyzing your games, 7 of 20, vs Knuuuugen (bullet)" with a progress bar. */
export function AnalysisProgressCard({ state }: { state: AnalysisState }) {
  const { status, progress } = state;
  if (status !== "fetching" && status !== "analyzing") return null;
  const fetching = status === "fetching";
  const pct = progress.total ? Math.round((100 * progress.done) / progress.total) : 0;
  return (
    <Card className="mb-6 border-l-4 border-accent" aria-live="polite">
      <div className="flex items-start gap-3">
        <Spinner size={22} className="mt-0.5 shrink-0 text-accent" label="Analysis in progress" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-lg font-extrabold">
              {fetching ? "Fetching your games from Chess.com" : `Analyzing your games, ${progress.done} of ${progress.total}`}
            </h2>
            {!fetching && <span className="text-sm font-bold tabular-nums text-accent">{pct}%</span>}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted">
            {fetching ? "Pulling your recent live games..." : progress.current ? progress.current : "Warming up the engine..."}
          </p>
          <ProgressBar className="mt-3" value={progress.done} max={Math.max(1, progress.total)} indeterminate={fetching} label="Analysis progress" />
          <p className="mt-2 text-xs text-faint">
            Stockfish runs in this tab. Results appear below as each game finishes, and finished games are cached for next time.
          </p>
        </div>
      </div>
    </Card>
  );
}

const NOT_FOUND = /not.?found|couldn.?t find|no such|unknown user|404|check the spelling/i;

export function AnalysisError({ state }: { state: AnalysisState }) {
  const notFound = NOT_FOUND.test(state.error ?? "");
  return (
    <EmptyState
      icon={notFound ? <IconSearch size={26} /> : <IconAlert size={26} />}
      title={notFound ? `We couldn't find "${state.username}"` : "Something went wrong"}
      body={
        notFound ? (
          <>Double-check the spelling of the Chess.com username. Closed accounts and accounts with no public games won&apos;t show up.</>
        ) : (
          <>{state.error ?? "The analysis stopped unexpectedly."} Try again in a moment.</>
        )
      }
      action={
        <div className="flex flex-wrap justify-center gap-3">
          {!notFound && (
            <Button onClick={state.refresh} icon={<IconRefresh size={16} />}>
              Try again
            </Button>
          )}
          <ButtonLink href="/" variant={notFound ? "primary" : "secondary"}>
            Try another username
          </ButtonLink>
        </div>
      }
    />
  );
}
