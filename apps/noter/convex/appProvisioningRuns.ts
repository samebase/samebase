import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  AppProvisioningEventLevel,
  AppProvisioningRunState,
  AppProvisioningRunTrigger,
  AppProvisioningStep,
} from "./schema";

const { id, number, optional, string } = v;

export const createForVault = internalMutation({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
    repositoryFullName: string(),
    trigger: AppProvisioningRunTrigger,
    createdAt: optional(number()),
  },
  returns: id("appProvisioningRuns"),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== args.userId) {
      throw new Error("Vault not found for provisioning run.");
    }

    const now = args.createdAt ?? Date.now();
    return await ctx.db.insert("appProvisioningRuns", {
      userId: args.userId,
      vaultId: args.vaultId,
      repositoryFullName: args.repositoryFullName,
      trigger: args.trigger,
      state: "queued",
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
    createdAt: optional(number()),
    state: optional(AppProvisioningRunState),
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

    const now = args.createdAt ?? Date.now();
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

    const nextState = args.state ?? run.state;
    const isTerminal =
      nextState === "succeeded" ||
      nextState === "failed" ||
      nextState === "canceled";
    await ctx.db.patch(args.runId, {
      state: nextState,
      currentStep: args.step,
      updatedAt: now,
      completedAt: isTerminal ? (run.completedAt ?? now) : run.completedAt,
    });

    return null;
  },
});
