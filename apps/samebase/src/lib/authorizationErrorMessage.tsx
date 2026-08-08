import type { ReactNode } from "react";
import type { AuthorizationError, AuthorizationProvider } from "../../shared/authorizationError";

type AuthorizationTargets = {
  cloudflareAccountName?: string;
  convexTeamName?: string;
  githubOwnerLogin?: string;
};

function readProviderCopy(provider: AuthorizationProvider): {
  authorizationLabel: string;
  connectionLabel: string;
} {
  switch (provider) {
    case "convex":
      return { authorizationLabel: "Convex authorization", connectionLabel: "Convex" };
    case "cloudflare":
      return { authorizationLabel: "Cloudflare authorization", connectionLabel: "Cloudflare" };
    case "github-app":
      return { authorizationLabel: "GitHub App setup", connectionLabel: "GitHub App" };
    case "github-user":
      return {
        authorizationLabel: "Personal repository authorization",
        connectionLabel: "personal repository",
      };
    case "google-sign-in":
      return { authorizationLabel: "Google sign-in", connectionLabel: "Google sign-in" };
    case "github-sign-in":
      return { authorizationLabel: "GitHub sign-in", connectionLabel: "GitHub sign-in" };
    default:
      provider satisfies never;
      return { authorizationLabel: "Authorization", connectionLabel: "Provider" };
  }
}

export function formatAuthorizationErrorMessage(
  authorizationError: AuthorizationError,
  targets: AuthorizationTargets = {},
): ReactNode {
  const { authorizationLabel, connectionLabel } = readProviderCopy(authorizationError.provider);
  switch (authorizationError.code) {
    case "canceled":
      return `${authorizationLabel} was canceled. No changes were saved.`;
    case "expired":
      return `${authorizationLabel} expired. Start again.`;
    case "access-changed":
      return "You no longer have permission to complete this authorization. No changes were saved.";
    case "configuration-changed":
      return `The ${connectionLabel} connection changed before authorization finished. Start again.`;
    case "target-mismatch":
      switch (authorizationError.provider) {
        case "convex":
          return targets.convexTeamName ? (
            <>
              Select Convex team <strong className="font-semibold">{targets.convexTeamName}</strong>{" "}
              to reauthorize this organization.
            </>
          ) : (
            "Select the configured Convex team to reauthorize this organization."
          );
        case "cloudflare":
          return targets.cloudflareAccountName ? (
            <>
              Select <strong className="font-semibold">ONLY ONE</strong> Cloudflare account to
              reconnect: <strong className="font-semibold">{targets.cloudflareAccountName}</strong>.
            </>
          ) : (
            "Select ONLY ONE Cloudflare account to connect."
          );
        case "github-app":
          return targets.githubOwnerLogin ? (
            <>
              Reconnect the GitHub App for{" "}
              <strong className="font-semibold">{targets.githubOwnerLogin}</strong>. The selected
              installation belongs to a different GitHub owner.
            </>
          ) : (
            "Reconnect the GitHub App for the configured owner. The selected installation belongs to a different GitHub owner."
          );
        case "github-user":
          return targets.githubOwnerLogin
            ? `Sign in to GitHub as @${targets.githubOwnerLogin} to authorize personal repository creation.`
            : "Sign in as the personal GitHub owner to authorize repository creation.";
        case "google-sign-in":
        case "github-sign-in":
          return "Select the provider account that is connected to this Samebase account.";
        default:
          authorizationError.provider satisfies never;
          return "Select the configured authorization target.";
      }
    case "failed":
      return `${authorizationLabel} failed. Try again.`;
    default:
      authorizationError.code satisfies never;
      return "Authorization could not be completed. Try again.";
  }
}
