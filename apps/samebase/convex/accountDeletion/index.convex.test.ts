import { describe, expect, it, vi } from "vite-plus/test";

import { ACCOUNT_DELETION_CONFIRMATION_PHRASE } from "../../shared/accountDeletionPhrase";
import { buildOrganizationDeletionConfirmationPhrase } from "../../shared/organizationDeletionPhrase";
import { api } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

async function seedActiveViewer(t: ReturnType<typeof makeConvexTest>, email: string) {
  const { sessionId, userId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email,
      isApproved: true,
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: 2_000_000_000_000,
    });
    return { sessionId, userId };
  });
  return {
    sessionId,
    userId,
    viewer: t.withIdentity({
      subject: `${userId}|${sessionId}`,
      tokenIdentifier: `test:${userId}`,
    }),
  };
}

describe("account deletion request and status", () => {
  it("returns no active status and makes no writes for a confirmation mismatch", async () => {
    const t = makeConvexTest();
    const { sessionId, userId, viewer } = await seedActiveViewer(t, "active@example.invalid");
    const before = await t.run(async (ctx) => ({
      events: await ctx.db.query("workflow_accountDeletion_events").collect(),
      runs: await ctx.db.query("workflow_accountDeletion_runs").collect(),
      session: await ctx.db.get(sessionId),
      user: await ctx.db.get(userId),
    }));

    await expect(viewer.query(api.accountDeletion.index.status, {})).resolves.toBeNull();
    await expect(
      viewer.mutation(api.accountDeletion.index.request, {
        completionCapability: "a".repeat(64),
        confirmationPhrase: "keep my account",
      }),
    ).resolves.toEqual({ state: "confirmation_mismatch" });

    const after = await t.run(async (ctx) => ({
      events: await ctx.db.query("workflow_accountDeletion_events").collect(),
      runs: await ctx.db.query("workflow_accountDeletion_runs").collect(),
      session: await ctx.db.get(sessionId),
      user: await ctx.db.get(userId),
    }));
    expect(after).toEqual(before);
  });

  it("creates one run, preserves the session, and returns the same status on repeat", async () => {
    const t = makeConvexTest();
    const { sessionId, userId, viewer } = await seedActiveViewer(t, "requester@example.invalid");
    const initiatingSession = await t.run(async (ctx) => await ctx.db.get(sessionId));
    const args = {
      completionCapability: "b".repeat(64),
      confirmationPhrase: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
    };

    const first = await viewer.mutation(api.accountDeletion.index.request, args);
    if (first.state !== "accepted") {
      throw new Error("Account deletion request was not accepted.");
    }
    const status = await viewer.query(api.accountDeletion.index.status, {});
    const repeated = await viewer.mutation(api.accountDeletion.index.request, args);

    expect(status).toEqual(first.status);
    expect(repeated).toEqual(first);
    const snapshot = await t.run(async (ctx) => ({
      events: await ctx.db.query("workflow_accountDeletion_events").collect(),
      run: await ctx.db.get(first.status.runId),
      runs: await ctx.db.query("workflow_accountDeletion_runs").collect(),
      session: await ctx.db.get(sessionId),
      user: await ctx.db.get(userId),
    }));
    expect(snapshot.runs).toHaveLength(1);
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.session).toEqual(initiatingSession);
    expect(snapshot.run).toMatchObject({
      _id: first.status.runId,
      initiatingSessionId: sessionId,
      state: "running",
    });
    expect(snapshot.user).toMatchObject({
      _id: userId,
      runId: first.status.runId,
      state: "deleting",
    });
  });

  it("requires a shared organization membership to be resolved before account deletion", async () => {
    const t = makeConvexTest();
    const { userId, viewer } = await seedActiveViewer(t, "payer@example.invalid");
    await t.run(async (ctx) => {
      const secondOwnerId = await ctx.db.insert("users", {
        state: "active",
        email: "second-owner@example.invalid",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "payer-organization",
        githubOwnerType: "organization",
        githubOwnerLogin: "payer-organization",
        githubOwnerLoginNormalized: "payer-organization",
        githubInstallationId: "payer-installation",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
        role: "owner",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: secondOwnerId,
        role: "owner",
      });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
        polarBillingUserId: userId,
      });
    });

    await expect(
      viewer.mutation(api.accountDeletion.index.request, {
        completionCapability: "f".repeat(64),
        confirmationPhrase: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
      }),
    ).rejects.toThrow(
      "Leave or delete the payer-organization organization before you delete your account.",
    );
  });

  it("rejects deleting markers whose run is missing or owned by another user", async () => {
    const t = makeConvexTest();
    const { sessionId, userId, viewer } = await seedActiveViewer(t, "inconsistent@example.invalid");
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
        initiatingSessionId: sessionId,
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
        confirmationPhrase: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
      }),
    ).rejects.toThrow("Account deletion state is inconsistent.");

    const { sessionId: runOwnerSessionId, userId: runOwnerUserId } = await seedActiveViewer(
      t,
      "run-owner@example.invalid",
    );
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
        initiatingSessionId: runOwnerSessionId,
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
        confirmationPhrase: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
      }),
    ).rejects.toThrow("Account deletion state is inconsistent.");
  });

  it("requires explicit sole-member organization deletion before account deletion", async () => {
    vi.useFakeTimers();
    try {
      const t = makeConvexTest();
      const { userId, viewer } = await seedActiveViewer(
        t,
        "sole-organization-owner@example.invalid",
      );
      const organizationId = await t.run(async (ctx) => {
        const organizationId = await ctx.db.insert("organizations", {
          githubOwnerId: "solo-owner-id",
          githubOwnerType: "organization",
          githubOwnerLogin: "SoloOrg",
          githubOwnerLoginNormalized: "soloorg",
          githubInstallationId: "solo-installation",
        });
        await ctx.db.insert("organizationMemberships", {
          organizationId,
          userId,
          role: "owner",
        });
        await ctx.db.insert("organizationBillingAccounts", {
          organizationId,
          plan: "free",
          status: "inactive",
          polarBillingUserId: userId,
        });
        return organizationId;
      });

      await expect(
        viewer.mutation(api.accountDeletion.index.request, {
          completionCapability: "f".repeat(64),
          confirmationPhrase: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
        }),
      ).rejects.toThrow("Leave or delete the SoloOrg organization before you delete your account.");

      await viewer.mutation(api.organizationDeletion.index.request, {
        organizationId,
        confirmationPhrase: buildOrganizationDeletionConfirmationPhrase("SoloOrg"),
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const deletedOrganization = await t.run(async (ctx) => await ctx.db.get(organizationId));
      expect(deletedOrganization).toBeNull();
      await expect(
        viewer.mutation(api.accountDeletion.index.request, {
          completionCapability: "0".repeat(64),
          confirmationPhrase: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
        }),
      ).resolves.toMatchObject({ state: "accepted" });
    } finally {
      vi.useRealTimers();
    }
  });
});
