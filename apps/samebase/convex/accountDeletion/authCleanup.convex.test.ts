import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
import { assertAuthSessionUserCanSignIn } from "../auth";

const workflowId = "account-deletion-workflow-1";
const notStartedOutcomes = {
  billing: { state: "not_started" as const },
  providerRevocation: { state: "not_started" as const },
  completionEmail: { state: "not_started" as const },
};

async function seedRunningDeletion() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "deleting@example.com",
      isApproved: true,
    });
    const initiatingSessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60_000,
    });
    const runId = await ctx.db.insert("accountDeletionRuns", {
      identity: { state: "active", userId, email: "deleting@example.com" },
      state: "running",
      workflow: { state: "started", workflowId, attempt: 1 },
      currentStep: "revoke_access",
      requestedAt: Date.now(),
      updatedAt: Date.now(),
      initiatingSessionId,
      retryCount: 0,
      outcomes: notStartedOutcomes,
    });
    await ctx.db.patch(userId, {
      accountDeletion: { state: "deleting", runId, requestedAt: Date.now() },
    });
    return { initiatingSessionId, runId, userId };
  });
  return { ids, t };
}

describe("account deletion auth cleanup", () => {
  it("deletes other sessions in bounded verifier, refresh token, session order", async () => {
    const { ids, t } = await seedRunningDeletion();
    const otherSessionId = await t.run(async (ctx) => {
      const sessionId = await ctx.db.insert("authSessions", {
        userId: ids.userId,
        expirationTime: Date.now() + 60_000,
      });
      for (let index = 0; index < 65; index += 1) {
        await ctx.db.insert("authVerifiers", { sessionId, signature: `signature-${index}` });
      }
      await ctx.db.insert("authRefreshTokens", {
        sessionId,
        expirationTime: Date.now() + 60_000,
      });
      return sessionId;
    });
    const args = { runId: ids.runId, workflowId };

    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteOtherSessionBatch, args),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteOtherSessionBatch, args),
    ).resolves.toBe(false);
    await expect(
      t.run(async (ctx) => ({
        session: await ctx.db.get(otherSessionId),
        token: await ctx.db
          .query("authRefreshTokens")
          .withIndex("sessionId", (query) => query.eq("sessionId", otherSessionId))
          .first(),
      })),
    ).resolves.toMatchObject({ session: expect.any(Object), token: expect.any(Object) });

    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteOtherSessionBatch, args),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteOtherSessionBatch, args),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteOtherSessionBatch, args),
    ).resolves.toBe(true);
    await expect(t.run(async (ctx) => await ctx.db.get(otherSessionId))).resolves.toBeNull();
    await expect(
      t.run(async (ctx) => await ctx.db.get(ids.initiatingSessionId)),
    ).resolves.not.toBeNull();
  });

  it("deletes verification codes, account rate limits, and one auth account at a time", async () => {
    const { ids, t } = await seedRunningDeletion();
    const accountId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("authAccounts", {
        userId: ids.userId,
        provider: "password",
        providerAccountId: "deleting@example.com",
        emailVerified: "verified@example.com",
      });
      for (let index = 0; index < 65; index += 1) {
        await ctx.db.insert("authVerificationCodes", {
          accountId: id,
          provider: "password",
          code: `code-${index}`,
          expirationTime: Date.now() + 60_000,
        });
      }
      for (const identifier of [id, "verified@example.com", "deleting@example.com"]) {
        await ctx.db.insert("authRateLimits", {
          identifier,
          lastAttemptTime: Date.now(),
          attemptsLeft: 1,
        });
      }
      return id;
    });
    const args = { runId: ids.runId, workflowId };

    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteAuthAccountBatch, args),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteAuthAccountBatch, args),
    ).resolves.toBe(false);
    await expect(t.run(async (ctx) => await ctx.db.get(accountId))).resolves.not.toBeNull();
    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteAuthAccountBatch, args),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteAuthAccountBatch, args),
    ).resolves.toBe(true);
    await expect(t.run(async (ctx) => await ctx.db.get(accountId))).resolves.toBeNull();

    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteIdentityRateLimit, args),
    ).resolves.toBeNull();
    const rateLimits = await t.run(async (ctx) => await ctx.db.query("authRateLimits").collect());
    expect(rateLimits).toEqual([]);
  });

  it("removes the initiating session and atomically scrubs the successful run", async () => {
    const { ids, t } = await seedRunningDeletion();
    const args = { runId: ids.runId, workflowId };
    await t.run(async (ctx) => {
      await ctx.db.insert("authVerifiers", {
        sessionId: ids.initiatingSessionId,
        signature: "initiating-signature",
      });
      await ctx.db.insert("authRefreshTokens", {
        sessionId: ids.initiatingSessionId,
        expirationTime: Date.now() + 60_000,
      });
      await ctx.db.patch(ids.userId, {
        accountDeletion: { state: "finalizing", runId: ids.runId, requestedAt: Date.now() },
      });
    });

    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteInitiatingSessionBatch, args),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteInitiatingSessionBatch, args),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteInitiatingSessionBatch, args),
    ).resolves.toBe(true);
    await expect(
      t.run(async (ctx) => await ctx.db.get(ids.initiatingSessionId)),
    ).resolves.not.toBeNull();
    await expect(
      t.mutation(internal.accountDeletion.authCleanup.finishIdentityDeletion, args),
    ).resolves.toBeNull();

    const stored = await t.run(async (ctx) => ({
      run: await ctx.db.get(ids.runId),
      user: await ctx.db.get(ids.userId),
    }));
    expect(stored.user).toBeNull();
    expect(stored.run).toMatchObject({
      identity: { state: "scrubbed" },
      state: "succeeded",
      currentStep: "finish",
      outcomes: notStartedOutcomes,
    });
    expect(stored.run).not.toHaveProperty("initiatingSessionId");
  });

  it("rejects stale workflow ownership and finalization with remaining auth rows", async () => {
    const { ids, t } = await seedRunningDeletion();
    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteOtherSessionBatch, {
        runId: ids.runId,
        workflowId: "stale-workflow",
      }),
    ).rejects.toThrow("workflow ownership changed");

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.userId, {
        accountDeletion: { state: "finalizing", runId: ids.runId, requestedAt: Date.now() },
      });
      await ctx.db.insert("authSessions", {
        userId: ids.userId,
        expirationTime: Date.now() + 60_000,
      });
    });
    await expect(
      t.mutation(internal.accountDeletion.authCleanup.finishIdentityDeletion, {
        runId: ids.runId,
        workflowId,
      }),
    ).rejects.toThrow("Only the initiating auth session may remain");
  });
});

describe("account deletion sign-in gate", () => {
  it("validates the unknown Convex Auth row and rejects a deletion marker", () => {
    expect(() => assertAuthSessionUserCanSignIn(null)).toThrow("Account is unavailable.");
    expect(() => assertAuthSessionUserCanSignIn({ email: "active@example.com" })).not.toThrow();
    expect(() =>
      assertAuthSessionUserCanSignIn({
        email: "deleting@example.com",
        accountDeletion: { state: "deleting" },
      }),
    ).toThrow("Account deletion is already in progress.");
  });
});
