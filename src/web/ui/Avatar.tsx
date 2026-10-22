"use client";

import { useState } from "react";
import { cx } from "./cx";

/** Player avatar with an initial-letter fallback (remote images may be blocked by COEP). */
export function Avatar({ src, name, size = 40, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`${name}'s avatar`}
        width={size}
        height={size}
        crossOrigin="anonymous"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cx("shrink-0 rounded-md bg-surface-2 object-cover", className)}
        style={style}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={`${name}'s avatar`}
      className={cx("inline-flex shrink-0 items-center justify-center rounded-md bg-accent-soft font-extrabold text-accent", className)}
      style={style}
    >
      {initial}
    </span>
  );
}
