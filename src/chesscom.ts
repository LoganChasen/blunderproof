import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";

/** The subset of a Chess.com API game we use. */
export interface ChessComGame {
  url: string;
  uuid: string;
  pgn?: string;
  time_control: string;
  time_class: string;
  rules: string;
  end_time: number;
  rated: boolean;
  initial_setup?: string;
  white: ChessComSide;
  black: ChessComSide;
}

export interface ChessComSide {
  username: string;
  rating: number;
  result: string;
}

export class PlayerNotFoundError extends Error {
  constructor(username: string) {
    super(`Couldn't find games for "${username}". Check the spelling, or the account may be closed.`);
  }
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface FetchOptions {
  cacheDir?: string;
  /** Injected for tests. */
  fetchFn?: FetchFn;
  /** Injected for tests; used to decide which month is "current" and must be re-fetched. */
  now?: Date;
}

const API = "https://api.chess.com/pub/player";

/**
 * Requests run one at a time (Chess.com returns 429s for parallel traffic).
 * On a 429 we wait and retry a few times.
 */
async function getJson(url: string, fetchFn: FetchFn, username: string): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetchFn(url, { headers: { "User-Agent": config.fetch.userAgent } });
    if (res.status === 404 || res.status === 410) throw new PlayerNotFoundError(username);
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Chess.com API ${res.status} for ${url}`);
    return res.json();
  }
  throw new Error(`Chess.com API kept rate-limiting ${url}`);
}

/** Archive URLs like ".../games/2026/10", oldest first. */
export async function fetchArchives(username: string, opts: FetchOptions = {}): Promise<string[]> {
  const fetchFn = opts.fetchFn ?? fetch;
  const data = (await getJson(`${API}/${username.toLowerCase()}/games/archives`, fetchFn, username)) as {
    archives?: string[];
  };
  return data.archives ?? [];
}

/**
 * Games for one archive month. Past months never change, so they are cached
 * on disk forever; the current month is always re-fetched.
 */
export async function fetchMonth(username: string, archiveUrl: string, opts: FetchOptions = {}): Promise<ChessComGame[]> {
  const fetchFn = opts.fetchFn ?? fetch;
  const now = opts.now ?? new Date();
  const [year, month] = archiveUrl.split("/").slice(-2).map(Number);
  const isCurrent = year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
  const cacheFile = opts.cacheDir
    ? join(opts.cacheDir, username.toLowerCase(), `${year}-${String(month).padStart(2, "0")}.json`)
    : undefined;

  if (cacheFile && !isCurrent) {
    try {
      return JSON.parse(await readFile(cacheFile, "utf8")) as ChessComGame[];
    } catch {
      // Not cached yet.
    }
  }

  const data = (await getJson(archiveUrl, fetchFn, username)) as { games?: ChessComGame[] };
  const games = data.games ?? [];
  if (cacheFile) {
    await mkdir(join(cacheFile, ".."), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(games));
  }
  return games;
}

/** Games from the last `months` archive months, newest first. */
export async function fetchRecentGames(username: string, months: number, opts: FetchOptions = {}): Promise<ChessComGame[]> {
  const archives = await fetchArchives(username, opts);
  if (archives.length === 0) throw new PlayerNotFoundError(username);
  const games: ChessComGame[] = [];
  for (const url of archives.slice(-months)) {
    games.push(...(await fetchMonth(username, url, opts)));
  }
  return games.sort((a, b) => b.end_time - a.end_time);
}
