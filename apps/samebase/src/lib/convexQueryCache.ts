import { useEffect, useMemo, useState } from "react";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import type { FunctionArgs, FunctionReference } from "convex/server";
import { getFunctionName } from "convex/server";
import {
  CONVEX_QUERY_CACHE_DB_NAME,
  readConvexQueryCacheNamespace,
  registerConvexQueryCacheDatabase,
  releaseConvexQueryCacheDatabase,
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
type CachedQueryState<T = unknown> = {
  cacheKey: string;
  data: T;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CONVEX_QUERY_CACHE_DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      registerConvexQueryCacheDatabase(db);
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<IdbRecord<T> | undefined> {
  try {
    const openedDb = await openDB();
    try {
      return await new Promise((resolve, reject) => {
        const tx = openedDb.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);
        const req = store.get(key);
        req.onsuccess = () => {
          const result: IdbRecord<T> | undefined = req.result;
          resolve(result);
        };
        req.onerror = () => reject(req.error);
      });
    } finally {
      releaseConvexQueryCacheDatabase(openedDb);
    }
  } catch {
    return undefined;
  }
}

async function idbSet<T>(key: string, value: IdbRecord<T>): Promise<void> {
  try {
    const openedDb = await openDB();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = openedDb.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } finally {
      releaseConvexQueryCacheDatabase(openedDb);
    }
  } catch {
    /* ignore */
  }
}

// ---------- in-memory cache (per tab) ----------

const memoryCache = new Map<string, IdbRecord<unknown>>();

export function clearConvexQueryMemoryCache() {
  memoryCache.clear();
}

// ---------- main hook ----------

/**
 * Hashes the query name + stable-stringified args, hydrates from memory/IndexedDB,
 * and returns cached data until the live Convex query resolves.
 */
export function useCacheQuery<Query extends FunctionReference<"query">>({
  args,
  dontCache = false,
  query,
}: {
  args: FunctionArgs<Query> | "skip";
  dontCache?: boolean | undefined;
  query: Query;
}): Query["_returnType"] | undefined {
  const queryOptions = convexQuery(query, args);
  const { data: live } = useQuery({
    ...(queryOptions.queryFn !== undefined ? { queryFn: queryOptions.queryFn } : {}),
    ...(queryOptions.staleTime !== undefined ? { staleTime: queryOptions.staleTime } : {}),
    ...("enabled" in queryOptions ? { enabled: queryOptions.enabled } : {}),
    queryKey: queryOptions.queryKey,
  });
  const queryName = useMemo(() => getFunctionName(query), [query]);

  const cacheKey = useMemo(() => {
    const argsKey = stableStringify(args);
    return `convex:${readConvexQueryCacheNamespace()}:${queryName}:${argsKey}`;
  }, [args, queryName]);

  const [cached, setCached] = useState<CachedQueryState<Query["_returnType"]> | undefined>(
    undefined,
  );
  const cachedForCurrentKey = cached?.cacheKey === cacheKey ? cached.data : undefined;

  // Hydrate from memory/IDB on mount/args change
  useEffect(() => {
    if (dontCache) {
      return;
    }

    const lifecycle = { active: true };

    // 1) memory
    const mem = memoryCache.get(cacheKey);
    if (mem) {
      if (!mem.exp || Date.now() <= mem.exp) {
        setCached({
          cacheKey,
          data: mem.data,
        });
      } else {
        memoryCache.delete(cacheKey);
      }
    } else {
      setCached((prev) => (prev?.cacheKey === cacheKey ? prev : undefined));
    }

    // 2) IDB (async)
    void (async () => {
      const rec = await idbGet<Query["_returnType"]>(cacheKey);
      if (!lifecycle.active) return;
      if (rec) {
        if (!rec.exp || Date.now() <= rec.exp) {
          setCached((prev) =>
            prev?.cacheKey === cacheKey
              ? prev
              : {
                  cacheKey,
                  data: rec.data,
                },
          );
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
  }, [cacheKey, dontCache]);

  // When the live value is ready, persist it
  useEffect(() => {
    if (!dontCache && cacheKey && live !== undefined) {
      const record: IdbRecord = {
        data: live,
      };
      memoryCache.set(cacheKey, record);
      void idbSet(cacheKey, record);
      setCached({
        cacheKey,
        data: live,
      });
    }
  }, [live, cacheKey, dontCache]);

  if (dontCache) {
    return live;
  }

  return live ?? cachedForCurrentKey;
}
