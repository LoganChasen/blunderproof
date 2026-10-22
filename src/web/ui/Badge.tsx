import type { ReactNode } from "react";
import type { Pattern } from "@/web/types";
import { PATTERN_LABEL } from "@/patterns/index";
import { cx } from "./cx";
import type { Tone } from "./StatTile";

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-3/70 text-muted",
  accent: "bg-accent/15 text-accent",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/15 text-info",
};

export function Badge({ tone = "neutral", children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-bold", TONE[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export const PATTERN_TONE: Record<Pattern, Tone> = {
  "missed-mate": "danger",
  "back-rank": "warning",
  "hanging-piece": "accent",
  "missed-capture": "info",
  other: "neutral",
};

/** Bar/fill class for a pattern, matching its badge tone. */
export const PATTERN_FILL: Record<Pattern, string> = {
  "missed-mate": "bg-danger",
  "back-rank": "bg-warning",
  "hanging-piece": "bg-accent",
  "missed-capture": "bg-info",
  other: "bg-faint",
};

export function PatternBadge({ pattern }: { pattern: Pattern }) {
  return <Badge tone={PATTERN_TONE[pattern]}>{PATTERN_LABEL[pattern]}</Badge>;
}

export function LabelBadge({ label }: { label: "mistake" | "blunder" }) {
  return <Badge tone={label === "blunder" ? "danger" : "warning"}>{label === "blunder" ? "Blunder ??" : "Mistake ?"}</Badge>;
}
