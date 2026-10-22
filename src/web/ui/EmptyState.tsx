import type { ReactNode } from "react";
import { Card } from "./Card";

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center sm:py-14">
      {icon && <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</div>}
      <h2 className="text-xl font-extrabold">{title}</h2>
      {body && <div className="mt-2 max-w-md text-[15px] text-muted">{body}</div>}
      {action && <div className="mt-6">{action}</div>}
    </Card>
  );
}
