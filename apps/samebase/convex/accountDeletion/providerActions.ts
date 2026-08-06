import { Infer, v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { revokeCloudflareMcpOAuthGrant } from "../cloudflareMcpOAuth";
import { revokeCloudflareOAuthGrant } from "../cloudflareOAuth";
import {
  providerAuthMatches,
  vCloudflareProviderConnection,
  vConvexProviderConnection,
  vProviderAuth,
} from "../providerConnectionModel";
import { getProviderConnectionByIdForOrganization } from "../providerConnections";
import { readOwnedActiveRun } from "./stepContext";

const { array, boolean, id, number, object, string, union } = v;

const PROVIDER_CONNECTION_BATCH_SIZE = 25;
const CLOUDFLARE_REVOCATION_SAFE_ERROR = "Cloudflare OAuth revocation could not be confirmed.";

const vProviderConnectionForAccountDeletion = union(
  vConvexProviderConnection.extend({
    _id: id("providerConnections"),
    _creationTime: number(),
  }),
  vCloudflareProviderConnection.extend({
    _id: id("providerConnections"),
    _creationTime: number(),
  }),
);

export const vRevokeProviderConnectionBatchResult = object({
  done: boolean(),
  convexManualRevocationRequired: boolean(),
});
export type RevokeProviderConnectionBatchResult = Infer<
  typeof vRevokeProviderConnectionBatchResult
>;

const workflowArgs = {
  runId: id("workflow_accountDeletion_runs"),
  workflowId: string(),
};

export const loadConnectionBatch = internalQuery({
  args: workflowArgs,
  returns: array(vProviderConnectionForAccountDeletion),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const connections = await ctx.db
      .query("providerConnections")
      .withIndex("by_connected_by_user", (query) =>
        query.eq("connectedByUserId", run.identity.userId),
      )
      .order("asc")
      .take(PROVIDER_CONNECTION_BATCH_SIZE);
    for (const connection of connections) {
      const singleton = await getProviderConnectionByIdForOrganization(ctx.db, {
        organizationId: connection.organizationId,
        providerConnectionId: connection._id,
        kind: connection.kind,
      });
      if (singleton === null) {
        throw new Error("Provider connection changed during account deletion.");
      }
    }
    return connections;
  },
});

export const deleteRevokedConnection = internalMutation({
  args: {
    ...workflowArgs,
    providerConnectionId: id("providerConnections"),
    expectedAuth: vProviderAuth,
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const candidate = await ctx.db.get(args.providerConnectionId);
    if (candidate === null) {
      return false;
    }
    const connection = await getProviderConnectionByIdForOrganization(ctx.db, {
      organizationId: candidate.organizationId,
      providerConnectionId: candidate._id,
      kind: candidate.kind,
    });
    if (connection === null) {
      return false;
    }
    if (connection.connectedByUserId !== run.identity.userId) {
      return false;
    }
    if (!providerAuthMatches(connection.auth, args.expectedAuth)) {
      return false;
    }

    if (connection.kind === "convex" && connection.auth.method === "oauth") {
      const providerRevocation = run.outcomes.providerRevocation;
      if (providerRevocation.state !== "in_progress") {
        throw new Error("Provider revocation was not started.");
      }
      await ctx.db.patch(run._id, {
        outcomes: {
          ...run.outcomes,
          providerRevocation: {
            state: "in_progress",
            convexManualRevocationRequired: true,
          },
        },
        updatedAt: Date.now(),
      });
    }

    await ctx.db.delete(connection._id);
    return true;
  },
});

export const revokeConnectionBatch = internalAction({
  args: workflowArgs,
  returns: vRevokeProviderConnectionBatchResult,
  handler: async (ctx, args): Promise<RevokeProviderConnectionBatchResult> => {
    const connections = await ctx.runQuery(
      internal.accountDeletion.providerActions.loadConnectionBatch,
      args,
    );
    let convexManualRevocationRequired = false;

    for (const connection of connections) {
      if (connection.kind === "cloudflare") {
        try {
          if (connection.auth.method === "oauth") {
            await revokeCloudflareOAuthGrant(connection.auth.refreshCredential);
          } else if (connection.auth.method === "mcp_oauth") {
            await revokeCloudflareMcpOAuthGrant({
              refreshToken: connection.auth.refreshCredential,
              clientId: connection.auth.clientId,
            });
          }
        } catch {
          throw new Error(CLOUDFLARE_REVOCATION_SAFE_ERROR);
        }
      } else if (connection.auth.method === "oauth") {
        convexManualRevocationRequired = true;
      }

      const deleted = await ctx.runMutation(
        internal.accountDeletion.providerActions.deleteRevokedConnection,
        {
          ...args,
          providerConnectionId: connection._id,
          expectedAuth: connection.auth,
        },
      );
      if (!deleted) {
        return {
          done: false,
          convexManualRevocationRequired,
        };
      }
    }

    return {
      done: connections.length < PROVIDER_CONNECTION_BATCH_SIZE,
      convexManualRevocationRequired,
    };
  },
});
