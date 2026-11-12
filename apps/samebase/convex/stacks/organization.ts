import { v } from "convex/values";
import { vOrganizationStacks, type OrganizationStacks } from "../../shared/stateStoreStacks";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { ResolvedCloudflareConnection } from "../cloudflareOAuth";
import { action } from "../functions";
import { organizationProviderCredentialAad } from "../organization/providerCredentialModel";
import { readEveryAlchemyStack } from "../repository/alchemyState";
import { readOrganizationConvexTarget } from "../repository/convexDeploymentInspection";
import { openSecret } from "../sealedSecret";
import { readCloudflareStateStore } from "./cloudflareStateStore";

const { id } = v;

type Reader = { organizationId: Id<"organizations">; userId: Id<"users"> };

async function readCloudflareStacks(
  ctx: ActionCtx,
  args: Reader,
): Promise<OrganizationStacks["cloudflare"]> {
  let connection: ResolvedCloudflareConnection | null;
  try {
    connection = await ctx.runAction(internal.cloudflareOAuth.resolveConnectionForOrganization, {
      organizationId: args.organizationId,
      userId: args.userId,
    });
  } catch {
    // The resolver records a grant that the hub refused to refresh. Only a reconnect repairs it.
    const current = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForProviderStatus,
      { organizationId: args.organizationId, userId: args.userId },
    );
    return {
      account: current.cloudflareAccount?.accountName ?? null,
      read: {
        state:
          current.cloudflareCredential?.tokenHealth?.status === "invalid" ? "reconnect" : "failed",
      },
    };
  }
  if (connection === null) {
    return { account: null, read: { state: "not_connected" } };
  }
  const account = connection.account.accountName;
  // An MCP connection reaches the API only through Cloudflare's MCP server, which cannot upload
  // the preview Worker that reads the store token.
  if (connection.auth.method === "mcp_oauth") {
    return { account, read: { state: "unsupported_connection" } };
  }
  const token = (
    await openSecret({
      sealed: connection.auth.credential,
      aad: organizationProviderCredentialAad(args.organizationId, "cloudflare.auth.credential"),
    })
  ).trim();
  return {
    account,
    read: await readCloudflareStateStore({ token, accountId: connection.account.accountId }),
  };
}

async function readConvexStacks(
  ctx: ActionCtx,
  args: Reader,
): Promise<OrganizationStacks["convex"]> {
  const target = await readOrganizationConvexTarget(ctx, args);
  if (target === null) {
    return { team: null, read: { state: "not_connected" } };
  }
  const team = target.teamSlug ?? target.teamId;
  try {
    return { team, read: await readEveryAlchemyStack(target) };
  } catch (error) {
    // Only the name: the error of a store request can quote its reply.
    console.warn("organization_stacks:convex_read_failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return { team, read: { state: "failed" } };
  }
}

/**
Every stack of the Alchemy state stores that an organization connected: the store of its Cloudflare
account and the store of its Convex team. Each resource gives only its fqn, type, and status, and
each stage its run record. A read takes some seconds, because the Cloudflare store has one request
per resource, so the page reads once when it opens.
*/
export const read = action({
  access: "access_dashboard",
  args: { organizationId: id("organizations") },
  returns: vOrganizationStacks,
  handler: async (ctx, args): Promise<OrganizationStacks> => {
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationIdForMember,
      { userId: ctx.viewer.userId, organizationId: args.organizationId },
    );
    const reader = { organizationId, userId: ctx.viewer.userId };
    const [cloudflare, convex] = await Promise.all([
      readCloudflareStacks(ctx, reader),
      readConvexStacks(ctx, reader),
    ]);
    return { cloudflare, convex };
  },
});
