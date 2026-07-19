import { v, type Infer } from "convex/values";
import { vResultValidator, type RunResult } from "@convex-dev/workpool";
import { WorkflowManager, type WorkflowCtx } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { toErrorMessage } from "./jsonUtils";
import type { AppProvisioningStep } from "./appProvisioningModel";
import { vVaultCloudflareOrigin, vVaultConvexConnectionTarget } from "./vault/model";
import { isLiveConnectedVault } from "./vault/state";

const workflow = new WorkflowManager(components.workflow);
const { boolean, id, null: nullValue, object, string, union } = v;
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
  appRoot: string(),
  convex: object({
    projectName: string(),
    attached: boolean(),
  }),
  cloudflare: object({
    accountId: string(),
    workerName: string(),
    attached: boolean(),
    buildsConnected: boolean(),
    convexBuildAccessWired: boolean(),
    workersDevUrl: union(string(), nullValue()),
  }),
});
type ComposedInfrastructureState = Infer<typeof composedInfrastructureState>;
const composedInfrastructureRetryContext = object({
  userId: id("users"),
  defaultBranch: string(),
});
type ComposedInfrastructureRetryContext = Infer<typeof composedInfrastructureRetryContext>;
const COMPOSED_INFRASTRUCTURE_STALE_MS = 10 * 60 * 1000;

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

    const [convexDeployment, worker] = await Promise.all([
      ctx.db
        .query("vaultConvexDeployments")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", args.vaultId).eq("appRoot", plan.appRoot),
        )
        .first(),
      ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", args.vaultId).eq("appRoot", plan.appRoot),
        )
        .first(),
    ]);
    const convexDeploymentAttached = convexDeployment !== null;
    const cloudflareWorkerAttached = worker !== null;

    return {
      appRoot: plan.appRoot,
      convex: {
        projectName: plan.convex.projectName,
        attached: convexDeploymentAttached,
      },
      cloudflare: {
        accountId: plan.cloudflare.accountId,
        workerName: plan.cloudflare.workerName,
        attached: cloudflareWorkerAttached,
        buildsConnected: false,
        convexBuildAccessWired: false,
        workersDevUrl:
          plan.cloudflare.state === "created" ? (plan.cloudflare.workersDevUrl ?? null) : null,
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
      defaultBranch: vault.defaultBranch,
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
    if (
      writeLock &&
      writeLock.state === "active" &&
      writeLock.runId !== args.runId &&
      now - writeLock.updatedAt < COMPOSED_INFRASTRUCTURE_STALE_MS
    ) {
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
      if (writeLock.state === "active" && writeLock.runId !== args.runId) {
        await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
          runId: writeLock.runId,
          step: "claim_infra",
          level: "warn",
          message: "Infrastructure provisioning was superseded by a newer run.",
          state: "canceled",
        });
      }
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
): Promise<void> {
  if (args.state.convex.attached) {
    return;
  }

  try {
    await step.runAction(
      internal.vault.convex.ensureConvexDeploymentConnection,
      {
        vaultId: args.vaultId,
        runId: args.parentRunId,
        userId: args.userId,
        target: {
          mode: "create_project",
          appRoot: args.state.appRoot,
          projectName: args.state.convex.projectName,
        },
      },
      { name: "attach_convex", retry: idempotentProviderStepRetry },
    );
    await step.runMutation(
      internal.vault.convexMutations.finishConvexDeploymentConnection,
      {
        vaultId: args.vaultId,
        runId: args.parentRunId,
        userId: args.userId,
        appRoot: args.state.appRoot,
      },
      { name: "finish_attach_convex" },
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
): Promise<void> {
  if (args.state.cloudflare.attached) {
    return;
  }

  try {
    await step.runAction(
      internal.vault.cloudflare.ensureCloudflareWorkerConnection,
      {
        vaultId: args.vaultId,
        runId: args.parentRunId,
        userId: args.userId,
        appRoot: args.state.appRoot,
        accountId: args.state.cloudflare.accountId,
        workerName: args.state.cloudflare.workerName,
        origin: "provisioned",
      },
      { name: "attach_worker", retry: false },
    );
    await step.runMutation(
      internal.vault.cloudflareMutations.finishCloudflareWorkerConnection,
      {
        vaultId: args.vaultId,
        runId: args.parentRunId,
        userId: args.userId,
        appRoot: args.state.appRoot,
      },
      { name: "finish_attach_worker" },
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

async function runComposedCloudflareBuildsWiring(
  step: WorkflowCtx,
  args: {
    vaultId: Id<"vaults">;
    parentRunId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    state: ComposedInfrastructureState;
  },
): Promise<void> {
  if (args.state.cloudflare.buildsConnected) {
    return;
  }

  try {
    await step.runAction(
      internal.vault.cloudflare.ensureCloudflareBuildsWiring,
      {
        vaultId: args.vaultId,
        runId: args.parentRunId,
        userId: args.userId,
        appRoot: args.state.appRoot,
      },
      { name: "wire_builds", retry: false },
    );
    await step.runMutation(
      internal.vault.cloudflareMutations.finishCloudflareBuildsWiring,
      {
        vaultId: args.vaultId,
        runId: args.parentRunId,
        userId: args.userId,
        appRoot: args.state.appRoot,
      },
      { name: "finish_wire_builds" },
    );
  } catch (error) {
    await markComposedInfrastructureRunFailed(step, {
      runId: args.parentRunId,
      name: "mark_wire_builds_failed",
      error,
    });
    throw error;
  }
}

async function runComposedCloudflareConvexBuildAccessWiring(
  step: WorkflowCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    appRoot: string;
    runId: Id<"workflow_vaultProvisioning_runs">;
  },
): Promise<void> {
  try {
    await step.runAction(
      internal.vault.cloudflare.ensureCloudflareConvexBuildAccessWiring,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        appRoot: args.appRoot,
      },
      { name: "wire_convex_build_access", retry: false },
    );
    await step.runMutation(
      internal.vault.cloudflareMutations.finishCloudflareConvexBuildAccessWiring,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        appRoot: args.appRoot,
      },
      { name: "finish_wire_convex_build_access" },
    );
  } catch (error) {
    await markComposedInfrastructureRunFailed(step, {
      runId: args.runId,
      name: "mark_wire_convex_build_access_failed",
      error,
    });
    throw error;
  }
}

async function recordComposedCloudflareDefaultDomain(
  step: WorkflowCtx,
  args: {
    parentRunId: Id<"workflow_vaultProvisioning_runs">;
    vaultId: Id<"vaults">;
    defaultBranch: string;
    state: ComposedInfrastructureState;
  },
): Promise<void> {
  const workersDevUrl = args.state.cloudflare.workersDevUrl;
  if (!workersDevUrl) {
    await step.runMutation(
      internal.appProvisioningRuns.appendRunEvent,
      {
        runId: args.parentRunId,
        step: "record_domains",
        level: "warn",
        message: "Cloudflare Worker ready, but workers.dev URL was not available yet.",
        state: "running",
      },
      { name: "record_domains_missing_workers_dev_url" },
    );
    return;
  }

  const { applied } = await step.runMutation(
    internal.infraProvisioning.upsertDomainRecord,
    {
      vaultId: args.vaultId,
      branch: args.defaultBranch,
      kind: "main",
      url: workersDevUrl,
      source: "cloudflare_workers_default",
      active: true,
    },
    { name: "upsert_workers_dev_domain" },
  );
  if (!applied) {
    throw new Error("Could not record Cloudflare Worker default domain.");
  }
  await step.runMutation(
    internal.appProvisioningRuns.appendRunEvent,
    {
      runId: args.parentRunId,
      step: "record_domains",
      level: "info",
      message: `Recorded production URL: ${workersDevUrl}.`,
      state: "running",
    },
    { name: "record_workers_dev_domain" },
  );
}

async function runComposedInfrastructure(
  step: WorkflowCtx,
  args: {
    vaultId: Id<"vaults">;
    parentRunId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    defaultBranch: string;
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

  if (!initialState.convex.attached) {
    await appendComposedInfrastructureParentEvent(step, {
      runId: args.parentRunId,
      step: "attach_convex",
      message: "Attaching Convex deployment.",
    });
  }
  await runComposedConvexAttachment(step, {
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
  if (!afterConvex.cloudflare.attached) {
    await appendComposedInfrastructureParentEvent(step, {
      runId: args.parentRunId,
      step: "attach_worker",
      message: "Attaching Cloudflare Worker.",
    });
  }
  await runComposedCloudflareAttachment(step, {
    vaultId: args.vaultId,
    parentRunId: args.parentRunId,
    userId: args.userId,
    state: afterConvex,
  });

  const afterWorker = await readCurrentComposedInfrastructureState(step, {
    vaultId: args.vaultId,
    userId: args.userId,
    name: "read_infra_after_worker",
  });
  if (!afterWorker.cloudflare.buildsConnected) {
    await appendComposedInfrastructureParentEvent(step, {
      runId: args.parentRunId,
      step: "wire_builds",
      message: "Wiring Cloudflare Workers Builds.",
    });
  }
  await runComposedCloudflareBuildsWiring(step, {
    vaultId: args.vaultId,
    parentRunId: args.parentRunId,
    userId: args.userId,
    state: afterWorker,
  });

  const afterBuilds = await readCurrentComposedInfrastructureState(step, {
    vaultId: args.vaultId,
    userId: args.userId,
    name: "read_infra_after_builds",
  });
  if (afterBuilds.convex.attached && !afterBuilds.cloudflare.convexBuildAccessWired) {
    await appendComposedInfrastructureParentEvent(step, {
      runId: args.parentRunId,
      step: "wire_convex_build_access",
      message: "Wiring Convex build access.",
    });
    await runComposedCloudflareConvexBuildAccessWiring(step, {
      vaultId: args.vaultId,
      runId: args.parentRunId,
      userId: args.userId,
      appRoot: afterBuilds.appRoot,
    });
  }

  const finalState = await readCurrentComposedInfrastructureState(step, {
    vaultId: args.vaultId,
    userId: args.userId,
    name: "read_infra_after_convex_build_access",
  });
  await recordComposedCloudflareDefaultDomain(step, {
    parentRunId: args.parentRunId,
    vaultId: args.vaultId,
    defaultBranch: args.defaultBranch,
    state: finalState,
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
      message: "App infrastructure is ready.",
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
      defaultBranch: retryContext.defaultBranch,
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
      defaultBranch: repository.defaultBranch,
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

export const connectCloudflareWorker = workflow.define({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
    accountId: string(),
    workerName: string(),
    origin: vVaultCloudflareOrigin,
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    const { claimed } = await step.runMutation(
      internal.vault.cloudflareMutations.claimCloudflareWorkerConnection,
      args,
      { name: "claim_infra" },
    );
    if (!claimed) {
      return null;
    }

    await step.runMutation(
      internal.appProvisioningRuns.appendRunEvent,
      {
        runId: args.runId,
        step: "attach_worker",
        level: "info",
        message:
          args.origin === "provisioned"
            ? "Creating Cloudflare Worker."
            : "Connecting Cloudflare Worker.",
        state: "running",
      },
      { name: "start_attach_worker" },
    );
    await step.runAction(internal.vault.cloudflare.ensureCloudflareWorkerConnection, args, {
      name: "attach_worker",
      retry: false,
    });
    let buildRunId: typeof args.runId | null = null;
    if (args.origin === "provisioned") {
      buildRunId = await step.runMutation(
        internal.appProvisioningRuns.createForVault,
        {
          vaultId: args.vaultId,
          userId: args.userId,
          trigger: "wire_builds",
        },
        { name: "create_wire_builds_run" },
      );
    }
    try {
      await step.runMutation(
        internal.vault.cloudflareMutations.finishCloudflareWorkerConnection,
        {
          vaultId: args.vaultId,
          runId: args.runId,
          userId: args.userId,
          appRoot: args.appRoot,
        },
        { name: "finish" },
      );
    } catch (error) {
      if (buildRunId) {
        await step.runMutation(
          internal.infraProvisioning.markWorkflowStartupFailed,
          {
            runId: buildRunId,
            message: "Cloudflare Worker connection did not finish.",
          },
          { name: "mark_wire_builds_blocked" },
        );
      }
      throw error;
    }

    if (!buildRunId) {
      return null;
    }
    try {
      await step.runMutation(
        internal.appProvisioningWorkflow.startCloudflareBuildsWiring,
        {
          vaultId: args.vaultId,
          runId: buildRunId,
          userId: args.userId,
          appRoot: args.appRoot,
        },
        { name: "start_wire_builds" },
      );
    } catch (error) {
      if (buildRunId) {
        await step
          .runMutation(
            internal.infraProvisioning.markWorkflowStartupFailed,
            {
              runId: buildRunId,
              message: toErrorMessage(error),
            },
            { name: "mark_wire_builds_start_failed" },
          )
          .catch((failureError: unknown) => {
            console.warn("cloudflare:builds:follow_on_failure_record_failed", {
              vaultId: args.vaultId,
              appRoot: args.appRoot,
              error: toErrorMessage(failureError),
            });
          });
      }
      console.warn("cloudflare:builds:follow_on_failed", {
        vaultId: args.vaultId,
        appRoot: args.appRoot,
        error: toErrorMessage(error),
      });
    }

    return null;
  },
});

export const wireCloudflareBuilds = workflow.define({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    const { claimed } = await step.runMutation(
      internal.vault.cloudflareMutations.claimCloudflareBuildsWiring,
      args,
      { name: "claim_infra" },
    );
    if (!claimed) {
      return null;
    }

    await step.runMutation(
      internal.appProvisioningRuns.appendRunEvent,
      {
        runId: args.runId,
        step: "wire_builds",
        level: "info",
        message: "Wiring Cloudflare Workers Builds.",
        state: "running",
      },
      { name: "start_wire_builds_step" },
    );
    await step.runAction(internal.vault.cloudflare.ensureCloudflareBuildsWiring, args, {
      name: "wire_builds",
      retry: false,
    });
    const { convexBuildAccessRunId } = await step.runMutation(
      internal.vault.cloudflareMutations.finishCloudflareBuildsWiring,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        appRoot: args.appRoot,
      },
      { name: "finish" },
    );
    if (!convexBuildAccessRunId) {
      return null;
    }

    try {
      await step.runMutation(
        internal.appProvisioningWorkflow.startCloudflareConvexBuildAccessWiring,
        {
          vaultId: args.vaultId,
          runId: convexBuildAccessRunId,
          userId: args.userId,
          appRoot: args.appRoot,
        },
        { name: "start_wire_convex_build_access" },
      );
    } catch (error) {
      await step
        .runMutation(
          internal.infraProvisioning.markWorkflowStartupFailed,
          {
            runId: convexBuildAccessRunId,
            message: toErrorMessage(error),
          },
          { name: "mark_wire_convex_build_access_start_failed" },
        )
        .catch((failureError: unknown) => {
          console.warn("cloudflare:convex_build_access:follow_on_failure_record_failed", {
            vaultId: args.vaultId,
            appRoot: args.appRoot,
            error: toErrorMessage(failureError),
          });
        });
      console.warn("cloudflare:convex_build_access:follow_on_failed", {
        vaultId: args.vaultId,
        appRoot: args.appRoot,
        error: toErrorMessage(error),
      });
    }

    return null;
  },
});

export const wireCloudflareConvexBuildAccess = workflow.define({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    const { claimed } = await step.runMutation(
      internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring,
      args,
      { name: "claim_infra" },
    );
    if (!claimed) {
      return null;
    }

    await step.runMutation(
      internal.appProvisioningRuns.appendRunEvent,
      {
        runId: args.runId,
        step: "wire_convex_build_access",
        level: "info",
        message: "Wiring Convex build access.",
        state: "running",
      },
      { name: "start_wire_convex_build_access_step" },
    );
    await step.runAction(internal.vault.cloudflare.ensureCloudflareConvexBuildAccessWiring, args, {
      name: "wire_convex_build_access",
      retry: false,
    });
    await step.runMutation(
      internal.vault.cloudflareMutations.finishCloudflareConvexBuildAccessWiring,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        appRoot: args.appRoot,
      },
      { name: "finish" },
    );

    return null;
  },
});

export const connectConvexDeployment = workflow.define({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    target: vVaultConvexConnectionTarget,
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    const { claimed } = await step.runMutation(
      internal.vault.convexMutations.claimConvexDeploymentConnection,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        appRoot: args.target.appRoot,
      },
      { name: "claim_infra" },
    );
    if (!claimed) {
      return null;
    }

    await step.runMutation(
      internal.appProvisioningRuns.appendRunEvent,
      {
        runId: args.runId,
        step: "attach_convex",
        level: "info",
        message: "Attaching Convex deployment.",
        state: "running",
      },
      { name: "start_attach_convex" },
    );
    await step.runAction(internal.vault.convex.ensureConvexDeploymentConnection, args, {
      name: "attach_convex",
      retry: false,
    });
    await step.runMutation(
      internal.vault.convexMutations.finishConvexDeploymentConnection,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        appRoot: args.target.appRoot,
      },
      { name: "finish" },
    );

    return null;
  },
});

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

export const startCloudflareWorkerConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
    accountId: string(),
    workerName: string(),
    origin: vVaultCloudflareOrigin,
  },
  returns: string(),
  handler: async (ctx, args): Promise<string> => {
    const workflowId: string = await workflow.start(
      ctx,
      internal.appProvisioningWorkflow.connectCloudflareWorker,
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
      step: "claim_infra",
      level: "info",
      message: "Queued Cloudflare Worker connection.",
      state: "queued",
    });

    return workflowId;
  },
});

export const startCloudflareBuildsWiring = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: string(),
  handler: async (ctx, args): Promise<string> => {
    const workflowId: string = await workflow.start(
      ctx,
      internal.appProvisioningWorkflow.wireCloudflareBuilds,
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
      step: "claim_infra",
      level: "info",
      message: "Queued Cloudflare Workers Builds wiring.",
      state: "queued",
    });

    return workflowId;
  },
});

export const startCloudflareConvexBuildAccessWiring = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: string(),
  handler: async (ctx, args): Promise<string> => {
    const workflowId: string = await workflow.start(
      ctx,
      internal.appProvisioningWorkflow.wireCloudflareConvexBuildAccess,
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
      step: "claim_infra",
      level: "info",
      message: "Queued Convex build access wiring.",
      state: "queued",
    });

    return workflowId;
  },
});

export const startConvexDeploymentConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    target: vVaultConvexConnectionTarget,
  },
  returns: string(),
  handler: async (ctx, args): Promise<string> => {
    const workflowId: string = await workflow.start(
      ctx,
      internal.appProvisioningWorkflow.connectConvexDeployment,
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
      step: "claim_infra",
      level: "info",
      message: "Queued Convex deployment connection.",
      state: "queued",
    });

    return workflowId;
  },
});

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
