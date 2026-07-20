import { v, type Infer } from "convex/values";
import { vResultValidator, type RunResult } from "@convex-dev/workpool";
import { WorkflowManager, type WorkflowCtx } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { toErrorMessage } from "./jsonUtils";
import type { AppProvisioningStep } from "./appProvisioningModel";
import { isLiveConnectedVault } from "./vault/state";
import { ROOT_VAULT_APP_ROOT } from "../shared/vaultAppRoot";
import { normalizeVaultRootDirectory, VAULT_ROOT_DIRECTORY } from "../shared/vaultRootDirectory";

const workflow = new WorkflowManager(components.workflow);
const { boolean, id, literal, null: nullValue, object, string, union } = v;
const idempotentProviderStepRetry = {
  maxAttempts: 3,
  initialBackoffMs: 1_000,
  base: 2,
} as const;

const workflowCompletionContext = object({
  runId: id("workflow_vaultProvisioning_runs"),
});
const createAppDescription = v.union(string(), v.null());
const composedInfrastructureState = object({
  appId: id("vaultApps"),
  appRoot: string(),
  convex: union(
    object({
      state: literal("missing"),
      projectName: string(),
    }),
    object({
      state: literal("attached"),
      projectName: string(),
      convexProjectId: id("vaultConvexProjects"),
    }),
  ),
  cloudflare: union(
    object({
      state: literal("missing"),
      accountId: string(),
      workerName: string(),
    }),
    object({
      state: literal("attached"),
      accountId: string(),
      workerName: string(),
      workerId: id("vaultCloudflareWorkers"),
    }),
  ),
});
type ComposedInfrastructureState = Infer<typeof composedInfrastructureState>;
const composedCloudflareBuilds = object({
  production: object({ triggerUuid: string() }),
  preview: object({ triggerUuid: string() }),
});
type ComposedCloudflareBuilds = Infer<typeof composedCloudflareBuilds>;
const composedInfrastructureRetryContext = object({
  userId: id("users"),
});
type ComposedInfrastructureRetryContext = Infer<typeof composedInfrastructureRetryContext>;

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
    vaultId: id("vaults"),
    userId: id("users"),
  },
  returns: composedInfrastructureState,
  handler: async (ctx, args): Promise<ComposedInfrastructureState> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }

    const plan = await ctx.db
      .query("workflow_vaultProvisioning_plans")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
    if (!plan) {
      throw new Error("Infrastructure provisioning plan not found for vault.");
    }

    const rootDirectory = normalizeVaultRootDirectory(
      plan.appRoot === ROOT_VAULT_APP_ROOT ? VAULT_ROOT_DIRECTORY : plan.appRoot,
    );
    const app = await ctx.db
      .query("vaultApps")
      .withIndex("by_vault_and_root_directory", (q) =>
        q.eq("vaultId", args.vaultId).eq("rootDirectory", rootDirectory),
      )
      .unique();
    if (!app) {
      throw new Error("Infrastructure provisioning app not found for vault.");
    }
    const [convexProject, worker] = await Promise.all([
      ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_app", (q) => q.eq("appId", app._id))
        .first(),
      ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_app", (q) => q.eq("appId", app._id))
        .first(),
    ]);

    return {
      appId: app._id,
      appRoot: plan.appRoot,
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
            accountId: plan.cloudflare.accountId,
            workerName: plan.cloudflare.workerName,
            workerId: worker._id,
          }
        : {
            state: "missing",
            accountId: plan.cloudflare.accountId,
            workerName: plan.cloudflare.workerName,
          },
    };
  },
});

export const readComposedInfrastructureRetryContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
  },
  returns: composedInfrastructureRetryContext,
  handler: async (ctx, args): Promise<ComposedInfrastructureRetryContext> => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.vaultId !== args.vaultId) {
      throw new Error("Provisioning run not found.");
    }
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== run.userId) {
      throw new Error("Vault not found.");
    }

    return {
      userId: run.userId,
    };
  },
});

export const claimComposedInfrastructureProvisioning = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
  },
  returns: object({ claimed: boolean() }),
  handler: async (ctx, args): Promise<{ claimed: boolean }> => {
    const run = await ctx.db.get(args.runId);
    if (
      !run ||
      run.vaultId !== args.vaultId ||
      run.userId !== args.userId ||
      (run.trigger !== "create" && run.trigger !== "retry")
    ) {
      throw new Error("Composed infrastructure run does not match vault.");
    }
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const plan = await ctx.db
      .query("workflow_vaultProvisioning_plans")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
    if (!plan) {
      throw new Error("Infrastructure provisioning plan not found for vault.");
    }

    const now = Date.now();
    const writeLock = await ctx.db
      .query("workflow_vaultProvisioning_writeLocks")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
    if (writeLock && writeLock.state === "active" && writeLock.runId !== args.runId) {
      await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: "Infrastructure provisioning is already running.",
        state: "canceled",
      });
      return { claimed: false };
    }

    if (writeLock) {
      await ctx.db.patch(writeLock._id, {
        runId: args.runId,
        state: "active",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId: args.vaultId,
        runId: args.runId,
        state: "active",
        updatedAt: now,
      });
    }

    await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
      runId: args.runId,
      step: "claim_infra",
      level: "info",
      message: `Started infrastructure provisioning for ${plan.appRoot}.`,
      state: "running",
    });

    return { claimed: true };
  },
});

export const finishComposedInfrastructureProvisioning = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const run = await ctx.db.get(args.runId);
    if (
      !run ||
      run.vaultId !== args.vaultId ||
      run.userId !== args.userId ||
      (run.trigger !== "create" && run.trigger !== "retry")
    ) {
      throw new Error("Composed infrastructure run does not match vault.");
    }
    const writeLock = await ctx.db
      .query("workflow_vaultProvisioning_writeLocks")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
    if (!writeLock || writeLock.state !== "active" || writeLock.runId !== args.runId) {
      throw new Error("Composed infrastructure run no longer holds the provisioning write lock.");
    }

    await ctx.db.patch(writeLock._id, {
      state: "succeeded",
      updatedAt: Date.now(),
    });

    return null;
  },
});

async function readCurrentComposedInfrastructureState(
  step: WorkflowCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    name: string;
  },
): Promise<ComposedInfrastructureState> {
  return await step.runQuery(
    internal.appProvisioningWorkflow.readComposedInfrastructureState,
    {
      vaultId: args.vaultId,
      userId: args.userId,
    },
    { name: args.name },
  );
}

async function markComposedInfrastructureRunFailed(
  step: WorkflowCtx,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
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
    runId: Id<"workflow_vaultProvisioning_runs">;
    step: AppProvisioningStep;
    message: string;
  },
): Promise<void> {
  await step.runMutation(
    internal.appProvisioningRuns.appendRunEvent,
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
    vaultId: Id<"vaults">;
    parentRunId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    state: ComposedInfrastructureState;
  },
): Promise<Id<"vaultConvexProjects">> {
  if (args.state.convex.state === "attached") {
    return args.state.convex.convexProjectId;
  }

  try {
    return await step.runAction(
      internal.vault.convex.ensureConvexProjectConnection,
      {
        vaultId: args.vaultId,
        runId: args.parentRunId,
        userId: args.userId,
        target: {
          mode: "create_project",
          appId: args.state.appId,
          projectName: args.state.convex.projectName,
        },
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
    vaultId: Id<"vaults">;
    parentRunId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    state: ComposedInfrastructureState;
  },
): Promise<Id<"vaultCloudflareWorkers">> {
  if (args.state.cloudflare.state === "attached") {
    return args.state.cloudflare.workerId;
  }

  try {
    return await step.runAction(
      internal.vault.cloudflare.ensureCloudflareWorkerConnection,
      {
        vaultId: args.vaultId,
        runId: args.parentRunId,
        userId: args.userId,
        appId: args.state.appId,
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
    vaultId: Id<"vaults">;
    parentRunId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    workerId: Id<"vaultCloudflareWorkers">;
  },
): Promise<ComposedCloudflareBuilds> {
  try {
    return await step.runAction(
      internal.vault.cloudflare.configureWorkersBuildsForGitHubForWorkflow,
      {
        vaultId: args.vaultId,
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
    vaultId: Id<"vaults">;
    parentRunId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    workerId: Id<"vaultCloudflareWorkers">;
    convexProjectId: Id<"vaultConvexProjects">;
    build: ComposedCloudflareBuilds;
  },
): Promise<void> {
  try {
    await step.runAction(
      internal.vault.cloudflare.rotateConvexDeployKeysForWorkersBuildsForWorkflow,
      {
        vaultId: args.vaultId,
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
    vaultId: Id<"vaults">;
    parentRunId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
  },
): Promise<void> {
  const initialState = await readCurrentComposedInfrastructureState(step, {
    vaultId: args.vaultId,
    userId: args.userId,
    name: "read_infra_target",
  });
  const { claimed } = await step.runMutation(
    internal.appProvisioningWorkflow.claimComposedInfrastructureProvisioning,
    {
      vaultId: args.vaultId,
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
    vaultId: args.vaultId,
    parentRunId: args.parentRunId,
    userId: args.userId,
    state: initialState,
  });

  const afterConvex = await readCurrentComposedInfrastructureState(step, {
    vaultId: args.vaultId,
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
    vaultId: args.vaultId,
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
    vaultId: args.vaultId,
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
    vaultId: args.vaultId,
    parentRunId: args.parentRunId,
    userId: args.userId,
    workerId,
    convexProjectId,
    build,
  });

  await step.runMutation(
    internal.appProvisioningWorkflow.finishComposedInfrastructureProvisioning,
    {
      vaultId: args.vaultId,
      runId: args.parentRunId,
      userId: args.userId,
    },
    { name: "finish_composed_infrastructure_ownership" },
  );
  await step.runMutation(
    internal.appProvisioningRuns.appendRunEvent,
    {
      runId: args.parentRunId,
      step: "finish",
      level: "info",
      message: "App provider resources are attached and configured.",
      state: "succeeded",
    },
    { name: "finish_composed_infra" },
  );
}

export const provisionVaultInfrastructure = workflow.define({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    const retryContext: ComposedInfrastructureRetryContext = await step.runQuery(
      internal.appProvisioningWorkflow.readComposedInfrastructureRetryContext,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      { name: "read_retry_context" },
    );
    await runComposedInfrastructure(step, {
      vaultId: args.vaultId,
      parentRunId: args.runId,
      userId: retryContext.userId,
    });

    return null;
  },
});

export const provisionApp = workflow.define({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    repositoryName: string(),
    repositoryOwner: string(),
    description: createAppDescription,
    private: boolean(),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    await step.runAction(
      internal.appProvisioningWorkflowActions.validateCreateAppConnections,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        repositoryName: args.repositoryName,
        repositoryOwner: args.repositoryOwner,
      },
      { name: "validate_connections", retry: false },
    );
    const repository = await step.runAction(
      internal.appProvisioningWorkflowActions.createGitHubRepository,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        repositoryName: args.repositoryName,
        repositoryOwner: args.repositoryOwner,
        description: args.description,
        private: args.private,
      },
      { name: "create_github_repo", retry: false },
    );
    await step.runAction(
      internal.appProvisioningWorkflowActions.createVaultForRepository,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        ghRepoId: repository.ghRepoId,
        ownerName: repository.ownerName,
        repoName: repository.repoName,
        defaultBranch: repository.defaultBranch,
        visibility: repository.visibility,
      },
      { name: "connect_github", retry: false },
    );
    await step.runAction(
      internal.appProvisioningWorkflowActions.seedStarterRepository,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        ownerName: repository.ownerName,
        repoName: repository.repoName,
        defaultBranch: repository.defaultBranch,
      },
      { name: "seed_starter", retry: idempotentProviderStepRetry },
    );
    await step.runAction(
      internal.appProvisioningWorkflowActions.syncVaultTreeForRepository,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        ownerName: repository.ownerName,
        repoName: repository.repoName,
        defaultBranch: repository.defaultBranch,
      },
      { name: "sync_tree", retry: idempotentProviderStepRetry },
    );
    await runComposedInfrastructure(step, {
      vaultId: args.vaultId,
      parentRunId: args.runId,
      userId: args.userId,
    });

    return null;
  },
});

export const connectExistingRepository = workflow.define({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    repositoryOwner: string(),
    repositoryName: string(),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    await step.runAction(
      internal.appProvisioningWorkflowActions.validateExistingRepositoryConnection,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        ownerName: args.repositoryOwner,
        repoName: args.repositoryName,
      },
      { name: "validate_connections", retry: false },
    );
    const repository = await step.runAction(
      internal.appProvisioningWorkflowActions.fetchExistingGitHubRepository,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        ownerName: args.repositoryOwner,
        repoName: args.repositoryName,
      },
      { name: "fetch_github_repo", retry: false },
    );
    await step.runAction(
      internal.appProvisioningWorkflowActions.connectExistingRepositoryVault,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        ghRepoId: repository.ghRepoId,
        ownerName: repository.ownerName,
        repoName: repository.repoName,
        defaultBranch: repository.defaultBranch,
        visibility: repository.visibility,
      },
      { name: "connect_github", retry: false },
    );
    await step.runAction(
      internal.appProvisioningWorkflowActions.syncVaultTreeForRepository,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        ownerName: repository.ownerName,
        repoName: repository.repoName,
        defaultBranch: repository.defaultBranch,
      },
      { name: "sync_tree", retry: idempotentProviderStepRetry },
    );
    await step.runAction(
      internal.appProvisioningWorkflowActions.finishExistingRepositoryConnection,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
      },
      { name: "finish", retry: false },
    );

    return null;
  },
});

// Provider attachment and configuration actions run directly without standalone workflows.

export const startCreateAppProvisioning = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    repositoryName: string(),
    repositoryOwner: string(),
    description: createAppDescription,
    private: boolean(),
  },
  returns: string(),
  handler: async (ctx, args): Promise<string> => {
    const workflowId: string = await workflow.start(
      ctx,
      internal.appProvisioningWorkflow.provisionApp,
      args,
      {
        startAsync: true,
        onComplete: internal.appProvisioningWorkflow.handleProvisioningWorkflowComplete,
        context: {
          runId: args.runId,
        },
      },
    );

    await ctx.db.patch(args.runId, {
      workflowId,
      updatedAt: Date.now(),
    });
    await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
      runId: args.runId,
      step: "validate_connections",
      level: "info",
      message: "Queued app provisioning.",
      state: "queued",
    });

    return workflowId;
  },
});

export const startConnectExistingRepositoryProvisioning = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    repositoryName: string(),
    repositoryOwner: string(),
  },
  returns: string(),
  handler: async (ctx, args): Promise<string> => {
    const workflowId: string = await workflow.start(
      ctx,
      internal.appProvisioningWorkflow.connectExistingRepository,
      args,
      {
        startAsync: true,
        onComplete: internal.appProvisioningWorkflow.handleProvisioningWorkflowComplete,
        context: {
          runId: args.runId,
        },
      },
    );

    await ctx.db.patch(args.runId, {
      workflowId,
      updatedAt: Date.now(),
    });
    await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
      runId: args.runId,
      step: "validate_connections",
      level: "info",
      message: "Queued existing repository connection.",
      state: "queued",
    });

    return workflowId;
  },
});

export const startVaultInfrastructureProvisioning = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
  },
  returns: string(),
  handler: async (ctx, args): Promise<string> => {
    const workflowId: string = await workflow.start(
      ctx,
      internal.appProvisioningWorkflow.provisionVaultInfrastructure,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      {
        startAsync: true,
        onComplete: internal.appProvisioningWorkflow.handleProvisioningWorkflowComplete,
        context: {
          runId: args.runId,
        },
      },
    );

    await ctx.db.patch(args.runId, {
      workflowId,
      updatedAt: Date.now(),
    });
    await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
      runId: args.runId,
      step: "claim_infra",
      level: "info",
      message: "Queued infrastructure provisioning.",
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
    if (run.state === "succeeded" || run.state === "failed") {
      return null;
    }

    const error = resolveWorkflowCompletionError(args.result);
    if (!error) {
      if (run.state !== "canceled") {
        const now = Date.now();
        await ctx.db.patch(args.context.runId, {
          state: "succeeded",
          updatedAt: now,
          completedAt: now,
        });
      }
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
