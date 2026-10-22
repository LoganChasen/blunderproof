"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAnalysis } from "@/web/analysis/AnalysisProvider";
import { Avatar } from "./Avatar";
import { cx, focusRing } from "./cx";
import { Footer } from "./Footer";
import { IconPositions, IconReport, IconStats, IconSwap, IconTrain } from "./icons";
import { Logo } from "./Logo";
import { ProgressBar } from "./ProgressBar";
import { Spinner } from "./Spinner";

interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: (p: { size?: number }) => ReactNode;
  cta?: boolean;
}

function navItems(username: string): NavItem[] {
  const base = `/u/${encodeURIComponent(username)}`;
  return [
    { href: base, label: "Report", short: "Report", icon: IconReport },
    { href: `${base}/train`, label: "Train", short: "Train", icon: IconTrain, cta: true },
    { href: `${base}/checkpoints`, label: "My Positions", short: "Positions", icon: IconPositions },
    { href: `${base}/stats`, label: "Stats", short: "Stats", icon: IconStats },
  ];
}

function isActive(pathname: string, href: string, exact: boolean): boolean {
  const p = decodeURIComponent(pathname).replace(/\/$/, "").toLowerCase();
  const h = decodeURIComponent(href).toLowerCase();
  return exact ? p === h : p === h || p.startsWith(h + "/");
}

function ratingLine(r: Partial<Record<"bullet" | "blitz" | "rapid", number>> | undefined): string {
  const parts = (["bullet", "blitz", "rapid"] as const).flatMap((k) => (r?.[k] ? [`${k[0]!.toUpperCase()}${k.slice(1)} ${r[k]}`] : []));
  return parts[0] ?? "Player";
}

function AnalysisChip() {
  const { status, progress } = useAnalysis();
  if (status !== "fetching" && status !== "analyzing") return null;
  const text = status === "fetching" ? "Fetching games" : `Analyzing ${progress.done}/${progress.total}`;
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2" aria-live="polite">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted">
        <Spinner size={12} className="text-accent" label={text} />
        {text}
      </div>
      <ProgressBar size="sm" value={progress.done} max={Math.max(progress.total, 1)} indeterminate={status === "fetching"} label={text} />
    </div>
  );
}

export function AppShell({ username, children }: { username: string; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const { profile } = useAnalysis();
  const items = navItems(username);
  const name = profile?.displayName ?? username;

  return (
    <div className="min-h-dvh bg-bg text-text">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[200px] flex-col bg-surface md:flex" aria-label="Main">
        <Link href="/" className={cx("mx-2 mt-3 mb-4 flex h-12 items-center rounded-md px-2.5", focusRing)} aria-label="Blunderproof home">
          <Logo size={28} />
        </Link>
        <nav className="flex flex-col gap-0.5 px-2">
          {items.map((it, i) => {
            const active = isActive(pathname, it.href, i === 0);
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "group relative flex h-11 items-center gap-3 rounded-md px-3 text-[15px] font-bold transition-colors",
                  focusRing,
                  active ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2/60 hover:text-text",
                )}
              >
                {active && <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-accent" aria-hidden="true" />}
                <span
                  className={cx(
                    "flex h-7 w-7 items-center justify-center rounded",
                    it.cta ? "bg-accent text-white shadow-[0_2px_0_var(--accent-shade)]" : active ? "text-accent" : "text-faint group-hover:text-muted",
                  )}
                >
                  <Icon size={it.cta ? 17 : 20} />
                </span>
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="mx-4 my-3 border-t border-border" />
        <Link
          href="/"
          className={cx("mx-2 flex h-9 items-center gap-3 rounded-md px-3 text-sm font-semibold text-faint hover:bg-surface-2/60 hover:text-text", focusRing)}
        >
          <IconSwap size={16} />
          Change player
        </Link>

        <div className="mt-auto flex flex-col gap-2 p-2">
          <AnalysisChip />
          <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
            <Avatar src={profile?.avatarUrl} name={name} size={32} />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{name}</div>
              <div className="truncate text-xs text-faint">{ratingLine(profile?.ratings)}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 bg-surface px-4 md:hidden">
        <Link href="/" className={cx("rounded", focusRing)} aria-label="Blunderproof home">
          <Logo size={24} />
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <MobileProgress />
          <Link href="/" className={cx("rounded", focusRing)} aria-label={`Signed in as ${name}. Change player`}>
            <Avatar src={profile?.avatarUrl} name={name} size={28} />
          </Link>
        </div>
      </header>

      <div className="flex min-h-dvh flex-col pb-16 md:pb-0 md:pl-[200px]">
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 md:px-8 md:py-8">{children}</main>
        <Footer />
      </div>

      {/* Mobile bottom tabs */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Main"
      >
        {items.map((it, i) => {
          const active = isActive(pathname, it.href, i === 0);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold",
                focusRing,
                active ? "text-accent" : "text-faint",
              )}
            >
              <span className={cx("flex h-7 w-10 items-center justify-center rounded-md", it.cta && "bg-accent text-white")}>
                <Icon size={19} />
              </span>
              {it.short}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function MobileProgress() {
  const { status, progress } = useAnalysis();
  if (status !== "fetching" && status !== "analyzing") return null;
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted" aria-live="polite">
      <Spinner size={11} className="text-accent" />
      {status === "fetching" ? "Fetching" : `${progress.done}/${progress.total}`}
    </span>
  );
}
