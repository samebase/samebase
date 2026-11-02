import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  ORGANIZATION_BILLING_LIMITED_ERROR_PREFIX,
  ORGANIZATION_CONNECTION_LIMIT_ERROR_PREFIX,
} from "./billingErrors";
import {
  isRepositoryProvisioningProviderStep,
  type RepositoryProvisioningStep,
} from "./repository/provisioningModel";
import { requireActiveRepositoryProvisioningRun } from "./repositoryWorkflowAuthority";

type ProvisioningEventCtx = {
  runMutation: <Mutation extends FunctionReference<"mutation", "public" | "internal">>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ) => Promise<FunctionReturnType<Mutation>>;
};

async function appendProvisioningRunEvent(
  ctx: ProvisioningEventCtx,
  args: {
    runId: Id<"workflow_repositoryProvisioning_runs">;
    step: RepositoryProvisioningStep;
    level: "info" | "warn" | "error";
    message: string;
    state: "unchanged" | "queued" | "running" | "succeeded" | "failed" | "canceled";
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.repositoryProvisioningRuns.appendRunEvent, {
      runId: args.runId,
      step: args.step,
      level: args.level,
      message: args.message,
      state: args.state,
    });
  } catch {
    console.warn("infra:provision:event_append_failed", {
      runId: args.runId,
      step: args.step,
    });
  }
}

type RepositoryProvisioningWriteLock = Doc<"workflow_repositoryProvisioning_writeLocks">;
type ProvisioningWriteLockCtx = Pick<MutationCtx, "db">;

async function readRepositoryProvisioningWriteLock(
  ctx: ProvisioningWriteLockCtx,
  repositoryId: Id<"repositories">,
): Promise<RepositoryProvisioningWriteLock | null> {
  return await ctx.db
    .query("workflow_repositoryProvisioning_writeLocks")
    .withIndex("by_repository", (q) => q.eq("repositoryId", repositoryId))
    .first();
}

async function markMatchingManagedWriteLockFailed(
  ctx: ProvisioningWriteLockCtx,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    now: number;
    invalidateProviderFreshness: boolean;
  },
): Promise<boolean> {
  const writeLock = await readRepositoryProvisioningWriteLock(ctx, args.repositoryId);
  if (
    !writeLock ||
    writeLock.owner.kind !== "managed_run" ||
    writeLock.owner.runId !== args.runId ||
    writeLock.state !== "active"
  ) {
    return false;
  }

  await ctx.db.patch(writeLock._id, {
    state: "failed",
    lastWriteAt: args.invalidateProviderFreshness
      ? { convex: args.now, cloudflare: args.now }
      : writeLock.lastWriteAt,
    updatedAt: args.now,
  });
  return true;
}

async function cancelSupersededProvisioningRun(
  ctx: ProvisioningEventCtx,
  args: {
    runId: Id<"workflow_repositoryProvisioning_runs">;
    step: RepositoryProvisioningStep;
  },
): Promise<void> {
  await appendProvisioningRunEvent(ctx, {
    runId: args.runId,
    step: args.step,
    level: "warn",
    message: "A newer run replaced this infrastructure provisioning run.",
    state: "canceled",
  });
}

export const markWorkflowStartupFailed = internalMutation({
  args: {
    runId: v.id("workflow_repositoryProvisioning_runs"),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Provisioning run not found.");
    }
    if (run.state === "succeeded" || run.state === "failed" || run.state === "canceled") {
      return null;
    }
    await requireActiveRepositoryProvisioningRun(ctx.db, {
      runId: run._id,
      userId: run.userId,
      repositoryId: run.repositoryId,
    });
    const now = Date.now();
    const safeRunError = "Provisioning workflow failed to start.";
    const eventStep = resolveWorkflowFailureEventStep(run);
    const repository = await ctx.db.get(run.repositoryId);
    if (repository?.state === "provisioning" && repository.runId === args.runId) {
      await ctx.runMutation(internal.repository.records.markGithubProvisioningFailed, {
        runId: args.runId,
      });
    }
    await markMatchingManagedWriteLockFailed(ctx, {
      repositoryId: run.repositoryId,
      runId: args.runId,
      now,
      invalidateProviderFreshness: false,
    });

    await recordWorkflowRunFailure(ctx, {
      eventStep,
      now,
      run,
      safeRunError,
    });

    console.error("infra:provision:start_failed", {
      repositoryId: run.repositoryId,
      repo: run.githubRepositoryFullName,
      message: args.message,
    });

    return null;
  },
});

function resolveWorkflowFailureEventStep(
  run: Pick<Doc<"workflow_repositoryProvisioning_runs">, "currentStep" | "trigger">,
): RepositoryProvisioningStep {
  if (run.currentStep !== "run_created") {
    return run.currentStep;
  }
  if (run.trigger === "create" || run.trigger === "connect_existing_repository") {
    return "validate_connections";
  }
  return "claim_infra";
}

async function recordWorkflowRunFailure(
  ctx: MutationCtx,
  args: {
    eventStep: RepositoryProvisioningStep;
    now: number;
    run: Doc<"workflow_repositoryProvisioning_runs">;
    safeRunError: string;
  },
): Promise<void> {
  await ctx.runMutation(internal.repositoryProvisioningEvents.append, {
    userId: args.run.userId,
    repositoryId: args.run.repositoryId,
    githubRepositoryFullName: args.run.githubRepositoryFullName,
    runId: args.run._id,
    step: args.eventStep,
    level: "error",
    message: args.safeRunError,
    createdAt: args.now,
  });
  await ctx.db.patch(args.run._id, {
    state: "failed",
    lastError: args.safeRunError,
    updatedAt: args.now,
    completedAt: args.now,
  });
}

const USER_FACING_PROVISIONING_ERROR_MARKERS = [
  ORGANIZATION_CONNECTION_LIMIT_ERROR_PREFIX,
  "Convex connection is required to provision infrastructure.",
  "GitHub repository response did not match the Samebase repository.",
  "The Samebase GitHub App is missing the",
  "has commits that Samebase did not make, so Samebase cannot seed the starter",
  ORGANIZATION_BILLING_LIMITED_ERROR_PREFIX,
];

function extractUserFacingProvisioningError(message: string): string | null {
  const firstLine = message.trim().split("\n")[0]?.trim();
  if (!firstLine) {
    return null;
  }

  let cleaned = firstLine;
  for (;;) {
    if (cleaned.startsWith("Error: Uncaught Error: ")) {
      cleaned = cleaned.slice("Error: Uncaught Error: ".length);
      continue;
    }
    if (cleaned.startsWith("Uncaught Error: ")) {
      cleaned = cleaned.slice("Uncaught Error: ".length);
      continue;
    }
    if (cleaned.startsWith("Error: ")) {
      cleaned = cleaned.slice("Error: ".length);
      continue;
    }
    break;
  }

  for (const marker of USER_FACING_PROVISIONING_ERROR_MARKERS) {
    if (cleaned.includes(marker)) {
      return cleaned;
    }
  }

  return null;
}

function resolveSafeWorkflowRunError(args: { currentStep: string; message: string }): string {
  if (args.currentStep === "run_created") {
    return "Provisioning failed before the first step.";
  }

  return (
    extractUserFacingProvisioningError(args.message) ??
    `Provisioning failed during ${args.currentStep}.`
  );
}

export const markWorkflowProvisioningFailed = internalMutation({
  args: {
    runId: v.id("workflow_repositoryProvisioning_runs"),
    workflowId: v.string(),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Provisioning run not found.");
    }
    if (run.state === "succeeded" || run.state === "failed" || run.state === "canceled") {
      return null;
    }
    if (run.workflowId && run.workflowId !== args.workflowId) {
      throw new Error("Workflow failure id does not match run.");
    }
    await requireActiveRepositoryProvisioningRun(ctx.db, {
      runId: run._id,
      userId: run.userId,
      repositoryId: run.repositoryId,
    });
    const now = Date.now();
    const eventStep = resolveWorkflowFailureEventStep(run);
    const repositoryId = run.repositoryId;
    const repository = await ctx.db.get(repositoryId);
    const safeRunError = resolveSafeWorkflowRunError({
      currentStep: run.currentStep,
      message: args.message,
    });
    if (repository?.state === "provisioning" && repository.runId === args.runId) {
      await ctx.runMutation(internal.repository.records.markGithubProvisioningFailed, {
        runId: args.runId,
      });
      await markMatchingManagedWriteLockFailed(ctx, {
        repositoryId,
        runId: args.runId,
        now,
        invalidateProviderFreshness: false,
      });
      await recordWorkflowRunFailure(ctx, {
        eventStep,
        now,
        run,
        safeRunError,
      });
      console.error(
        repository.githubMode === "connect_existing_repository"
          ? "app:connect_existing:failed"
          : "app:provision:failed",
        {
          repositoryId,
          repo: run.githubRepositoryFullName,
          step: run.currentStep,
          message: args.message,
        },
      );
      return null;
    }

    let sourceSetupFailureLogName: "app:connect_existing:failed" | "app:provision:failed" | null =
      null;
    if (run.trigger === "connect_existing_repository") {
      sourceSetupFailureLogName = "app:connect_existing:failed";
    } else if (run.trigger === "create" && !isRepositoryProvisioningProviderStep(run.currentStep)) {
      sourceSetupFailureLogName = "app:provision:failed";
    }
    if (sourceSetupFailureLogName) {
      await markMatchingManagedWriteLockFailed(ctx, {
        repositoryId,
        runId: args.runId,
        now,
        invalidateProviderFreshness: false,
      });
      await recordWorkflowRunFailure(ctx, {
        eventStep,
        now,
        run,
        safeRunError,
      });
      console.error(sourceSetupFailureLogName, {
        repositoryId,
        repo: run.githubRepositoryFullName,
        step: run.currentStep,
        message: args.message,
      });
      return null;
    }

    const markedWriteLockFailed = await markMatchingManagedWriteLockFailed(ctx, {
      repositoryId,
      runId: args.runId,
      now,
      invalidateProviderFreshness: true,
    });
    if (!markedWriteLockFailed) {
      await cancelSupersededProvisioningRun(ctx, {
        runId: args.runId,
        step: eventStep,
      });
      return null;
    }

    await recordWorkflowRunFailure(ctx, {
      eventStep,
      now,
      run,
      safeRunError,
    });

    console.error("infra:provision:failed", {
      repositoryId,
      repo: run.githubRepositoryFullName,
      step: run.currentStep,
      message: args.message,
    });

    return null;
  },
});
