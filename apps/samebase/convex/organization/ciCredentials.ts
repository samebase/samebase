import { notEmpty } from "@samebase/dependent/main";
import { ConvexError } from "convex/values";

import type { CloudflareAccount } from "../cloudflareAccountDiscovery";
import { createCloudflareClient } from "../cloudflareApi/client";
import { Cloudflare } from "../cloudflareApi/generated/sdk.gen";
import { verifyConvexTeamAccessToken } from "../convexManagementApi/client";
import { ConvexManagementApiError } from "../convexManagementApi/errors";

/* The checks of the organization's CI tokens. Saving a token runs them. */

/**
One read per permission group that the template's setup stack needs, the groups that
buildCloudflareCiApiTokenUrl preselects. A read cannot prove Edit, so a token with only Read passes
here and fails in the stack's first deploy. A probe reads only Cloudflare's success flag, so it
parses no response body.
*/
const CLOUDFLARE_CI_TOKEN_PROBES = [
  { permission: "Account Settings Read", url: "/accounts/{account_id}", query: {} },
  { permission: "Workers Scripts Edit", url: "/accounts/{account_id}/workers/scripts", query: {} },
  // Alchemy's state store in the account reads its bearer token from the Secrets Store.
  {
    permission: "Secrets Store Edit",
    url: "/accounts/{account_id}/secrets_store/stores",
    query: { page: 1, per_page: 1 },
  },
  // The read that @samebase/alchemy-cloudflare-workers-builds makes before it links the Worker:
  // the account's Workers Builds tokens.
  {
    permission: "Workers Builds Configuration Edit",
    url: "/accounts/{account_id}/builds/tokens",
    query: { page: 1, per_page: 1 },
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
  const client = createCloudflareClient({ token: args.token, transport: "direct" });
  const verification = await Cloudflare.GET["/user/tokens/verify"]({ client }).then(
    ({ result }) => result,
    () => undefined,
  );
  if (verification?.status !== "active") {
    throw new ConvexError(
      "Cloudflare could not verify the Cloudflare CI token as an active API token. Save a new token from the Cloudflare API tokens link under CI credentials on the Providers page, or try again.",
    );
  }

  const missing = (
    await Promise.all(
      CLOUDFLARE_CI_TOKEN_PROBES.map((probe) =>
        client
          .get({ url: probe.url, path: { account_id: args.account.accountId }, query: probe.query })
          .then(
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
