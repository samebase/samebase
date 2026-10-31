import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";

/**
True while Samebase creates the repository. `connect` refuses a repository that is not connected, so
the page holds its read of the Alchemy store as loading until then. The repository row is live, so
the read starts when the repository connects.
*/
export function isRepositoryBeingCreated(
  repository: Pick<UserRepositoryResult, "hasConnectedGitHubRepository"> & {
    sourceSetup: Pick<UserRepositoryResult["sourceSetup"], "status">;
  },
): boolean {
  return !repository.hasConnectedGitHubRepository && repository.sourceSetup.status === "running";
}
