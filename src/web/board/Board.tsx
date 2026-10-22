"use client";

import { Chessboard } from "react-chessboard";
import type { CSSProperties } from "react";

export interface BoardArrow {
  from: string;
  to: string;
  /** CSS color; defaults to the accent blue. */
  color?: string;
}

export interface BoardProps {
  fen: string;
  orientation?: "white" | "black";
  /** Called when the user drops a piece. Return true to accept the move, false to snap back. */
  onMove?: (from: string, to: string, piece: string) => boolean;
  /** Called on square click (for click-to-move). */
  onSquareClick?: (square: string) => void;
  /** Per-square style overrides, e.g. last-move highlights. */
  squareStyles?: Record<string, CSSProperties>;
  arrows?: BoardArrow[];
  /** Disable dragging (e.g. while the opponent "thinks"). */
  interactive?: boolean;
  /** Stable id when several boards are on one page. */
  id?: string;
}

/** The single board component used everywhere, with the blue theme applied. */
export function Board({ fen, orientation = "white", onMove, onSquareClick, squareStyles, arrows, interactive = true, id }: BoardProps) {
  return (
    <div className="aspect-square w-full select-none overflow-hidden rounded-[3px] shadow-[0_6px_24px_rgb(0_0_0/0.35)]">
      <Chessboard
        options={{
          id,
          position: fen,
          boardOrientation: orientation,
          allowDragging: interactive,
          animationDurationInMs: 180,
          darkSquareStyle: { backgroundColor: "var(--board-dark)" },
          lightSquareStyle: { backgroundColor: "var(--board-light)" },
          // Coordinates in the opposite square color, bold, like a chess site.
          darkSquareNotationStyle: { color: "var(--board-light)", fontWeight: 700 },
          lightSquareNotationStyle: { color: "var(--board-dark)", fontWeight: 700 },
          squareStyles: squareStyles ?? {},
          arrows: (arrows ?? []).map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color ?? "rgb(59 142 232 / 0.85)" })),
          onPieceDrop: ({ sourceSquare, targetSquare, piece }) =>
            !!targetSquare && !!onMove && interactive && onMove(sourceSquare, targetSquare, piece.pieceType),
          onSquareClick: ({ square }) => onSquareClick?.(square),
        }}
      />
    </div>
  );
}
