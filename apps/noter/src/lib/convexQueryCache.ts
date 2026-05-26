import { useEffect, useMemo, useState } from "react";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import type { FunctionReference } from "convex/server";
import { getFunctionName } from "convex/server";
import type { OptionalRestArgsOrSkip } from "convex/react";
import {
  CONVEX_QUERY_CACHE_DB_NAME,
  readConvexQueryCacheNamespace,
} from "@/lib/convexQueryCacheStorage";

// ---------- tiny stable stringify + hash ----------

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const stringify = (nextValue: unknown): unknown => {
    if (nextValue === null || typeof nextValue !== "object") {
      return nextValue;
    }
    if (seen.has(nextValue)) {
      return "[Circular]";
    }
    seen.add(nextValue);

    if (Array.isArray(nextValue)) {
      return nextValue.map((item) => stringify(item));
    }

    // Sort keys for deterministic output
    const out: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(nextValue).sort(([leftKey], [rightKey]) =>
      leftKey.localeCompare(rightKey),
    )) {
      out[key] = stringify(entryValue);
    }
    return out;
  };
  return JSON.stringify(stringify(value));
}

// ---------- minimal IndexedDB KV (no deps) ----------

const STORE = "kv";
const DB_VERSION = 1;

type IdbRecord<T = unknown> = { data: T; exp?: number };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CONVEX_QUERY_CACHE_DB_NAME, DB_VERSION);
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
      req.onsuccess = () => {
        const result: IdbRecord<T> | undefined = req.result;
        resolve(result);
      };
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

const memoryCache = new Map<string, IdbRecord<unknown>>();

// ---------- main hook ----------

/**
 * Hashes the query name + stable-stringified args, hydrates from memory/IndexedDB,
 * and returns cached data until the live Convex query resolves.
 */
export function useCacheQuery<Query extends FunctionReference<"query">>(
  query: Query,
  arg?: undefined,
  options?: {
    dontCache?: boolean;
  },
): Query["_returnType"] | undefined;

export function useCacheQuery<Query extends FunctionReference<"query">>(
  query: Query,
  arg: OptionalRestArgsOrSkip<Query>[0],
  options?: {
    dontCache?: boolean;
  },
): Query["_returnType"] | undefined;
export function useCacheQuery<Query extends FunctionReference<"query">>(
  query: Query,
  arg: OptionalRestArgsOrSkip<Query>[0],
  options: {
    dontCache?: boolean;
  } = {},
): Query["_returnType"] | undefined {
  const { data: live } = useQuery(convexQuery(query, arg));
  const [cached, setCached] = useState<Query["_returnType"]>(undefined);
  const queryName = useMemo(() => getFunctionName(query), [query]);

  const cacheKey = useMemo(() => {
    const argsKey = stableStringify(arg);
    return `convex:${readConvexQueryCacheNamespace()}:${queryName}:${argsKey}`;
  }, [arg, queryName]);

  // Hydrate from memory/IDB on mount/args change
  useEffect(() => {
    const lifecycle = { active: true };

    // 1) memory
    const mem = memoryCache.get(cacheKey);
    if (mem) {
      if (!mem.exp || Date.now() <= mem.exp) {
        setCached(mem.data);
      } else {
        memoryCache.delete(cacheKey);
      }
    }

    // 2) IDB (async)
    void (async () => {
      const rec = await idbGet<Query["_returnType"]>(cacheKey);
      if (!lifecycle.active) return;
      if (rec) {
        if (!rec.exp || Date.now() <= rec.exp) {
          setCached((prev) => (prev === undefined ? rec.data : prev)); // don't clobber mem
          // also copy into memory
          memoryCache.set(cacheKey, rec);
        } else {
          // expired: let live fill it
        }
      }
    })();

    return () => {
      lifecycle.active = false;
    };
  }, [cacheKey]);

  // When the live value is ready, persist it
  useEffect(() => {
    if (cacheKey && live !== undefined) {
      const record: IdbRecord = {
        data: live,
      };
      memoryCache.set(cacheKey, record);
      void idbSet(cacheKey, record);
      setCached(live);
    }
  }, [live, cacheKey]);

  if (options.dontCache) {
    return live;
  }

  return cached;
}
