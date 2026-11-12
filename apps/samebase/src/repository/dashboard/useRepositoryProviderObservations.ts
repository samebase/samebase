import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import { isRepositoryBeingCreated } from "@/repository/dashboard/repositoryAlchemyStore";
import type { AlchemyStateObservation } from "../../../shared/alchemyStateModel";
import {
  useRepositoryAlchemyState,
  type RepositoryAlchemyState,
} from "./useRepositoryAlchemyState";

/** The stacks of the repository in the Alchemy state stores of its Convex team and Cloudflare account. */
export type RepositoryAlchemyStacks = Extract<AlchemyStateObservation, { store: "found" }>;

type RepositoryProviderObservationTarget = Pick<
  UserRepositoryResult,
  "repositoryId" | "convexTeamId" | "githubRepositoryFullName" | "hasConnectedGitHubRepository"
> & {
  sourceSetup: Pick<UserRepositoryResult["sourceSetup"], "status">;
};

/**
The read of the repository's stores. A repository without a Convex team reads only the store of its
organization's Cloudflare account, and the read stays loading while Samebase creates the repository.
*/
export function useRepositoryProviderObservations(
  repository: RepositoryProviderObservationTarget | null,
): RepositoryAlchemyState {
  const waiting = repository !== null && isRepositoryBeingCreated(repository);
  const read = useRepositoryAlchemyState(
    repository && !waiting ? repository.repositoryId : null,
    repository?.convexTeamId,
    repository?.githubRepositoryFullName,
  );
  return waiting ? { state: "loading" } : read;
}
