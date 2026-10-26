import { TREE_REFRESH_STALE_LOCK_MS } from "@samebase/git-editor/treeRefresh";

type TreeRefreshFailureKind = "failed" | "rate_limited";

type TreeRefreshUiStateArgs = {
  now?: number;
  treeRefreshStartedAt?: number;
  lastTreeRefreshAt?: number;
  lastTreeRefreshFailedAt?: number;
  treeRefreshFailureKind?: TreeRefreshFailureKind;
  treeRefreshCooldownUntil?: number;
};

type TreeRefreshUiState =
  | { kind: "syncing" }
  | { kind: "rate_limited"; cooldownUntil: number }
  | { kind: "cooldown"; cooldownUntil: number }
  | { kind: "failed" }
  | { kind: "idle" };

/**
 * Collapses the connected repository's live tree-refresh coordination fields into
 * the state rendered by FileView's repository sync status.
 *
 * Precedence matters here: a non-stale treeRefreshStartedAt lock wins first,
 * then an active treeRefreshCooldownUntil window, then a lastTreeRefreshFailedAt
 * that is newer than lastTreeRefreshAt. Anything else is idle.
 */
export function getTreeRefreshUiState(args: TreeRefreshUiStateArgs): TreeRefreshUiState {
  const now = args.now ?? Date.now();

  if (
    typeof args.treeRefreshStartedAt === "number" &&
    now - args.treeRefreshStartedAt < TREE_REFRESH_STALE_LOCK_MS
  ) {
    return { kind: "syncing" };
  }

  if (typeof args.treeRefreshCooldownUntil === "number" && args.treeRefreshCooldownUntil > now) {
    if (args.treeRefreshFailureKind === "rate_limited") {
      return {
        kind: "rate_limited",
        cooldownUntil: args.treeRefreshCooldownUntil,
      };
    }

    return {
      kind: "cooldown",
      cooldownUntil: args.treeRefreshCooldownUntil,
    };
  }

  if (
    typeof args.lastTreeRefreshFailedAt === "number" &&
    (typeof args.lastTreeRefreshAt !== "number" ||
      args.lastTreeRefreshFailedAt > args.lastTreeRefreshAt)
  ) {
    return { kind: "failed" };
  }

  return { kind: "idle" };
}
