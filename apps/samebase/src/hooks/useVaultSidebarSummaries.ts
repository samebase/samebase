import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { summarizeRepositoryChecks, type RepositoryCheckSummary } from "@/lib/repositoryChecks";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";

const SIDEBAR_SUMMARIES_STALE_MS = 60_000;
const SIDEBAR_SUMMARIES_GC_MS = 5 * 60_000;

export type VaultSidebarSummary = {
  vaultId: Id<"vaults">;
  openPullRequestCount: number;
  checks: RepositoryCheckSummary;
};

export type VaultSidebarSummariesState =
  | { state: "not_requested" }
  | { state: "loading" }
  | { state: "failed" }
  | {
      state: "loaded";
      summaries: readonly VaultSidebarSummary[];
    };

export function useVaultSidebarSummaries(enabled: boolean): VaultSidebarSummariesState {
  const listVaultSidebarSummaries = useAction(api.repositoryPullRequests.listVaultSidebarSummaries);
  const summariesQuery = useQuery({
    queryKey: ["vault-sidebar-summaries"],
    queryFn: async () => {
      const summaries = await listVaultSidebarSummaries({});
      return summaries.flatMap((summary) =>
        summary.repository
          ? [
              {
                vaultId: summary.vaultId,
                openPullRequestCount: summary.repository.openPullRequestCount,
                checks: summarizeRepositoryChecks(summary.repository.statusCheckRollup),
              },
            ]
          : [],
      );
    },
    enabled,
    staleTime: SIDEBAR_SUMMARIES_STALE_MS,
    gcTime: SIDEBAR_SUMMARIES_GC_MS,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.some((summary) => summary.checks.state === "running")
        ? SIDEBAR_SUMMARIES_STALE_MS
        : false,
    refetchIntervalInBackground: false,
  });

  if (!enabled) {
    return { state: "not_requested" };
  }
  if (!summariesQuery.data) {
    return summariesQuery.isError ? { state: "failed" } : { state: "loading" };
  }
  return {
    state: "loaded",
    summaries: summariesQuery.data,
  };
}
