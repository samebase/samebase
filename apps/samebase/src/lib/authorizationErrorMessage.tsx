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
        authorizationLabel: "GitHub authorization",
        connectionLabel: "GitHub",
      };
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
    case "github-sign-in-required":
      return targets.githubOwnerLogin
        ? `Personal GitHub access requires @${targets.githubOwnerLogin} as the GitHub sign-in method for this Samebase account. Sign out, sign in with GitHub as @${targets.githubOwnerLogin}, then try again.`
        : "Sign out and sign in with GitHub before you authorize GitHub. Use the GitHub account whose verified email is the email of this Samebase account.";
    case "github-sign-in-mismatch":
      return targets.githubOwnerLogin
        ? `Use the Samebase account connected to GitHub as @${targets.githubOwnerLogin}, then try again.`
        : "Authorize GitHub with the account connected to this Samebase account.";
    case "expired":
      return `${authorizationLabel} expired. Start again.`;
    case "access-changed":
      return "You no longer have permission to complete this authorization. No changes were saved.";
    case "started-by-another-account":
      return `${authorizationLabel} was started by another Samebase account, so no changes were saved.`;
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
            : "Authorize GitHub with the account connected to this Samebase account.";
        default:
          authorizationError.provider satisfies never;
          return "Select the configured authorization target.";
      }
    case "organization-owner-required":
      return authorizationError.provider === "github-app"
        ? "The GitHub account or organization you selected is already connected to a Samebase organization. Ask one of its owners to add you as an owner."
        : `${authorizationLabel} failed. Try again.`;
    case "failed":
      return `${authorizationLabel} failed. Try again.`;
    default:
      authorizationError.code satisfies never;
      return "Authorization could not be completed. Try again.";
  }
}
