import { createFunctionHandle } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ACCOUNT_DELETION_CONFIRMATION_PHRASE } from "../../shared/accountDeletionPhrase";
import { sessionIdentity } from "@convex-dev/auth/test";

import { api, components, internal } from "../_generated/api";
import { authTtl } from "../identity/signIn";
import { makeConvexTest, signInTestUser } from "../test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function seedActiveViewer(t: ReturnType<typeof makeConvexTest>, email: string) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      state: "active",
      email,
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
  });
  return { userId, viewer: t.withIdentity(await signInTestUser(t, userId)) };
}

async function seedStaffViewer(t: ReturnType<typeof makeConvexTest>) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      state: "active",
      email: "nicu@samebase.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
  });
  return { userId, viewer: t.withIdentity(await signInTestUser(t, userId)) };
}

describe("account deletion request and status", () => {
  it("returns no active status and makes no writes for a confirmation mismatch", async () => {
    const t = makeConvexTest();
    const { userId, viewer } = await seedActiveViewer(t, "active@example.invalid");
    const before = await t.run(async (ctx) => ({
      events: await ctx.db.query("workflow_accountDeletion_events").collect(),
      runs: await ctx.db.query("workflow_accountDeletion_runs").collect(),
      user: await ctx.db.get(userId),
    }));

    await expect(viewer.query(api.accountDeletion.index.status, {})).resolves.toBeNull();
    await expect(
      viewer.mutation(api.accountDeletion.index.request, {
        completionCapability: "a".repeat(64),
        deletionStartMode: "seven_days",
        deletionConfirmationText: "keep my account",
      }),
    ).resolves.toEqual({ state: "confirmation_mismatch" });

    const after = await t.run(async (ctx) => ({
      events: await ctx.db.query("workflow_accountDeletion_events").collect(),
      runs: await ctx.db.query("workflow_accountDeletion_runs").collect(),
      user: await ctx.db.get(userId),
    }));
    expect(after).toEqual(before);
  });

  it("queues one run for seven days and starts from the callback", async () => {
    // convex-test never runs a transaction at a time before the last commit, so the seed writes
    // commit before the time that the test reads.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const t = makeConvexTest();
    const { userId, viewer } = await seedActiveViewer(t, "requester@example.invalid");
    const args = {
      completionCapability: "b".repeat(64),
      deletionStartMode: "seven_days" as const,
      deletionConfirmationText: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
    };

    vi.setSystemTime(1_000);
    try {
      const first = await viewer.mutation(api.accountDeletion.index.request, args);
      if (first.state !== "accepted") {
        throw new Error("Account deletion request was not accepted.");
      }
      const status = await viewer.query(api.accountDeletion.index.status, {});
      const repeated = await viewer.mutation(api.accountDeletion.index.request, args);

      expect(first.status).toMatchObject({
        requestedAt: 1_000,
        deletionStartsAt: 604_801_000,
        state: "queued",
      });
      expect(status).toEqual(first.status);
      expect(repeated).toEqual(first);
      const snapshot = await t.run(async (ctx) => ({
        events: await ctx.db.query("workflow_accountDeletion_events").collect(),
        run: await ctx.db.get(first.status.runId),
        runs: await ctx.db.query("workflow_accountDeletion_runs").collect(),
        scheduledFunctions: await ctx.db.system.query("_scheduled_functions").take(2),
        user: await ctx.db.get(userId),
      }));
      expect(snapshot.runs).toHaveLength(1);
      expect(snapshot.events).toHaveLength(1);
      expect(snapshot.scheduledFunctions).toEqual([
        expect.objectContaining({
          scheduledTime: 604_801_000,
          state: { kind: "pending" },
        }),
      ]);
      expect(snapshot.run).toMatchObject({
        _id: first.status.runId,
        deletionStartsAt: 604_801_000,
        state: "queued",
        workflow: { state: "not_started" },
      });
      expect(snapshot.user).toMatchObject({
        _id: userId,
        runId: first.status.runId,
        state: "deleting",
      });

      await expect(
        t.mutation(internal.accountDeletion.index.startScheduled, {
          runId: first.status.runId,
        }),
      ).resolves.toBeNull();
      await expect(
        t.run(async (ctx) => await ctx.db.get(first.status.runId)),
      ).resolves.toMatchObject({
        state: "running",
        workflow: { state: "started", attempt: 1 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("queues immediate deletion in production when the override is zero", async () => {
    vi.stubEnv("ACCOUNT_DELETION_GRACE_PERIOD_MS", "0");
    vi.stubEnv("CONVEX_DEPLOYMENT", "prod:samebase");
    vi.useFakeTimers();
    try {
      const t = makeConvexTest();
      const { viewer } = await seedActiveViewer(t, "immediate@example.invalid");

      const policy = await viewer.query(api.accountDeletion.index.policy, {});
      expect(policy).toBe("immediate");

      const requested = await viewer.mutation(api.accountDeletion.index.request, {
        completionCapability: "0".repeat(64),
        deletionStartMode: policy,
        deletionConfirmationText: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
      });
      if (requested.state !== "accepted") {
        throw new Error("Account deletion request was not accepted.");
      }

      expect(requested.status.deletionStartsAt).toBe(requested.status.requestedAt);

      vi.unstubAllEnvs();
      await expect(viewer.query(api.accountDeletion.index.status, {})).resolves.toEqual(
        requested.status,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the seven-day start time for a legacy queued run", async () => {
    vi.stubEnv("ACCOUNT_DELETION_GRACE_PERIOD_MS", "0");

    const t = makeConvexTest();
    const { userId, viewer } = await seedActiveViewer(t, "legacy@example.invalid");
    const runId = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
        state: "queued",
        identity: {
          state: "active",
          userId,
          email: "legacy@example.invalid",
        },
        completionCapability: "5".repeat(64),
        currentStep: "request_accepted",
        requestedAt: 1,
        updatedAt: 1,
        retryCount: 0,
        outcomes: {
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
        workflow: { state: "not_started" },
      });
      await ctx.db.replace(userId, {
        state: "deleting",
        email: "legacy@example.invalid",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
        runId,
        requestedAt: 1,
      });
      return runId;
    });

    await expect(viewer.query(api.accountDeletion.index.status, {})).resolves.toMatchObject({
      runId,
      requestedAt: 1,
      deletionStartsAt: 604_800_001,
    });
  });

  it("rejects a stale policy in both request mutations", async () => {
    const t = makeConvexTest();
    const { userId, viewer } = await seedActiveViewer(t, "stale-policy@example.invalid");
    const { viewer: staff } = await seedStaffViewer(t);

    await expect(
      viewer.mutation(api.accountDeletion.index.request, {
        completionCapability: "3".repeat(64),
        deletionStartMode: "immediate",
        deletionConfirmationText: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
      }),
    ).rejects.toThrow("Account deletion policy changed");
    await expect(
      staff.mutation(api.accountDeletion.index.queueUserDeletionForAdmin, {
        deletionStartMode: "immediate",
        userId,
      }),
    ).rejects.toThrow("Account deletion policy changed");
  });

  it("lets staff start only a queued deletion and makes the late callback a no-op", async () => {
    const t = makeConvexTest();
    const { viewer } = await seedActiveViewer(t, "delete-now@example.invalid");
    const requested = await viewer.mutation(api.accountDeletion.index.request, {
      completionCapability: "1".repeat(64),
      deletionStartMode: "seven_days",
      deletionConfirmationText: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
    });
    if (requested.state !== "accepted") {
      throw new Error("Account deletion request was not accepted.");
    }

    await expect(
      viewer.mutation(api.accountDeletion.index.deleteNow, { runId: requested.status.runId }),
    ).rejects.toThrow("Access denied");

    const { viewer: staff } = await seedStaffViewer(t);
    await expect(
      staff.mutation(api.accountDeletion.index.deleteNow, { runId: requested.status.runId }),
    ).resolves.toMatchObject({
      runId: requested.status.runId,
      state: "running",
    });
    await expect(
      staff.mutation(api.accountDeletion.index.restore, { runId: requested.status.runId }),
    ).rejects.toThrow("Account deletion run is not restorable.");
    const started = await t.run(async (ctx) => await ctx.db.get(requested.status.runId));

    await expect(
      t.mutation(internal.accountDeletion.index.startScheduled, {
        runId: requested.status.runId,
      }),
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => await ctx.db.get(requested.status.runId))).resolves.toEqual(
      started,
    );
    await expect(
      staff.mutation(api.accountDeletion.index.deleteNow, { runId: requested.status.runId }),
    ).rejects.toThrow("Account deletion run is not queued.");
  });

  it("lists current users by default and includes scrubbed users on request", async () => {
    const t = makeConvexTest();
    const { userId: staffUserId, viewer: staff } = await seedStaffViewer(t);
    const { deletedUserId, targetUserId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "pending@example.invalid",
      });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "pending-google",
      });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "github",
        providerAccountId: "pending-github",
      });
      const deletedUserId = await ctx.db.insert("users", {
        state: "deleted",
        deletedAt: 1,
      });
      return { deletedUserId, targetUserId: userId };
    });

    const result = await staff.query(api.accountDeletion.index.listUsersForAdmin, {
      includeScrubbed: false,
      paginationOpts: { cursor: null, numItems: 10 },
    });

    expect(result.page).toContainEqual({
      userId: targetUserId,
      email: "pending@example.invalid",
      state: "active",
      isApproved: false,
      isCurrentUser: false,
      providers: ["github", "google"],
      createdAt: expect.any(Number),
    });
    expect(result.page).toContainEqual({
      userId: staffUserId,
      email: "nicu@samebase.com",
      state: "active",
      isApproved: true,
      isCurrentUser: true,
      providers: [],
      createdAt: expect.any(Number),
    });
    expect(result.page).not.toContainEqual(
      expect.objectContaining({
        userId: deletedUserId,
      }),
    );

    const resultWithScrubbed = await staff.query(api.accountDeletion.index.listUsersForAdmin, {
      includeScrubbed: true,
      paginationOpts: { cursor: null, numItems: 10 },
    });

    expect(resultWithScrubbed.page).toContainEqual({
      userId: deletedUserId,
      state: "deleted",
      isApproved: false,
      isCurrentUser: false,
      providers: [],
      createdAt: expect.any(Number),
    });
  });

  it("lets staff queue any active user and starts the deletion", async () => {
    // convex-test never runs a transaction at a time before the last commit, so the seed writes
    // commit before the time that the test reads.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const t = makeConvexTest();
    const { userId: staffUserId, viewer: staff } = await seedStaffViewer(t);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "staff-target@example.invalid",
      });
    });

    vi.setSystemTime(5_000);
    try {
      await expect(
        staff.mutation(api.accountDeletion.index.queueUserDeletionForAdmin, {
          deletionStartMode: "seven_days",
          userId: staffUserId,
        }),
      ).rejects.toThrow("Use Account settings to delete the current account.");

      const status = await staff.mutation(api.accountDeletion.index.queueUserDeletionForAdmin, {
        deletionStartMode: "seven_days",
        userId,
      });
      expect(status).toMatchObject({
        state: "queued",
        requestedAt: 5_000,
        deletionStartsAt: 604_805_000,
      });

      const queued = await t.run(async (ctx) => ({
        run: await ctx.db.get(status.runId),
        scheduledFunctions: await ctx.db.system.query("_scheduled_functions").take(2),
        user: await ctx.db.get(userId),
      }));
      expect(queued.run).toMatchObject({
        state: "queued",
        workflow: { state: "not_started" },
      });
      expect(queued.scheduledFunctions).toEqual([
        expect.objectContaining({
          scheduledTime: 604_805_000,
          state: { kind: "pending" },
        }),
      ]);
      expect(queued.user).toMatchObject({ state: "deleting", runId: status.runId });

      const operations = await staff.query(api.accountDeletion.index.listForAdmin, {
        paginationOpts: { cursor: null, numItems: 10 },
      });
      expect(operations.page).toContainEqual(
        expect.objectContaining({ runId: status.runId, state: "queued" }),
      );

      await t.mutation(internal.accountDeletion.index.startScheduled, { runId: status.runId });
      const started = await t.run(async (ctx) => await ctx.db.get(status.runId));
      if (started?.state !== "running") {
        throw new Error("Account deletion did not start.");
      }
      expect(started.deletionStartsAt).toBe(604_805_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets staff restore only a queued deletion and makes the late callback a no-op", async () => {
    const t = makeConvexTest();
    const { userId, viewer } = await seedActiveViewer(t, "restore@example.invalid");
    await t.run(async (ctx) =>
      ctx.db.patch(userId, {
        name: "Restored User",
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1_755_000_000_000,
      }),
    );
    const requested = await viewer.mutation(api.accountDeletion.index.request, {
      completionCapability: "2".repeat(64),
      deletionStartMode: "seven_days",
      deletionConfirmationText: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
    });
    if (requested.state !== "accepted") {
      throw new Error("Account deletion request was not accepted.");
    }

    await expect(
      viewer.mutation(api.accountDeletion.index.restore, { runId: requested.status.runId }),
    ).rejects.toThrow("Access denied");

    const { viewer: staff } = await seedStaffViewer(t);
    await expect(
      staff.mutation(api.accountDeletion.index.restore, { runId: requested.status.runId }),
    ).resolves.toBeNull();
    const restored = await t.run(async (ctx) => ({
      events: await ctx.db
        .query("workflow_accountDeletion_events")
        .withIndex("by_run_and_created_at", (query) => query.eq("runId", requested.status.runId))
        .collect(),
      run: await ctx.db.get(requested.status.runId),
      user: await ctx.db.get(userId),
    }));
    expect(restored.events).toEqual([]);
    expect(restored.run).toBeNull();
    expect(restored.user).toMatchObject({
      _id: userId,
      email: "restore@example.invalid",
      name: "Restored User",
      state: "active",
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1_755_000_000_000,
    });

    await expect(
      t.mutation(internal.accountDeletion.index.startScheduled, {
        runId: requested.status.runId,
      }),
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => await ctx.db.get(userId))).resolves.toMatchObject({
      state: "active",
    });
  });

  it("rejects account deletion while any organization membership exists", async () => {
    const t = makeConvexTest();
    const { userId, viewer } = await seedActiveViewer(t, "member@example.invalid");
    await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "account-deletion-membership",
        githubOwnerType: "organization",
        githubOwnerLogin: "account-deletion-membership",
        githubOwnerLoginNormalized: "account-deletion-membership",
        githubInstallationId: "account-deletion-membership-installation",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
        role: "member",
      });
    });

    await expect(
      viewer.mutation(api.accountDeletion.index.request, {
        completionCapability: "f".repeat(64),
        deletionStartMode: "seven_days",
        deletionConfirmationText: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
      }),
    ).resolves.toEqual({ state: "organization_membership_exists" });
    const snapshot = await t.run(async (ctx) => ({
      events: await ctx.db.query("workflow_accountDeletion_events").collect(),
      runs: await ctx.db.query("workflow_accountDeletion_runs").collect(),
      user: await ctx.db.get(userId),
    }));
    expect(snapshot.events).toEqual([]);
    expect(snapshot.runs).toEqual([]);
    expect(snapshot.user).toMatchObject({ _id: userId, state: "active" });
  });

  it("rejects deleting markers whose run is missing or owned by another user", async () => {
    const t = makeConvexTest();
    const { userId, viewer } = await seedActiveViewer(t, "inconsistent@example.invalid");
    await t.run(async (ctx) => {
      const missingRunId = await ctx.db.insert("workflow_accountDeletion_runs", {
        state: "queued",
        identity: {
          state: "active",
          userId,
          email: "inconsistent@example.invalid",
        },
        completionCapability: "c".repeat(64),
        currentStep: "request_accepted",
        requestedAt: 1,
        updatedAt: 1,
        retryCount: 0,
        outcomes: {
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
        workflow: { state: "not_started" },
      });
      await ctx.db.delete(missingRunId);
      await ctx.db.replace(userId, {
        state: "deleting",
        email: "inconsistent@example.invalid",
        isApproved: true,
        runId: missingRunId,
        requestedAt: 1,
      });
    });

    await expect(viewer.query(api.accountDeletion.index.status, {})).rejects.toThrow(
      "Account deletion state is inconsistent.",
    );
    await expect(
      viewer.mutation(api.accountDeletion.index.request, {
        completionCapability: "e".repeat(64),
        deletionStartMode: "seven_days",
        deletionConfirmationText: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
      }),
    ).rejects.toThrow("Account deletion state is inconsistent.");

    const { userId: runOwnerUserId } = await seedActiveViewer(t, "run-owner@example.invalid");
    await t.run(async (ctx) => {
      const wrongOwnerRunId = await ctx.db.insert("workflow_accountDeletion_runs", {
        state: "queued",
        identity: {
          state: "active",
          userId: runOwnerUserId,
          email: "run-owner@example.invalid",
        },
        completionCapability: "d".repeat(64),
        currentStep: "request_accepted",
        requestedAt: 1,
        updatedAt: 1,
        retryCount: 0,
        outcomes: {
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
        workflow: { state: "not_started" },
      });
      await ctx.db.replace(userId, {
        state: "deleting",
        email: "inconsistent@example.invalid",
        isApproved: true,
        runId: wrongOwnerRunId,
        requestedAt: 1,
      });
    });

    await expect(viewer.query(api.accountDeletion.index.status, {})).rejects.toThrow(
      "Account deletion state is inconsistent.",
    );
    await expect(
      viewer.mutation(api.accountDeletion.index.request, {
        completionCapability: "e".repeat(64),
        deletionStartMode: "seven_days",
        deletionConfirmationText: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
      }),
    ).rejects.toThrow("Account deletion state is inconsistent.");
  });
});

describe("account deletion with Convex Auth 2", () => {
  it("ends the sessions and frees the GitHub account for a new Samebase account", async () => {
    // convex/auth.ts builds the hub sign-in methods from IDENTITY_HUB_ISSUER when it loads.
    vi.stubEnv("IDENTITY_HUB_ISSUER", "https://hub.example.invalid");
    vi.stubEnv("AUTO_APPROVE_NEW_USERS", "true");
    // A local deployment skips the new-user and completion emails.
    vi.stubEnv("CONVEX_DEPLOYMENT", "local:test");
    vi.useFakeTimers();
    const t = makeConvexTest();
    const email = "deleted-github-user@example.invalid";
    const password = "deleted-user-password-1234";
    const providerAccountId = "github:deleted-account";
    // What the hub-github method does for a first sign-in: the core signs up a user through the
    // app's callbacks, and the `authHub` component records the hub subject for that user.
    const signUpWithGithub = async () => {
      const handles = await t.run(async () => ({
        createUser: await createFunctionHandle(internal.identity.signIn.createUser),
        onSignIn: await createFunctionHandle(internal.identity.signIn.onSignIn),
      }));
      const tokens = await t.mutation(components.auth.public._internal_dangerous_signUp, {
        claims: {
          method: "hub-github",
          profile: {
            id: providerAccountId,
            connector: "github",
            providerAccountId: "deleted-account",
            name: "Deleted User",
            email,
            picture: "https://example.com/avatar.png",
          },
        },
        componentPath: "authHub",
        createUserHandle: handles.createUser,
        onSignInHandle: handles.onSignIn,
        accessTokenTtlSeconds: authTtl.accessTokenTtlSeconds,
        refreshInactivityTimeoutSeconds: authTtl.refreshInactivityTimeoutSeconds,
        sessionMaxLifetimeSeconds: authTtl.sessionMaxLifetimeSeconds,
      });
      await t.mutation(components.authHub.provider._internal_dangerous_createAccount, {
        providerAccountId,
        userId: tokens.userId,
      });
      return tokens;
    };

    const session = await signUpWithGithub();
    const userId = await t.run(async (ctx) => {
      const id = ctx.db.normalizeId("users", session.userId);
      if (id === null) {
        throw new Error("The core returned a user id that is not a users id.");
      }
      await ctx.db.patch(id, { termsVersion: "2026-08-12", termsAcceptedAt: 1 });
      return id;
    });
    await t.mutation(internal.authAdmin.createOrUpdatePasswordAccount, { email, password });
    await expect(
      t.query(components.authHub.provider.getUserIdByAccount, { providerAccountId }),
    ).resolves.toBe(userId);

    const viewer = t.withIdentity(sessionIdentity(session));
    await expect(viewer.query(api.auth.isAuthenticated, {})).resolves.toBe(true);
    const requested = await viewer.mutation(api.accountDeletion.index.request, {
      completionCapability: "f".repeat(64),
      deletionStartMode: "seven_days",
      deletionConfirmationText: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
    });
    if (requested.state !== "accepted") {
      throw new Error("Account deletion request was not accepted.");
    }
    await t.mutation(internal.accountDeletion.index.startScheduled, {
      runId: requested.status.runId,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers, 1_000);

    await expect(
      t.run(async (ctx) => ({
        run: await ctx.db.get(requested.status.runId),
        user: await ctx.db.get(userId),
      })),
    ).resolves.toMatchObject({ run: { state: "succeeded" }, user: { state: "deleted" } });
    // The access token of the deleted session is still unexpired, but it names no session.
    await expect(viewer.query(api.auth.isAuthenticated, {})).resolves.toBe(false);
    await expect(t.query(components.auth.public.listSessions, { userId })).resolves.toEqual([]);
    await expect(
      t.mutation(components.auth.public.refresh, {
        refreshToken: session.refreshToken,
        accessTokenTtlSeconds: authTtl.accessTokenTtlSeconds,
        refreshInactivityTimeoutSeconds: authTtl.refreshInactivityTimeoutSeconds,
        sessionMaxLifetimeSeconds: authTtl.sessionMaxLifetimeSeconds,
      }),
    ).resolves.toEqual({ kind: "noSession" });
    await expect(
      t.mutation(components.authPassword.public.verifyPassword, { userId, password }),
    ).rejects.toThrow(`No password stored for userId ${userId}.`);

    // The hub method signs up a subject that the `authHub` component does not know.
    await expect(
      t.query(components.authHub.provider.getUserIdByAccount, { providerAccountId }),
    ).resolves.toBeNull();
    const nextSession = await signUpWithGithub();
    expect(nextSession.userId).not.toBe(userId);
    await expect(
      t.run(async (ctx) => {
        const nextUserId = ctx.db.normalizeId("users", nextSession.userId);
        return nextUserId === null ? null : await ctx.db.get(nextUserId);
      }),
    ).resolves.toMatchObject({ state: "active", email, isApproved: true });
  });
});
