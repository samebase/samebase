import { Infer, v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import {
  getOrganizationProviderCredentials,
  getProviderCredentialsByConnectedUser,
  removeCiCredentialEntry,
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
    const credentials = await getOrganizationProviderCredentials(
      ctx.db,
      args.expected.organizationId,
    );
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

    const otherCredential =
      args.expected.provider === "convex" ? credentials.cloudflare : credentials.convex;
    if (otherCredential === undefined) {
      await ctx.db.delete(credentials._id);
    } else {
      await ctx.db.patch(credentials._id, {
        [args.expected.provider]: undefined,
      });
    }
    return true;
  },
});

/**
Removes one batch of the CI token entries that the deleting member saved; other members' entries in
the same organization stay. Samebase cannot revoke a pasted token, so it only forgets it. Returns
whether none remain.
*/
export const deleteCiCredentialBatch = internalMutation({
  args: workflowArgs,
  returns: boolean(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const userId = run.identity.userId;
    const readBatch = async () =>
      await Promise.all([
        ctx.db
          .query("organizationCiCredentials")
          .withIndex("by_cloudflare_connected_by_user", (query) =>
            query.eq("cloudflare.connectedByUserId", userId),
          )
          .take(PROVIDER_CREDENTIAL_BATCH_SIZE),
        ctx.db
          .query("organizationCiCredentials")
          .withIndex("by_convex_connected_by_user", (query) =>
            query.eq("convex.connectedByUserId", userId),
          )
          .take(PROVIDER_CREDENTIAL_BATCH_SIZE),
      ]);

    const [cloudflareRows, convexRows] = await readBatch();
    for (const row of cloudflareRows) {
      await removeCiCredentialEntry(ctx, row, "cloudflare");
    }
    for (const { _id } of convexRows) {
      // The Cloudflare pass may have changed or deleted this row.
      const row = await ctx.db.get(_id);
      if (row?.convex?.connectedByUserId === userId) {
        await removeCiCredentialEntry(ctx, row, "convex");
      }
    }

    const [remainingCloudflare, remainingConvex] = await readBatch();
    return remainingCloudflare.length === 0 && remainingConvex.length === 0;
  },
});

export const revokeConnectionBatch = internalAction({
  args: workflowArgs,
  returns: vRevokeProviderConnectionBatchResult,
  handler: async (ctx, args): Promise<RevokeProviderConnectionBatchResult> => {
    const ciCredentialsDone = await ctx.runMutation(
      internal.accountDeletion.providerActions.deleteCiCredentialBatch,
      {
        runId: args.runId,
        workflowId: args.workflowId,
      },
    );
    const credentials = await ctx.runQuery(
      internal.accountDeletion.providerActions.loadConnectionBatch,
      {
        runId: args.runId,
        workflowId: args.workflowId,
      },
    );
    let convexManualRevocationRequired = false;

    for (const connection of credentials) {
      const deleted = await ctx.runMutation(
        internal.accountDeletion.providerActions.deleteRevokedConnection,
        {
          runId: args.runId,
          workflowId: args.workflowId,
          expected: connection,
        },
      );
      if (!deleted) {
        return {
          done: false,
          convexManualRevocationRequired,
        };
      }

      if (connection.provider === "convex" && connection.credential.auth.method === "oauth") {
        convexManualRevocationRequired = true;
      }
    }

    const remainingCredentials = await ctx.runQuery(
      internal.accountDeletion.providerActions.loadConnectionBatch,
      {
        runId: args.runId,
        workflowId: args.workflowId,
      },
    );
    return {
      done: ciCredentialsDone && remainingCredentials.length === 0,
      convexManualRevocationRequired,
    };
  },
});
