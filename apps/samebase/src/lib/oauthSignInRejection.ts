import { useOauth } from "@convex-dev/auth/methods/oauth/react";

/**
The message that Samebase's sign-in callbacks rejected the last OAuth sign-in with, or null. The
callbacks throw a ConvexError with a message for the user, and Convex Auth reports it after the
redirect back as a `REJECTED` flow error.
*/
export function useOAuthSignInRejection(): string | null {
  const { flowError } = useOauth();
  return flowError?.error === "REJECTED" && typeof flowError.data === "string"
    ? flowError.data
    : null;
}
