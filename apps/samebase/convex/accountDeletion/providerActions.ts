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
  connection: Doc<"providerConnections"> | null | undefined,
): Promise<AccountDeletionGithubOutcome> {
  if (connection?.kind !== "github" || connection.state !== "connected") {
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
  connection: Doc<"providerConnections"> | null | undefined,
): Promise<AccountDeletionCloudflareOutcome> {
  if (connection?.kind !== "cloudflare" || connection.state !== "connected") {
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
  connection: Doc<"providerConnections"> | null | undefined,
): AccountDeletionConvexOutcome {
  if (connection?.kind !== "convex" || connection.state !== "connected") {
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

function aggregateGithubOutcomes(
  outcomes: AccountDeletionGithubOutcome[],
): AccountDeletionGithubOutcome {
  return (
    outcomes.find((outcome) => outcome.state === "unconfirmed") ??
    outcomes.find((outcome) => outcome.state === "revoked") ??
    outcomes.find((outcome) => outcome.state === "local_delete_only") ?? { state: "not_connected" }
  );
}

function aggregateCloudflareOutcomes(
  outcomes: AccountDeletionCloudflareOutcome[],
): AccountDeletionCloudflareOutcome {
  return (
    outcomes.find((outcome) => outcome.state === "unconfirmed") ??
    outcomes.find((outcome) => outcome.state === "revoked") ??
    outcomes.find((outcome) => outcome.state === "local_delete_only") ?? { state: "not_connected" }
  );
}

function aggregateConvexOutcomes(
  outcomes: AccountDeletionConvexOutcome[],
): AccountDeletionConvexOutcome {
  return (
    outcomes.find((outcome) => outcome.state === "manual_revocation_required") ??
    outcomes.find((outcome) => outcome.state === "local_delete_only") ?? { state: "not_connected" }
  );
}

export const revokeForAccountDeletion = internalAction({
  args: {
    runId: id("workflow_accountDeletion_runs"),
    workflowId: string(),
  },
  returns: vRevokeProviderAccessResult,
  handler: async (ctx, args): Promise<RevokeProviderAccessResult> => {
    const identity = await ctx.runQuery(
      internal.accountDeletion.stepContext.getOwnedIdentity,
      args,
    );

    const connections = await ctx.runQuery(internal.providerConnections.listByConnectedByUserId, {
      connectedByUserId: identity.userId,
    });
    const [githubOutcomes, cloudflareOutcomes] = await Promise.all([
      Promise.all(
        connections
          .filter((connection) => connection.kind === "github" && connection.state === "connected")
          .map(revokeGithub),
      ),
      Promise.all(
        connections
          .filter(
            (connection) => connection.kind === "cloudflare" && connection.state === "connected",
          )
          .map(revokeCloudflare),
      ),
    ]);
    const convexOutcomes = connections
      .filter((connection) => connection.kind === "convex" && connection.state === "connected")
      .map(classifyConvex);

    for (const connection of connections) {
      await ctx.runMutation(internal.providerConnections.disconnectForAccountDeletion, {
        connectedByUserId: identity.userId,
        providerConnectionId: connection._id,
      });
    }

    return {
      github: aggregateGithubOutcomes(githubOutcomes),
      cloudflare: aggregateCloudflareOutcomes(cloudflareOutcomes),
      convex: aggregateConvexOutcomes(convexOutcomes),
    };
  },
});
