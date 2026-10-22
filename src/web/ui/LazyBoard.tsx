"use client";

import { useEffect, useRef, useState } from "react";
import { Board, type BoardProps } from "@/web/board/Board";

/** A non-interactive Board that only mounts once it scrolls near the viewport. */
export function LazyBoard(props: Omit<BoardProps, "interactive" | "onMove" | "onSquareClick"> & { label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  const { label, ...boardProps } = props;
  return (
    <div ref={ref} role="img" aria-label={label ?? "Chess position"} className="aspect-square w-full">
      {visible ? (
        <Board {...boardProps} interactive={false} />
      ) : (
        <div className="aspect-square w-full animate-pulse rounded-[3px] bg-surface-2" />
      )}
    </div>
  );
}
