import {
  CLOUDFLARE_STORE_UNREADABLE,
  CONNECT_CONVEX_TO_CHECK_STACK,
  DESTROY_ALCHEMY_STACK_FIRST,
  RECONNECT_CLOUDFLARE_TO_CHECK_STACK,
} from "../../../shared/alchemyStateModel";
import type { RepositoryAlchemyState } from "./useRepositoryAlchemyState";

type RepositoryStackCheck =
  | { state: "no_stack" }
  | { state: "has_stack" | "unknown"; reason: string };

/**
The stores' answer for the dialog. The server checks again in `assertRepositoryHasNoStack`, in the
same order: the Cloudflare store first, then the team's store.
*/
export function readRepositoryStackCheck(
  alchemyState: RepositoryAlchemyState,
): RepositoryStackCheck {
  switch (alchemyState.state) {
    case "loading":
      return { state: "unknown", reason: "Checking for an Alchemy stack." };
    case "failed":
      return { state: "unknown", reason: "Samebase cannot read your Alchemy state store." };
    case "loaded": {
      const { observation, cloudflareProblem } = alchemyState;
      if (
        observation.store === "found" &&
        observation.stacks.some((stack) => stack.store === "cloudflare")
      ) {
        return { state: "has_stack", reason: DESTROY_ALCHEMY_STACK_FIRST };
      }
      if (cloudflareProblem) {
        return {
          state: "unknown",
          reason:
            cloudflareProblem === "reconnect"
              ? RECONNECT_CLOUDFLARE_TO_CHECK_STACK
              : CLOUDFLARE_STORE_UNREADABLE,
        };
      }
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
