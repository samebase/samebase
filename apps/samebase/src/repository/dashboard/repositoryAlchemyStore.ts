import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";

/**
Whether the page can read the Alchemy store of this repository. The store lives in the repository's
Convex team, and `connect` refuses a repository that is not connected yet or that is being deleted.
The repository row is live, so a page that opens during creation starts the read when the repository
connects.
*/
export function canReadRepositoryAlchemyStore(
  repository: Pick<UserRepositoryResult, "convexTeamId" | "hasConnectedGitHubRepository"> & {
    deletion: Pick<UserRepositoryResult["deletion"], "state">;
  },
): boolean {
  return (
    Boolean(repository.convexTeamId) &&
    repository.hasConnectedGitHubRepository &&
    repository.deletion.state === "not_deleting"
  );
}
