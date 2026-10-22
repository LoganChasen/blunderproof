import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export function Card({
  className,
  padded = true,
  raised = false,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { padded?: boolean; raised?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-lg",
        raised ? "bg-surface-2" : "bg-surface",
        "shadow-[0_1px_0_rgb(255_255_255/0.03)_inset,0_2px_8px_rgb(0_0_0/0.18)]",
        padded && "p-4 sm:p-5",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-accent">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold leading-tight text-text">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-faint">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
