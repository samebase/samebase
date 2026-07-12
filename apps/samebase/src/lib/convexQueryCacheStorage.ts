import { readAppBuildCommit } from "@/lib/appBuildMetadata";

export const CONVEX_QUERY_CACHE_DB_NAME = "convexQueryCache";
const openConvexQueryCacheDatabases = new Set<IDBDatabase>();

export function registerConvexQueryCacheDatabase(db: IDBDatabase) {
  openConvexQueryCacheDatabases.add(db);
  db.onversionchange = () => {
    db.close();
    openConvexQueryCacheDatabases.delete(db);
  };
}

export function releaseConvexQueryCacheDatabase(db: IDBDatabase) {
  db.close();
  openConvexQueryCacheDatabases.delete(db);
}

export function closeConvexQueryCacheDatabases() {
  for (const db of openConvexQueryCacheDatabases) {
    db.close();
  }
  openConvexQueryCacheDatabases.clear();
}

// Keep query-cache reads scoped to one shipped app build so older cached
// payloads cannot crash a newer UI before the live query hydrates.
export function readConvexQueryCacheNamespace(): string {
  return `1:${readAppBuildCommit()}`;
}
