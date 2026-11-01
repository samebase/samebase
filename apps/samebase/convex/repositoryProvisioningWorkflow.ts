import { v, type Infer } from "convex/values";
import { vResultValidator, type RunResult } from "@convex-dev/workpool";
import { WorkflowManager, type WorkflowCtx } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { toErrorMessage } from "./jsonUtils";
import { vSealedSecret } from "./sealedSecret";
import { getOrganizationProviderConfiguration } from "./organizationProviderCredentials";
import {
  REPOSITORY_ACTIONS_DEFAULT_BRANCH,
  vRepositoryActionsSeed,
  vRepositoryProvisioningMode,
  type RepositoryProvisioningMode,
} from "./repository/provisioningModel";
import {
  isSamebaseProvisioningPlan,
  readRepositoryProvisioningMode,
  type RepositoryProvisioningPlan,
} from "./repository/provisioningPlan";
import { isLiveConnectedRepository } from "./repository/state";
import {
  requireActiveRepositoryProvisioningAuthority,
  requireActiveRepositoryProvisioningContinuation,
  requireActiveRepositoryProvisioningRun,
} from "./repositoryWorkflowAuthority";

const workflow = new WorkflowManager(components.workflow);
const { boolean, id, literal, number, object, string } = v;
const idempotentProviderStepRetry = {
  maxAttempts: 3,
  initialBackoffMs: 1_000,
  base: 2,
} as const;

const workflowCompletionContext = object({
  runId: id("workflow_repositoryProvisioning_runs"),
});
const createAppDescription = v.union(string(), v.null());
const composedInfrastructureRetryContext = object({
  userId: id("users"),
  provisioning: object({
    mode: literal("repository_actions"),
    githubRepositoryDatabaseId: string(),
  }),
});
type ComposedInfrastructureRetryContext = Infer<typeof composedInfrastructureRetryContext>;
const actionsSecretsTarget = object({
  organizationId: id("organizations"),
  convexCredential: vSealedSecret,
  convexTeamId: string(),
  credentialRevision: number(),
});
type ActionsSecretsTarget = Infer<typeof actionsSecretsTarget>;

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
    const repository = authority.repository;
    if (!isLiveConnectedRepository(repository)) {
      throw new Error("Repository not found.");
    }
    const plan = await readProvisioningPlan(ctx, args.repositoryId);
    if (isSamebaseProvisioningPlan(plan)) {
      throw new Error("Only a repository_actions repository can retry its setup.");
    }

    return {
      userId: authority.run.userId,
      provisioning: {
        mode: "repository_actions",
        githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
      },
    };
  },
});

async function readProvisioningPlan(
  ctx: Pick<QueryCtx, "db">,
  repositoryId: Id<"repositories">,
): Promise<RepositoryProvisioningPlan> {
  const plan = await ctx.db
    .query("workflow_repositoryProvisioning_plans")
    .withIndex("by_repository", (q) => q.eq("repositoryId", repositoryId))
    .unique();
  if (!plan) {
    throw new Error("Infrastructure provisioning plan not found for repository.");
  }
  return plan;
}

async function requireManagedRunWriteLock(
  ctx: Pick<QueryCtx, "db">,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
  },
): Promise<Doc<"workflow_repositoryProvisioning_writeLocks">> {
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
    throw new Error("Provisioning run no longer holds the provisioning write lock.");
  }
  return writeLock;
}

/**
The mode of the repository of an active run, for the steps that refuse any other plan. A retry run
also must hold the write lock: only a repository_actions retry runs the seed and sync steps.
*/
export const readProvisioningModeForRun = internalQuery({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
  },
  returns: vRepositoryProvisioningMode,
  handler: async (ctx, args): Promise<RepositoryProvisioningMode> => {
    const authority = await requireActiveRepositoryProvisioningRun(ctx.db, args);
    if (authority.run.trigger === "retry") {
      await requireManagedRunWriteLock(ctx, args);
    }
    return readRepositoryProvisioningMode(await readProvisioningPlan(ctx, args.repositoryId));
  },
});

/**
The values that write_actions_secrets writes into the repository: the credential of the
organization's Convex connection, an OAuth token or an API key, which must connect the repository's
Convex team, and the time that the connection last changed. The credential stays sealed; the action
opens it right before the write.
*/
export const readActionsSecretsTarget = internalQuery({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
  },
  returns: actionsSecretsTarget,
  handler: async (ctx, args): Promise<ActionsSecretsTarget> => {
    const authority = await requireActiveRepositoryProvisioningAuthority(ctx.db, args);
    const repository = authority.repository;
    if (authority.run.trigger !== "create" && authority.run.trigger !== "retry") {
      throw new Error("Provisioning run does not match repository_actions setup.");
    }
    if (!isLiveConnectedRepository(repository)) {
      throw new Error("Repository not found.");
    }
    const [plan, { convexCredential, convexTeam }] = await Promise.all([
      readProvisioningPlan(ctx, args.repositoryId),
      getOrganizationProviderConfiguration(ctx.db, repository.organizationId),
      requireManagedRunWriteLock(ctx, args),
    ]);
    if (readRepositoryProvisioningMode(plan) !== "repository_actions") {
      throw new Error("Only a repository_actions repository receives GitHub Actions secrets.");
    }
    if (repository.convexTeamId === undefined) {
      throw new Error("Managed repository provider destinations are not configured.");
    }
    if (!convexCredential || convexTeam?.teamId !== repository.convexTeamId) {
      throw new Error(
        "Convex connection is required to provision infrastructure. Connect Convex and retry.",
      );
    }

    return {
      organizationId: repository.organizationId,
      convexCredential: convexCredential.auth.credential,
      convexTeamId: repository.convexTeamId,
      credentialRevision: convexCredential.updatedAt,
    };
  },
});

async function readRepositoryActionsPlanForRun(
  ctx: Pick<QueryCtx, "db">,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
  },
) {
  await requireActiveRepositoryProvisioningRun(ctx.db, args);
  await requireManagedRunWriteLock(ctx, args);
  const plan = await readProvisioningPlan(ctx, args.repositoryId);
  if (isSamebaseProvisioningPlan(plan)) {
    throw new Error("Only a repository_actions repository records its starter seed.");
  }
  return plan;
}

/** The starter seed of a repository_actions repository, read by the seed step before it seeds. */
export const readRepositoryActionsSeedForRun = internalQuery({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
  },
  returns: vRepositoryActionsSeed,
  handler: async (ctx, args) => (await readRepositoryActionsPlanForRun(ctx, args)).seed,
});

/**
Records main as the repository's default branch after the seed step set it on GitHub (or found it
there), so the dashboard reads the tree of main and no later retry changes the branch again.
*/
export const recordRepositoryActionsDefaultBranch = internalMutation({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await readRepositoryActionsPlanForRun(ctx, args);
    const repository = await ctx.db.get(args.repositoryId);
    if (!isLiveConnectedRepository(repository)) {
      throw new Error("Repository not found.");
    }
    await ctx.db.patch(repository._id, { defaultBranch: REPOSITORY_ACTIONS_DEFAULT_BRANCH });
    return null;
  },
});

/** Records the starter tree right before the seed push, so a retry can find the pushed starter. */
export const markStarterSeeding = internalMutation({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    manifestVersion: string(),
    treeSha: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const plan = await readRepositoryActionsPlanForRun(ctx, {
      repositoryId: args.repositoryId,
      runId: args.runId,
      userId: args.userId,
    });
    await ctx.db.patch(plan._id, {
      seed: { state: "seeding", manifestVersion: args.manifestVersion, treeSha: args.treeSha },
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Records the seed, so no later retry force-updates the default branch again. */
export const markStarterSeeded = internalMutation({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    manifestVersion: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const plan = await readRepositoryActionsPlanForRun(ctx, args);
    const now = Date.now();
    await ctx.db.patch(plan._id, {
      seed: { state: "seeded", seededAt: now, manifestVersion: args.manifestVersion },
      updatedAt: now,
    });
    return null;
  },
});

/** Records which revision of the Convex connection the repository's Actions secret now holds. */
export const markActionsSecretsWritten = internalMutation({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    credentialRevision: number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireActiveRepositoryProvisioningContinuation(ctx, args);
    await requireManagedRunWriteLock(ctx, args);
    const plan = await readProvisioningPlan(ctx, args.repositoryId);
    if (isSamebaseProvisioningPlan(plan)) {
      throw new Error("Only a repository_actions repository receives GitHub Actions secrets.");
    }
    const now = Date.now();
    await ctx.db.patch(plan._id, {
      ciSecrets: { state: "written", writtenAt: now, credentialRevision: args.credentialRevision },
      updatedAt: now,
    });
    return null;
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

/**
Samebase's part of a repository_actions setup, after connect_github_repository: the Actions secret
and variable, then the starter seed whose push starts the repository's first deploy, then the tree
sync. The writes come first so the first workflow run has them. A retry resumes here: the writes are
upserts, the seed step skips a seed that the plan records and still finishes the switch of the
default branch to main, and the tree sync always runs again. Nothing waits for the deploy here:
readRepositorySetupStatus reads it from the team's Alchemy state store.
*/
async function runRepositoryActionsSetup(
  step: WorkflowCtx,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    githubRepositoryDatabaseId: string;
  },
): Promise<void> {
  await step.runAction(
    internal.repositoryProvisioningWorkflowActions.writeActionsSecrets,
    {
      repositoryId: args.repositoryId,
      runId: args.runId,
      userId: args.userId,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
    },
    { name: "write_actions_secrets", retry: idempotentProviderStepRetry },
  );
  await step.runAction(
    internal.repositoryProvisioningWorkflowActions.seedStarterRepository,
    {
      repositoryId: args.repositoryId,
      runId: args.runId,
      userId: args.userId,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
    },
    { name: "seed_starter", retry: idempotentProviderStepRetry },
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
    internal.repositoryProvisioningWorkflow.finishComposedInfrastructureProvisioning,
    {
      repositoryId: args.repositoryId,
      runId: args.runId,
      userId: args.userId,
    },
    { name: "finish_repository_actions_ownership" },
  );
  await step.runMutation(
    internal.repositoryProvisioningRuns.appendRunEvent,
    {
      runId: args.runId,
      step: "finish",
      level: "info",
      message:
        "Samebase wrote the GitHub Actions secrets and seeded the starter. The deployment runs in the repository's GitHub Actions.",
      state: "succeeded",
    },
    { name: "finish_repository_actions" },
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
    await runRepositoryActionsSetup(step, {
      repositoryId: args.repositoryId,
      runId: args.runId,
      userId: retryContext.userId,
      githubRepositoryDatabaseId: retryContext.provisioning.githubRepositoryDatabaseId,
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
    await runRepositoryActionsSetup(step, {
      repositoryId: args.repositoryId,
      runId: args.runId,
      userId: args.userId,
      githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
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
