import { Infer, v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { revokeCloudflareMcpOAuthGrant } from "../cloudflareMcpOAuth";
import { revokeCloudflareOAuthGrant } from "../cloudflareOAuth";
import { revokeGithubOAuthGrant } from "../githubOAuth";

const { id, literal, object, string, union } = v;

export const vProviderRevocationResult = union(
  object({ state: literal("not_connected") }),
  object({ state: literal("local_delete_only") }),
  object({ state: literal("revoked") }),
  object({
    state: literal("manual_revocation_required"),
    safeNotice: string(),
  }),
  object({ state: literal("unconfirmed"), safeError: string() }),
);
export type ProviderRevocationResult = Infer<typeof vProviderRevocationResult>;

export const vRevokeProviderAccessResult = object({
  github: vProviderRevocationResult,
  cloudflare: vProviderRevocationResult,
  convex: vProviderRevocationResult,
});
export type RevokeProviderAccessResult = Infer<typeof vRevokeProviderAccessResult>;

const CONVEX_MANUAL_REVOCATION_NOTICE =
  "Convex OAuth cannot be revoked by Samebase. Previously issued production and preview deploy keys remain usable until the user revokes Samebase in Convex Authorized Applications.";

async function revokeGithub(
  connection: Doc<"providerConnections"> | null,
): Promise<ProviderRevocationResult> {
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
      safeError: "GitHub OAuth revocation could not be confirmed.",
    };
  }
}

async function revokeCloudflare(
  connection: Doc<"providerConnections"> | null,
): Promise<ProviderRevocationResult> {
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
      safeError: "Cloudflare OAuth revocation could not be confirmed.",
    };
  }
}

function classifyConvex(connection: Doc<"providerConnections"> | null): ProviderRevocationResult {
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
