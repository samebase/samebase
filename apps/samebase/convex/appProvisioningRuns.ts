import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  isAppProvisioningProviderStep,
  vAppProvisioningEventLevel,
  vAppProvisioningRunState,
  vAppProvisioningStep,
} from "./appProvisioningModel";
import { readVaultInfrastructureState } from "./vault/infrastructureOperation";
import { assertConnectedVault } from "./vault/state";
import { startVaultInfrastructureProvisioningWorkflow } from "./appProvisioningWorkflow";
import { hasOrganizationAccess, requireOrganizationAccessContext } from "./organizationAccess";

const { id, literal, string, union } = v;
const MAX_EVENTS_TO_LINK_TO_VAULT = 20;

async function recordRepositoryFullNameForRun(
  ctx: MutationCtx,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
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
    .query("workflow_vaultProvisioning_events")
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
    runId: id("workflow_vaultProvisioning_runs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

export const createRetryForVault = internalMutation({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
  },
  returns: id("workflow_vaultProvisioning_runs"),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      throw new Error("Vault not found for provisioning run.");
    }
    const ownership = await requireOrganizationAccessContext(ctx.db, args.userId);
    if (!hasOrganizationAccess(ownership, vault)) {
      throw new Error("Vault not found for provisioning run.");
    }
    const user = await ctx.db.get(args.userId);
    if (!user || user.accountDeletion !== undefined) {
      throw new Error("App provisioning is unavailable during account deletion.");
    }
    const connectedVault = assertConnectedVault(vault);
    const infrastructure = await readVaultInfrastructureState(ctx, connectedVault);
    if (infrastructure.operation.kind !== "none") {
      throw new Error("Another vault infrastructure operation is active.");
    }
    const failedWrite = infrastructure.providerWrite;
    if (
      !failedWrite ||
      failedWrite.owner.kind !== "managed_run" ||
      failedWrite.state !== "failed"
    ) {
      throw new Error("Infrastructure retry is available only after managed setup fails.");
    }
    const failedRun = await ctx.db.get(failedWrite.owner.runId);
    if (!failedRun || failedRun.state !== "failed" || failedRun.vaultId !== args.vaultId) {
      throw new Error("Failed managed setup does not match this vault.");
    }
    if (
      failedRun.trigger === "connect_existing_repository" ||
      (!isAppProvisioningProviderStep(failedRun.currentStep) &&
        !(failedRun.trigger === "retry" && failedRun.currentStep === "run_created"))
    ) {
      throw new Error("Infrastructure retry is available only after provider setup fails.");
    }

    const now = Date.now();
    const repositoryFullName = `${connectedVault.owner}/${connectedVault.name}`;
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      requestedByUserId: args.userId,
      vaultId: args.vaultId,
      repositoryFullName,
      trigger: "retry",
      state: "queued",
      currentStep: "run_created",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.replace(failedWrite._id, {
      vaultId: args.vaultId,
      owner: {
        kind: "managed_run",
        runId,
      },
      state: "active",
      lastWriteAt: failedWrite.lastWriteAt,
      updatedAt: now,
    });
    const workflowId = await startVaultInfrastructureProvisioningWorkflow(ctx, {
      vaultId: args.vaultId,
      runId,
    });
    const queuedAt = Date.now();
    await ctx.db.patch(runId, {
      workflowId,
      currentStep: "claim_infra",
      updatedAt: queuedAt,
    });
    await ctx.db.insert("workflow_vaultProvisioning_events", {
      vaultId: args.vaultId,
      repositoryFullName,
      runId,
      step: "claim_infra",
      level: "info",
      message: "Queued infrastructure provisioning.",
      createdAt: queuedAt,
    });
    return runId;
  },
});

export const recordRepositoryFullName = internalMutation({
  args: {
    runId: id("workflow_vaultProvisioning_runs"),
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
    runId: id("workflow_vaultProvisioning_runs"),
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
