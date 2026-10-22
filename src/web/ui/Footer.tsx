import { IconGithub } from "./icons";
import { cx, focusRing } from "./cx";

export function Footer({ className }: { className?: string }) {
  return (
    <footer className={cx("border-t border-border px-4 py-6 text-xs text-faint sm:px-8", className)}>
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p className="leading-relaxed">
          Analysis by Stockfish (GPL-3.0) · Puzzles from the Lichess puzzle database (CC0) · Works with your Chess.com account. Not
          affiliated.
        </p>
        <a
          href="https://github.com/LoganChasen/blunderproof"
          target="_blank"
          rel="noopener noreferrer"
          className={cx("inline-flex shrink-0 items-center gap-1.5 rounded font-semibold text-muted hover:text-text", focusRing)}
        >
          <IconGithub size={16} />
          GitHub
        </a>
      </div>
    </footer>
  );
}
