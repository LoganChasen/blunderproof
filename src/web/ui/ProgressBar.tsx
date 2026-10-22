import { cx } from "./cx";
import type { Tone } from "./StatTile";

const FILL: Record<Tone, string> = {
  neutral: "bg-muted",
  accent: "bg-accent",
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
};

export function ProgressBar({
  value,
  max = 100,
  tone = "accent",
  label,
  size = "md",
  indeterminate = false,
  className,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  /** Accessible label. */
  label: string;
  size?: "sm" | "md" | "lg";
  indeterminate?: boolean;
  className?: string;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (100 * value) / max));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={indeterminate ? undefined : value}
      className={cx(
        "relative w-full overflow-hidden rounded-full bg-black/30",
        size === "sm" ? "h-1.5" : size === "lg" ? "h-3.5" : "h-2.5",
        className,
      )}
    >
      <div
        className={cx("h-full rounded-full transition-[width] duration-500 ease-out", FILL[tone], indeterminate && "animate-pulse")}
        style={{ width: `${indeterminate ? 100 : pct}%` }}
      />
    </div>
  );
}
