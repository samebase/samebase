import { v } from "convex/values";
import { vResultValidator, type RunResult } from "@convex-dev/workpool";
import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { toErrorMessage } from "./jsonUtils";

const workflow = new WorkflowManager(components.workflow);
const { boolean, id, object, string } = v;
const idempotentProviderStepRetry = {
  maxAttempts: 3,
  initialBackoffMs: 1_000,
  base: 2,
} as const;

const workflowCompletionContext = object({
  runId: id("appProvisioningRuns"),
});
const createAppDescription = v.union(string(), v.null());

export function resolveWorkflowCompletionError(
  result: RunResult,
): string | null {
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

export const provisionVaultInfrastructure = workflow.define({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    force: boolean(),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    const { claimed } = await step.runMutation(
      internal.infraProvisioning.claimWorkflowProvisioning,
      args,
      { name: "claim_infra" },
    );
    if (!claimed) {
      return null;
    }

    await step.runAction(
      internal.infraProvisioning.validateProvisioningConnections,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      { name: "validate_connections", retry: false },
    );
    await step.runAction(
      internal.infraProvisioning.ensureConvexInfrastructure,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      { name: "ensure_convex", retry: idempotentProviderStepRetry },
    );
    await step.runAction(
      internal.infraProvisioning.ensureConvexPreviewInfrastructure,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      { name: "ensure_convex_preview", retry: idempotentProviderStepRetry },
    );
    await step.runAction(
      internal.infraProvisioning.ensureCloudflareInfrastructure,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      { name: "ensure_cloudflare", retry: false },
    );
    await step.runMutation(
      internal.infraProvisioning.finishWorkflowProvisioning,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      { name: "finish" },
    );

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
    const { claimed } = await step.runMutation(
      internal.infraProvisioning.claimWorkflowProvisioning,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        force: false,
      },
      { name: "claim_infra" },
    );
    if (!claimed) {
      return null;
    }

    await step.runAction(
      internal.infraProvisioning.validateProvisioningConnections,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      { name: "validate_infra_connections", retry: false },
    );
    await step.runAction(
      internal.infraProvisioning.ensureConvexInfrastructure,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      { name: "ensure_convex", retry: idempotentProviderStepRetry },
    );
    await step.runAction(
      internal.infraProvisioning.ensureConvexPreviewInfrastructure,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      { name: "ensure_convex_preview", retry: idempotentProviderStepRetry },
    );
    await step.runAction(
      internal.infraProvisioning.ensureCloudflareInfrastructure,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      { name: "ensure_cloudflare", retry: false },
    );
    await step.runMutation(
      internal.infraProvisioning.finishWorkflowProvisioning,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      { name: "finish" },
    );

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
      internal.appProvisioningWorkflowActions
        .validateExistingRepositoryConnection,
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
      internal.appProvisioningWorkflowActions
        .finishExistingRepositoryConnection,
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
        onComplete:
          internal.appProvisioningWorkflow.handleProvisioningWorkflowComplete,
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
        onComplete:
          internal.appProvisioningWorkflow.handleProvisioningWorkflowComplete,
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
    force: boolean(),
  },
  returns: string(),
  handler: async (ctx, args): Promise<string> => {
    const workflowId: string = await workflow.start(
      ctx,
      internal.appProvisioningWorkflow.provisionVaultInfrastructure,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        force: args.force,
      },
      {
        startAsync: true,
        onComplete:
          internal.appProvisioningWorkflow.handleProvisioningWorkflowComplete,
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

    await ctx.runMutation(
      internal.infraProvisioning.markWorkflowProvisioningFailed,
      {
        runId: args.context.runId,
        workflowId: args.workflowId,
        message: toErrorMessage(error),
      },
    );

    return null;
  },
});
