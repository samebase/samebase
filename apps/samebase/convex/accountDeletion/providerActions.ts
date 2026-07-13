import { Infer, v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { revokeCloudflareMcpOAuthGrant } from "../cloudflareMcpOAuth";
import { revokeCloudflareOAuthGrant } from "../cloudflareOAuth";
import { revokeGithubOAuthGrant } from "../githubOAuth";
import {
  CLOUDFLARE_REVOCATION_UNCONFIRMED_ERROR,
  CONVEX_MANUAL_REVOCATION_NOTICE,
  GITHUB_REVOCATION_UNCONFIRMED_ERROR,
  type AccountDeletionCloudflareOutcome,
  type AccountDeletionConvexOutcome,
  type AccountDeletionGithubOutcome,
  vAccountDeletionCloudflareOutcome,
  vAccountDeletionConvexOutcome,
  vAccountDeletionGithubOutcome,
} from "./model";

const { id, object, string } = v;

export const vRevokeProviderAccessResult = object({
  github: vAccountDeletionGithubOutcome,
  cloudflare: vAccountDeletionCloudflareOutcome,
  convex: vAccountDeletionConvexOutcome,
});
export type RevokeProviderAccessResult = Infer<typeof vRevokeProviderAccessResult>;

async function revokeGithub(
  connection: Doc<"providerConnections"> | null,
): Promise<AccountDeletionGithubOutcome> {
  if (connection?.kind !== "github") {
    return { state: "not_connected" };
  }
  if (connection.auth.method === "api_key") {
    return { state: "local_delete_only" };
  }

  try {
    await revokeGithubOAuthGrant(connection.auth.credential);
    return { state: "revoked" };
  } catch {
    return {
      state: "unconfirmed",
      safeError: GITHUB_REVOCATION_UNCONFIRMED_ERROR,
    };
  }
}

async function revokeCloudflare(
  connection: Doc<"providerConnections"> | null,
): Promise<AccountDeletionCloudflareOutcome> {
  if (connection?.kind !== "cloudflare") {
    return { state: "not_connected" };
  }
  if (connection.auth.method === "api_key") {
    return { state: "local_delete_only" };
  }

  try {
    if (connection.auth.method === "oauth") {
      await revokeCloudflareOAuthGrant(connection.auth.refreshCredential);
    } else {
      await revokeCloudflareMcpOAuthGrant({
        refreshToken: connection.auth.refreshCredential,
        clientId: connection.auth.clientId,
      });
    }
    return { state: "revoked" };
  } catch {
    return {
      state: "unconfirmed",
      safeError: CLOUDFLARE_REVOCATION_UNCONFIRMED_ERROR,
    };
  }
}

function classifyConvex(
  connection: Doc<"providerConnections"> | null,
): AccountDeletionConvexOutcome {
  if (connection?.kind !== "convex") {
    return { state: "not_connected" };
  }
  if (connection.auth.method === "api_key") {
    return { state: "local_delete_only" };
  }
  return {
    state: "manual_revocation_required",
    safeNotice: CONVEX_MANUAL_REVOCATION_NOTICE,
  };
}

export const revokeForAccountDeletion = internalAction({
  args: {
    runId: id("accountDeletionRuns"),
    workflowId: string(),
  },
  returns: vRevokeProviderAccessResult,
  handler: async (ctx, args): Promise<RevokeProviderAccessResult> => {
    const identity = await ctx.runQuery(
      internal.accountDeletion.stepContext.getOwnedIdentity,
      args,
    );

    const [githubConnection, cloudflareConnection, convexConnection] = await Promise.all([
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId: identity.userId,
        kind: "github",
      }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId: identity.userId,
        kind: "cloudflare",
      }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId: identity.userId,
        kind: "convex",
      }),
    ]);

    const [github, cloudflare] = await Promise.all([
      revokeGithub(githubConnection),
      revokeCloudflare(cloudflareConnection),
    ]);

    return {
      github,
      cloudflare,
      convex: classifyConvex(convexConnection),
    };
  },
});
