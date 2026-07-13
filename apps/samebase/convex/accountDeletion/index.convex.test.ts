import { describe, expect, it } from "vite-plus/test";

import { api } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

const now = 1_700_000_000_000;
const completionCapability = "a".repeat(64);

async function seedUser(args: {
  email: string;
  approved?: boolean;
  t?: ReturnType<typeof makeConvexTest>;
}) {
  const t = args.t ?? makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: args.email,
      isApproved: args.approved ?? true,
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: now + 60_000,
    });
    return { userId, sessionId };
  });
  const asUser = t.withIdentity({
    subject: `${ids.userId}|${ids.sessionId}`,
    tokenIdentifier: `test:${ids.sessionId}`,
  });
  return { asUser, ids, t };
}

const notStartedOutcomes = {
  billing: { state: "not_started" as const },
  providerRevocation: { state: "not_started" as const },
  completionEmail: { state: "not_started" as const },
};

describe("account deletion foundation", () => {
  it("atomically gates the user and reuses one running workflow", async () => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });

    const first = await asUser.mutation(api.accountDeletion.index.request, {
      completionCapability,
    });
    const second = await asUser.mutation(api.accountDeletion.index.request, {
      completionCapability,
    });

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      state: "running",
      currentStep: "request_accepted",
      dataDeletion: {
        chatsAndAgentData: { state: "not_started" },
        vaultsAndStagedChanges: { state: "not_started" },
        connectedMachines: { state: "not_started" },
        preferences: { state: "not_started" },
        appAccessAndTokens: { state: "not_started" },
        accessRequestsAndHistory: { state: "not_started" },
      },
    });
    expect(first).not.toHaveProperty("stagedFileCount");

    const stored = await t.run(async (ctx) => {
      const user = await ctx.db.get(ids.userId);
      const runs = await ctx.db.query("accountDeletionRuns").collect();
      const events = await ctx.db.query("accountDeletionEvents").collect();
      return { user, runs, events };
    });
    expect(stored.user?.accountDeletion).toEqual({
      state: "deleting",
      runId: first.runId,
      requestedAt: first.requestedAt,
    });
    expect(stored.runs).toMatchObject([
      {
        state: "running",
        workflow: { state: "started", attempt: 1 },
        outcomes: notStartedOutcomes,
      },
    ]);
    expect(stored.events).toMatchObject([
      {
        runId: first.runId,
        step: "request_accepted",
        level: "info",
      },
    ]);
    await expect(
      asUser.mutation(api.dashboardSettings.setAccountPanelOpen, { isOpen: true }),
    ).rejects.toThrow("Access denied");
  });

  it("rejects staff self-deletion without removing staff access", async () => {
    const staff = await seedUser({ email: "nicu@samebase.com" });

    await expect(
      staff.asUser.mutation(api.accountDeletion.index.request, { completionCapability }),
    ).rejects.toThrow("Staff accounts cannot request account deletion.");
    await expect(
      staff.asUser.query(api.accountDeletion.index.listForAdmin, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toMatchObject({ page: [] });
  });

  it("exposes status only for the current deleting user", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const other = await seedUser({ email: "grace@example.com", t: owner.t });
    const status = await owner.asUser.mutation(api.accountDeletion.index.request, {
      completionCapability,
    });

    await expect(owner.asUser.query(api.accountDeletion.index.status)).resolves.toEqual(status);
    await expect(other.asUser.query(api.accountDeletion.index.status)).resolves.toBeNull();
  });

  it("does not fabricate detailed progress for active legacy runs", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const requested = await owner.asUser.mutation(api.accountDeletion.index.request, {
      completionCapability,
    });
    await owner.t.run(async (ctx) => {
      await ctx.db.patch(requested.runId, { dataDeletion: undefined });
    });

    await expect(owner.asUser.query(api.accountDeletion.index.status)).resolves.toMatchObject({
      dataDeletion: { state: "legacy_unavailable" },
    });
  });

  it("keeps deletion status readable while the user marker is finalizing", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const status = await owner.asUser.mutation(api.accountDeletion.index.request, {
      completionCapability,
    });

    await owner.t.run(async (ctx) => {
      await ctx.db.patch(owner.ids.userId, {
        accountDeletion: {
          state: "finalizing",
          runId: status.runId,
          requestedAt: status.requestedAt,
        },
      });
    });

    await expect(owner.asUser.query(api.accountDeletion.index.status)).resolves.toMatchObject({
      completionCapability,
      currentStep: "request_accepted",
      runId: status.runId,
      state: "running",
    });
  });

  it("exposes only a scrubbed completion receipt by capability", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const requested = await owner.asUser.mutation(api.accountDeletion.index.request, {
      completionCapability,
    });

    await expect(
      owner.t.query(api.accountDeletion.index.completion, { completionCapability }),
    ).resolves.toBeNull();
    await expect(
      owner.t.query(api.accountDeletion.index.completion, { completionCapability: "invalid" }),
    ).resolves.toBeNull();

    const completedAt = requested.latestProgressAt + 1;
    await owner.t.run(async (ctx) => {
      await ctx.db.replace(requested.runId, {
        identity: { state: "scrubbed" },
        completionCapability,
        state: "succeeded",
        currentStep: "finish",
        requestedAt: requested.requestedAt,
        updatedAt: completedAt,
        retryCount: 0,
        completedAt,
        outcomes: notStartedOutcomes,
      });
    });

    await expect(
      owner.t.query(api.accountDeletion.index.completion, { completionCapability }),
    ).resolves.toEqual({ state: "succeeded", completedAt });
  });

  it("provides safe paginated staff list and detail results", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const staff = await seedUser({ email: "nicu@samebase.com", t: owner.t });
    const run = await owner.asUser.mutation(api.accountDeletion.index.request, {
      completionCapability,
    });

    await expect(
      owner.asUser.query(api.accountDeletion.index.listForAdmin, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow("Access denied");

    const list = await staff.asUser.query(api.accountDeletion.index.listForAdmin, {
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(list.page).toEqual([
      expect.objectContaining({
        runId: run.runId,
        email: "ada@example.com",
        state: "running",
        outcomes: notStartedOutcomes,
      }),
    ]);
    expect(list.page[0]).not.toHaveProperty("userId");
    expect(list.page[0]).not.toHaveProperty("initiatingSessionId");
    expect(list.page[0]).not.toHaveProperty("stagedFileCount");

    const detail = await staff.asUser.query(api.accountDeletion.index.detailForAdmin, {
      runId: run.runId,
    });
    expect(detail).toMatchObject({
      run: {
        runId: run.runId,
        email: "ada@example.com",
        outcomes: notStartedOutcomes,
        dataDeletion: {
          chatsAndAgentData: { state: "not_started" },
          vaultsAndStagedChanges: { state: "not_started" },
        },
      },
      events: [{ step: "request_accepted", level: "info" }],
    });
    expect(detail?.events[0]).not.toHaveProperty("userId");
    expect(detail?.events[0]).not.toHaveProperty("email");
  });

  it("represents started work, required attention errors, and scrubbed success legally", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const staff = await seedUser({ email: "nicu@samebase.com", t: owner.t });
    const requested = await owner.asUser.mutation(api.accountDeletion.index.request, {
      completionCapability,
    });

    await owner.t.run(async (ctx) => {
      const running = await ctx.db.get(requested.runId);
      if (running === null || running.state !== "running") {
        throw new Error("Expected running account deletion run.");
      }
      await ctx.db.replace(requested.runId, {
        ...running,
        state: "needs_attention",
        latestSafeError: "Billing cancellation needs staff attention.",
        updatedAt: running.updatedAt + 1,
        outcomes: {
          ...running.outcomes,
          billing: {
            state: "failed",
            safeError: "Billing cancellation needs staff attention.",
          },
        },
      });
    });

    const attention = await staff.asUser.query(api.accountDeletion.index.detailForAdmin, {
      runId: requested.runId,
    });
    expect(attention?.run).toMatchObject({
      state: "needs_attention",
      latestSafeError: "Billing cancellation needs staff attention.",
      outcomes: {
        billing: {
          state: "failed",
          safeError: "Billing cancellation needs staff attention.",
        },
      },
    });

    const succeededOutcomes = {
      billing: { state: "succeeded" as const },
      providerRevocation: {
        state: "completed" as const,
        github: {
          state: "unconfirmed" as const,
          safeError: "GitHub OAuth revocation could not be confirmed." as const,
        },
        cloudflare: { state: "revoked" as const },
        convex: {
          state: "manual_revocation_required" as const,
          safeNotice:
            "Convex OAuth cannot be revoked by Samebase. Previously issued production and preview deploy keys remain usable until the user revokes Samebase in Convex Authorized Applications." as const,
        },
      },
      completionEmail: {
        state: "delivery_failed" as const,
        safeError: "Completion email delivery was not confirmed.",
      },
    };
    await owner.t.run(async (ctx) => {
      await ctx.db.replace(requested.runId, {
        identity: { state: "scrubbed" },
        completionCapability,
        state: "succeeded",
        currentStep: "finish",
        requestedAt: requested.requestedAt,
        updatedAt: requested.latestProgressAt + 3,
        retryCount: 2,
        completedAt: requested.latestProgressAt + 3,
        outcomes: succeededOutcomes,
      });
    });

    const succeeded = await staff.asUser.query(api.accountDeletion.index.detailForAdmin, {
      runId: requested.runId,
    });
    expect(succeeded?.run).toMatchObject({
      state: "succeeded",
      completedAt: requested.latestProgressAt + 3,
      outcomes: succeededOutcomes,
      dataDeletion: { state: "receipt_scrubbed" },
    });
    expect(succeeded?.run).not.toHaveProperty("email");
    expect(succeeded?.run).not.toHaveProperty("userId");
    expect(succeeded?.run).not.toHaveProperty("stagedFileCount");
  });

  it("rejects illegal workflow ownership and missing attention errors", async () => {
    const { ids, t } = await seedUser({ email: "ada@example.com" });

    await expect(
      t.run(async (ctx) => {
        await ctx.db.insert("accountDeletionRuns", {
          identity: { state: "active", userId: ids.userId, email: "ada@example.com" },
          completionCapability,
          state: "queued",
          // @ts-expect-error A queued run cannot own a started workflow.
          workflow: { state: "started", workflowId: "workflow-1", attempt: 1 },
          currentStep: "request_accepted",
          requestedAt: now,
          updatedAt: now,
          initiatingSessionId: ids.sessionId,
          retryCount: 0,
          outcomes: notStartedOutcomes,
        });
      }),
    ).rejects.toThrow();

    await expect(
      t.run(async (ctx) => {
        // @ts-expect-error A needs-attention run requires a safe error.
        await ctx.db.insert("accountDeletionRuns", {
          identity: { state: "active", userId: ids.userId, email: "ada@example.com" },
          completionCapability,
          state: "needs_attention",
          workflow: { state: "started", workflowId: "workflow-1", attempt: 1 },
          currentStep: "cancel_billing",
          requestedAt: now,
          updatedAt: now,
          initiatingSessionId: ids.sessionId,
          retryCount: 0,
          outcomes: notStartedOutcomes,
        });
      }),
    ).rejects.toThrow();
  });

  it("keeps legacy scrubbed receipts deployable without making them publicly discoverable", async () => {
    const staff = await seedUser({ email: "nicu@samebase.com" });
    const legacyOutcomes = {
      billing: { state: "not_applicable" as const },
      providerRevocation: {
        state: "completed" as const,
        github: { state: "not_connected" as const },
        cloudflare: { state: "not_connected" as const },
        convex: { state: "not_connected" as const },
      },
      completionEmail: { state: "sent" as const },
    };
    const legacyRunId = await staff.t.run(async (ctx) => {
      return await ctx.db.insert("accountDeletionRuns", {
        identity: { state: "scrubbed" },
        state: "succeeded",
        currentStep: "finish",
        requestedAt: now,
        updatedAt: now + 1,
        retryCount: 0,
        completedAt: now + 1,
        outcomes: legacyOutcomes,
      });
    });

    const detail = await staff.asUser.query(api.accountDeletion.index.detailForAdmin, {
      runId: legacyRunId,
    });
    expect(detail?.run).toMatchObject({
      state: "succeeded",
      completedAt: now + 1,
      dataDeletion: { state: "receipt_scrubbed" },
    });
    await expect(
      staff.t.query(api.accountDeletion.index.completion, { completionCapability }),
    ).resolves.toBeNull();
  });

  it("rejects active runs without a completion capability", async () => {
    const { ids, t } = await seedUser({ email: "ada@example.com" });

    await expect(
      t.run(async (ctx) => {
        // @ts-expect-error Active deletion runs always require the browser capability.
        await ctx.db.insert("accountDeletionRuns", {
          identity: { state: "active", userId: ids.userId, email: "ada@example.com" },
          state: "queued",
          workflow: { state: "not_started" },
          currentStep: "request_accepted",
          requestedAt: now,
          updatedAt: now,
          initiatingSessionId: ids.sessionId,
          retryCount: 0,
          outcomes: notStartedOutcomes,
        });
      }),
    ).rejects.toThrow();
  });
});
