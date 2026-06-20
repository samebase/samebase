import { TREE_REFRESH_DEBOUNCE_MS } from "../../shared/treeRefresh";

const refreshDebounceByScopeAndKey = new Map<string, number>();

function getRefreshDebounceKey(scope: string, key: string): string {
  return `${scope}:${key}`;
}

export function claimRefreshDebounce(
  scope: string,
  key: string,
  debounceMs = TREE_REFRESH_DEBOUNCE_MS,
): boolean {
  const refreshKey = getRefreshDebounceKey(scope, key);
  const lastRefresh = refreshDebounceByScopeAndKey.get(refreshKey) ?? 0;
  if (Date.now() - lastRefresh < debounceMs) {
    return false;
  }

  refreshDebounceByScopeAndKey.set(refreshKey, Date.now());
  return true;
}

/**
 * Clears an in-memory debounce slot after an async action settles.
 *
 * This is only a browser-tab duplicate-request guard. Convex still owns durable
 * dedupe, cooldown, and retry policy for repository refresh work.
 */
export function releaseRefreshDebounce(scope: string, key: string): void {
  refreshDebounceByScopeAndKey.delete(getRefreshDebounceKey(scope, key));
}
