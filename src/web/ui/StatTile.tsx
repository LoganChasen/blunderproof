import type { ReactNode } from "react";
import { cx } from "./cx";

export type Tone = "neutral" | "accent" | "success" | "danger" | "warning" | "info";

const VALUE_TONE: Record<Tone, string> = {
  neutral: "text-text",
  accent: "text-accent",
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  info: "text-info",
};

export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col rounded-lg bg-surface px-4 py-3.5 shadow-[0_2px_8px_rgb(0_0_0/0.18)]", className)}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
        {icon && <span className="text-faint">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <div className={cx("mt-1 text-2xl font-extrabold tabular-nums leading-tight sm:text-[28px]", VALUE_TONE[tone])}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}
