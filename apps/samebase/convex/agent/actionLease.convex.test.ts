import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";

const workflowId = "agent-action-quiescence-workflow";

async function seedRunningDeletion(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const initiatingSessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: now + 60_000,
    });
    const runId = await ctx.db.insert("operations_accountDeletionRuns", {
      identity: { state: "active", userId, email: "deleting@example.com" },
      completionCapability: "agent-action-lease-test",
      state: "running",
      workflow: { state: "started", workflowId, attempt: 1 },
      currentStep: "delete_samebase_data",
      requestedAt: now,
      updatedAt: now,
      initiatingSessionId,
      retryCount: 0,
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
    await ctx.db.patch(userId, {
      accountDeletion: { state: "deleting", runId, requestedAt: now },
    });
    return runId;
  });
}

describe("Agent action deletion quiescence", () => {
  it("atomically refuses new work after deletion begins", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "deleting@example.com",
        isApproved: true,
      });
    });
    await seedRunningDeletion(t, userId);

    await expect(t.mutation(internal.agent.actionLease.acquire, { userId })).resolves.toBeNull();
    await expect(
      t.run(async (ctx) => {
        return await ctx.db
          .query("operations_agentActionLeases")
          .withIndex("by_user_and_expires_at", (query) => query.eq("userId", userId))
          .first();
      }),
    ).resolves.toBeNull();
  });

  it("blocks finalization until held work releases its lease", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "deleting@example.com",
        isApproved: true,
      });
    });
    const leaseId = await t.mutation(internal.agent.actionLease.acquire, { userId });
    expect(leaseId).not.toBeNull();
    if (leaseId === null) throw new Error("Expected an Agent action lease");
    const runId = await seedRunningDeletion(t, userId);
    const args = { runId, workflowId };

    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, args),
    ).resolves.toMatchObject({
      state: "waiting",
      blocker: "active_agent_action",
    });
    await expect(
      t.mutation(internal.accountDeletion.workflow.markFinalizing, args),
    ).rejects.toThrow("Agent action remains active during finalization.");

    await t.mutation(internal.agent.actionLease.release, { leaseId });
    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, args),
    ).resolves.toEqual({ state: "done" });
    await expect(
      t.mutation(internal.accountDeletion.workflow.markFinalizing, args),
    ).resolves.toBeNull();
  });

  it("reaps a crashed action lease after the Convex action deadline", async () => {
    const t = makeConvexTest();
    const { runId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "deleting@example.com",
        isApproved: true,
      });
      const now = Date.now();
      const initiatingSessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: now + 60_000,
      });
      const runId = await ctx.db.insert("operations_accountDeletionRuns", {
        identity: { state: "active", userId, email: "deleting@example.com" },
        completionCapability: "agent-action-lease-test",
        state: "running",
        workflow: { state: "started", workflowId, attempt: 1 },
        currentStep: "request_accepted",
        requestedAt: now,
        updatedAt: now,
        initiatingSessionId,
        retryCount: 0,
        outcomes: {
          billing: { state: "not_started" },
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
      });
      await ctx.db.patch(userId, {
        accountDeletion: { state: "deleting", runId, requestedAt: now },
      });
      await ctx.db.insert("operations_agentActionLeases", { userId, expiresAt: now - 1 });
      return { runId, userId };
    });

    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, { runId, workflowId }),
    ).resolves.toEqual({ state: "done" });
    await expect(
      t.run(async (ctx) => {
        return await ctx.db
          .query("operations_agentActionLeases")
          .withIndex("by_user_and_expires_at", (query) => query.eq("userId", userId))
          .first();
      }),
    ).resolves.toBeNull();
  });
});
