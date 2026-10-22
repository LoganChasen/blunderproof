"use client";
/**
 * Drag-and-drop + click-to-move for the shared Board, with legal-move dots and
 * a promotion step (the caller renders <PromotionPicker> while `pendingPromotion` is set).
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { legalTargets, needsPromotion, pieceColorAt, toUci, type Color, type PromotionPiece, type SquarePair } from "./puzzleLogic";

const DOT: CSSProperties = { background: "radial-gradient(circle, rgb(0 0 0 / 0.2) 23%, transparent 25%)" };
const RING: CSSProperties = { background: "radial-gradient(circle, transparent 60%, rgb(0 0 0 / 0.2) 62%)" };

export function useMoveInput(opts: {
  fen: string;
  color: Color;
  interactive: boolean;
  /** Called with a full UCI move (promotion suffix included). Return false to reject (snap back). */
  onMove: (uci: string) => boolean;
}) {
  const { fen, color, interactive, onMove } = opts;
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<SquarePair | null>(null);

  // A new position (or turning input off) clears any selection.
  useEffect(() => {
    setSelected(null);
    setPendingPromotion(null);
  }, [fen, interactive]);

  const targets = useMemo(() => (selected ? legalTargets(fen, selected) : []), [fen, selected]);

  const attempt = useCallback(
    (from: string, to: string): boolean => {
      if (!interactive) return false;
      if (!legalTargets(fen, from).some((t) => t.to === to)) return false;
      if (needsPromotion(fen, from, to)) {
        setPendingPromotion({ from, to });
        return false; // piece snaps back until a piece is chosen
      }
      return onMove(toUci(from, to));
    },
    [fen, interactive, onMove],
  );

  const onSquareClick = useCallback(
    (sq: string) => {
      if (!interactive || pendingPromotion) return;
      if (selected && targets.some((t) => t.to === sq)) {
        setSelected(null);
        attempt(selected, sq);
        return;
      }
      if (sq !== selected && pieceColorAt(fen, sq) === color) setSelected(sq);
      else setSelected(null);
    },
    [interactive, pendingPromotion, selected, targets, attempt, fen, color],
  );

  const onDrop = useCallback(
    (from: string, to: string) => {
      setSelected(null);
      return attempt(from, to);
    },
    [attempt],
  );

  const choosePromotion = useCallback(
    (piece: PromotionPiece | null) => {
      const p = pendingPromotion;
      setPendingPromotion(null);
      if (p && piece) onMove(toUci(p.from, p.to, piece));
    },
    [pendingPromotion, onMove],
  );

  const inputStyles = useMemo(() => {
    const s: Record<string, CSSProperties> = {};
    if (selected) s[selected] = { background: "var(--highlight-select)" };
    for (const t of targets) s[t.to] = t.capture ? RING : DOT;
    if (pendingPromotion) {
      s[pendingPromotion.from] = { background: "var(--highlight-select)" };
      s[pendingPromotion.to] = { background: "var(--highlight-select)" };
    }
    return s;
  }, [selected, targets, pendingPromotion]);

  return { onSquareClick, onDrop, inputStyles, pendingPromotion, choosePromotion };
}

/** Merge square-style maps; later maps win per property. */
export function mergeStyles(...maps: (Record<string, CSSProperties> | null | undefined | false)[]): Record<string, CSSProperties> {
  const out: Record<string, CSSProperties> = {};
  for (const m of maps) {
    if (!m) continue;
    for (const [k, v] of Object.entries(m)) out[k] = { ...out[k], ...v };
  }
  return out;
}

export function lastMoveStyles(m: SquarePair | null): Record<string, CSSProperties> {
  if (!m) return {};
  return { [m.from]: { background: "var(--highlight-move)" }, [m.to]: { background: "var(--highlight-move)" } };
}
