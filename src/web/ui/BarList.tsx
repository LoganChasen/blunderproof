import { cx } from "./cx";

export interface BarItem {
  label: string;
  value: number;
  /** Tailwind bg class for the bar; defaults to accent. */
  fillClass?: string;
}

/** Horizontal bars for a breakdown: label, count and share of the total. */
export function BarList({
  items,
  total,
  compact = false,
  emptyText = "No data yet.",
}: {
  items: BarItem[];
  /** Denominator for the share; defaults to the sum of values. */
  total?: number;
  compact?: boolean;
  emptyText?: string;
}) {
  const sum = total ?? items.reduce((s, i) => s + i.value, 0);
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0 || sum === 0) return <p className="text-sm text-faint">{emptyText}</p>;
  return (
    <ul className={cx("flex flex-col", compact ? "gap-2" : "gap-3")}>
      {items.map((it) => {
        const share = Math.round((100 * it.value) / sum);
        return (
          <li key={it.label} className="min-w-0">
            <div className={cx("mb-1 flex items-baseline justify-between gap-2", compact ? "text-xs" : "text-sm")}>
              <span className="truncate font-semibold text-muted">{it.label}</span>
              <span className="shrink-0 tabular-nums text-faint">
                <span className="font-bold text-text">{it.value}</span> · {share}%
              </span>
            </div>
            <div className={cx("w-full overflow-hidden rounded-full bg-black/30", compact ? "h-1.5" : "h-2.5")}>
              <div
                className={cx("h-full rounded-full", it.fillClass ?? "bg-accent")}
                style={{ width: `${Math.max(2, (100 * it.value) / max)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
