/** Chess.com profile + stats JSON → PlayerProfile. Pure; used by /api/player. */
import type { PlayerProfile } from "../types";

export interface RawProfile {
  username?: string;
  url?: string;
  avatar?: string;
  country?: string;
}
export type RawStats = Partial<Record<"chess_bullet" | "chess_blitz" | "chess_rapid", { last?: { rating?: number } }>>;

export function toProfile(username: string, p: RawProfile, stats: RawStats | null): PlayerProfile {
  const fromUrl = p.url?.split("/").filter(Boolean).pop();
  const displayName =
    fromUrl && fromUrl.toLowerCase() === username.toLowerCase() ? fromUrl : (p.username ?? username);
  const country = p.country?.split("/").pop() ?? null; // ".../pub/country/US" → "US"
  const ratings: PlayerProfile["ratings"] = {};
  for (const tc of ["bullet", "blitz", "rapid"] as const) {
    const r = stats?.[`chess_${tc}`]?.last?.rating;
    if (typeof r === "number") ratings[tc] = r;
  }
  return {
    username: (p.username ?? username).toLowerCase(),
    displayName,
    avatarUrl: p.avatar ?? null,
    country,
    ratings,
  };
}
