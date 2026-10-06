import { ConvexError } from "convex/values";

import type { CloudflareAccount } from "../cloudflareAccountDiscovery";
import type { OrganizationProviderConfiguration } from "../organizationProviderCredentials";
import type { OrganizationCiCredentials } from "./providerCredentialModel";

/*
The credentials of a repository_actions repository's GitHub Actions. The Cloudflare CI token is
pasted once per organization and checked when it is saved and at every creation, because a token
can be revoked after it was saved. The Convex access token is minted per repository through the
organization's Convex OAuth connection.
*/

/** The Cloudflare CI token must reach the organization's connected Cloudflare account. */
export function requireCloudflareCiAccountAccess(
  accounts: readonly CloudflareAccount[],
  account: CloudflareAccount,
): void {
  if (!accounts.some((candidate) => candidate.accountId === account.accountId)) {
    throw new ConvexError(
      `The Cloudflare CI token cannot access the Cloudflare account ${account.accountName}.`,
    );
  }
}

/** The Cloudflare CI token, saved for the organization's current Cloudflare account. */
export function requireCloudflareCiCredential(args: {
  ci: OrganizationCiCredentials | null;
  cloudflareAccountId: string;
  githubOwnerLogin: string;
}): OrganizationCiCredentials["cloudflare"] {
  if (args.ci?.cloudflare.accountId !== args.cloudflareAccountId) {
    throw new ConvexError(
      `Save the Cloudflare CI token on the Providers page (/org/${args.githubOwnerLogin}/providers) before you create a repository that its GitHub Actions set up.`,
    );
  }
  return args.ci.cloudflare;
}

/**
The Convex OAuth token that mints each repository's Convex access token. The Management API mints
team access tokens for an OAuth team token or a personal access token, not for a team access token,
so a Convex connection made with an API key cannot.
*/
export function requireConvexMintingToken(args: {
  configuration: Pick<OrganizationProviderConfiguration, "convexTeam" | "convexCredential">;
  convexTeamId: string;
  githubOwnerLogin: string;
}): string {
  const credential = args.configuration.convexCredential;
  if (
    args.configuration.convexTeam?.teamId !== args.convexTeamId ||
    credential?.auth.method !== "oauth"
  ) {
    throw new ConvexError(
      `GitHub Actions setup needs a Convex connection made with OAuth: Samebase mints each repository's Convex access token through it. Connect Convex with OAuth on the Providers page (/org/${args.githubOwnerLogin}/providers).`,
    );
  }
  return credential.auth.credential;
}
