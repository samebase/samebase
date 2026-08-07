import { Infer, v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { revokeCloudflareMcpOAuthGrant } from "../cloudflareMcpOAuth";
import { revokeCloudflareOAuthGrant } from "../cloudflareOAuth";
import {
  getOrganizationProviderCredentials,
  getProviderCredentialsByConnectedUser,
  vConnectedProviderCredential,
} from "../organizationProviderCredentials";
import { providerAuthMatches } from "../providerAuth";
import { readOwnedActiveRun } from "./stepContext";

const { boolean, id, object, string } = v;

const PROVIDER_CREDENTIAL_BATCH_SIZE = 25;

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
  returns: v.array(vConnectedProviderCredential),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    return await getProviderCredentialsByConnectedUser(ctx.db, {
      connectedByUserId: run.identity.userId,
      limit: PROVIDER_CREDENTIAL_BATCH_SIZE,
    });
  },
});

export const deleteRevokedConnection = internalMutation({
  args: {
    ...workflowArgs,
    expected: vConnectedProviderCredential,
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const organization = await ctx.db.get(args.expected.organizationId);
    if (organization === null) {
      return false;
    }
    const credentials = await getOrganizationProviderCredentials(ctx.db, organization);
    if (credentials === null) {
      return false;
    }
    const credential =
      args.expected.provider === "convex" ? credentials.convex : credentials.cloudflare;
    if (
      credential === undefined ||
      credential.connectedByUserId !== run.identity.userId ||
      !providerAuthMatches(credential.auth, args.expected.credential.auth)
    ) {
      return false;
    }

    if (args.expected.provider === "convex" && credential.auth.method === "oauth") {
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

    await ctx.db.patch(credentials._id, {
      [args.expected.provider]: undefined,
    });
    return true;
  },
});

export const revokeConnectionBatch = internalAction({
  args: workflowArgs,
  returns: vRevokeProviderConnectionBatchResult,
  handler: async (ctx, args): Promise<RevokeProviderConnectionBatchResult> => {
    const credentials = await ctx.runQuery(
      internal.accountDeletion.providerActions.loadConnectionBatch,
      args,
    );
    let convexManualRevocationRequired = false;

    for (const connection of credentials) {
      const deleted = await ctx.runMutation(
        internal.accountDeletion.providerActions.deleteRevokedConnection,
        {
          ...args,
          expected: connection,
        },
      );
      if (!deleted) {
        return {
          done: false,
          convexManualRevocationRequired,
        };
      }

      if (connection.provider === "cloudflare") {
        try {
          if (connection.credential.auth.method === "oauth") {
            await revokeCloudflareOAuthGrant(connection.credential.auth.refreshCredential);
          } else if (connection.credential.auth.method === "mcp_oauth") {
            await revokeCloudflareMcpOAuthGrant({
              refreshToken: connection.credential.auth.refreshCredential,
              clientId: connection.credential.auth.clientId,
            });
          }
        } catch {
          // Local access is already removed. Upstream revocation is best effort.
        }
      } else if (connection.credential.auth.method === "oauth") {
        convexManualRevocationRequired = true;
      }
    }

    const remainingCredentials = await ctx.runQuery(
      internal.accountDeletion.providerActions.loadConnectionBatch,
      args,
    );
    return {
      done: remainingCredentials.length === 0,
      convexManualRevocationRequired,
    };
  },
});
