import type { api } from "../../../convex/_generated/api";
import { getCloudflareBranchPreviewHydrationTargets } from "@/lib/cloudflarePreviewLinks";
import { shouldAutoRefreshVault } from "@/lib/treeRefreshStatus";
import { claimRefreshDebounce } from "@/lib/treeRefreshDebounce";
import { useCallback, useEffect, useRef } from "react";

const DASHBOARD_REFRESH_CONCURRENCY = 3;

type DashboardTreeRefreshTrigger = "visibility" | "page_load";
type DashboardRefreshTree = (
  args: (typeof api.github.refreshRepositoryTree)["_args"],
) => Promise<(typeof api.github.refreshRepositoryTree)["_returnType"]>;
type EnqueueDashboardRepositoryRefresh = (
  args: (typeof api.repositoryRefresh.enqueueDashboardRepositoryRefresh)["_args"],
) => Promise<
  (typeof api.repositoryRefresh.enqueueDashboardRepositoryRefresh)["_returnType"]
>;
type EnqueueManualRepositoryRefresh = (
  args: (typeof api.repositoryRefresh.enqueueManualRepositoryRefresh)["_args"],
) => Promise<
  (typeof api.repositoryRefresh.enqueueManualRepositoryRefresh)["_returnType"]
>;

export type VaultDashboardVault = NonNullable<
  (typeof api.vault.getUserVaults)["_returnType"]
>[number];
export type DashboardManualRefreshVault = Pick<
  VaultDashboardVault,
  | "_id"
  | "ghRepoName"
  | "ghRepoOwner"
  | "remoteBranches"
  | "repositoryFullName"
  | "state"
  | "treeRefreshCooldownUntil"
>;

/**
 * Owns repository tree refresh scheduling and manual dashboard refreshes. Keep
 * this as a hook while refreshes depend on browser visibility and React action
 * calls; remove it by moving scheduling to the backend or route data layer.
 */
export function useDashboardRepositoryTreeRefresh({
  enqueueDashboardRepositoryRefresh,
  enqueueManualRepositoryRefresh,
  refreshTree,
  vaults,
}: {
  enqueueDashboardRepositoryRefresh: EnqueueDashboardRepositoryRefresh;
  enqueueManualRepositoryRefresh: EnqueueManualRepositoryRefresh;
  refreshTree: DashboardRefreshTree;
  vaults: VaultDashboardVault[] | undefined;
}) {
  const enqueueDashboardDemand = useCallback(
    (trigger: DashboardTreeRefreshTrigger) => {
      if (!vaults) {
        return;
      }

      // The browser loops through opaque backend pages, not vault ids. Convex
      // owns which vaults each page contains.
      void (async () => {
        let cursor: string | null = null;
        let isDone = false;
        while (!isDone) {
          const page = await enqueueDashboardRepositoryRefresh({
            trigger,
            cursor,
          });
          isDone = page.isDone;
          if (!page.continueCursor) {
            if (isDone) {
              return;
            }
            throw new Error(
              "Dashboard refresh demand page is missing a continuation cursor.",
            );
          }
          cursor = page.continueCursor;
        }
      })().catch((error: unknown) => {
        console.error(
          "Failed to enqueue repository refresh demand from dashboard:",
          error,
        );
      });
    },
    [enqueueDashboardRepositoryRefresh, vaults],
  );

  const refreshVaultTreesIfNeeded = useCallback(
    (trigger: DashboardTreeRefreshTrigger = "visibility") => {
      if (!vaults || vaults.length === 0) {
        return;
      }
      enqueueDashboardDemand(trigger);

      const now = Date.now();
      const readyVaults = vaults.filter((vault) => vault.state === "ready");
      const vaultsToRefresh = readyVaults.filter((vault) =>
        typeof vault.treeRefreshCooldownUntil !== "number" ||
        vault.treeRefreshCooldownUntil <= now
          ? shouldAutoRefreshVault({
              lastTreeRefreshAt: vault.lastTreeRefreshAt,
              remoteBranches: vault.remoteBranches,
              trigger,
              now,
            }) && claimRefreshDebounce("dashboard", vault.repositoryFullName)
          : false,
      );

      if (vaultsToRefresh.length === 0) {
        return;
      }

      void (async () => {
        for (
          let index = 0;
          index < vaultsToRefresh.length;
          index += DASHBOARD_REFRESH_CONCURRENCY
        ) {
          const batch = vaultsToRefresh.slice(
            index,
            index + DASHBOARD_REFRESH_CONCURRENCY,
          );

          await Promise.all(
            batch.map(async (vault) => {
              const cloudflarePreviewBranchNames =
                getCloudflareBranchPreviewHydrationTargets(
                  vault.remoteBranches,
                );
              await refreshTree({
                owner: vault.ghRepoOwner,
                repo: vault.ghRepoName,
                // Preview-comment scans are expensive compared to the default
                // branch tree refresh itself, so only re-run them for the
                // current PR branches that still lack cached preview metadata.
                includeCloudflarePreviewLinks:
                  cloudflarePreviewBranchNames.length > 0,
                cloudflarePreviewBranchNames,
                trigger,
              }).catch((error: unknown) => {
                console.error(
                  "Failed to refresh repository tree from dashboard:",
                  error,
                );
              });
            }),
          );
        }
      })();
    },
    [enqueueDashboardDemand, refreshTree, vaults],
  );

  useVisibleDashboardRepositoryTreeRefresh({
    refreshVaultTreesIfNeeded,
    vaults,
  });

  const refreshVaultTreeFromStatusClick = useCallback(
    (vault: DashboardManualRefreshVault) => {
      if (vault.state !== "ready") {
        return;
      }

      void enqueueManualRepositoryRefresh({
        vaultId: vault._id,
      }).catch((error: unknown) => {
        console.error(
          "Failed to enqueue manual repository refresh demand:",
          error,
        );
      });

      if (
        (typeof vault.treeRefreshCooldownUntil === "number" &&
          vault.treeRefreshCooldownUntil > Date.now()) ||
        !claimRefreshDebounce("dashboard", vault.repositoryFullName)
      ) {
        return;
      }

      const cloudflarePreviewBranchNames =
        getCloudflareBranchPreviewHydrationTargets(vault.remoteBranches);

      void refreshTree({
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        includeCloudflarePreviewLinks: cloudflarePreviewBranchNames.length > 0,
        cloudflarePreviewBranchNames,
        trigger: "manual",
      }).catch((error: unknown) => {
        console.error(
          "Failed to refresh repository tree from dashboard status click:",
          error,
        );
      });
    },
    [enqueueManualRepositoryRefresh, refreshTree],
  );

  return {
    refreshVaultTreeFromStatusClick,
  };
}

/**
 * Schedules dashboard repository tree refreshes for visible page load and tab
 * resume. Remove this hook by moving refresh scheduling to backend work or a
 * route-level data invalidation layer.
 */
function useVisibleDashboardRepositoryTreeRefresh({
  refreshVaultTreesIfNeeded,
  vaults,
}: {
  refreshVaultTreesIfNeeded: (trigger?: DashboardTreeRefreshTrigger) => void;
  vaults: VaultDashboardVault[] | undefined;
}) {
  const initialDashboardPageLoadSentRef = useRef(false);

  useEffect(() => {
    if (!vaults || vaults.length === 0) {
      return;
    }

    const triggerInitialPageLoad = () => {
      if (initialDashboardPageLoadSentRef.current) {
        return;
      }
      initialDashboardPageLoadSentRef.current = true;
      refreshVaultTreesIfNeeded("page_load");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (!initialDashboardPageLoadSentRef.current) {
        triggerInitialPageLoad();
        return;
      }

      refreshVaultTreesIfNeeded("visibility");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (document.visibilityState === "visible") {
      triggerInitialPageLoad();
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshVaultTreesIfNeeded, vaults]);
}
