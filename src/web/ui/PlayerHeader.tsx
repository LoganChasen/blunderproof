"use client";

import type { ReactNode } from "react";
import type { PlayerProfile } from "@/web/types";
import { Avatar } from "./Avatar";

const KINDS = ["bullet", "blitz", "rapid"] as const;

export function PlayerHeader({
  username,
  profile,
  title,
  subtitle,
  action,
}: {
  username: string;
  profile: PlayerProfile | null;
  /** Page title shown above the name, e.g. "Report". */
  title?: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  const name = profile?.displayName ?? username;
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <Avatar src={profile?.avatarUrl} name={name} size={64} className="rounded-lg" />
        <div className="min-w-0">
          {title && <p className="text-xs font-bold uppercase tracking-wider text-accent">{title}</p>}
          <h1 className="truncate text-2xl font-black tracking-tight sm:text-3xl">{name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {profile ? (
              KINDS.filter((k) => profile.ratings[k]).map((k) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <span className="text-faint capitalize">{k}</span>
                  <span className="font-bold tabular-nums text-text">{profile.ratings[k]}</span>
                </span>
              ))
            ) : (
              <span className="h-4 w-40 animate-pulse rounded bg-surface-2" aria-hidden="true" />
            )}
            {subtitle}
          </div>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
