"use client";

import { useState } from "react";
import { cx } from "./cx";

export interface ColumnDatum {
  key: string;
  label: string;
  /** Full description for the tooltip and table. */
  title: string;
  value: number;
}

function niceMax(v: number): number {
  if (v <= 1) return 1;
  if (v <= 2) return 2;
  if (v <= 4) return 4;
  if (v <= 5) return 5;
  return Math.ceil(v / 2) * 2;
}

/**
 * Single-series column chart in HTML/CSS (text never scales with the plot).
 * Thin accent columns with rounded tops, recessive grid, dashed average line,
 * per-column hover tooltip, and a table view for screen readers.
 */
export function ColumnChart({
  data,
  yLabel,
  xLabel,
  average,
  height = 220,
  format = (v: number) => v.toFixed(1),
}: {
  data: ColumnDatum[];
  yLabel: string;
  xLabel: string;
  average?: number;
  height?: number;
  format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));
  const h = hover !== null ? data[hover] : undefined;

  return (
    <figure className="w-full">
      <div className="flex gap-2">
        {/* y axis */}
        <div className="relative w-8 shrink-0 text-right text-[11px] tabular-nums text-faint" style={{ height }} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0" style={{ bottom: `${(100 * t) / max}%`, transform: "translateY(50%)" }}>
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }} onMouseLeave={() => setHover(null)}>
          {/* grid */}
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden="true"
              className={cx("absolute inset-x-0 border-t", t === 0 ? "border-surface-3" : "border-border/70")}
              style={{ bottom: `${(100 * t) / max}%` }}
            />
          ))}
          {average !== undefined && average > 0 && (
            <div
              aria-hidden="true"
              className="absolute inset-x-0 z-10 border-t-2 border-dashed border-muted/60"
              style={{ bottom: `${(100 * average) / max}%` }}
            >
              <span className="absolute -top-5 right-0 rounded bg-surface px-1 text-[11px] font-semibold text-muted">
                avg {format(average)}
              </span>
            </div>
          )}
          {/* columns */}
          <div className="absolute inset-0 flex items-end gap-[2px]" role="list" aria-label={`${yLabel} by ${xLabel}`}>
            {data.map((d, i) => (
              <div
                key={d.key}
                role="listitem"
                tabIndex={0}
                aria-label={d.title}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="group flex h-full min-w-0 flex-1 cursor-default items-end justify-center rounded-sm outline-none focus-visible:bg-accent-soft"
              >
                <div
                  className={cx(
                    "w-full max-w-7 rounded-t-[4px] transition-colors",
                    hover === null || hover === i ? "bg-accent" : "bg-accent/45",
                  )}
                  style={{ height: `${Math.max(d.value > 0 ? 1.5 : 0.6, (100 * d.value) / max)}%` }}
                />
              </div>
            ))}
          </div>
          {h && hover !== null && (
            <div
              className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-md bg-surface-3 px-2.5 py-1.5 text-xs shadow-lg"
              style={{
                left: `${((hover + 0.5) / data.length) * 100}%`,
                bottom: `calc(${Math.min(85, (100 * h.value) / max)}% + 8px)`,
              }}
              role="tooltip"
            >
              <div className="font-bold tabular-nums text-text">{format(h.value)}</div>
              <div className="max-w-48 text-muted">{h.title}</div>
            </div>
          )}
        </div>
      </div>
      {/* x axis */}
      <div className="mt-1.5 flex gap-[2px] pl-10 text-[11px] text-faint" aria-hidden="true">
        {data.map((d, i) => (
          <span key={d.key} className="min-w-0 flex-1 truncate text-center tabular-nums">
            {i % labelEvery === 0 ? d.label : ""}
          </span>
        ))}
      </div>
      <figcaption className="mt-1 pl-10 text-center text-xs font-semibold text-faint">{xLabel}</figcaption>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-faint hover:text-muted">Show as table</summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-faint">
            <tr>
              <th className="py-1 font-semibold">{xLabel}</th>
              <th className="py-1 text-right font-semibold">{yLabel}</th>
            </tr>
          </thead>
          <tbody className="text-muted">
            {data.map((d) => (
              <tr key={d.key} className="border-t border-border">
                <td className="py-1">{d.title}</td>
                <td className="py-1 text-right tabular-nums">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
