import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  isRepositoryProvisioningProviderStep,
  vRepositoryProvisioningEventLevel,
  vRepositoryProvisioningRunState,
  vRepositoryProvisioningStep,
} from "./repository/provisioningModel";
import {
  INFRASTRUCTURE_OPERATION_ACTIVE_MESSAGE,
  readRepositoryInfrastructureState,
} from "./repository/infrastructureOperation";
import { assertConnectedRepository, isSamebaseManagedRepository } from "./repository/state";
import { readRepositoryProvisioningMode } from "./repository/provisioningPlan";
import { vConfirmationSurface } from "./repository/confirmationModel";
import { checkActionConfirmation } from "./repository/confirmations";
import {
  vActionConfirmation,
  type ActionConfirmationRequest,
} from "./repository/contracts/actionConfirmation";
import { retryInfrastructureProvisioningContract } from "./repository/contracts/retryInfrastructureProvisioning";
import { startRepositoryInfrastructureProvisioningWorkflow } from "./repositoryProvisioningWorkflow";
import { requireRepositoryForUser, requireRepositoryOrganization } from "./organizationAccess";
import { readActiveUser } from "./identity/lifecycle";

const { id, literal, optional, string, union } = v;
const MAX_EVENTS_TO_LINK_TO_REPOSITORY = 20;

async function recordRepositoryFullNameForRun(
  ctx: MutationCtx,
  args: {
    runId: Id<"workflow_repositoryProvisioning_runs">;
    githubRepositoryFullName: string;
  },
): Promise<void> {
  const run = await ctx.db.get(args.runId);
  if (!run) {
    throw new Error("Provisioning run not found.");
  }
  if (run.state !== "queued" && run.state !== "running") {
    throw new Error("Provisioning run is not active.");
  }
  if (run.githubRepositoryFullName === args.githubRepositoryFullName) {
    return;
  }

  await ctx.db.patch(args.runId, {
    githubRepositoryFullName: args.githubRepositoryFullName,
    updatedAt: Date.now(),
  });

  const events = await ctx.db
    .query("workflow_repositoryProvisioning_events")
    .withIndex("by_run_and_created_at_and_source_order", (q) => q.eq("runId", args.runId))
    .take(MAX_EVENTS_TO_LINK_TO_REPOSITORY);
  for (const event of events) {
    await ctx.db.patch(event._id, {
      githubRepositoryFullName: args.githubRepositoryFullName,
    });
  }
}

export const getById = internalQuery({
  args: {
    runId: id("workflow_repositoryProvisioning_runs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

/** The admission rules of a retry: a live Samebase-managed repository whose GitHub Actions setup failed, with no other provider operation running. An old plan has no setup steps left to run. */
async function requireRetryAdmission(
  ctx: MutationCtx,
  args: { userId: Id<"users">; repositoryId: Id<"repositories"> },
) {
  const repository = await requireRepositoryForUser(ctx.db, args);
  const user = await ctx.db.get(args.userId);
  if (!user || readActiveUser(user) === null) {
    throw new Error("App provisioning is unavailable during account deletion.");
  }
  const connectedRepository = assertConnectedRepository(repository);
  if (!isSamebaseManagedRepository(connectedRepository)) {
    throw new ConvexError(
      "Samebase retries provider setup only for repositories that it created, so nothing changed. Set up the missing resources in the repository's Alchemy stack instead.",
    );
  }
  const [infrastructure, organization] = await Promise.all([
    readRepositoryInfrastructureState(ctx, connectedRepository),
    requireRepositoryOrganization(ctx.db, connectedRepository),
  ]);
  if (infrastructure.operation.kind !== "none") {
    throw new ConvexError(INFRASTRUCTURE_OPERATION_ACTIVE_MESSAGE);
  }
  const failedWrite = infrastructure.providerWrite;
  if (!failedWrite || failedWrite.owner.kind !== "managed_run" || failedWrite.state !== "failed") {
    throw new ConvexError(
      "Samebase setup of this repository has not failed, so there is nothing to retry and nothing changed. Check the repository status for its current state.",
    );
  }
  const [failedRun, plan] = await Promise.all([
    ctx.db.get(failedWrite.owner.runId),
    ctx.db
      .query("workflow_repositoryProvisioning_plans")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .unique(),
  ]);
  if (!failedRun || failedRun.state !== "failed" || failedRun.repositoryId !== args.repositoryId) {
    throw new Error("Failed managed setup does not match this repository.");
  }
  // A retry resumes everything after connect_github_repository: the secrets, the seed (skipped once
  // the plan records it), and the tree sync. So a create or retry run that failed in the seed or
  // the sync can be retried as well.
  const isResumableRepositoryActionsRetry =
    (failedRun.trigger === "create" || failedRun.trigger === "retry") &&
    (failedRun.currentStep === "seed_starter" || failedRun.currentStep === "sync_tree");
  if (
    plan === null ||
    readRepositoryProvisioningMode(plan) !== "repository_actions" ||
    failedRun.trigger === "connect_existing_repository" ||
    (!isRepositoryProvisioningProviderStep(failedRun.currentStep) &&
      !(failedRun.trigger === "retry" && failedRun.currentStep === "run_created") &&
      !isResumableRepositoryActionsRetry)
  ) {
    throw new ConvexError(
      "A provider setup retry cannot repair this failed setup, so nothing changed. Check this repository in the Samebase dashboard for recovery steps.",
    );
  }
  return { connectedRepository, organization, failedWrite };
}

/**
The gated retry of a failed managed setup (rfcs/125). The admission rules run before the challenge,
so a retry that cannot start gets none. With the token, the admission rules, the confirmation check,
and the run insert share one transaction, so a refused retry leaves the token unused and writes no
audit row.
*/
export const createRetryForRepository = internalMutation({
  args: {
    userId: id("users"),
    repositoryId: id("repositories"),
    surface: vConfirmationSurface,
    confirmation: optional(vActionConfirmation),
  },
  returns: retryInfrastructureProvisioningContract.returns,
  handler: async (ctx, args): Promise<ActionConfirmationRequest | null> => {
    const { connectedRepository, organization, failedWrite } = await requireRetryAdmission(ctx, {
      userId: args.userId,
      repositoryId: args.repositoryId,
    });
    const confirmation = await checkActionConfirmation(ctx, {
      userId: args.userId,
      surface: args.surface,
      request: { action: "retry_provider_setup", repositoryId: args.repositoryId },
      confirmation: args.confirmation,
    });
    if (confirmation.state === "needs_confirmation") {
      return confirmation;
    }

    const now = Date.now();
    const githubRepositoryFullName = `${organization.githubOwnerLogin}/${connectedRepository.githubRepositoryName}`;
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId: connectedRepository.organizationId,
      userId: args.userId,
      repositoryId: args.repositoryId,
      githubRepositoryFullName,
      trigger: "retry",
      state: "queued",
      currentStep: "run_created",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.replace(failedWrite._id, {
      repositoryId: args.repositoryId,
      owner: {
        kind: "managed_run",
        runId,
      },
      state: "active",
      lastWriteAt: failedWrite.lastWriteAt,
      updatedAt: now,
    });
    const workflowId = await startRepositoryInfrastructureProvisioningWorkflow(ctx, {
      repositoryId: args.repositoryId,
      runId,
    });
    const queuedAt = Date.now();
    await ctx.db.patch(runId, {
      workflowId,
      currentStep: "write_actions_secrets",
      updatedAt: queuedAt,
    });
    await ctx.db.insert("workflow_repositoryProvisioning_events", {
      userId: args.userId,
      repositoryId: args.repositoryId,
      githubRepositoryFullName,
      runId,
      step: "write_actions_secrets",
      level: "info",
      message: "Queued the GitHub Actions secrets.",
      createdAt: queuedAt,
      sourceOrder: {
        creationTime: queuedAt,
        documentId: crypto.randomUUID(),
      },
    });
    return null;
  },
});

export const recordRepositoryFullName = internalMutation({
  args: {
    runId: id("workflow_repositoryProvisioning_runs"),
    githubRepositoryFullName: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordRepositoryFullNameForRun(ctx, args);

    return null;
  },
});

export const appendRunEvent = internalMutation({
  args: {
    runId: id("workflow_repositoryProvisioning_runs"),
    step: vRepositoryProvisioningStep,
    level: vRepositoryProvisioningEventLevel,
    message: string(),
    state: union(literal("unchanged"), vRepositoryProvisioningRunState),
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
    await ctx.runMutation(internal.repositoryProvisioningEvents.append, {
      userId: run.userId,
      repositoryId: run.repositoryId,
      githubRepositoryFullName: run.githubRepositoryFullName,
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
