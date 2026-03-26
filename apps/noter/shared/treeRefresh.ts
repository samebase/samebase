export const TREE_REFRESH_DEBOUNCE_MS = 2 * 60 * 1000;
export const TREE_REFRESH_STALE_LOCK_MS = 3 * 60 * 1000;
export const TREE_REFRESH_FAILURE_COOLDOWN_MS = 60 * 1000;
export const REPOSITORY_METADATA_STALE_MS = 10 * 60 * 1000;

export function getLastRepositoryMetadataRefreshAt(
  remoteBranches: Array<{ lastSyncedAt: number }>,
): number | undefined {
  return remoteBranches.reduce<number | undefined>((latest, branch) => {
    if (latest === undefined || branch.lastSyncedAt > latest) {
      return branch.lastSyncedAt;
    }
    return latest;
  }, undefined);
}

export function isRepositoryMetadataStale(args: {
  lastRepositoryMetadataRefreshAt?: number;
  now?: number;
}): boolean {
  if (typeof args.lastRepositoryMetadataRefreshAt !== "number") {
    return true;
  }

  const now = args.now ?? Date.now();
  return (
    now - args.lastRepositoryMetadataRefreshAt >= REPOSITORY_METADATA_STALE_MS
  );
}
