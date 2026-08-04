export const TREE_REFRESH_DEBOUNCE_MS = 2 * 60 * 1000;
export const TREE_REFRESH_STALE_LOCK_MS = 3 * 60 * 1000;
export const TREE_REFRESH_FAILURE_COOLDOWN_MS = 60 * 1000;

export function shouldPreserveTreeRefreshFailureAfterSuccess(args: {
  claimedStartedAt?: number | undefined;
  lastTreeRefreshFailedAt?: number | undefined;
}): boolean {
  return (
    typeof args.claimedStartedAt === "number" &&
    typeof args.lastTreeRefreshFailedAt === "number" &&
    args.lastTreeRefreshFailedAt > args.claimedStartedAt
  );
}

export function shouldPreserveTreeRefreshCooldownAfterSuccess(args: {
  claimedStartedAt?: number | undefined;
  lastTreeRefreshFailedAt?: number | undefined;
  cooldownUntil?: number | undefined;
  now?: number | undefined;
}): boolean {
  const now = args.now ?? Date.now();
  return (
    shouldPreserveTreeRefreshFailureAfterSuccess(args) ||
    (typeof args.cooldownUntil === "number" && args.cooldownUntil > now)
  );
}

export function doesTreeRefreshClaimMatch(args: {
  claimedStartedAt?: number | undefined;
  treeRefreshStartedAt?: number | undefined;
}): boolean {
  return (
    typeof args.claimedStartedAt === "number" && args.treeRefreshStartedAt === args.claimedStartedAt
  );
}
