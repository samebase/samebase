import { type AuthTokenAuthProvider } from "../../shared/authTokenClaims";

export function formatAuthProviderLabel(provider: AuthTokenAuthProvider | undefined): string {
  if (provider === undefined) return "Unknown";
  switch (provider) {
    case "google":
      return "Google";
    case "password":
      return "Password";
    default:
      provider satisfies never;
      return "Unknown";
  }
}
