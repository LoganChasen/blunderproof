"use client";
/** /u/[username]/train: drills weighted to the player's weaknesses, with a checkpoint every 10–15. */
import { Button, Spinner } from "../ui";
import { checkpointId } from "../types";
import { CheckpointPlayer } from "./CheckpointPlayer";
import { DrillPlayer } from "./DrillPlayer";
import { CheckpointTracker, SessionStats, TrainingStyles } from "./parts";
import { gapSize, type DrillItem } from "./session";
import { useTraining } from "./useTraining";

export function TrainingScreen({ username }: { username: string }) {
  const t = useTraining(username);
  const { analysis, session, item, phase, availability } = t;
  const analyzing = analysis.status === "idle" || analysis.status === "fetching" || analysis.status === "analyzing";

  if (!session || (phase !== "error" && !item)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted">
        <TrainingStyles />
        <Spinner size={28} />
        <p>{session ? "Loading puzzles…" : "Setting up your training…"}</p>
      </div>
    );
  }

  if (phase === "error" && !item) {
    return <PuzzleError message={t.error} onRetry={() => void t.advance()} />;
  }

  const onCheckpoint = item?.kind === "checkpoint";
  const due = session.progress.drillsUntilCheckpoint <= 0;
  let note: string | null = null;
  if (due && availability === "all-conquered") note = "All your positions are conquered 🎉";
  else if (due && availability === "none-yet")
    note = analyzing
      ? "No checkpoint positions yet (analysis still running)"
      : "No checkpoint positions yet (not enough blunders)";

  const tracker = (
    <CheckpointTracker total={gapSize(session)} remaining={session.progress.drillsUntilCheckpoint} onCheckpoint={onCheckpoint} note={note} />
  );
  const stats = (
    <SessionStats
      solved={session.solved}
      attempted={session.attempted}
      streak={session.streak}
      rating={session.progress.puzzleRating}
      delta={t.lastDelta}
    />
  );
  const notes = (
    <div className="space-y-2 text-xs text-faint">
      {analyzing && (
        <p className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-muted">
          <Spinner size={14} />
          Analyzing your games… checkpoints unlock as games finish
          {analysis.progress.total > 0 && ` (${analysis.progress.done}/${analysis.progress.total})`}
        </p>
      )}
      {analysis.status === "error" && (
        <p className="rounded-md bg-surface-2 px-3 py-2 text-muted">
          Couldn&apos;t analyze games{analysis.error ? `: ${analysis.error}` : ""}. Drills use a balanced mix for now.
        </p>
      )}
      {phase === "error" && <PuzzleErrorInline message={t.error} onRetry={() => void t.advance()} />}
      {phase === "loading" && (
        <p className="flex items-center gap-2">
          <Spinner size={12} /> Loading next puzzle…
        </p>
      )}
    </div>
  );

  const next = () => void t.advance();

  return (
    <>
      <TrainingStyles />
      {item?.kind === "drill" && (
        <DrillPlayer
          key={`d:${item.puzzle.id}`}
          item={item}
          onComplete={(solved) => t.finishDrill(item as DrillItem, solved)}
          onNext={next}
          tracker={tracker}
          stats={stats}
          notes={notes}
        />
      )}
      {item?.kind === "checkpoint" && (
        <CheckpointPlayer
          key={`c:${checkpointId(item.checkpoint)}:${session.checkpointsAttempted}`}
          checkpoint={item.checkpoint}
          onAttempt={(uci) => t.finishCheckpoint(item.checkpoint, uci)}
          onNext={next}
          tracker={tracker}
          stats={stats}
          notes={notes}
        />
      )}
    </>
  );
}

function PuzzleError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-xl font-bold">Couldn&apos;t load puzzles</h1>
      <p className="text-sm text-muted">{message ?? "Something went wrong fetching puzzles."} Check your connection and try again.</p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}

function PuzzleErrorInline({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-danger/15 px-3 py-2 text-danger">
      <span>Couldn&apos;t load the next puzzle{message ? `: ${message}` : ""}</span>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
