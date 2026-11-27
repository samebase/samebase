import * as accounts from "@distilled.cloud/cloudflare/accounts";
import * as secretsStore from "@distilled.cloud/cloudflare/secrets_store";
import * as user from "@distilled.cloud/cloudflare/user";
import * as workers from "@distilled.cloud/cloudflare/workers";
import * as workersBuilds from "@distilled.cloud/cloudflare/workers_builds";
import { notEmpty } from "@samebase/dependent/main";
import { ConvexError } from "convex/values";

import type { CloudflareAccount } from "../cloudflareAccountDiscovery";
import { runCloudflare } from "../cloudflareApi";
import { verifyConvexTeamAccessToken } from "../convexManagementApi/client";
import { ConvexManagementApiError } from "../convexManagementApi/errors";

/* The checks of the organization's CI tokens. Saving a token runs them. */

/**
One read per permission group that the template's setup stack needs, the groups that
buildCloudflareCiApiTokenUrl preselects. A read cannot prove Edit, so a token with only Read passes
here and fails in the stack's first deploy.
*/
const CLOUDFLARE_CI_TOKEN_PROBES = [
  {
    permission: "Account Settings Read",
    read: (accountId: string) => accounts.getAccount({ accountId }),
  },
  {
    permission: "Workers Scripts Edit",
    read: (accountId: string) => workers.listScripts({ accountId }),
  },
  // Alchemy's state store in the account reads its bearer token from the Secrets Store.
  {
    permission: "Secrets Store Edit",
    read: (accountId: string) => secretsStore.listStores({ accountId, page: 1, perPage: 1 }),
  },
  // The read that @samebase/alchemy-cloudflare-workers-builds makes before it links the Worker:
  // the account's Workers Builds tokens.
  {
    permission: "Workers Builds Configuration Edit",
    read: (accountId: string) => workersBuilds.listTokens({ accountId, page: 1, perPage: 1 }),
  },
] as const;

/**
The Cloudflare CI token must be an active user API token that reaches the organization's connected
account with every permission group of CLOUDFLARE_CI_TOKEN_PROBES. A probe that Cloudflare could
not answer reads like a missing permission, so the message also says to try again.
*/
export async function requireCloudflareCiTokenPermissions(args: {
  token: string;
  account: CloudflareAccount;
}): Promise<void> {
  const connection = { token: args.token, transport: "direct" } as const;
  const verification = await runCloudflare(connection, user.verifyToken({})).catch(() => undefined);
  if (verification?.status !== "active") {
    throw new ConvexError(
      "Cloudflare could not verify the Cloudflare CI token as an active API token. Save a new token from the Cloudflare API tokens link under CI credentials on the Providers page, or try again.",
    );
  }

  const missing = (
    await Promise.all(
      CLOUDFLARE_CI_TOKEN_PROBES.map((probe) =>
        runCloudflare<unknown, unknown>(connection, probe.read(args.account.accountId)).then(
          () => null,
          () => probe.permission,
        ),
      ),
    )
  ).filter(notEmpty);
  if (missing.length > 0) {
    throw new ConvexError(
      `Cloudflare could not confirm that the Cloudflare CI token has ${missing.join(", ")} in the Cloudflare account ${args.account.accountName}. Save a new token from the Cloudflare API tokens link under CI credentials on the Providers page, which preselects every permission that the setup stack needs, or try again.`,
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
