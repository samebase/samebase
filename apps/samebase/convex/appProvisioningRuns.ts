import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  vAppProvisioningEventLevel,
  vAppProvisioningRunState,
  vAppProvisioningRunTrigger,
  vAppProvisioningStep,
} from "./schema";
import { assertConnectedVault } from "./vault/state";

const { id, literal, string, union } = v;
const MAX_EVENTS_TO_LINK_TO_VAULT = 20;

async function recordRepositoryFullNameForRun(
  ctx: MutationCtx,
  args: {
    runId: Id<"operations_vaultProvisioningRuns">;
    repositoryFullName: string;
  },
): Promise<void> {
  const run = await ctx.db.get(args.runId);
  if (!run) {
    throw new Error("Provisioning run not found.");
  }
  if (run.repositoryFullName === args.repositoryFullName) {
    return;
  }

  await ctx.db.patch(args.runId, {
    repositoryFullName: args.repositoryFullName,
    updatedAt: Date.now(),
  });

  const events = await ctx.db
    .query("operations_vaultProvisioningEvents")
    .withIndex("by_run_and_created_at", (q) => q.eq("runId", args.runId))
    .take(MAX_EVENTS_TO_LINK_TO_VAULT);
  for (const event of events) {
    await ctx.db.patch(event._id, {
      repositoryFullName: args.repositoryFullName,
    });
  }
}

export const getById = internalQuery({
  args: {
    runId: id("operations_vaultProvisioningRuns"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

export const createForVault = internalMutation({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
    trigger: vAppProvisioningRunTrigger,
  },
  returns: id("operations_vaultProvisioningRuns"),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== args.userId) {
      throw new Error("Vault not found for provisioning run.");
    }
    const user = await ctx.db.get(args.userId);
    if (!user || user.accountDeletion !== undefined) {
      throw new Error("App provisioning is unavailable during account deletion.");
    }
    const connectedVault = assertConnectedVault(vault);

    const now = Date.now();
    return await ctx.db.insert("operations_vaultProvisioningRuns", {
      userId: args.userId,
      vaultId: args.vaultId,
      repositoryFullName: `${connectedVault.owner}/${connectedVault.name}`,
      trigger: args.trigger,
      state: "queued",
      currentStep: "run_created",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const recordRepositoryFullName = internalMutation({
  args: {
    runId: id("operations_vaultProvisioningRuns"),
    repositoryFullName: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordRepositoryFullNameForRun(ctx, args);

    return null;
  },
});

export const appendRunEvent = internalMutation({
  args: {
    runId: id("operations_vaultProvisioningRuns"),
    step: vAppProvisioningStep,
    level: vAppProvisioningEventLevel,
    message: string(),
    state: union(literal("unchanged"), vAppProvisioningRunState),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Provisioning run not found.");
    }
    if (run.state === "succeeded" || run.state === "failed" || run.state === "canceled") {
      // Workflow cancellation and completion can leave in-flight step actions
      // trying to report late events. Terminal state owns the final record.
      return null;
    }

    const now = Date.now();
    await ctx.runMutation(internal.appProvisioningEvents.append, {
      userId: run.userId,
      vaultId: run.vaultId,
      repositoryFullName: run.repositoryFullName,
      runId: args.runId,
      step: args.step,
      level: args.level,
      message: args.message,
      createdAt: now,
    });

    const nextState = args.state === "unchanged" ? run.state : args.state;
    const isTerminal =
      nextState === "succeeded" || nextState === "failed" || nextState === "canceled";
    await ctx.db.patch(args.runId, {
      state: nextState,
      currentStep: args.step,
      updatedAt: now,
      completedAt: isTerminal ? now : undefined,
    });

    return null;
  },
});
