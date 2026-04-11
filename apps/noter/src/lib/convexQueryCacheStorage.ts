import { readAppBuildCommit } from "@/lib/appBuildMetadata";

export const CONVEX_QUERY_CACHE_DB_NAME = "convexQueryCache";

// Keep query-cache reads scoped to one shipped app build so older cached
// payloads cannot crash a newer UI before the live query hydrates.
export function readConvexQueryCacheNamespace(): string {
  return `1:${readAppBuildCommit()}`;
}
