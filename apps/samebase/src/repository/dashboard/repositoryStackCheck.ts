import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import {
  CONNECT_CONVEX_TO_CHECK_STACK,
  DESTROY_ALCHEMY_STACK_FIRST,
} from "../../../shared/alchemyStateModel";
import type { RepositoryAlchemyState } from "./useRepositoryAlchemyState";

type RepositoryStackCheck =
  | { state: "no_stack" }
  | { state: "has_stack" | "unknown"; reason: string };

/** The store's answer for the dialog. The server checks again in `assertRepositoryHasNoStack`. */
export function readRepositoryStackCheck(
  repository: Pick<UserRepositoryResult, "convexTeamId">,
  alchemyState: RepositoryAlchemyState,
): RepositoryStackCheck {
  // The store read of a repository without a Convex team never leaves `loading`.
  if (!repository.convexTeamId) {
    return { state: "unknown", reason: CONNECT_CONVEX_TO_CHECK_STACK };
  }
  switch (alchemyState.state) {
    case "loading":
      return { state: "unknown", reason: "Checking for an Alchemy stack." };
    case "failed":
      return { state: "unknown", reason: "Samebase cannot read your Alchemy state store." };
    case "loaded": {
      const { observation } = alchemyState;
      switch (observation.store) {
        case "missing":
          return { state: "no_stack" };
        case "no_connection":
          return { state: "unknown", reason: CONNECT_CONVEX_TO_CHECK_STACK };
        case "found":
          return observation.stacks.length === 0
            ? { state: "no_stack" }
            : { state: "has_stack", reason: DESTROY_ALCHEMY_STACK_FIRST };
        default:
          observation satisfies never;
          throw new Error("Unknown Alchemy state observation.");
      }
    }
    default:
      alchemyState satisfies never;
      throw new Error("Unknown Alchemy state.");
  }
}
