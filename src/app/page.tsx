"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Board } from "@/web/board/Board";
import { Button } from "@/web/ui/Button";
import { Card } from "@/web/ui/Card";
import { cx, focusRing } from "@/web/ui/cx";
import { Footer } from "@/web/ui/Footer";
import { IconArrowRight, IconGithub, IconPositions, IconSearch, IconTarget, IconTrain } from "@/web/ui/icons";
import { Logo } from "@/web/ui/Logo";
import { pushRecent, readRecent, USERNAME_RE } from "@/web/ui/storage";

/** Morphy vs Duke Karl / Count Isouard, Paris 1858 ("the Opera Game"), before 17.Rd8#. */
const HERO_FEN = "1n2kb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2KR4 w k - 0 17";

const STEPS = [
  {
    icon: IconSearch,
    title: "We find your blunders",
    body: "Enter your Chess.com username. Stockfish runs right in your browser and checks every move of your recent games.",
  },
  {
    icon: IconTarget,
    title: "You see why they happen",
    body: "Hanging pieces, missed captures, back-rank mates. See which patterns cost you, in which phase, and how much clock you had left.",
  },
  {
    icon: IconTrain,
    title: "You beat them for good",
    body: "Puzzles weighted to your weak spots, then a checkpoint: the exact position you lost in. Find the move to conquer it.",
  },
];

export default function Home() {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => setRecent(readRecent()), []);

  function go(name: string) {
    pushRecent(name);
    setSubmitting(true);
    router.push(`/u/${encodeURIComponent(name)}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!USERNAME_RE.test(name)) {
      setError(
        name.length === 0
          ? "Enter your Chess.com username."
          : "Usernames are 2 to 30 characters: letters, numbers, underscores and hyphens.",
      );
      return;
    }
    setError(null);
    go(name);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-16 items-center justify-between px-4 sm:px-8">
        <Link href="/" className={cx("rounded", focusRing)} aria-label="Blunderproof home">
          <Logo size={30} />
        </Link>
        <a
          href="https://github.com/LoganChasen/blunderproof"
          target="_blank"
          rel="noopener noreferrer"
          className={cx("inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-text", focusRing)}
        >
          <IconGithub size={18} />
          <span className="hidden sm:inline">GitHub</span>
        </a>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-8">
        {/* Hero */}
        <section className="grid items-center gap-10 py-8 md:grid-cols-[1.1fr_1fr] md:gap-14 md:py-16">
          <div className="min-w-0">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">
              Free · Runs in your browser
            </p>
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Stop making the <span className="text-accent">same blunders.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Other trainers give you puzzles. Blunderproof drills your weak patterns, then makes you beat the exact positions you lost in.
            </p>

            <form onSubmit={onSubmit} noValidate className="mt-8 max-w-xl">
              <label htmlFor={inputId} className="mb-2 block text-sm font-bold text-muted">
                Chess.com username
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id={inputId}
                  name="username"
                  type="text"
                  inputMode="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="e.g. hikaru"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (error) setError(null);
                  }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  className={cx(
                    "h-14 min-w-0 flex-1 rounded-md border-2 bg-surface-2 px-4 text-lg font-semibold text-text placeholder:text-faint",
                    "outline-none transition-colors focus:border-accent",
                    error ? "border-danger" : "border-transparent",
                  )}
                />
                <Button type="submit" size="lg" loading={submitting} className="h-14 px-7 text-lg" icon={!submitting && <IconArrowRight size={20} />}>
                  Analyze my games
                </Button>
              </div>
              <p id={errorId} role="alert" className={cx("mt-2 min-h-5 text-sm font-semibold text-danger", !error && "invisible")}>
                {error ?? " "}
              </p>
            </form>

            {recent.length > 0 && (
              <div className="mt-2 max-w-xl">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-faint">Recently analyzed</h2>
                <ul className="flex flex-wrap gap-2">
                  {recent.map((u) => (
                    <li key={u}>
                      <button
                        type="button"
                        onClick={() => go(u)}
                        className={cx(
                          "inline-flex items-center gap-2 rounded-full bg-surface-2 py-1 pr-3 pl-1 text-sm font-semibold text-muted hover:bg-surface-3 hover:text-text",
                          focusRing,
                        )}
                      >
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-xs font-black text-accent">
                          {u[0]!.toUpperCase()}
                        </span>
                        {u}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <figure className="mx-auto w-full max-w-[460px]">
            <div className="rounded-lg bg-surface p-3 shadow-[0_12px_40px_rgb(0_0_0/0.35)]">
              <div className="mb-2.5 flex items-center justify-between px-1 text-sm">
                <span className="font-bold">White to move</span>
                <span className="rounded bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">Mate in 1</span>
              </div>
              <div role="img" aria-label="Chess position from Morphy's Opera Game, 1858: white rook on d1 can mate on d8">
                <Board id="hero" fen={HERO_FEN} interactive={false} arrows={[{ from: "d1", to: "d8" }]} />
              </div>
            </div>
            <figcaption className="mt-3 text-center text-sm text-faint">
              Morphy, Paris 1858. You&apos;d spot this in a puzzle. Would you spot it on move 17 with 9 seconds left?
            </figcaption>
          </figure>
        </section>

        {/* How it works */}
        <section aria-labelledby="how" className="pb-16">
          <h2 id="how" className="mb-6 text-2xl font-extrabold">
            How it works
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.title}>
                  <Card className="h-full">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-white shadow-[0_3px_0_var(--accent-shade)]">
                        <Icon size={20} />
                      </span>
                      <span className="text-sm font-black text-faint">STEP {i + 1}</span>
                    </div>
                    <h3 className="text-lg font-extrabold">{s.title}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{s.body}</p>
                  </Card>
                </li>
              );
            })}
          </ol>
          <Card raised className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
              <IconPositions size={20} />
            </span>
            <p className="text-[15px] text-muted">
              <strong className="text-text">Checkpoints are your own games.</strong> Every 10 to 15 puzzles, you get the position from right
              before one of your real blunders. Play the best move to conquer it. Miss it and it comes back.
            </p>
          </Card>
        </section>
      </main>

      <Footer />
    </div>
  );
}
