import { useEffect, useMemo, useState } from "react";
import type { FunctionReference } from "convex/server";
import { getFunctionName } from "convex/server";
import { useQuery, OptionalRestArgsOrSkip } from "convex/react";

// ---------- tiny stable stringify + hash ----------

function stableStringify(value: unknown): string {
  const seen = new WeakSet();
  const stringify = (val: any): any => {
    if (val === null || typeof val !== "object") return val;
    if (seen.has(val)) return "[Circular]";
    seen.add(val);

    if (Array.isArray(val)) return val.map(stringify);

    // Sort keys for deterministic output
    const out: Record<string, any> = {};
    for (const key of Object.keys(val).sort()) {
      out[key] = stringify(val[key]);
    }
    return out;
  };
  return JSON.stringify(stringify(value));
}

// ---------- minimal IndexedDB KV (no deps) ----------

const DB_NAME = "convexQueryCache";
const STORE = "kv";
const DB_VERSION = 1;
const CACHE_VERSION = 1; // bump when data shape changes

type IdbRecord<T = unknown> = { data: T; exp?: number };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<IdbRecord<T> | undefined> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as IdbRecord<T> | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbSet<T>(key: string, value: IdbRecord<T>): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* ignore */
  }
}

// ---------- in-memory cache (per tab) ----------

const memoryCache = new Map<string, IdbRecord<any>>();

// ---------- main hook ----------

/**
 * Hashes the query name + stable-stringified args, hydrates from memory/IndexedDB,
 * and returns cached data until the live Convex query resolves.
 *
 * Cache entries may optionally include a TTL by setting `useConvexQuery.ttlMs`.
 */
export function useCacheQuery<Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
) {
  const live = useQuery(query, ...args); // live value or undefined while loading
  const [cached, setCached] = useState<Query["_returnType"]>(undefined);
  const [fromCache, setFromCache] = useState(false);
  const queryName = useMemo(() => getFunctionName(query), [query]);

  const cacheKey = useMemo(() => {
    const argsKey = stableStringify(args);
    return `convex:${CACHE_VERSION}:${queryName}:${argsKey}`;
  }, [args, queryName]);

  // Hydrate from memory/IDB on mount/args change
  useEffect(() => {
    let cancelled = false;

    // 1) memory
    const mem = memoryCache.get(cacheKey);
    if (mem) {
      if (!mem.exp || Date.now() <= mem.exp) {
        setCached(mem.data);
        setFromCache(true);
      } else {
        memoryCache.delete(cacheKey);
      }
    }

    // 2) IDB (async)
    void (async () => {
      const rec = await idbGet<any>(cacheKey);
      if (cancelled) return;
      if (rec) {
        if (!rec.exp || Date.now() <= rec.exp) {
          setCached((prev: any) => (prev === undefined ? rec.data : prev)); // don't clobber mem
          setFromCache(true);
          // also copy into memory
          memoryCache.set(cacheKey, rec);
        } else {
          // expired: let live fill it
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  // When the live value is ready, persist it
  useEffect(() => {
    if (cacheKey && live !== undefined) {
      const record: IdbRecord = {
        data: live,
        exp: useCacheQuery.ttlMs ? Date.now() + useCacheQuery.ttlMs : undefined,
      };
      memoryCache.set(cacheKey, record);
      void idbSet(cacheKey, record);
      setCached(live);
      setFromCache(false);
    }
  }, [live, cacheKey]);

  // Returned value mirrors useQuery (data or undefined),
  // with metadata on the function as a property for opt-in usage.
  useCacheQuery.last = { fromCache, cacheKey };

  return cached;
}

/**
 * Optional TTL (milliseconds) for all subsequent calls until changed.
 * Example: `useConvexQuery.ttlMs = 12 * 60 * 60 * 1000;`
 */
useCacheQuery.ttlMs = undefined as number | undefined;

/**
 * Introspection (read-only): last call metadata (for debugging/devtools).
 * Example: `console.log(useConvexQuery.last)`
 */
useCacheQuery.last = { fromCache: false, cacheKey: null as string | null };
