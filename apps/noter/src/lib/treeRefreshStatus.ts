import {
  getLastRepositoryMetadataRefreshAt,
  isRepositoryMetadataStale,
  TREE_REFRESH_DEBOUNCE_MS,
  TREE_REFRESH_STALE_LOCK_MS,
} from "../../shared/treeRefresh";

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

type DashboardRefreshTrigger = "visibility" | "page_load";

/**
 * Collapses the shared repo refresh timestamps into the UI state used by the
 * dashboard and sync strip.
 *
 * Precedence matters here: a non-stale treeRefreshStartedAt lock wins first,
 * then an active treeRefreshCooldownUntil window, then a lastTreeRefreshFailedAt
 * that is newer than lastTreeRefreshAt. Anything else is idle.
 */
export function getTreeRefreshUiState(
  args: TreeRefreshUiStateArgs,
): TreeRefreshUiState {
  const now = args.now ?? Date.now();

  if (
    typeof args.treeRefreshStartedAt === "number" &&
    now - args.treeRefreshStartedAt < TREE_REFRESH_STALE_LOCK_MS
  ) {
    return { kind: "syncing" };
  }

  if (
    typeof args.treeRefreshCooldownUntil === "number" &&
    args.treeRefreshCooldownUntil > now
  ) {
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

/**
 * Dashboard auto-refresh keeps the cheap default-branch tree debounce, but it
 * should still backfill repo metadata when branch rows are missing or stale.
 */
export function shouldAutoRefreshVault(args: {
  lastTreeRefreshAt?: number;
  remoteBranches: Array<{
    remoteState: "active" | "deleted_upstream";
    lastSyncedAt: number;
    pullRequestNumber?: number;
    cloudflareBranchPreviewUrl?: string;
  }>;
  trigger: DashboardRefreshTrigger;
  now?: number;
}): boolean {
  const now = args.now ?? Date.now();
  const activeRemoteBranches = args.remoteBranches.filter(
    (branch) => branch.remoteState === "active",
  );
  const freshnessBranches =
    activeRemoteBranches.length > 0
      ? activeRemoteBranches
      : args.remoteBranches;
  const hasMissingPreviewLinks = activeRemoteBranches.some(
    (branch) =>
      typeof branch.pullRequestNumber === "number" &&
      typeof branch.cloudflareBranchPreviewUrl !== "string",
  );
  const metadataStale =
    hasMissingPreviewLinks ||
    isRepositoryMetadataStale({
      lastRepositoryMetadataRefreshAt:
        getLastRepositoryMetadataRefreshAt(freshnessBranches),
      now,
    });

  if (args.trigger === "visibility") {
    return metadataStale;
  }

  return (
    metadataStale ||
    typeof args.lastTreeRefreshAt !== "number" ||
    now - args.lastTreeRefreshAt >= TREE_REFRESH_DEBOUNCE_MS
  );
}
