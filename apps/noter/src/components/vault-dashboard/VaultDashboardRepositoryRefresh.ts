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

export type VaultDashboardVault = NonNullable<
  (typeof api.vault.getUserVaults)["_returnType"]
>[number];
export type DashboardManualRefreshVault = Pick<
  VaultDashboardVault,
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
  refreshTree,
  vaults,
}: {
  refreshTree: DashboardRefreshTree;
  vaults: VaultDashboardVault[] | undefined;
}) {
  const refreshVaultTreesIfNeeded = useCallback(
    (trigger: DashboardTreeRefreshTrigger = "visibility") => {
      if (!vaults || vaults.length === 0) {
        return;
      }

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
    [refreshTree, vaults],
  );

  useVisibleDashboardRepositoryTreeRefresh({
    refreshVaultTreesIfNeeded,
    vaults,
  });

  const refreshVaultTreeFromStatusClick = useCallback(
    (vault: DashboardManualRefreshVault) => {
      if (
        vault.state !== "ready" ||
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
    [refreshTree],
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
