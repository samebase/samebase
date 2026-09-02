import { guard } from "@samebase/dependent/main";
import type { Doc } from "../_generated/dataModel";
import { isRepositoryDeletingOrDeleteFailed } from "./deletion/state";

export type ConnectedRepository = Extract<Doc<"repositories">, { state: "connected" }>;
export type SamebaseManagedConnectedRepository = Extract<
  ConnectedRepository,
  { githubMode: "create_repository" }
>;

export const isConnectedRepository = guard<
  Doc<"repositories"> | null | undefined,
  ConnectedRepository
>((repository) => (repository?.state === "connected" ? repository : null));

export const isLiveConnectedRepository = guard<
  Doc<"repositories"> | null | undefined,
  ConnectedRepository
>((repository) =>
  isConnectedRepository(repository) && !isRepositoryDeletingOrDeleteFailed(repository)
    ? repository
    : null,
);

/**
 * Asserts both that the repository row exists and that repo-backed code can use it.
 * Callers that need different errors for missing vs. pre-GitHub repositories should
 * split those checks before calling this helper.
 */
export function assertConnectedRepository(
  repository: Doc<"repositories"> | null | undefined,
): ConnectedRepository {
  if (!isLiveConnectedRepository(repository)) {
    if (repository && isRepositoryDeletingOrDeleteFailed(repository)) {
      const deletion = repository.deletion;
      throw new Error(
        deletion.state === "delete_failed"
          ? "Repository deletion failed. Retry deletion to continue."
          : "Repository deletion is in progress.",
      );
    }
    throw new Error("Repository is not connected to a GitHub repository.");
  }
  return repository;
}

export const isSamebaseManagedRepository = guard<
  ConnectedRepository,
  SamebaseManagedConnectedRepository
>((repository) => (repository.githubMode === "create_repository" ? repository : null));
