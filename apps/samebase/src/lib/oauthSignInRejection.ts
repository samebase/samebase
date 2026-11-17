import { useOauth } from "@convex-dev/auth/methods/oauth/react";
import { ConvexError } from "convex/values";

/**
The message that Samebase's sign-in callbacks rejected the last OAuth sign-in with, or null. The
callbacks throw a ConvexError with a message for the user, and Convex Auth reports it after the
redirect back as an `OTHER_ERROR` flow error whose `cause` is that ConvexError.
*/
export function useOAuthSignInRejection(): string | null {
  const { flowError } = useOauth();
  return flowError?.error === "OTHER_ERROR" &&
    flowError.cause instanceof ConvexError &&
    typeof flowError.cause.data === "string"
    ? flowError.cause.data
    : null;
}
