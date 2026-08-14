import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { resolveCloudflareApiTransport } from "./cloudflareApi/client";
import { listCloudflareBuildTokens } from "./cloudflareResources";
import { action } from "./functions";
import {
  cloudflareListWorkersBuildTokensContract,
  type CloudflareWorkersBuildTokens,
} from "./vault/contracts/cloudflareBuildTokens";

export async function listWorkersBuildTokensForUser(
  ctx: Pick<ActionCtx, "runAction" | "runQuery">,
  args: { userId: Id<"users">; organizationId: Id<"organizations"> },
): Promise<CloudflareWorkersBuildTokens> {
  const organizationId = await ctx.runQuery(
    internal.organizationAccess.requireOrganizationIdForUser,
    {
      userId: args.userId,
      organizationId: args.organizationId,
    },
  );
  const connection = await ctx.runAction(
    internal.cloudflareOAuth.resolveConnectionForOrganization,
    {
      userId: args.userId,
      organizationId,
    },
  );
  const token = connection?.auth.credential.trim();
  const accountId = connection?.account.accountId.trim();
  if (!connection || !token || !accountId) {
    throw new Error("Cloudflare connection is required.");
  }
  const tokens = await listCloudflareBuildTokens({
    token,
    transport: resolveCloudflareApiTransport(connection.auth.method),
    accountId,
  });
  return {
    accountId,
    tokens: tokens.map((buildToken) => ({
      uuid: buildToken.uuid,
      name: buildToken.name,
    })),
  };
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
