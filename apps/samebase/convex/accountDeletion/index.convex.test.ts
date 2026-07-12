import { describe, expect, it } from "vite-plus/test";

import { api } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

const now = 1_700_000_000_000;

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
  it("atomically gates the user and reuses one queued run", async () => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });

    const first = await asUser.mutation(api.accountDeletion.index.request);
    const second = await asUser.mutation(api.accountDeletion.index.request);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      state: "queued",
      markerPhase: "deleting",
      currentStep: "request_accepted",
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
        state: "queued",
        workflow: { state: "not_started" },
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

    await expect(staff.asUser.mutation(api.accountDeletion.index.request)).rejects.toThrow(
      "Staff accounts cannot request account deletion.",
    );
    await expect(
      staff.asUser.query(api.accountDeletion.index.listForAdmin, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toMatchObject({ page: [] });
  });

  it("exposes status only for the current deleting user", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const other = await seedUser({ email: "grace@example.com", t: owner.t });
    const status = await owner.asUser.mutation(api.accountDeletion.index.request);

    await expect(owner.asUser.query(api.accountDeletion.index.status)).resolves.toEqual(status);
    await expect(other.asUser.query(api.accountDeletion.index.status)).resolves.toBeNull();
  });

  it("projects finalizing before the user loses authenticated status", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const status = await owner.asUser.mutation(api.accountDeletion.index.request);

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
      runId: status.runId,
      markerPhase: "finalizing",
    });
  });

  it("provides safe paginated staff list and detail results", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const staff = await seedUser({ email: "nicu@samebase.com", t: owner.t });
    const run = await owner.asUser.mutation(api.accountDeletion.index.request);

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
        state: "queued",
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
      run: { runId: run.runId, email: "ada@example.com", outcomes: notStartedOutcomes },
      events: [{ step: "request_accepted", level: "info" }],
    });
    expect(detail?.events[0]).not.toHaveProperty("userId");
    expect(detail?.events[0]).not.toHaveProperty("email");
  });

  it("represents started work, required attention errors, and scrubbed success legally", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const staff = await seedUser({ email: "nicu@samebase.com", t: owner.t });
    const requested = await owner.asUser.mutation(api.accountDeletion.index.request);

    await owner.t.run(async (ctx) => {
      const queued = await ctx.db.get(requested.runId);
      if (queued === null || queued.state !== "queued") {
        throw new Error("Expected queued account deletion run.");
      }
      await ctx.db.replace(requested.runId, {
        identity: queued.identity,
        state: "running",
        workflow: { state: "started", workflowId: "workflow-1", attempt: 1 },
        currentStep: "cancel_billing",
        requestedAt: queued.requestedAt,
        updatedAt: queued.updatedAt + 1,
        initiatingSessionId: queued.initiatingSessionId,
        retryCount: queued.retryCount,
        outcomes: queued.outcomes,
      });
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
        state: "unconfirmed" as const,
        safeError: "Upstream revocation was not confirmed.",
      },
      completionEmail: {
        state: "delivery_failed" as const,
        safeError: "Completion email delivery was not confirmed.",
      },
    };
    await owner.t.run(async (ctx) => {
      await ctx.db.replace(requested.runId, {
        identity: { state: "scrubbed" },
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
});
