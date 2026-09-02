import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { summarizeRepositoryChecks, type RepositoryCheckSummary } from "@/lib/repositoryChecks";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";

const SIDEBAR_SUMMARIES_STALE_MS = 60_000;
const SIDEBAR_SUMMARIES_GC_MS = 5 * 60_000;

export type RepositorySidebarSummary = {
  repositoryId: Id<"repositories">;
  openPullRequestCount: number;
  checks: RepositoryCheckSummary;
};

export type RepositorySidebarSummariesState =
  | { state: "loading" }
  | { state: "failed" }
  | {
      state: "loaded";
      summaries: readonly RepositorySidebarSummary[];
    };

export function useRepositorySidebarSummaries(): RepositorySidebarSummariesState {
  const listRepositorySidebarSummaries = useAction(
    api.repositoryPullRequests.listRepositorySidebarSummaries,
  );
  const summariesQuery = useQuery({
    queryKey: ["repository-sidebar-summaries"],
    queryFn: async () => {
      const summaries = await listRepositorySidebarSummaries({});
      return summaries.flatMap((summary) =>
        summary.repository
          ? [
              {
                repositoryId: summary.repositoryId,
                openPullRequestCount: summary.repository.openPullRequestCount,
                checks: summarizeRepositoryChecks(summary.repository.statusCheckRollup),
              },
            ]
          : [],
      );
    },
    staleTime: SIDEBAR_SUMMARIES_STALE_MS,
    gcTime: SIDEBAR_SUMMARIES_GC_MS,
    retry: false,
    // A completed commit can be replaced by a new commit with running checks,
    // so the sidebar must refresh even when its current summary is settled.
    refetchInterval: SIDEBAR_SUMMARIES_STALE_MS,
    refetchIntervalInBackground: false,
  });

  if (!summariesQuery.data) {
    return summariesQuery.isError ? { state: "failed" } : { state: "loading" };
  }
  return {
    state: "loaded",
    summaries: summariesQuery.data,
  };
}
