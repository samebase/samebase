import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  AppProvisioningEventLevel,
  AppProvisioningRunState,
  AppProvisioningRunTrigger,
  AppProvisioningStep,
} from "./schema";

const { id, literal, string, union } = v;

export const createForVault = internalMutation({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
    repositoryFullName: string(),
    trigger: AppProvisioningRunTrigger,
  },
  returns: id("appProvisioningRuns"),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== args.userId) {
      throw new Error("Vault not found for provisioning run.");
    }

    const now = Date.now();
    return await ctx.db.insert("appProvisioningRuns", {
      userId: args.userId,
      vaultId: args.vaultId,
      repositoryFullName: args.repositoryFullName,
      trigger: args.trigger,
      state: "queued",
      currentStep: "run_created",
      createdAt: now,
      updatedAt: now,
    });
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
      return null;
    }
    if (
      run.state === "succeeded" ||
      run.state === "failed" ||
      run.state === "canceled"
    ) {
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
