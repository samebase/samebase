import { v, type Infer } from "convex/values";
import { vResultValidator, type RunResult } from "@convex-dev/workpool";
import { WorkflowManager, type WorkflowCtx } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { toErrorMessage } from "./jsonUtils";
import type { AppProvisioningStep } from "./schema";
import {
  isVaultProviderUpstreamPresent,
  vVaultCloudflareOrigin,
  vVaultConvexConnectionTarget,
} from "./vault/model";
import { isLiveConnectedVault } from "./vault/state";

const workflow = new WorkflowManager(components.workflow);
const { boolean, id, null: nullValue, object, string, union } = v;
const idempotentProviderStepRetry = {
  maxAttempts: 3,
  initialBackoffMs: 1_000,
  base: 2,
} as const;

const workflowCompletionContext = object({
  runId: id("appProvisioningRuns"),
});
const createAppDescription = v.union(string(), v.null());
const composedInfrastructureState = object({
  appId: id("vaultApps"),
  convex: union(
    object({ state: v.literal("not_attached"), projectName: string() }),
    object({
      state: v.literal("attached"),
      projectName: string(),
      deploymentId: id("vaultConvexDeployments"),
    }),
  ),
  cloudflare: union(
    object({
      state: v.literal("not_attached"),
      accountId: string(),
      workerName: string(),
    }),
    object({
      state: v.literal("attached"),
      accountId: string(),
      workerName: string(),
      workerId: id("vaultCloudflareWorkers"),
      convexBuildAccessWired: boolean(),
      workersDevUrl: union(string(), nullValue()),
    }),
  ),
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

    const target = await ctx.db
      .query("vaultInfrastructureTargets")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
    if (!target) {
      throw new Error("Infrastructure target not found for vault.");
    }
    const [app, convexDeployment, worker] = await Promise.all([
      ctx.db.get(target.appId),
      ctx.db
        .query("vaultConvexDeployments")
        .withIndex("by_app", (q) => q.eq("appId", target.appId))
        .unique(),
      ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_account_and_worker", (q) =>
          q
            .eq("vaultId", args.vaultId)
            .eq("accountId", target.cloudflare.accountId)
            .eq("workerName", target.cloudflare.workerName),
        )
        .unique(),
    ]);
    if (!app || app.vaultId !== args.vaultId || app.userId !== args.userId) {
      throw new Error("Infrastructure target references an invalid app.");
    }
    const convexDeploymentAttached =
      convexDeployment !== null && isVaultProviderUpstreamPresent(convexDeployment);
    const cloudflareWorkerAttached = worker !== null && isVaultProviderUpstreamPresent(worker);
    const dependency = cloudflareWorkerAttached
      ? await ctx.db
          .query("vaultWorkerDeploymentDependencies")
          .withIndex("by_worker", (q) => q.eq("workerId", worker._id))
          .unique()
      : null;
    const convexBuildAccessWired =
      dependency !== null &&
      convexDeployment !== null &&
      isVaultProviderUpstreamPresent(convexDeployment) &&
      dependency.convexDeploymentId === convexDeployment._id &&
      dependency.wiring.state === "wired";

    return {
      appId: app._id,
      convex: convexDeploymentAttached
        ? {
            state: "attached",
            projectName: target.convex.projectName,
            deploymentId: convexDeployment._id,
          }
        : { state: "not_attached", projectName: target.convex.projectName },
      cloudflare: cloudflareWorkerAttached
        ? {
            state: "attached",
            accountId: target.cloudflare.accountId,
            workerName: target.cloudflare.workerName,
            workerId: worker._id,
            convexBuildAccessWired,
            workersDevUrl: worker.workersDevUrl ?? null,
          }
        : {
            state: "not_attached",
            accountId: target.cloudflare.accountId,
            workerName: target.cloudflare.workerName,
          },
    };
  },
});

export const readComposedInfrastructureRetryContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
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
    runId: id("appProvisioningRuns"),
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
    const target = await ctx.db
      .query("vaultInfrastructureTargets")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
    if (!target) {
      throw new Error("Infrastructure target not found for vault.");
    }
    const app = await ctx.db.get(target.appId);
    if (!app || app.vaultId !== args.vaultId || app.userId !== args.userId) {
      throw new Error("Infrastructure target references an invalid app.");
    }

    const now = Date.now();
    const ownership = await ctx.db
      .query("vaultInfrastructureOwnership")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
    if (
      ownership &&
      ownership.state === "active" &&
      ownership.runId !== args.runId &&
      now - ownership.updatedAt < COMPOSED_INFRASTRUCTURE_STALE_MS
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

    if (ownership) {
      if (ownership.state === "active" && ownership.runId !== args.runId) {
        await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
          runId: ownership.runId,
          step: "claim_infra",
          level: "warn",
          message: "Infrastructure provisioning was superseded by a newer run.",
          state: "canceled",
        });
      }
      await ctx.db.patch(ownership._id, {
        runId: args.runId,
        state: "active",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("vaultInfrastructureOwnership", {
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
      message: `Started infrastructure provisioning for ${app.rootDirectory}.`,
      state: "running",
    });

    return { claimed: true };
  },
});

export const finishComposedInfrastructureProvisioning = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
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
    const ownership = await ctx.db
      .query("vaultInfrastructureOwnership")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
    if (!ownership || ownership.state !== "active" || ownership.runId !== args.runId) {
      throw new Error("Composed infrastructure run no longer owns provisioning.");
    }

    await ctx.db.patch(ownership._id, {
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
    runId: Id<"appProvisioningRuns">;
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
    runId: Id<"appProvisioningRuns">;
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
    parentRunId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    state: ComposedInfrastructureState;
  },
): Promise<void> {
  if (args.state.convex.state === "attached") {
    return;
  }

  try {
    const deploymentId = await step.runAction(
      internal.vault.convex.ensureConvexDeploymentConnection,
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
      { name: "attach_convex", retry: idempotentProviderStepRetry },
    );
    if (deploymentId === null) {
      return;
    }
    await step.runMutation(
      internal.vault.convexMutations.finishConvexDeploymentConnection,
      {
        vaultId: args.vaultId,
        runId: args.parentRunId,
        userId: args.userId,
        deploymentId,
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
    parentRunId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    state: ComposedInfrastructureState;
  },
): Promise<void> {
  if (args.state.cloudflare.state === "attached") {
    return;
  }

  try {
    const workerId = await step.runAction(
      internal.vault.cloudflare.ensureCloudflareWorkerConnection,
      {
        vaultId: args.vaultId,
        runId: args.parentRunId,
        userId: args.userId,
        appId: args.state.appId,
        accountId: args.state.cloudflare.accountId,
        workerName: args.state.cloudflare.workerName,
        origin: "provisioned",
      },
      { name: "attach_worker", retry: false },
    );
    if (workerId === null) {
      return;
    }
    await step.runMutation(
      internal.vault.cloudflareMutations.finishCloudflareWorkerConnection,
      {
        vaultId: args.vaultId,
        runId: args.parentRunId,
        userId: args.userId,
        workerId,
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

async function runComposedCloudflareConvexBuildAccessWiring(
  step: WorkflowCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    workerId: Id<"vaultCloudflareWorkers">;
    convexDeploymentId: Id<"vaultConvexDeployments">;
    runId: Id<"appProvisioningRuns">;
  },
): Promise<void> {
  try {
    const { claimed } = await step.runMutation(
      internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        workerId: args.workerId,
        convexDeploymentId: args.convexDeploymentId,
      },
      { name: "claim_wire_convex_build_access" },
    );
    if (!claimed) {
      return;
    }
    await step.runAction(
      internal.vault.cloudflare.ensureCloudflareConvexBuildAccessWiring,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        workerId: args.workerId,
        convexDeploymentId: args.convexDeploymentId,
      },
      { name: "wire_convex_build_access", retry: false },
    );
    await step.runMutation(
      internal.vault.cloudflareMutations.finishCloudflareConvexBuildAccessWiring,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        workerId: args.workerId,
        convexDeploymentId: args.convexDeploymentId,
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
    parentRunId: Id<"appProvisioningRuns">;
    vaultId: Id<"vaults">;
    defaultBranch: string;
    state: ComposedInfrastructureState;
  },
): Promise<void> {
  if (args.state.cloudflare.state !== "attached") {
    throw new Error("Cloudflare Worker must be attached before recording its domain.");
  }
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

export async function runComposedInfrastructure(
  step: WorkflowCtx,
  args: {
    vaultId: Id<"vaults">;
    parentRunId: Id<"appProvisioningRuns">;
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

  if (initialState.convex.state === "not_attached") {
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
  if (afterConvex.cloudflare.state === "not_attached") {
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
  if (
    afterWorker.convex.state === "attached" &&
    afterWorker.cloudflare.state === "attached" &&
    !afterWorker.cloudflare.convexBuildAccessWired
  ) {
    await appendComposedInfrastructureParentEvent(step, {
      runId: args.parentRunId,
      step: "wire_convex_build_access",
      message: "Wiring Convex build access.",
    });
    await runComposedCloudflareConvexBuildAccessWiring(step, {
      vaultId: args.vaultId,
      runId: args.parentRunId,
      userId: args.userId,
      workerId: afterWorker.cloudflare.workerId,
      convexDeploymentId: afterWorker.convex.deploymentId,
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
    runId: id("appProvisioningRuns"),
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
    runId: id("appProvisioningRuns"),
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
        ghRepoNodeId: repository.ghRepoNodeId,
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
        ghRepoId: repository.ghRepoId,
        ghRepoNodeId: repository.ghRepoNodeId,
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
    runId: id("appProvisioningRuns"),
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
        ghRepoNodeId: repository.ghRepoNodeId,
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
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
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
    const workerId = await step.runAction(
      internal.vault.cloudflare.ensureCloudflareWorkerConnection,
      args,
      {
        name: "attach_worker",
        retry: false,
      },
    );
    if (workerId === null) {
      return null;
    }
    await step.runMutation(
      internal.vault.cloudflareMutations.finishCloudflareWorkerConnection,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        workerId,
      },
      { name: "finish" },
    );

    return null;
  },
});

export const wireCloudflareBuilds = workflow.define({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
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
    await step.runMutation(internal.vault.cloudflareMutations.finishCloudflareBuildsWiring, args, {
      name: "finish",
    });

    return null;
  },
});

export const wireCloudflareConvexBuildAccess = workflow.define({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
    convexDeploymentId: id("vaultConvexDeployments"),
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
      args,
      { name: "finish" },
    );

    return null;
  },
});

export const verifyCloudflareInfrastructure = workflow.define({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    const { claimed } = await step.runMutation(
      internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification,
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
        step: "verify_infrastructure",
        level: "info",
        message: "Verifying Cloudflare infrastructure.",
        state: "running",
      },
      { name: "start_verify_infrastructure_step" },
    );
    await step.runAction(
      internal.vault.cloudflare.ensureCloudflareInfrastructureVerification,
      args,
      {
        name: "verify_infrastructure",
        retry: false,
      },
    );
    await step.runMutation(
      internal.vault.cloudflareMutations.finishCloudflareInfrastructureVerification,
      args,
      { name: "finish" },
    );

    return null;
  },
});

export const connectConvexDeployment = workflow.define({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
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
        appId: args.target.appId,
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
    const deploymentId = await step.runAction(
      internal.vault.convex.ensureConvexDeploymentConnection,
      args,
      {
        name: "attach_convex",
        retry: false,
      },
    );
    if (deploymentId === null) {
      return null;
    }
    await step.runMutation(
      internal.vault.convexMutations.finishConvexDeploymentConnection,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        deploymentId,
      },
      { name: "finish" },
    );

    return null;
  },
});

export const startCreateAppProvisioning = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
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
    runId: id("appProvisioningRuns"),
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
    runId: id("appProvisioningRuns"),
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
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
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
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
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
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
    convexDeploymentId: id("vaultConvexDeployments"),
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

export const startCloudflareInfrastructureVerification = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: string(),
  handler: async (ctx, args): Promise<string> => {
    const workflowId: string = await workflow.start(
      ctx,
      internal.appProvisioningWorkflow.verifyCloudflareInfrastructure,
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
      message: "Queued infrastructure verification.",
      state: "queued",
    });

    return workflowId;
  },
});

export const startConvexDeploymentConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
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
