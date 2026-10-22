import { cx } from "./cx";

/** Shield with a pawn and a check mark: "your pawns, protected". */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={cx("shrink-0", className)}>
      <path d="M16 2.5 4.5 6.6v8.6c0 7.1 4.8 12.6 11.5 14.8 6.7-2.2 11.5-7.7 11.5-14.8V6.6L16 2.5Z" className="fill-accent-shade" />
      <path d="M16 1 4.5 5.1v8.6c0 7.1 4.8 12.6 11.5 14.8 6.7-2.2 11.5-7.7 11.5-14.8V5.1L16 1Z" className="fill-accent" />
      <circle cx="16" cy="9.2" r="2.7" className="fill-white" />
      <path d="M13.2 13.2h5.6l-1 2.2 1.9 5.6h-9.4l1.9-5.6-1-2.2Z" className="fill-white" />
      <rect x="10.8" y="20.6" width="10.4" height="2.4" rx="1" className="fill-white" />
    </svg>
  );
}

export function Logo({ size = 30, className, showWordmark = true }: { size?: number; className?: string; showWordmark?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      {showWordmark && (
        <span className="text-[19px] font-black tracking-tight text-text" style={{ fontSize: Math.round(size * 0.66) }}>
          Blunder<span className="text-accent">proof</span>
        </span>
      )}
      <span className="sr-only">Blunderproof</span>
    </span>
  );
}
