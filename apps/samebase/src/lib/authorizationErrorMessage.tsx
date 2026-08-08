import type { ReactNode } from "react";
import type { AuthorizationError, AuthorizationProvider } from "../../shared/authorizationError";

type AuthorizationTargets = {
  cloudflareAccountName?: string;
  convexTeamName?: string;
  githubOwnerLogin?: string;
};

function readProviderLabel(provider: AuthorizationProvider): string {
  switch (provider) {
    case "convex":
      return "Convex";
    case "cloudflare":
      return "Cloudflare";
    case "github-app":
      return "GitHub App setup";
    case "github-user":
      return "GitHub authorization";
    default:
      provider satisfies never;
      return "Authorization";
  }
}

export function formatAuthorizationErrorMessage(
  authorizationError: AuthorizationError,
  targets: AuthorizationTargets = {},
): ReactNode {
  const providerLabel = readProviderLabel(authorizationError.provider);
  switch (authorizationError.code) {
    case "canceled":
      return `${providerLabel} was canceled. The existing connection was not changed.`;
    case "expired":
      return `${providerLabel} expired. Start it again.`;
    case "access-changed":
      return `Your access changed while ${providerLabel} was open. Start it again.`;
    case "configuration-changed":
      return `The existing connection changed while ${providerLabel} was open. Start it again.`;
    case "target-mismatch":
      switch (authorizationError.provider) {
        case "convex":
          return targets.convexTeamName ? (
            <>
              This organization is connected to Convex team{" "}
              <strong className="font-semibold">{targets.convexTeamName}</strong>. Select that team
              to reauthorize it.
            </>
          ) : (
            "This organization is connected to a different Convex team. Select the configured team to reauthorize it."
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
              This organization is connected to GitHub owner{" "}
              <strong className="font-semibold">{targets.githubOwnerLogin}</strong>. Select that
              owner to reconnect it.
            </>
          ) : (
            "This organization is connected to a different GitHub owner. Select the configured owner to reconnect it."
          );
        case "github-user":
          return "Select the GitHub user that is connected to this account.";
        default:
          authorizationError.provider satisfies never;
          return "Select the configured authorization target.";
      }
    case "failed":
      return `${providerLabel} could not be completed. Try again.`;
    default:
      authorizationError.code satisfies never;
      return "Authorization could not be completed. Try again.";
  }
}
