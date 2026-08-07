import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
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

async function deleteRateLimit(ctx: MutationCtx, identifier: string): Promise<void> {
  const rateLimit = await ctx.db
    .query("authRateLimits")
    .withIndex("identifier", (query) => query.eq("identifier", identifier))
    .unique();

  if (rateLimit !== null) {
    await ctx.db.delete(rateLimit._id);
  }
}

async function deleteSessionChildrenBatch(
  ctx: MutationCtx,
  sessionId: Id<"authSessions">,
): Promise<boolean> {
  const verifiers = await ctx.db
    .query("authVerifiers")
    .withIndex("sessionId", (query) => query.eq("sessionId", sessionId))
    .take(AUTH_CHILD_BATCH_SIZE);

  if (verifiers.length > 0) {
    for (const verifier of verifiers) {
      await ctx.db.delete(verifier._id);
    }
    return false;
  }

  const refreshTokens = await ctx.db
    .query("authRefreshTokens")
    .withIndex("sessionId", (query) => query.eq("sessionId", sessionId))
    .take(AUTH_CHILD_BATCH_SIZE);

  if (refreshTokens.length > 0) {
    for (const refreshToken of refreshTokens) {
      await ctx.db.delete(refreshToken._id);
    }
    return false;
  }

  return true;
}

export const deleteOtherSessionBatch = internalMutation({
  args: workflowArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);

    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (query) => query.eq("userId", run.identity.userId))
      .take(2);
    const session = sessions.find(({ _id }) => _id !== run.initiatingSessionId);

    if (session === undefined) {
      return true;
    }

    if (await deleteSessionChildrenBatch(ctx, session._id)) {
      await ctx.db.delete(session._id);
    }
    return false;
  },
});

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

    const verificationCodes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (query) => query.eq("accountId", account._id))
      .take(AUTH_CHILD_BATCH_SIZE);

    if (verificationCodes.length > 0) {
      for (const verificationCode of verificationCodes) {
        await ctx.db.delete(verificationCode._id);
      }
      return false;
    }

    await deleteRateLimit(ctx, account._id);

    if (account.emailVerified !== undefined) {
      await deleteRateLimit(ctx, account.emailVerified);
    }

    if (account.phoneVerified !== undefined) {
      await deleteRateLimit(ctx, account.phoneVerified);
    }

    await ctx.db.delete(account._id);

    return false;
  },
});

export const deleteIdentityRateLimit = internalMutation({
  args: workflowArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);

    await deleteRateLimit(ctx, run.identity.email);

    return null;
  },
});

export const deleteInitiatingSessionBatch = internalMutation({
  args: workflowArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);

    const session = await ctx.db.get(run.initiatingSessionId);

    if (session !== null && session.userId !== run.identity.userId) {
      throw new Error("Initiating auth session belongs to another user.");
    }

    return deleteSessionChildrenBatch(ctx, run.initiatingSessionId);
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

  const initiatingSession = await ctx.db.get(run.initiatingSessionId);

  if (initiatingSession !== null && initiatingSession.userId !== run.identity.userId) {
    throw new Error("Initiating auth session belongs to another user.");
  }

  const remainingSessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (query) => query.eq("userId", run.identity.userId))
    .take(2);

  if (
    remainingSessions.length > 1 ||
    (remainingSessions.length === 1 && remainingSessions[0]._id !== run.initiatingSessionId)
  ) {
    throw new Error("Only the initiating auth session may remain during finalization.");
  }

  const remainingVerifier = await ctx.db
    .query("authVerifiers")
    .withIndex("sessionId", (query) => query.eq("sessionId", run.initiatingSessionId))
    .first();

  const remainingRefreshToken = await ctx.db
    .query("authRefreshTokens")
    .withIndex("sessionId", (query) => query.eq("sessionId", run.initiatingSessionId))
    .first();

  if (remainingVerifier !== null || remainingRefreshToken !== null) {
    throw new Error("Initiating auth session children remain during finalization.");
  }

  const remainingAccount = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (query) => query.eq("userId", run.identity.userId))
    .first();

  if (remainingAccount !== null) {
    throw new Error("Auth accounts remain for the deleting account.");
  }

  const remainingIdentityRateLimit = await ctx.db
    .query("authRateLimits")
    .withIndex("identifier", (query) => query.eq("identifier", run.identity.email))
    .first();

  if (remainingIdentityRateLimit !== null) {
    throw new Error("Auth rate limits remain for the deleting account.");
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

    if (
      user === null ||
      user.accountDeletion?.state !== "finalizing" ||
      user.accountDeletion.runId !== run._id
    ) {
      throw new Error("Account deletion is not ready to finalize.");
    }

    await assertIdentityDeletionReady(ctx, run);

    const initiatingSession = await ctx.db.get(run.initiatingSessionId);

    if (initiatingSession?.userId === run.identity.userId) {
      await ctx.db.delete(initiatingSession._id);
    }

    await ctx.db.delete(run.identity.userId);

    const completedAt = Date.now();

    await ctx.db.replace(run._id, {
      identity: { state: "scrubbed" },
      completionCapability: run.completionCapability,
      state: "succeeded",
      currentStep: "finish",
      requestedAt: run.requestedAt,
      updatedAt: completedAt,
      retryCount: run.retryCount,
      completedAt,
      outcomes: run.outcomes,
    });

    return null;
  },
});
