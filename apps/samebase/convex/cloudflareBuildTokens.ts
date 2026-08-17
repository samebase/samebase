import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { CloudflareApiError, resolveCloudflareApiTransport } from "./cloudflareApi/client";
import { listCloudflareBuildTokens } from "./cloudflareResources";
import { action } from "./functions";
import {
  cloudflareListWorkersBuildTokensContract,
  type CloudflareWorkersBuildTokens,
} from "./vault/contracts/cloudflareBuildTokens";

export async function listWorkersBuildTokensForUser(
  ctx: Pick<ActionCtx, "runAction">,
  args: { userId: Id<"users">; organizationId: Id<"organizations"> },
): Promise<CloudflareWorkersBuildTokens> {
  const connection = await ctx.runAction(
    internal.cloudflareOAuth.resolveConnectionForOrganization,
    {
      userId: args.userId,
      organizationId: args.organizationId,
    },
  );
  const token = connection?.auth.credential.trim();
  const accountId = connection?.account.accountId.trim();
  if (!connection || !token || !accountId) {
    throw new Error("Cloudflare connection is required.");
  }
  try {
    const tokens = await listCloudflareBuildTokens({
      token,
      transport: resolveCloudflareApiTransport(connection.auth.method),
      accountId,
    });
    const lastUsedBuildTokenUuid = connection.account.lastUsedBuildTokenUuid;
    return {
      accountId,
      lastUsedBuildTokenUuid:
        lastUsedBuildTokenUuid &&
        tokens.some((buildToken) => buildToken.uuid === lastUsedBuildTokenUuid)
          ? lastUsedBuildTokenUuid
          : null,
      tokens: tokens.map((buildToken) => ({
        uuid: buildToken.uuid,
        name: buildToken.name,
      })),
    };
  } catch (error) {
    if (error instanceof CloudflareApiError) {
      throw new Error("Could not load Cloudflare Workers Builds tokens.");
    }
    throw error;
  }
}

export const list = action({
  access: cloudflareListWorkersBuildTokensContract.access,
  args: cloudflareListWorkersBuildTokensContract.args,
  returns: cloudflareListWorkersBuildTokensContract.returns,
  mcp: cloudflareListWorkersBuildTokensContract.mcp,
  handler: async (ctx, args): Promise<CloudflareWorkersBuildTokens> =>
    await listWorkersBuildTokensForUser(ctx, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    }),
});
