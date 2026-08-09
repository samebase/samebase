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
    case "account-link-required":
      switch (authorizationError.provider) {
        case "google-sign-in":
          return "The email on this Google account is already used by another Samebase account. Sign in to that account with an existing method.";
        case "github-sign-in":
          return "The primary email on this GitHub account is already used by another Samebase account. Sign in to that account with an existing method, then connect GitHub in Account settings.";
        case "convex":
        case "cloudflare":
        case "github-app":
        case "github-user":
          return `${authorizationLabel} could not use this account. Sign in with an existing method and try again.`;
        default:
          authorizationError.provider satisfies never;
          return "Sign in with an existing method and try again.";
      }
    case "github-sign-in-required":
      return targets.githubOwnerLogin
        ? `Personal GitHub access requires @${targets.githubOwnerLogin} as the GitHub sign-in method for this Samebase account. Connect it in Account settings, then try again.`
        : "Personal GitHub access requires the same GitHub account as the GitHub sign-in method for this Samebase account. Connect GitHub in Account settings, then try again.";
    case "github-sign-in-mismatch":
      return targets.githubOwnerLogin
        ? `Use the Samebase account connected to GitHub as @${targets.githubOwnerLogin}, then try again.`
        : "Use a Samebase account whose GitHub sign-in method matches the personal GitHub account, then try again.";
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
              You selected a different GitHub account or organization. Select{" "}
              <strong className="font-semibold">@{targets.githubOwnerLogin}</strong> to reconnect
              this Samebase organization, or add your selection as a new Samebase organization.
            </>
          ) : (
            "You selected a different GitHub account or organization. Select the configured GitHub owner to reconnect this Samebase organization, or add your selection as a new Samebase organization."
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
