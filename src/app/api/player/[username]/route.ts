import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "@/config";
import { fetchRecentGames, PlayerNotFoundError } from "@/chesscom";
import { filterGames } from "@/filter";
import type { ApiError, PlayerApiResponse } from "@/web/types";
import { toProfile, type RawProfile, type RawStats } from "@/web/analysis/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTHS = 3;
const MAX_GAMES = 150;
const USERNAME_RE = /^[A-Za-z0-9_-]{2,30}$/;
const API = "https://api.chess.com/pub/player";
const CACHE_DIR = join(tmpdir(), "blunderproof-chesscom");

class NotFound extends Error {}

function json(body: PlayerApiResponse | ApiError, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function getJson(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": config.fetch.userAgent }, cache: "no-store" });
    if (res.status === 404 || res.status === 410) throw new NotFound();
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Chess.com API ${res.status} for ${url}`);
    return res.json();
  }
  throw new Error(`Chess.com API kept rate-limiting ${url}`);
}

export async function GET(_req: Request, ctx: { params: Promise<{ username: string }> }) {
  const { username: raw } = await ctx.params;
  const username = decodeURIComponent(raw).trim();
  if (!USERNAME_RE.test(username)) {
    return json({ error: "That doesn't look like a Chess.com username (2–30 letters, numbers, - or _)." }, 400);
  }
  const u = username.toLowerCase();

  try {
    // Serial on purpose: Chess.com rate-limits parallel requests.
    const rawProfile = (await getJson(`${API}/${u}`)) as RawProfile;
    let stats: RawStats | null = null;
    try {
      stats = (await getJson(`${API}/${u}/stats`)) as RawStats;
    } catch {
      // Ratings are nice-to-have.
    }
    const profile = toProfile(username, rawProfile, stats);

    let all: Awaited<ReturnType<typeof fetchRecentGames>> = [];
    try {
      all = await fetchRecentGames(u, MONTHS, { cacheDir: CACHE_DIR });
    } catch (e) {
      // The player exists (profile loaded) but has no game archives.
      if (!(e instanceof PlayerNotFoundError)) throw e;
    }
    const { kept, skipped } = filterGames(all);
    const games = kept.sort((a, b) => b.end_time - a.end_time).slice(0, MAX_GAMES);
    return json({ profile, games, skipped: skipped as Record<string, number>, totalFetched: all.length });
  } catch (e) {
    if (e instanceof NotFound) return json({ error: `Couldn't find a Chess.com player named ${username}` }, 404);
    console.error("[api/player]", e);
    return json({ error: "Couldn't reach Chess.com right now. Please try again in a minute." }, 502);
  }
}
