import { v, type Infer } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  vRepositoryDeletionEventLevel,
  vRepositoryDeletionStep,
  type RepositoryDeletionEventLevel,
  type RepositoryDeletionPlan,
  type RepositoryDeletionStep,
  type RepositoryDeletionRetainedSnapshot,
} from "./model";
import { readRepositoryDeletionEligibility } from "./eligibility";
import { isConnectedRepository } from "../state";
import { requireRepositoryForUser, requireRepositoryOrganization } from "../../organizationAccess";
import {
  requireActiveRepositoryDeletionContinuation,
  requireActiveRepositoryDeletionRun,
} from "../../repositoryWorkflowAuthority";
import { readActiveUser } from "../../identity/lifecycle";
import { startTenantSuspensionSync } from "../../hubClients/tenantSuspension";

const { boolean, id, literal, object, string, union } = v;

const deletionRequestOptions = object({
  removeGithubRepo: boolean(),
  removeConvexProvision: boolean(),
  removeCloudflareProvision: boolean(),
});
type DeletionRequestOptions = Infer<typeof deletionRequestOptions>;

const deletionRunEventState = union(literal("unchanged"), literal("running"));

async function listRepositoryConvexProjects(
  ctx: MutationCtx,
  repositoryId: Id<"repositories">,
): Promise<Doc<"repositoryConvexProjects">[]> {
  return await ctx.db
    .query("repositoryConvexProjects")
    .withIndex("by_repository", (q) => q.eq("repositoryId", repositoryId))
    .collect();
}

async function assertRepositoryIsQuiescentForDeletion(
  ctx: MutationCtx,
  repository: Doc<"repositories">,
): Promise<void> {
  const eligibility = await readRepositoryDeletionEligibility(ctx, repository);
  if (eligibility.state === "blocked") {
    throw new Error(eligibility.reason);
  }
}

function buildConvexProjectDeletionPlan(
  projects: Array<{
    teamId: string;
    projectId: string;
  }>,
): Exclude<RepositoryDeletionPlan["convex"], { action: "skip" }> | null {
  const projectsByIdentity = new Map(
    projects.map((project) => [`${project.teamId}:${project.projectId}`, project] as const),
  );
  const uniqueProjects = [...projectsByIdentity.values()].sort(
    (left, right) =>
      left.teamId.localeCompare(right.teamId) || left.projectId.localeCompare(right.projectId),
  );
  if (uniqueProjects.length === 0) {
    return null;
  }
  return { action: "delete_projects", projects: uniqueProjects };
}

function buildConvexPlan(args: {
  repository: Doc<"repositories">;
  convexProjects: Doc<"repositoryConvexProjects">[];
  options: DeletionRequestOptions;
}): RepositoryDeletionPlan["convex"] {
  const { repository, convexProjects, options } = args;
  if (!options.removeConvexProvision) {
    return { action: "skip", reason: "not_requested" };
  }

  if (!isConnectedRepository(repository)) {
    return { action: "skip", reason: "not_recorded" };
  }
  const createdProjects: Array<{
    teamId: string;
    projectId: string;
  }> = [];

  for (const project of convexProjects) {
    if (
      project.organizationId !== repository.organizationId ||
      project.teamId !== repository.convexTeamId
    ) {
      throw new Error("Repository Convex project destination does not match its repository.");
    }
    if (project.origin === "provisioned") {
      createdProjects.push({
        teamId: project.teamId,
        projectId: project.projectId,
      });
    }
  }

  const projectPlan = buildConvexProjectDeletionPlan(createdProjects);
  if (projectPlan) {
    return projectPlan;
  }

  if (convexProjects.length > 0) {
    return { action: "skip", reason: "not_managed" };
  }

  return { action: "skip", reason: "not_recorded" };
}

async function buildCloudflarePlan(
  ctx: MutationCtx,
  args: {
    repository: Doc<"repositories">;
    options: DeletionRequestOptions;
  },
): Promise<RepositoryDeletionPlan["cloudflare"]> {
  const { repository, options } = args;
  if (!options.removeCloudflareProvision) {
    return { action: "skip", reason: "not_requested" };
  }
  if (!isConnectedRepository(repository)) {
    return { action: "skip", reason: "not_recorded" };
  }

  const workers = await ctx.db
    .query("repositoryCloudflareWorkers")
    .withIndex("by_repository", (q) => q.eq("repositoryId", repository._id))
    .collect();
  const provisionedWorkers = workers
    .filter((worker) => worker.origin === "provisioned")
    .sort(
      (left, right) =>
        left.workerName.localeCompare(right.workerName) ||
        left.accountId.localeCompare(right.accountId) ||
        left.workerTag.localeCompare(right.workerTag),
    );
  if (
    workers.some(
      (worker) =>
        worker.organizationId !== repository.organizationId ||
        worker.accountId !== repository.cloudflareAccountId,
    )
  ) {
    throw new Error("Repository Cloudflare Worker destination does not match its repository.");
  }
  if (provisionedWorkers.length === 0) {
    return { action: "skip", reason: "not_recorded" };
  }

  return {
    action: "delete_workers",
    workers: provisionedWorkers.map((worker) => ({
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
    })),
  };
}

async function buildDeletionPlan(
  ctx: MutationCtx,
  args: {
    repository: Extract<Doc<"repositories">, { state: "connected" | "failed" }>;
    githubOwnerLogin: string;
    convexProjects: Doc<"repositoryConvexProjects">[];
    options: DeletionRequestOptions;
  },
): Promise<RepositoryDeletionPlan> {
  const convex = buildConvexPlan(args);
  const cloudflare = await buildCloudflarePlan(ctx, args);
  const githubRepositoryFullName = `${args.githubOwnerLogin}/${args.repository.githubRepositoryName}`;

  switch (args.repository.state) {
    case "connected": {
      if (args.repository.githubMode === "connect_existing_repository") {
        if (args.options.removeGithubRepo) {
          throw new Error("Existing repository removal cannot remove the GitHub repository.");
        }
        return {
          convex,
          cloudflare,
          target: {
            kind: "existing_repository",
            githubRepositoryDatabaseId: args.repository.githubRepositoryDatabaseId,
            githubOwnerLogin: args.githubOwnerLogin,
            githubRepositoryName: args.repository.githubRepositoryName,
            githubRepositoryFullName,
          },
          githubRepository: {
            action: "skip",
            reason: "not_requested",
          },
        };
      }

      return {
        convex,
        cloudflare,
        target: {
          kind: "samebase_managed_repository",
          githubRepositoryDatabaseId: args.repository.githubRepositoryDatabaseId,
          githubOwnerLogin: args.githubOwnerLogin,
          githubRepositoryName: args.repository.githubRepositoryName,
          githubRepositoryFullName,
        },
        githubRepository: args.options.removeGithubRepo
          ? {
              action: "delete_repository",
              githubRepositoryDatabaseId: args.repository.githubRepositoryDatabaseId,
              githubOwnerLogin: args.githubOwnerLogin,
              githubRepositoryName: args.repository.githubRepositoryName,
            }
          : {
              action: "skip",
              reason: "not_requested",
            },
      };
    }
    case "failed": {
      if (args.options.removeGithubRepo) {
        throw new Error(
          "Failed repository setup has no confirmed GitHub repository identity to delete.",
        );
      }
      return {
        convex,
        cloudflare,
        target: {
          kind: "failed_repository_setup",
          githubMode: args.repository.githubMode,
          githubOwnerLogin: args.githubOwnerLogin,
          githubRepositoryName: args.repository.githubRepositoryName,
          githubRepositoryFullName,
        },
        githubRepository: {
          action: "skip",
          reason: "not_requested",
        },
      };
    }
    default: {
      args.repository satisfies never;
      throw new Error("Repository is not ready to be removed from Samebase yet.");
    }
  }
}

async function appendDeletionEvent(
  ctx: MutationCtx,
  args: {
    run: Doc<"workflow_repositoryDeletion_runs">;
    step: RepositoryDeletionStep;
    level: RepositoryDeletionEventLevel;
    message: string;
    createdAt: number;
  },
): Promise<void> {
  await ctx.runMutation(internal.repository.deletion.events.append, {
    organizationId: args.run.organizationId,
    userId: args.run.userId,
    repositoryId: args.run.repositoryId,
    githubRepositoryFullName: args.run.githubRepositoryFullName,
    runId: args.run._id,
    step: args.step,
    level: args.level,
    message: args.message,
    createdAt: args.createdAt,
  });
}

export const getById = internalQuery({
  args: {
    runId: id("workflow_repositoryDeletion_runs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

export const createInitialRun = internalMutation({
  args: {
    userId: id("users"),
    repositoryId: id("repositories"),
    options: deletionRequestOptions,
  },
  returns: object({
    deletionRunId: id("workflow_repositoryDeletion_runs"),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || readActiveUser(user) === null) {
      throw new Error("Account deletion is in progress.");
    }
    const repository = await requireRepositoryForUser(ctx.db, args);
    await assertRepositoryIsQuiescentForDeletion(ctx, repository);
    if (repository.state === "not_connected" || repository.state === "provisioning") {
      throw new Error("Repository is not ready to be removed from Samebase yet.");
    }

    const [convexProjects, organization] = await Promise.all([
      listRepositoryConvexProjects(ctx, args.repositoryId),
      requireRepositoryOrganization(ctx.db, repository),
    ]);
    const plan = await buildDeletionPlan(ctx, {
      repository,
      githubOwnerLogin: organization.githubOwnerLogin,
      convexProjects,
      options: args.options,
    });
    const now = Date.now();
    const deletionRunId = await ctx.db.insert("workflow_repositoryDeletion_runs", {
      organizationId: repository.organizationId,
      userId: args.userId,
      repositoryId: args.repositoryId,
      githubRepositoryFullName: plan.target.githubRepositoryFullName,
      attempt: { kind: "initial" },
      state: "queued",
      workflow: { state: "not_started" },
      currentStep: "initialize_deletion",
      snapshot: {
        state: "retained_for_retry",
        plan,
      },
      createdAt: now,
      updatedAt: now,
    });

    const run = await ctx.db.get(deletionRunId);
    if (!run) {
      throw new Error("Deletion run was not created.");
    }
    await appendDeletionEvent(ctx, {
      run,
      step: "initialize_deletion",
      level: "info",
      message: "Queued removal from Samebase.",
      createdAt: now,
    });
    await ctx.db.patch(args.repositoryId, {
      deletion: {
        state: "deleting",
        runId: deletionRunId,
        requestedAt: now,
      },
    });
    // The repository stops being live here, and a removal never returns it to live.
    if (isConnectedRepository(repository)) {
      await startTenantSuspensionSync(ctx, repository.githubRepositoryDatabaseId);
    }

    return { deletionRunId };
  },
});

export const createRetryRun = internalMutation({
  args: {
    userId: id("users"),
    failedRunId: id("workflow_repositoryDeletion_runs"),
  },
  returns: object({
    deletionRunId: id("workflow_repositoryDeletion_runs"),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || readActiveUser(user) === null) {
      throw new Error("Account deletion is in progress.");
    }
    const failedRun = await ctx.db.get(args.failedRunId);
    if (!failedRun) {
      throw new Error("Deletion run not found.");
    }
    if (failedRun.state !== "failed") {
      throw new Error("Only failed repository deletion runs can be retried.");
    }

    const repository = await requireRepositoryForUser(ctx.db, {
      userId: args.userId,
      repositoryId: failedRun.repositoryId,
    });
    if (repository.organizationId !== failedRun.organizationId) {
      throw new Error("Deletion run does not match repository organization.");
    }
    const deletion = repository.deletion;
    if (deletion.state !== "delete_failed" || deletion.runId !== args.failedRunId) {
      throw new Error("Repository is not waiting for deletion retry.");
    }

    const retainedSnapshot = readRetainedSnapshot(failedRun);
    const now = Date.now();
    const deletionRunId = await ctx.db.insert("workflow_repositoryDeletion_runs", {
      organizationId: repository.organizationId,
      userId: args.userId,
      repositoryId: failedRun.repositoryId,
      githubRepositoryFullName: failedRun.githubRepositoryFullName,
      attempt: {
        kind: "retry",
        retryOf: args.failedRunId,
      },
      state: "queued",
      workflow: { state: "not_started" },
      currentStep: "initialize_deletion",
      snapshot: {
        state: "retained_for_retry",
        plan: retainedSnapshot.plan,
      },
      createdAt: now,
      updatedAt: now,
    });
    const run = await ctx.db.get(deletionRunId);
    if (!run) {
      throw new Error("Deletion retry run was not created.");
    }
    await appendDeletionEvent(ctx, {
      run,
      step: "initialize_deletion",
      level: "info",
      message: "Queued removal retry.",
      createdAt: now,
    });
    await ctx.db.patch(repository._id, {
      deletion: {
        state: "deleting",
        runId: deletionRunId,
        requestedAt: now,
      },
    });

    return { deletionRunId };
  },
});

export const markWorkflowStarted = internalMutation({
  args: {
    runId: id("workflow_repositoryDeletion_runs"),
    workflowId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Deletion run not found.");
    }
    if (run.state === "succeeded" || run.state === "failed") {
      return null;
    }
    await requireActiveRepositoryDeletionContinuation(ctx, { runId: args.runId });

    await ctx.db.patch(args.runId, {
      state: "running",
      workflow: {
        state: "started",
        workflowId: args.workflowId,
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const appendRunEvent = internalMutation({
  args: {
    runId: id("workflow_repositoryDeletion_runs"),
    step: vRepositoryDeletionStep,
    level: vRepositoryDeletionEventLevel,
    message: string(),
    state: deletionRunEventState,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Deletion run not found.");
    }
    if (run.state === "succeeded" || run.state === "failed") {
      return null;
    }
    if (args.state === "running" && run.workflow.state !== "started") {
      throw new Error("Deletion workflow has not started.");
    }
    const now = Date.now();
    await appendDeletionEvent(ctx, {
      run,
      step: args.step,
      level: args.level,
      message: args.message,
      createdAt: now,
    });
    if (args.state === "unchanged") {
      await ctx.db.patch(args.runId, {
        currentStep: args.step,
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.patch(args.runId, {
      state: "running",
      currentStep: args.step,
      updatedAt: now,
    });
    return null;
  },
});

export const claimWorkflowRun = internalMutation({
  args: {
    runId: id("workflow_repositoryDeletion_runs"),
    repositoryId: id("repositories"),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const authority = await requireActiveRepositoryDeletionContinuation(ctx, {
      runId: args.runId,
    });
    const { run } = authority;
    if (run.userId !== args.userId || run.repositoryId !== args.repositoryId) {
      throw new Error("Deletion run does not match repository.");
    }

    const now = Date.now();
    await appendDeletionEvent(ctx, {
      run,
      step: "lock_repository",
      level: "info",
      message: "Blocked new repository work.",
      createdAt: now,
    });
    await ctx.db.patch(args.runId, {
      state: "running",
      currentStep: "lock_repository",
      updatedAt: now,
    });
    return null;
  },
});

export const markWorkflowFailed = internalMutation({
  args: {
    runId: id("workflow_repositoryDeletion_runs"),
    message: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.state === "failed") {
      return null;
    }
    if (run.state === "succeeded") {
      return null;
    }
    await requireActiveRepositoryDeletionRun(ctx.db, { runId: args.runId });
    const now = Date.now();
    await appendDeletionEvent(ctx, {
      run,
      step: run.currentStep,
      level: "error",
      message: args.message,
      createdAt: now,
    });
    await ctx.db.patch(args.runId, {
      state: "failed",
      lastError: args.message,
      completedAt: now,
      updatedAt: now,
    });

    const repository = await ctx.db.get(run.repositoryId);
    if (!repository) {
      return null;
    }
    const deletion = repository.deletion;
    if (deletion.state === "deleting" && deletion.runId === args.runId) {
      await ctx.db.patch(repository._id, {
        deletion: {
          state: "delete_failed",
          runId: args.runId,
          failedAt: now,
        },
      });
    }
    return null;
  },
});

export const finishWorkflowRun = internalMutation({
  args: {
    runId: id("workflow_repositoryDeletion_runs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.state === "succeeded") {
      return null;
    }
    if (run.state === "failed") {
      throw new Error("Failed deletion run cannot be marked succeeded.");
    }
    if (run.workflow.state !== "started") {
      throw new Error("Deletion workflow has not started.");
    }
    await requireActiveRepositoryDeletionRun(ctx.db, { runId: args.runId });
    const now = Date.now();
    await appendDeletionEvent(ctx, {
      run,
      step: "finish",
      level: "info",
      message: "Removed from Samebase.",
      createdAt: now,
    });
    await ctx.db.patch(args.runId, {
      state: "succeeded",
      currentStep: "finish",
      snapshot: {
        state: "scrubbed_after_success",
      },
      completedAt: now,
      updatedAt: now,
    });

    return null;
  },
});

export function readRetainedSnapshot(
  run: Doc<"workflow_repositoryDeletion_runs">,
): RepositoryDeletionRetainedSnapshot {
  if (run.snapshot.state !== "retained_for_retry") {
    throw new Error("Deletion retry snapshot is not available.");
  }
  return run.snapshot;
}
