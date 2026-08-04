import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
import { assertAuthSessionUserCanSignIn } from "../auth";
import { INITIAL_ACCOUNT_DELETION_DATA_PROGRESS } from "./model";

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
    const organizationId = await ctx.db.insert("organizations", { name: "Test organization" });
    const membershipId = await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId,
    });
    const billingAccountId = await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      plan: "free",
      status: "inactive",
    });
    const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
      identity: { state: "active", userId, email: "deleting@example.com" },
      completionCapability: "auth-cleanup-test",
      state: "running",
      workflow: { state: "started", workflowId, attempt: 1 },
      currentStep: "revoke_access",
      requestedAt: Date.now(),
      updatedAt: Date.now(),
      initiatingSessionId,
      retryCount: 0,
      outcomes: notStartedOutcomes,
      dataDeletion: INITIAL_ACCOUNT_DELETION_DATA_PROGRESS,
    });
    await ctx.db.patch(userId, {
      accountDeletion: { state: "deleting", runId, requestedAt: Date.now() },
    });
    await ctx.db.patch(organizationId, { accountDeletionRunId: runId });
    return {
      billingAccountId,
      initiatingSessionId,
      membershipId,
      organizationId,
      runId,
      userId,
    };
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

  it("removes a session created during the deleting visibility window after finalizing starts", async () => {
    const { ids, t } = await seedRunningDeletion();
    const lateSessionId = await t.run(async (ctx) => {
      const sessionId = await ctx.db.insert("authSessions", {
        userId: ids.userId,
        expirationTime: Date.now() + 60_000,
      });
      await ctx.db.patch(ids.userId, {
        accountDeletion: { state: "finalizing", runId: ids.runId, requestedAt: Date.now() },
      });
      return sessionId;
    });

    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteOtherSessionBatch, {
        runId: ids.runId,
        workflowId,
      }),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteOtherSessionBatch, {
        runId: ids.runId,
        workflowId,
      }),
    ).resolves.toBe(true);
    await expect(t.run(async (ctx) => await ctx.db.get(lateSessionId))).resolves.toBeNull();
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
      await ctx.db.patch(ids.runId, {
        outcomes: {
          billing: { state: "not_applicable" },
          providerRevocation: {
            state: "completed",
            github: { state: "not_connected" },
            cloudflare: { state: "not_connected" },
            convex: { state: "not_connected" },
          },
          completionEmail: { state: "sent" },
        },
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
      t.mutation(internal.accountDeletion.workflow.markFinalizing, args),
    ).resolves.toBeNull();
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
      outcomes: {
        billing: { state: "not_applicable" },
        providerRevocation: {
          state: "completed",
          github: { state: "not_connected" },
          cloudflare: { state: "not_connected" },
          convex: { state: "not_connected" },
        },
        completionEmail: { state: "sent" },
      },
    });
    expect(stored.run).not.toHaveProperty("initiatingSessionId");
  });

  it("removes only the deleting membership from a shared organization", async () => {
    const { ids, t } = await seedRunningDeletion();
    const retained = await t.run(async (ctx) => {
      const remainingUserId = await ctx.db.insert("users", {
        email: "remaining@example.com",
        isApproved: true,
      });
      const remainingMembershipId = await ctx.db.insert("organizationMemberships", {
        organizationId: ids.organizationId,
        userId: remainingUserId,
      });
      await ctx.db.patch(ids.runId, {
        outcomes: {
          billing: { state: "not_applicable" },
          providerRevocation: {
            state: "completed",
            github: { state: "not_connected" },
            cloudflare: { state: "not_connected" },
            convex: { state: "not_connected" },
          },
          completionEmail: { state: "sent" },
        },
      });
      return {
        deletingMembershipId: ids.membershipId,
        organizationId: ids.organizationId,
        remainingMembershipId,
        remainingUserId,
      };
    });
    const args = { runId: ids.runId, workflowId };

    await expect(
      t.mutation(internal.accountDeletion.workflow.markFinalizing, args),
    ).resolves.toBeNull();
    await expect(
      t.mutation(internal.accountDeletion.authCleanup.finishIdentityDeletion, args),
    ).resolves.toBeNull();

    const stored = await t.run(async (ctx) => ({
      deletingMembership: await ctx.db.get(retained.deletingMembershipId),
      organization: await ctx.db.get(retained.organizationId),
      remainingMembership: await ctx.db.get(retained.remainingMembershipId),
      remainingUser: await ctx.db.get(retained.remainingUserId),
      user: await ctx.db.get(ids.userId),
    }));
    expect(stored.user).toBeNull();
    expect(stored.deletingMembership).toBeNull();
    expect(stored.organization).not.toBeNull();
    expect(stored.organization).not.toHaveProperty("accountDeletionRunId");
    expect(stored.remainingMembership).not.toBeNull();
    expect(stored.remainingUser).not.toBeNull();
  });

  it("deletes sole-member organization billing and the empty organization at finalization", async () => {
    const { ids, t } = await seedRunningDeletion();
    const providerConnectionId = await t.run(async (ctx) => {
      await ctx.db.patch(ids.runId, {
        outcomes: {
          billing: { state: "not_applicable" },
          providerRevocation: {
            state: "completed",
            github: { state: "not_connected" },
            cloudflare: { state: "not_connected" },
            convex: { state: "not_connected" },
          },
          completionEmail: { state: "sent" },
        },
      });
      return await ctx.db.insert("providerConnections", {
        state: "disconnected",
        kind: "github",
        organizationId: ids.organizationId,
        connectedByUserId: ids.userId,
        accountId: "deleted-github-account",
        disconnectedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const args = { runId: ids.runId, workflowId };

    await expect(
      t.mutation(internal.accountDeletion.workflow.markFinalizing, args),
    ).resolves.toBeNull();
    await expect(
      t.run(async (ctx) => await ctx.db.get(ids.billingAccountId)),
    ).resolves.not.toBeNull();
    await expect(
      t.mutation(internal.accountDeletion.authCleanup.finishIdentityDeletion, args),
    ).resolves.toBeNull();

    await expect(
      t.run(async (ctx) => ({
        billing: await ctx.db.get(ids.billingAccountId),
        membership: await ctx.db.get(ids.membershipId),
        organization: await ctx.db.get(ids.organizationId),
        providerConnection: await ctx.db.get(providerConnectionId),
        user: await ctx.db.get(ids.userId),
      })),
    ).resolves.toEqual({
      billing: null,
      membership: null,
      organization: null,
      providerConnection: null,
      user: null,
    });
  });

  it("finishes when the user signed out and the initiating session is already absent", async () => {
    const { ids, t } = await seedRunningDeletion();
    const args = { runId: ids.runId, workflowId };
    await t.run(async (ctx) => {
      await ctx.db.delete(ids.initiatingSessionId);
      await ctx.db.patch(ids.runId, {
        outcomes: {
          billing: { state: "not_applicable" },
          providerRevocation: {
            state: "completed",
            github: { state: "not_connected" },
            cloudflare: { state: "not_connected" },
            convex: { state: "not_connected" },
          },
          completionEmail: { state: "sent" },
        },
      });
    });

    await expect(
      t.mutation(internal.accountDeletion.authCleanup.deleteInitiatingSessionBatch, args),
    ).resolves.toBe(true);
    await expect(
      t.mutation(internal.accountDeletion.workflow.markFinalizing, args),
    ).resolves.toBeNull();
    await expect(
      t.mutation(internal.accountDeletion.authCleanup.finishIdentityDeletion, args),
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => await ctx.db.get(ids.userId))).resolves.toBeNull();
    await expect(t.run(async (ctx) => await ctx.db.get(ids.runId))).resolves.toMatchObject({
      identity: { state: "scrubbed" },
      state: "succeeded",
    });
  });

  it("rejects an identity rate limit created after finalizing became visible", async () => {
    const { ids, t } = await seedRunningDeletion();
    const args = { runId: ids.runId, workflowId };
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.runId, {
        outcomes: {
          billing: { state: "not_applicable" },
          providerRevocation: {
            state: "completed",
            github: { state: "not_connected" },
            cloudflare: { state: "not_connected" },
            convex: { state: "not_connected" },
          },
          completionEmail: { state: "sent" },
        },
      });
    });
    await expect(
      t.mutation(internal.accountDeletion.workflow.markFinalizing, args),
    ).resolves.toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.insert("authRateLimits", {
        identifier: "deleting@example.com",
        lastAttemptTime: Date.now(),
        attemptsLeft: 1,
      });
    });

    await expect(
      t.mutation(internal.accountDeletion.authCleanup.finishIdentityDeletion, args),
    ).rejects.toThrow("Auth rate limits remain for the deleting account.");
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
      await ctx.db.patch(ids.runId, {
        outcomes: {
          billing: { state: "not_applicable" },
          providerRevocation: {
            state: "completed",
            github: { state: "not_connected" },
            cloudflare: { state: "not_connected" },
            convex: { state: "not_connected" },
          },
          completionEmail: { state: "sent" },
        },
      });
      await ctx.db.insert("authSessions", {
        userId: ids.userId,
        expirationTime: Date.now() + 60_000,
      });
    });
    await expect(
      t.mutation(internal.accountDeletion.workflow.markFinalizing, {
        runId: ids.runId,
        workflowId,
      }),
    ).rejects.toThrow("Only the initiating auth session may remain");
  });
});

describe("account deletion sign-in gate", () => {
  it("allows deletion-only re-login while deleting and rejects finalizing", () => {
    expect(() => assertAuthSessionUserCanSignIn(null)).toThrow("Account is unavailable.");
    expect(() => assertAuthSessionUserCanSignIn({ email: "active@example.com" })).not.toThrow();
    expect(() =>
      assertAuthSessionUserCanSignIn({
        email: "deleting@example.com",
        accountDeletion: { state: "deleting" },
      }),
    ).not.toThrow();
    expect(() =>
      assertAuthSessionUserCanSignIn({
        email: "deleting@example.com",
        accountDeletion: { state: "finalizing" },
      }),
    ).toThrow("Account deletion is already finalizing.");
  });
});
