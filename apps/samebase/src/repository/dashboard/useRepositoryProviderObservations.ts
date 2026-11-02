import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import { isRepositoryBeingCreated } from "@/repository/dashboard/repositoryAlchemyStore";
import type { AlchemyStateObservation } from "../../../shared/alchemyStateModel";
import {
  useRepositoryAlchemyState,
  type RepositoryAlchemyState,
} from "./useRepositoryAlchemyState";

/** The stacks of the repository in the Alchemy state store of its Convex team. */
export type RepositoryAlchemyStacks = Extract<AlchemyStateObservation, { store: "found" }>;

type RepositoryProviderObservationTarget = Pick<
  UserRepositoryResult,
  "repositoryId" | "convexTeamId" | "hasConnectedGitHubRepository"
> & {
  sourceSetup: Pick<UserRepositoryResult["sourceSetup"], "status">;
};

/**
The read of the team's store. The store lives in the Convex team of the repository, so a repository
without one reads no store, and the read stays loading while Samebase creates the repository.
*/
export function useRepositoryProviderObservations(
  repository: RepositoryProviderObservationTarget | null,
): RepositoryAlchemyState {
  const withTeam = repository?.convexTeamId ? repository : null;
  const waiting = withTeam !== null && isRepositoryBeingCreated(withTeam);
  const read = useRepositoryAlchemyState(
    withTeam && !waiting ? withTeam.repositoryId : null,
    withTeam?.convexTeamId,
  );
  return waiting ? { state: "loading" } : read;
}
