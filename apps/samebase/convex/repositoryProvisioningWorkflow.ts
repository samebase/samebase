import { v, type Infer } from "convex/values";
import { vResultValidator, type RunResult } from "@convex-dev/workpool";
import { WorkflowManager, type WorkflowCtx } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { toErrorMessage } from "./jsonUtils";
import type { RepositoryProvisioningStep } from "./repository/provisioningModel";
import { isLiveConnectedRepository } from "./repository/state";
import {
  requireActiveRepositoryProvisioningAuthority,
  requireActiveRepositoryProvisioningContinuation,
  requireActiveRepositoryProvisioningRun,
} from "./repositoryWorkflowAuthority";

const workflow = new WorkflowManager(components.workflow);
const { boolean, id, literal, object, string, union } = v;
const idempotentProviderStepRetry = {
  maxAttempts: 3,
  initialBackoffMs: 1_000,
  base: 2,
} as const;

const workflowCompletionContext = object({
  runId: id("workflow_repositoryProvisioning_runs"),
});
const createAppDescription = v.union(string(), v.null());
const composedInfrastructureState = object({
  convexConfigPath: string(),
  convex: union(
    object({
      state: literal("missing"),
      projectName: string(),
    }),
    object({
      state: literal("attached"),
      projectName: string(),
      convexProjectId: id("repositoryConvexProjects"),
    }),
  ),
  cloudflare: union(
    object({
      state: literal("missing"),
      accountId: string(),
      workerName: string(),
      buildTokenUuid: union(string(), v.null()),
    }),
    object({
      state: literal("attached"),
      accountId: string(),
      workerName: string(),
      workerId: id("repositoryCloudflareWorkers"),
      buildTokenUuid: union(string(), v.null()),
    }),
  ),
});
type ComposedInfrastructureState = Infer<typeof composedInfrastructureState>;
const composedCloudflareBuilds = object({
  rootDirectory: string(),
  production: object({ triggerUuid: string() }),
});
type ComposedCloudflareBuilds = Infer<typeof composedCloudflareBuilds>;
const composedInfrastructureRetryContext = object({
  userId: id("users"),
});
type ComposedInfrastructureRetryContext = Infer<typeof composedInfrastructureRetryContext>;

export async function startCreateRepositoryProvisioningWorkflow(
  ctx: MutationCtx,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    githubRepositoryName: string;
    githubOwnerLogin: string;
    description: string | null;
    private: boolean;
  },
): Promise<string> {
  return await workflow.start(
    ctx,
    internal.repositoryProvisioningWorkflow.provisionApp,
    {
      repositoryId: args.repositoryId,
      runId: args.runId,
      userId: args.userId,
      githubRepositoryName: args.githubRepositoryName,
      githubOwnerLogin: args.githubOwnerLogin,
      description: args.description,
      private: args.private,
    },
    {
      startAsync: true,
      onComplete: internal.repositoryProvisioningWorkflow.handleProvisioningWorkflowComplete,
      context: {
        runId: args.runId,
      },
    },
  );
}

export async function startRepositoryInfrastructureProvisioningWorkflow(
  ctx: MutationCtx,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
  },
): Promise<string> {
  return await workflow.start(
    ctx,
    internal.repositoryProvisioningWorkflow.provisionRepositoryInfrastructure,
    {
      repositoryId: args.repositoryId,
      runId: args.runId,
    },
    {
      startAsync: true,
      onComplete: internal.repositoryProvisioningWorkflow.handleProvisioningWorkflowComplete,
      context: {
        runId: args.runId,
      },
    },
  );
}

export function resolveWorkflowCompletionError(result: RunResult): string | null {
  switch (result.kind) {
    case "success":
      return null;
    case "failed":
      return result.error;
    case "canceled":
      return "Provisioning workflow was canceled.";
    default: {
      result satisfies never;
      return null;
    }
  }
}

export const readComposedInfrastructureState = internalQuery({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
  },
  returns: composedInfrastructureState,
  handler: async (ctx, args): Promise<ComposedInfrastructureState> => {
    const authority = await requireActiveRepositoryProvisioningAuthority(ctx.db, args);
    const repository = authority.repository;

    const plan = await ctx.db
      .query("workflow_repositoryProvisioning_plans")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .first();
    if (!plan) {
      throw new Error("Infrastructure provisioning plan not found for repository.");
    }
    if (repository.convexTeamId === undefined || repository.cloudflareAccountId === undefined) {
      throw new Error("Managed repository provider destinations are not configured.");
    }
    const cloudflareAccountId = repository.cloudflareAccountId;

    const convexConfigPath = plan.convexConfigPath;
    const convexCheckpoint = plan.convex.state === "created" ? plan.convex : null;
    const cloudflareCheckpoint = plan.cloudflare.state === "created" ? plan.cloudflare : null;
    const [convexProject, worker] = await Promise.all([
      convexCheckpoint
        ? ctx.db
            .query("repositoryConvexProjects")
            .withIndex("by_project", (q) => q.eq("projectId", convexCheckpoint.projectId))
            .unique()
        : null,
      cloudflareCheckpoint
        ? ctx.db
            .query("repositoryCloudflareWorkers")
            .withIndex("by_account_and_worker_tag", (q) =>
              q
                .eq("accountId", cloudflareAccountId)
                .eq("workerTag", cloudflareCheckpoint.workerTag),
            )
            .unique()
        : null,
    ]);
    if (
      convexProject &&
      (convexProject.repositoryId !== args.repositoryId ||
        convexProject.organizationId !== repository.organizationId ||
        !convexCheckpoint ||
        convexProject.teamId !== repository.convexTeamId ||
        !("convexConfigPath" in convexProject) ||
        convexProject.convexConfigPath !== convexConfigPath)
    ) {
      throw new Error("Managed Convex project attachment does not match its checkpoint.");
    }
    if (
      worker &&
      (worker.repositoryId !== args.repositoryId ||
        worker.organizationId !== repository.organizationId ||
        !cloudflareCheckpoint ||
        worker.accountId !== repository.cloudflareAccountId ||
        worker.workerName !== cloudflareCheckpoint.workerName ||
        worker.workerTag !== cloudflareCheckpoint.workerTag)
    ) {
      throw new Error("Managed Cloudflare Worker attachment does not match its checkpoint.");
    }

    return {
      convexConfigPath,
      convex: convexProject
        ? {
            state: "attached",
            projectName: plan.convex.projectName,
            convexProjectId: convexProject._id,
          }
        : {
            state: "missing",
            projectName: plan.convex.projectName,
          },
      cloudflare: worker
        ? {
            state: "attached",
            accountId: cloudflareAccountId,
            workerName: plan.cloudflare.workerName,
            workerId: worker._id,
            buildTokenUuid: plan.cloudflare.buildTokenUuid,
          }
        : {
            state: "missing",
            accountId: cloudflareAccountId,
            workerName: plan.cloudflare.workerName,
            buildTokenUuid: plan.cloudflare.buildTokenUuid,
          },
    };
  },
});

export const readComposedInfrastructureRetryContext = internalQuery({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
  },
  returns: composedInfrastructureRetryContext,
  handler: async (ctx, args): Promise<ComposedInfrastructureRetryContext> => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.repositoryId !== args.repositoryId) {
      throw new Error("Provisioning run not found.");
    }
    const authority = await requireActiveRepositoryProvisioningAuthority(ctx.db, {
      runId: args.runId,
      userId: run.userId,
      repositoryId: args.repositoryId,
    });
    if (!isLiveConnectedRepository(authority.repository)) {
      throw new Error("Repository not found.");
    }

    return {
      userId: authority.run.userId,
    };
  },
});

export const claimComposedInfrastructureProvisioning = internalMutation({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
  },
  returns: object({ claimed: boolean() }),
  handler: async (ctx, args): Promise<{ claimed: boolean }> => {
    const authority = await requireActiveRepositoryProvisioningContinuation(ctx, args);
    if (authority.run.trigger !== "create" && authority.run.trigger !== "retry") {
      throw new Error("Composed infrastructure run does not match repository.");
    }
    const repository = authority.repository;
    if (!isLiveConnectedRepository(repository)) {
      throw new Error("Repository not found.");
    }
    const plan = await ctx.db
      .query("workflow_repositoryProvisioning_plans")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .first();
    if (!plan) {
      throw new Error("Infrastructure provisioning plan not found for repository.");
    }

    const writeLock = await ctx.db
      .query("workflow_repositoryProvisioning_writeLocks")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .unique();
    if (
      !writeLock ||
      writeLock.owner.kind !== "managed_run" ||
      writeLock.owner.runId !== args.runId ||
      writeLock.state !== "active"
    ) {
      await ctx.runMutation(internal.repositoryProvisioningRuns.appendRunEvent, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: "Infrastructure provisioning is already running.",
        state: "canceled",
      });
      return { claimed: false };
    }

    await ctx.runMutation(internal.repositoryProvisioningRuns.appendRunEvent, {
      runId: args.runId,
      step: "claim_infra",
      level: "info",
      message: `Started infrastructure provisioning for ${plan.convexConfigPath}.`,
      state: "running",
    });

    return { claimed: true };
  },
});

export const finishComposedInfrastructureProvisioning = internalMutation({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const authority = await requireActiveRepositoryProvisioningContinuation(ctx, args);
    if (authority.run.trigger !== "create" && authority.run.trigger !== "retry") {
      throw new Error("Composed infrastructure run does not match repository.");
    }
    const writeLock = await ctx.db
      .query("workflow_repositoryProvisioning_writeLocks")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .unique();
    if (
      !writeLock ||
      writeLock.owner.kind !== "managed_run" ||
      writeLock.state !== "active" ||
      writeLock.owner.runId !== args.runId
    ) {
      throw new Error("Composed infrastructure run no longer holds the provisioning write lock.");
    }

    const now = Date.now();
    await ctx.db.patch(writeLock._id, {
      state: "succeeded",
      updatedAt: now,
    });

    return null;
  },
});

async function readCurrentComposedInfrastructureState(
  step: WorkflowCtx,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    name: string;
  },
): Promise<ComposedInfrastructureState> {
  return await step.runQuery(
    internal.repositoryProvisioningWorkflow.readComposedInfrastructureState,
    {
      repositoryId: args.repositoryId,
      runId: args.runId,
      userId: args.userId,
    },
    { name: args.name },
  );
}

async function markComposedInfrastructureRunFailed(
  step: WorkflowCtx,
  args: {
    runId: Id<"workflow_repositoryProvisioning_runs">;
    name: string;
    error: unknown;
  },
): Promise<void> {
  await step
    .runMutation(
      internal.infraProvisioning.markWorkflowProvisioningFailed,
      {
        runId: args.runId,
        workflowId: step.workflowId,
        message: toErrorMessage(args.error),
      },
      { name: args.name, unstableArgs: true },
    )
    .catch((failureError: unknown) => {
      console.warn("app:provision:composed_block_failure_record_failed", {
        runId: args.runId,
        error: toErrorMessage(failureError),
      });
    });
}

async function appendComposedInfrastructureParentEvent(
  step: WorkflowCtx,
  args: {
    runId: Id<"workflow_repositoryProvisioning_runs">;
    step: RepositoryProvisioningStep;
    message: string;
  },
): Promise<void> {
  await step.runMutation(
    internal.repositoryProvisioningRuns.appendRunEvent,
    {
      runId: args.runId,
      step: args.step,
      level: "info",
      message: args.message,
      state: "running",
    },
    { name: `parent_${args.step}` },
  );
}

async function runComposedConvexAttachment(
  step: WorkflowCtx,
  args: {
    repositoryId: Id<"repositories">;
    parentRunId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    state: ComposedInfrastructureState;
  },
): Promise<Id<"repositoryConvexProjects">> {
  if (args.state.convex.state === "attached") {
    return args.state.convex.convexProjectId;
  }

  try {
    return await step.runAction(
      internal.repository.convex.ensureConvexProjectConnection,
      {
        repositoryId: args.repositoryId,
        runId: args.parentRunId,
        userId: args.userId,
        convexConfigPath: args.state.convexConfigPath,
        projectName: args.state.convex.projectName,
      },
      { name: "attach_convex", retry: false },
    );
  } catch (error) {
    await markComposedInfrastructureRunFailed(step, {
      runId: args.parentRunId,
      name: "mark_attach_convex_failed",
      error,
    });
    throw error;
  }
}

async function runComposedCloudflareAttachment(
  step: WorkflowCtx,
  args: {
    repositoryId: Id<"repositories">;
    parentRunId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    state: ComposedInfrastructureState;
  },
): Promise<Id<"repositoryCloudflareWorkers">> {
  if (args.state.cloudflare.state === "attached") {
    return args.state.cloudflare.workerId;
  }

  try {
    return await step.runAction(
      internal.repository.cloudflare.ensureCloudflareWorkerConnection,
      {
        repositoryId: args.repositoryId,
        runId: args.parentRunId,
        userId: args.userId,
        accountId: args.state.cloudflare.accountId,
        workerName: args.state.cloudflare.workerName,
      },
      { name: "attach_worker", retry: false },
    );
  } catch (error) {
    await markComposedInfrastructureRunFailed(step, {
      runId: args.parentRunId,
      name: "mark_attach_worker_failed",
      error,
    });
    throw error;
  }
}

async function runComposedWorkersBuildsGitHubConfiguration(
  step: WorkflowCtx,
  args: {
    repositoryId: Id<"repositories">;
    parentRunId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    workerId: Id<"repositoryCloudflareWorkers">;
  },
): Promise<ComposedCloudflareBuilds> {
  try {
    return await step.runAction(
      internal.repository.cloudflare.configureWorkersBuildsForGitHubForWorkflow,
      {
        repositoryId: args.repositoryId,
        runId: args.parentRunId,
        userId: args.userId,
        workerId: args.workerId,
      },
      { name: "configure_workers_builds_for_github", retry: false },
    );
  } catch (error) {
    await markComposedInfrastructureRunFailed(step, {
      runId: args.parentRunId,
      name: "mark_configure_workers_builds_for_github_failed",
      error,
    });
    throw error;
  }
}

async function runComposedConvexDeployKeyRotation(
  step: WorkflowCtx,
  args: {
    repositoryId: Id<"repositories">;
    parentRunId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    workerId: Id<"repositoryCloudflareWorkers">;
    convexProjectId: Id<"repositoryConvexProjects">;
    build: ComposedCloudflareBuilds;
  },
): Promise<void> {
  try {
    await step.runAction(
      internal.repository.cloudflare.rotateConvexDeployKeysForWorkersBuildsForWorkflow,
      {
        repositoryId: args.repositoryId,
        runId: args.parentRunId,
        userId: args.userId,
        workerId: args.workerId,
        convexProjectId: args.convexProjectId,
        build: args.build,
      },
      { name: "rotate_convex_deploy_keys_for_workers_builds", retry: false },
    );
  } catch (error) {
    await markComposedInfrastructureRunFailed(step, {
      runId: args.parentRunId,
      name: "mark_rotate_convex_deploy_keys_for_workers_builds_failed",
      error,
    });
    throw error;
  }
}

async function runComposedInfrastructure(
  step: WorkflowCtx,
  args: {
    repositoryId: Id<"repositories">;
    parentRunId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
  },
): Promise<void> {
  const initialState = await readCurrentComposedInfrastructureState(step, {
    repositoryId: args.repositoryId,
    runId: args.parentRunId,
    userId: args.userId,
    name: "read_infra_target",
  });
  const { claimed } = await step.runMutation(
    internal.repositoryProvisioningWorkflow.claimComposedInfrastructureProvisioning,
    {
      repositoryId: args.repositoryId,
      runId: args.parentRunId,
      userId: args.userId,
    },
    { name: "claim_composed_infrastructure" },
  );
  if (!claimed) {
    return;
  }

  if (initialState.convex.state === "missing") {
    await appendComposedInfrastructureParentEvent(step, {
      runId: args.parentRunId,
      step: "attach_convex",
      message: "Attaching Convex project.",
    });
  }
  const convexProjectId = await runComposedConvexAttachment(step, {
    repositoryId: args.repositoryId,
    parentRunId: args.parentRunId,
    userId: args.userId,
    state: initialState,
  });

  const buildTokenUuid = initialState.cloudflare.buildTokenUuid;
  if (buildTokenUuid !== null) {
    const afterConvex = await readCurrentComposedInfrastructureState(step, {
      repositoryId: args.repositoryId,
      runId: args.parentRunId,
      userId: args.userId,
      name: "read_infra_after_convex",
    });
    if (afterConvex.cloudflare.state === "missing") {
      await appendComposedInfrastructureParentEvent(step, {
        runId: args.parentRunId,
        step: "attach_worker",
        message: "Attaching Cloudflare Worker.",
      });
    }
    const workerId = await runComposedCloudflareAttachment(step, {
      repositoryId: args.repositoryId,
      parentRunId: args.parentRunId,
      userId: args.userId,
      state: afterConvex,
    });

    await appendComposedInfrastructureParentEvent(step, {
      runId: args.parentRunId,
      step: "configure_workers_builds_for_github",
      message: "Configuring Workers Builds for GitHub.",
    });
    const build = await runComposedWorkersBuildsGitHubConfiguration(step, {
      repositoryId: args.repositoryId,
      parentRunId: args.parentRunId,
      userId: args.userId,
      workerId,
    });

    await appendComposedInfrastructureParentEvent(step, {
      runId: args.parentRunId,
      step: "rotate_convex_deploy_keys_for_workers_builds",
      message: "Rotating Convex deploy keys for Workers Builds.",
    });
    await runComposedConvexDeployKeyRotation(step, {
      repositoryId: args.repositoryId,
      parentRunId: args.parentRunId,
      userId: args.userId,
      workerId,
      convexProjectId,
      build,
    });
  }

  await step.runMutation(
    internal.repositoryProvisioningWorkflow.finishComposedInfrastructureProvisioning,
    {
      repositoryId: args.repositoryId,
      runId: args.parentRunId,
      userId: args.userId,
    },
    { name: "finish_composed_infrastructure_ownership" },
  );
  await step.runMutation(
    internal.repositoryProvisioningRuns.appendRunEvent,
    {
      runId: args.parentRunId,
      step: "finish",
      level: "info",
      message:
        buildTokenUuid === null
          ? "GitHub and Convex are ready. Cloudflare setup is required."
          : "App provider resources are attached and configured.",
      state: "succeeded",
    },
    { name: "finish_composed_infra" },
  );
}

export const provisionRepositoryInfrastructure = workflow.define({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    const retryContext: ComposedInfrastructureRetryContext = await step.runQuery(
      internal.repositoryProvisioningWorkflow.readComposedInfrastructureRetryContext,
      {
        repositoryId: args.repositoryId,
        runId: args.runId,
      },
      { name: "read_retry_context" },
    );
    await runComposedInfrastructure(step, {
      repositoryId: args.repositoryId,
      parentRunId: args.runId,
      userId: retryContext.userId,
    });

    return null;
  },
});

export const provisionApp = workflow.define({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    githubRepositoryName: string(),
    githubOwnerLogin: string(),
    description: createAppDescription,
    private: boolean(),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    await step.runAction(
      internal.repositoryProvisioningWorkflowActions.validateCreateAppConnections,
      {
        repositoryId: args.repositoryId,
        runId: args.runId,
        userId: args.userId,
        githubRepositoryName: args.githubRepositoryName,
        githubOwnerLogin: args.githubOwnerLogin,
      },
      { name: "validate_connections", retry: false },
    );
    const repository = await step.runAction(
      internal.repositoryProvisioningWorkflowActions.createGitHubRepository,
      {
        repositoryId: args.repositoryId,
        runId: args.runId,
        userId: args.userId,
        githubRepositoryName: args.githubRepositoryName,
        githubOwnerLogin: args.githubOwnerLogin,
        description: args.description,
        private: args.private,
      },
      { name: "create_github_repository", retry: false },
    );
    await step.runAction(
      internal.repositoryProvisioningWorkflowActions.createRepositoryForRepository,
      {
        repositoryId: args.repositoryId,
        runId: args.runId,
        userId: args.userId,
        githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
        githubOwnerLogin: repository.githubOwnerLogin,
        githubRepositoryName: repository.githubRepositoryName,
        defaultBranch: repository.defaultBranch,
        visibility: repository.visibility,
      },
      { name: "connect_github_repository", retry: false },
    );
    await step.runAction(
      internal.repositoryProvisioningWorkflowActions.seedStarterRepository,
      {
        repositoryId: args.repositoryId,
        runId: args.runId,
        userId: args.userId,
        githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
      },
      { name: "seed_starter", retry: idempotentProviderStepRetry },
    );
    await step.runAction(
      internal.repositoryProvisioningWorkflowActions.syncRepositoryTreeForRepository,
      {
        repositoryId: args.repositoryId,
        runId: args.runId,
        userId: args.userId,
        githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
      },
      { name: "sync_tree", retry: idempotentProviderStepRetry },
    );
    await runComposedInfrastructure(step, {
      repositoryId: args.repositoryId,
      parentRunId: args.runId,
      userId: args.userId,
    });

    return null;
  },
});

export const connectExistingRepository = workflow.define({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    githubRepositoryDatabaseId: string(),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    const repository = await step.runAction(
      internal.repositoryProvisioningWorkflowActions.fetchExistingGitHubRepository,
      {
        repositoryId: args.repositoryId,
        runId: args.runId,
        userId: args.userId,
        githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      },
      { name: "fetch_github_repository", retry: false },
    );
    await step.runAction(
      internal.repositoryProvisioningWorkflowActions.connectExistingRepository,
      {
        repositoryId: args.repositoryId,
        runId: args.runId,
        userId: args.userId,
        githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
        githubOwnerLogin: repository.githubOwnerLogin,
        githubRepositoryName: repository.githubRepositoryName,
        defaultBranch: repository.defaultBranch,
        visibility: repository.visibility,
      },
      { name: "connect_github_repository", retry: false },
    );
    await step.runAction(
      internal.repositoryProvisioningWorkflowActions.syncRepositoryTreeForRepository,
      {
        repositoryId: args.repositoryId,
        runId: args.runId,
        userId: args.userId,
        githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      },
      { name: "sync_tree", retry: idempotentProviderStepRetry },
    );
    await step.runMutation(
      internal.repositoryProvisioningRuns.appendRunEvent,
      {
        runId: args.runId,
        step: "finish",
        level: "info",
        message: "Connected existing repository.",
        state: "succeeded",
      },
      { name: "finish" },
    );

    return null;
  },
});

// Provider attachment and configuration actions run directly without standalone workflows.

export const startConnectExistingRepositoryProvisioning = internalMutation({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    githubRepositoryDatabaseId: string(),
  },
  returns: string(),
  handler: async (ctx, args): Promise<string> => {
    await requireActiveRepositoryProvisioningRun(ctx.db, args);
    const workflowId: string = await workflow.start(
      ctx,
      internal.repositoryProvisioningWorkflow.connectExistingRepository,
      {
        repositoryId: args.repositoryId,
        runId: args.runId,
        userId: args.userId,
        githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      },
      {
        startAsync: true,
        onComplete: internal.repositoryProvisioningWorkflow.handleProvisioningWorkflowComplete,
        context: {
          runId: args.runId,
        },
      },
    );

    await ctx.db.patch(args.runId, {
      workflowId,
      updatedAt: Date.now(),
    });
    await ctx.runMutation(internal.repositoryProvisioningRuns.appendRunEvent, {
      runId: args.runId,
      step: "validate_connections",
      level: "info",
      message: "Queued existing repository connection.",
      state: "queued",
    });

    return workflowId;
  },
});

// Standalone provider actions do not allocate provisioning runs.

export const handleProvisioningWorkflowComplete = internalMutation({
  args: {
    workflowId: string(),
    context: workflowCompletionContext,
    result: vResultValidator,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const run = await ctx.db.get(args.context.runId);
    if (!run) {
      throw new Error("Provisioning run not found.");
    }
    if (run.workflowId && run.workflowId !== args.workflowId) {
      throw new Error("Workflow completion id does not match run.");
    }
    if (run.state === "succeeded" || run.state === "failed" || run.state === "canceled") {
      return null;
    }
    await requireActiveRepositoryProvisioningRun(ctx.db, {
      runId: run._id,
      userId: run.userId,
      repositoryId: run.repositoryId,
    });
    const error = resolveWorkflowCompletionError(args.result);
    if (!error) {
      const now = Date.now();
      await ctx.db.patch(args.context.runId, {
        state: "succeeded",
        updatedAt: now,
        completedAt: now,
      });
      return null;
    }

    await ctx.runMutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
      runId: args.context.runId,
      workflowId: args.workflowId,
      message: toErrorMessage(error),
    });

    return null;
  },
});
