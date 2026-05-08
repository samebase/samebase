import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  AppProvisioningEventLevel,
  AppProvisioningRunState,
  AppProvisioningRunTrigger,
  AppProvisioningStep,
} from "./schema";
import { assertConnectedVault } from "./vaultState";

const { id, literal, string, union } = v;
const MAX_EVENTS_TO_LINK_TO_VAULT = 20;

export const getById = internalQuery({
  args: {
    runId: id("appProvisioningRuns"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

export const createForVault = internalMutation({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
    trigger: AppProvisioningRunTrigger,
  },
  returns: id("appProvisioningRuns"),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== args.userId) {
      throw new Error("Vault not found for provisioning run.");
    }
    const connectedVault = assertConnectedVault(vault);

    const now = Date.now();
    return await ctx.db.insert("appProvisioningRuns", {
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

export const recordRepositoryCreated = internalMutation({
  args: {
    runId: id("appProvisioningRuns"),
    repositoryFullName: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Provisioning run not found.");
    }
    await ctx.db.patch(args.runId, {
      repositoryFullName: args.repositoryFullName,
      updatedAt: Date.now(),
    });
    if (
      run.repositoryFullName &&
      run.repositoryFullName !== args.repositoryFullName
    ) {
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", args.runId))
        .take(MAX_EVENTS_TO_LINK_TO_VAULT);
      for (const event of events) {
        await ctx.db.patch(event._id, {
          repositoryFullName: args.repositoryFullName,
        });
      }
    }

    return null;
  },
});

export const appendRunEvent = internalMutation({
  args: {
    runId: id("appProvisioningRuns"),
    step: AppProvisioningStep,
    level: AppProvisioningEventLevel,
    message: string(),
    state: union(literal("unchanged"), AppProvisioningRunState),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Provisioning run not found.");
    }
    if (
      run.state === "succeeded" ||
      run.state === "failed" ||
      run.state === "canceled"
    ) {
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
      nextState === "succeeded" ||
      nextState === "failed" ||
      nextState === "canceled";
    await ctx.db.patch(args.runId, {
      state: nextState,
      currentStep: args.step,
      updatedAt: now,
      completedAt: isTerminal ? now : undefined,
    });

    return null;
  },
});
