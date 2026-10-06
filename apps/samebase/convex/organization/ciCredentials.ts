import { ConvexError } from "convex/values";

import type { CloudflareAccount } from "../cloudflareAccountDiscovery";
import { createCloudflareClient } from "../cloudflareApi/client";
import { Cloudflare } from "../cloudflareApi/generated/sdk.gen";
import { verifyConvexTeamAccessToken } from "../convexManagementApi/client";
import { ConvexManagementApiError } from "../convexManagementApi/errors";
import type {
  CompleteOrganizationCiCredentials,
  OrganizationCiCredentials,
} from "./providerCredentialModel";

/*
The checks of the CI tokens that a repository_actions repository receives as GitHub Actions secrets.
Saving a token runs them, and so does every repository_actions creation, because a token can be
revoked after it was saved.
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

/**
The Cloudflare CI token must reach Workers Builds in that account: the repository's setup stack links
the repository to its Worker there. One read of the account's build tokens catches a token saved
before the preset asked for Workers Builds Configuration. A read cannot prove Edit, so a token with
only Read passes and fails in the stack's first deploy. Any failure stops the save or the create,
and the message also covers a failure that a retry fixes.
*/
export async function requireCloudflareCiWorkersBuildsAccess(args: {
  token: string;
  account: CloudflareAccount;
}): Promise<void> {
  try {
    await Cloudflare.GET["/accounts/{account_id}/builds/tokens"]({
      client: createCloudflareClient({ token: args.token, transport: "direct" }),
      path: { account_id: args.account.accountId },
      query: { page: 1, per_page: 1 },
    });
  } catch {
    throw new ConvexError(
      `Cloudflare could not confirm that the Cloudflare CI token reaches Workers Builds in the Cloudflare account ${args.account.accountName}. The token needs Workers Builds Configuration Edit. Try again, or save a new token on the Providers page.`,
    );
  }
}

/** The Convex CI token must read the organization's connected Convex team. */
export async function requireConvexCiTeamAccess(args: {
  token: string;
  teamId: string;
  teamLabel: string;
}): Promise<void> {
  try {
    await verifyConvexTeamAccessToken({ token: args.token, teamId: args.teamId });
  } catch (error) {
    if (
      error instanceof ConvexManagementApiError &&
      (error.status === 401 || error.status === 403 || error.status === 404)
    ) {
      throw new ConvexError(`The Convex CI token cannot read the Convex team ${args.teamLabel}.`);
    }
    throw new ConvexError("Convex could not verify the Convex CI token.");
  }
}

/** Both CI tokens, saved for the organization's current Convex team and Cloudflare account. */
export function requireCompleteCiCredentials(args: {
  ci: OrganizationCiCredentials | null;
  convexTeamId: string;
  cloudflareAccountId: string;
  githubOwnerLogin: string;
}): CompleteOrganizationCiCredentials {
  const { ci } = args;
  if (
    !ci?.cloudflare ||
    !ci.convex ||
    ci.cloudflare.accountId !== args.cloudflareAccountId ||
    ci.convex.teamId !== args.convexTeamId
  ) {
    throw new ConvexError(
      `Save the Cloudflare and Convex CI tokens on the Providers page (/org/${args.githubOwnerLogin}/providers) before you create a repository that its GitHub Actions set up.`,
    );
  }
  return { cloudflare: ci.cloudflare, convex: ci.convex };
}
