import { v } from "convex/values";

import { components } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { cleanupAccountDataBatchForUser } from "./cleanup";
import { readOwnedActiveRun } from "./stepContext";

const AUTH_CHILD_BATCH_SIZE = 64;

const workflowArgs = {
  runId: v.id("workflow_accountDeletion_runs"),
  workflowId: v.string(),
};

type RunningAccountDeletionRun = Extract<
  Doc<"workflow_accountDeletion_runs">,
  { state: "running" }
>;

export const deleteAuthAccountBatch = internalMutation({
  args: workflowArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);

    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (query) => query.eq("userId", run.identity.userId))
      .first();

    if (account === null) {
      return true;
    }

    await ctx.db.delete(account._id);

    return false;
  },
});

export const deleteEventBatch = internalMutation({
  args: workflowArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await readOwnedActiveRun(ctx, args);

    const events = await ctx.db
      .query("workflow_accountDeletion_events")
      .withIndex("by_run_and_created_at", (query) => query.eq("runId", args.runId))
      .take(AUTH_CHILD_BATCH_SIZE);

    for (const event of events) {
      await ctx.db.delete(event._id);
    }

    return events.length < AUTH_CHILD_BATCH_SIZE;
  },
});

export async function assertIdentityDeletionReady(
  ctx: MutationCtx,
  run: RunningAccountDeletionRun,
): Promise<void> {
  if (run.outcomes.providerRevocation.state !== "completed") {
    throw new Error("Provider revocation is not complete.");
  }

  if (run.outcomes.completionEmail.state === "not_started") {
    throw new Error("Completion email was not attempted.");
  }

  const accountDataRemoved = await cleanupAccountDataBatchForUser(ctx, {
    userId: run.identity.userId,
  });

  if (!accountDataRemoved) {
    throw new Error("Samebase account data remains during finalization.");
  }

  const remainingMembership = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_user", (query) => query.eq("userId", run.identity.userId))
    .first();

  if (remainingMembership !== null) {
    throw new Error("Organization membership remains during account deletion.");
  }

  const remainingAccount = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (query) => query.eq("userId", run.identity.userId))
    .first();

  if (remainingAccount !== null) {
    throw new Error("Auth accounts remain for the deleting account.");
  }

  const remainingEvent = await ctx.db
    .query("workflow_accountDeletion_events")
    .withIndex("by_run_and_created_at", (query) => query.eq("runId", run._id))
    .first();

  if (remainingEvent !== null) {
    throw new Error("Account deletion events remain during finalization.");
  }

  const [remainingConvexCredential, remainingCloudflareCredential] = await Promise.all([
    ctx.db
      .query("organizationProviderCredentials")
      .withIndex("by_convex_connected_by_user", (query) =>
        query.eq("convex.connectedByUserId", run.identity.userId),
      )
      .first(),
    ctx.db
      .query("organizationProviderCredentials")
      .withIndex("by_cloudflare_connected_by_user", (query) =>
        query.eq("cloudflare.connectedByUserId", run.identity.userId),
      )
      .first(),
  ]);

  if (remainingConvexCredential !== null || remainingCloudflareCredential !== null) {
    throw new Error("Provider credentials remain for the deleting account.");
  }

  const [remainingConvexCiCredential, remainingCloudflareCiCredential] = await Promise.all([
    ctx.db
      .query("organizationCiCredentials")
      .withIndex("by_convex_connected_by_user", (query) =>
        query.eq("convex.connectedByUserId", run.identity.userId),
      )
      .first(),
    ctx.db
      .query("organizationCiCredentials")
      .withIndex("by_cloudflare_connected_by_user", (query) =>
        query.eq("cloudflare.connectedByUserId", run.identity.userId),
      )
      .first(),
  ]);

  if (remainingConvexCiCredential !== null || remainingCloudflareCiCredential !== null) {
    throw new Error("CI credentials remain for the deleting account.");
  }

  const remainingGitHubAuthorization = await ctx.db
    .query("githubUserAuthorizations")
    .withIndex("by_user", (query) => query.eq("userId", run.identity.userId))
    .first();

  if (remainingGitHubAuthorization !== null) {
    throw new Error("GitHub user authorization remains for the deleting account.");
  }
}

export const finishIdentityDeletion = internalMutation({
  args: workflowArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);

    const user = await ctx.db.get(run.identity.userId);

    if (user === null) {
      throw new Error("Account deletion is not ready to finalize.");
    }
    if (user.state !== "deleting" || user.runId !== run._id) {
      throw new Error("Account deletion is not ready to finalize.");
    }

    await assertIdentityDeletionReady(ctx, run);

    // Convex Auth 2 keeps its own accounts, sessions, refresh tokens, and password hash by user id.
    // Deleting them in the transaction that marks the user deleted ends every session of the user,
    // and a later sign-in with the same provider account creates a new user.
    await ctx.runMutation(components.auth.public.deleteUser, { userId: run.identity.userId });
    await ctx.runMutation(components.authPassword.public.deleteUser, {
      userId: run.identity.userId,
    });

    const completedAt = Date.now();

    await ctx.db.replace(run.identity.userId, {
      state: "deleted",
      deletedAt: completedAt,
    });

    await ctx.db.replace(run._id, {
      identity: { state: "scrubbed" },
      completionCapability: run.completionCapability,
      state: "succeeded",
      currentStep: "finish",
      requestedAt: run.requestedAt,
      ...(run.deletionStartsAt === undefined ? {} : { deletionStartsAt: run.deletionStartsAt }),
      updatedAt: completedAt,
      retryCount: run.retryCount,
      completedAt,
      outcomes: run.outcomes,
    });

    return null;
  },
});
