/**
 * Browser analysis cache: IndexedDB `bp-analysis` / store `games`, keyed by
 * analysisCacheKey(game, engine.name). Falls back to an in-memory Map when
 * IndexedDB is missing or blocked (private mode, storage disabled, ...).
 */
import type { GameAnalysis } from "../../analyze";

const DB_NAME = "bp-analysis";
const STORE = "games";

const memory = new Map<string, GameAnalysis>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        } catch {
          // Ignore; onerror/onsuccess decides.
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function request<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
      tx.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function getCachedAnalysis(key: string): Promise<GameAnalysis | null> {
  const mem = memory.get(key);
  if (mem) return mem;
  const db = await openDb();
  if (!db) return null;
  const hit = await request<GameAnalysis | undefined>(db, "readonly", (s) => s.get(key) as IDBRequest<GameAnalysis | undefined>);
  if (hit && typeof hit === "object" && Array.isArray(hit.moves)) {
    memory.set(key, hit);
    return hit;
  }
  return null;
}

/** Look up many keys; returns only the hits. */
export async function getManyCachedAnalyses(keys: string[]): Promise<Map<string, GameAnalysis>> {
  const out = new Map<string, GameAnalysis>();
  for (const k of keys) {
    const hit = await getCachedAnalysis(k);
    if (hit) out.set(k, hit);
  }
  return out;
}

export async function putCachedAnalysis(key: string, analysis: GameAnalysis): Promise<void> {
  memory.set(key, analysis);
  const db = await openDb();
  if (!db) return;
  await request(db, "readwrite", (s) => s.put(analysis, key));
}
