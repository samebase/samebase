import { v, type Infer } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  vVaultDeletionEventLevel,
  vVaultDeletionStep,
  type VaultDeletionEventLevel,
  type VaultDeletionPlan,
  type VaultDeletionStep,
  type VaultDeletionRetainedSnapshot,
} from "./model";
import { readVaultDeletionEligibility } from "./eligibility";
import { isConnectedVault } from "../state";
import { readVaultDeletionState } from "./state";
import {
  hasOrganizationAccess,
  requireOrganizationAccessContext,
  type OrganizationAccessContext,
} from "../../organizationAccess";

const { boolean, id, literal, object, string, union } = v;

const deletionRequestOptions = object({
  removeGithubRepo: boolean(),
  removeConvexProvision: boolean(),
  removeCloudflareProvision: boolean(),
});
type DeletionRequestOptions = Infer<typeof deletionRequestOptions>;

const deletionRunEventState = union(literal("unchanged"), literal("running"));

type ProviderKind = "github" | "convex" | "cloudflare";

function getRepositoryFullName(vault: Exclude<Doc<"vaults">, { state: "not_connected" }>): string {
  return `${vault.owner}/${vault.name}`;
}

function providerConnectionMessage(kind: ProviderKind): string {
  switch (kind) {
    case "github":
      return "GitHub is not connected.";
    case "convex":
      return "Convex connection is required to remove resources.";
    case "cloudflare":
      return "Cloudflare connection is required to remove resources.";
    default: {
      kind satisfies never;
      return "Provider is not connected.";
    }
  }
}

async function requireProviderConnection(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    providerConnectionId: Id<"providerConnections">;
    kind: ProviderKind;
  },
): Promise<void> {
  const connection = await ctx.db.get(args.providerConnectionId);
  if (
    connection !== null &&
    connection.organizationId === args.organizationId &&
    connection.kind === args.kind &&
    connection.state === "connected"
  ) {
    return;
  }
  throw new Error(providerConnectionMessage(args.kind));
}

async function requireConvexProviderTeam(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    providerConnectionId: Id<"providerConnections">;
    teamId: string;
  },
): Promise<void> {
  const connection = await ctx.db.get(args.providerConnectionId);
  if (
    connection?.kind !== "convex" ||
    connection.organizationId !== args.organizationId ||
    connection.state !== "connected"
  ) {
    throw new Error(providerConnectionMessage("convex"));
  }
  if (connection.teamId !== args.teamId) {
    throw new Error("Connect the Convex team that owns these projects before removing them.");
  }
}

async function listVaultConvexProjects(
  ctx: MutationCtx,
  vaultId: Id<"vaults">,
): Promise<Doc<"vaultConvexProjects">[]> {
  return await ctx.db
    .query("vaultConvexProjects")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .collect();
}

async function assertVaultIsQuiescentForDeletion(
  ctx: MutationCtx,
  vault: Doc<"vaults">,
): Promise<void> {
  const eligibility = await readVaultDeletionEligibility(ctx, vault);
  if (eligibility.state === "blocked") {
    throw new Error(eligibility.reason);
  }
}

function buildConvexProjectDeletionPlan(
  projects: Array<{ teamId: string; projectId: string }>,
): Exclude<VaultDeletionPlan["convex"], { action: "skip" }> | null {
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
  const project = uniqueProjects[0];
  if (uniqueProjects.some((candidate) => candidate.teamId !== project.teamId)) {
    throw new Error("Managed Convex projects span more than one team.");
  }
  if (uniqueProjects.length === 1) {
    return { action: "delete_project", teamId: project.teamId, projectId: project.projectId };
  }
  return {
    action: "delete_projects",
    teamId: project.teamId,
    projectIds: uniqueProjects.map((candidate) => candidate.projectId),
  };
}

async function buildConvexPlan(
  ctx: MutationCtx,
  args: {
    vault: Doc<"vaults">;
    convexProjects: Doc<"vaultConvexProjects">[];
    options: DeletionRequestOptions;
    ownership: OrganizationAccessContext;
  },
): Promise<VaultDeletionPlan["convex"]> {
  const { vault, convexProjects, options } = args;
  if (!options.removeConvexProvision) {
    return { action: "skip", reason: "not_requested" };
  }

  if (!isConnectedVault(vault)) {
    return { action: "skip", reason: "not_recorded" };
  }
  const createdProjects: Array<{ teamId: string; projectId: string }> = [];

  for (const project of convexProjects) {
    if (!hasOrganizationAccess(args.ownership, project)) {
      throw new Error("Convex project attachment not found.");
    }
    if (project.origin === "provisioned") {
      createdProjects.push({ teamId: project.teamId, projectId: project.projectId });
    }
  }

  const projectPlan = buildConvexProjectDeletionPlan(createdProjects);
  if (projectPlan) {
    for (const project of convexProjects) {
      if (project.origin === "provisioned") {
        await requireConvexProviderTeam(ctx, {
          organizationId: vault.organizationId,
          providerConnectionId: project.providerConnectionId,
          teamId: project.teamId,
        });
      }
    }
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
    vault: Doc<"vaults">;
    options: DeletionRequestOptions;
    ownership: OrganizationAccessContext;
  },
): Promise<VaultDeletionPlan["cloudflare"]> {
  const { vault, options } = args;
  if (!options.removeCloudflareProvision) {
    return { action: "skip", reason: "not_requested" };
  }
  if (!isConnectedVault(vault)) {
    return { action: "skip", reason: "not_recorded" };
  }

  const workers = await ctx.db
    .query("vaultCloudflareWorkers")
    .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
    .collect();
  if (workers.some((worker) => !hasOrganizationAccess(args.ownership, worker))) {
    throw new Error("Cloudflare Worker attachment not found.");
  }
  const provisionedWorkers = workers
    .filter((worker) => worker.origin === "provisioned")
    .sort(
      (left, right) =>
        left.workerName.localeCompare(right.workerName) ||
        left.accountId.localeCompare(right.accountId) ||
        left.workerTag.localeCompare(right.workerTag),
    );
  if (provisionedWorkers.length === 0) {
    return { action: "skip", reason: "not_recorded" };
  }

  for (const worker of provisionedWorkers) {
    await requireProviderConnection(ctx, {
      organizationId: vault.organizationId,
      providerConnectionId: worker.providerConnectionId,
      kind: "cloudflare",
    });
  }
  if (provisionedWorkers.length === 1) {
    const worker = provisionedWorkers[0];
    return {
      action: "delete_worker",
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
    };
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
    vault: Exclude<Doc<"vaults">, { state: "not_connected" | "provisioning" }>;
    convexProjects: Doc<"vaultConvexProjects">[];
    options: DeletionRequestOptions;
    ownership: OrganizationAccessContext;
  },
): Promise<VaultDeletionPlan> {
  const convex = await buildConvexPlan(ctx, args);
  const cloudflare = await buildCloudflarePlan(ctx, args);
  const repositoryFullName = getRepositoryFullName(args.vault);

  switch (args.vault.state) {
    case "connected": {
      if (args.vault.githubMode === "connect_existing_repository") {
        if (args.options.removeGithubRepo) {
          throw new Error(
            "Existing repository vault deletion cannot remove the GitHub repository.",
          );
        }
        return {
          convex,
          cloudflare,
          target: {
            kind: "existing_repository",
            ghRepoId: args.vault.ghRepoId,
            owner: args.vault.owner,
            name: args.vault.name,
            repositoryFullName,
          },
          githubRepository: {
            action: "skip",
            reason: "not_requested",
          },
        };
      }

      if (args.options.removeGithubRepo) {
        await requireProviderConnection(ctx, {
          organizationId: args.vault.organizationId,
          providerConnectionId: args.vault.githubProviderConnectionId,
          kind: "github",
        });
      }

      return {
        convex,
        cloudflare,
        target: {
          kind: "samebase_managed_repository",
          ghRepoId: args.vault.ghRepoId,
          owner: args.vault.owner,
          name: args.vault.name,
          repositoryFullName,
        },
        githubRepository: args.options.removeGithubRepo
          ? {
              action: "delete_repository",
              ghRepoId: args.vault.ghRepoId,
              owner: args.vault.owner,
              name: args.vault.name,
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
          githubMode: args.vault.githubMode,
          owner: args.vault.owner,
          name: args.vault.name,
          repositoryFullName,
        },
        githubRepository: {
          action: "skip",
          reason: "not_requested",
        },
      };
    }
    default: {
      args.vault satisfies never;
      throw new Error("Vault is not ready to delete yet.");
    }
  }
}

async function appendDeletionEvent(
  ctx: MutationCtx,
  args: {
    run: Doc<"workflow_vaultDeletion_runs">;
    step: VaultDeletionStep;
    level: VaultDeletionEventLevel;
    message: string;
    createdAt: number;
  },
): Promise<void> {
  await ctx.runMutation(internal.vault.deletion.events.append, {
    vaultId: args.run.vaultId,
    repositoryFullName: args.run.repositoryFullName,
    runId: args.run._id,
    step: args.step,
    level: args.level,
    message: args.message,
    createdAt: args.createdAt,
  });
}

export const getById = internalQuery({
  args: {
    runId: id("workflow_vaultDeletion_runs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

export const getProviderDeletionContext = internalQuery({
  args: {
    runId: id("workflow_vaultDeletion_runs"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null) {
      return null;
    }
    const vault = await ctx.db.get(run.vaultId);
    if (!isConnectedVault(vault)) {
      return null;
    }
    const [workers, projects] = await Promise.all([
      ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
        .collect(),
      ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
        .collect(),
    ]);
    return {
      organizationId: vault.organizationId,
      githubProviderConnectionId: vault.githubProviderConnectionId,
      workers,
      projects,
    };
  },
});

export const createInitialRun = internalMutation({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
    options: deletionRequestOptions,
  },
  returns: object({
    deletionRunId: id("workflow_vaultDeletion_runs"),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.accountDeletion) {
      throw new Error("Account deletion is in progress.");
    }
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      throw new Error("Vault not found");
    }
    const ownership = await requireOrganizationAccessContext(ctx.db, args.userId);
    if (!hasOrganizationAccess(ownership, vault)) {
      throw new Error("Vault not found");
    }
    await assertVaultIsQuiescentForDeletion(ctx, vault);
    if (vault.state === "not_connected" || vault.state === "provisioning") {
      throw new Error("Vault is not ready to delete yet.");
    }

    const convexProjects = await listVaultConvexProjects(ctx, args.vaultId);
    const plan = await buildDeletionPlan(ctx, {
      vault,
      convexProjects,
      options: args.options,
      ownership,
    });
    const now = Date.now();
    const deletionRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
      requestedByUserId: args.userId,
      vaultId: args.vaultId,
      repositoryFullName: plan.target.repositoryFullName,
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
      message: "Queued vault deletion.",
      createdAt: now,
    });
    await ctx.db.patch(args.vaultId, {
      deletion: {
        state: "deleting",
        runId: deletionRunId,
        requestedAt: now,
      },
    });

    return { deletionRunId };
  },
});

export const createRetryRun = internalMutation({
  args: {
    userId: id("users"),
    failedRunId: id("workflow_vaultDeletion_runs"),
  },
  returns: object({
    deletionRunId: id("workflow_vaultDeletion_runs"),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.accountDeletion) {
      throw new Error("Account deletion is in progress.");
    }
    const failedRun = await ctx.db.get(args.failedRunId);
    if (!failedRun) {
      throw new Error("Deletion run not found.");
    }
    if (failedRun.state !== "failed") {
      throw new Error("Only failed vault deletion runs can be retried.");
    }

    const vault = await ctx.db.get(failedRun.vaultId);
    if (!vault) {
      throw new Error("Vault not found");
    }
    const ownership = await requireOrganizationAccessContext(ctx.db, args.userId);
    if (!hasOrganizationAccess(ownership, vault)) {
      throw new Error("Vault not found");
    }
    const deletion = readVaultDeletionState(vault);
    if (deletion.state !== "delete_failed" || deletion.runId !== args.failedRunId) {
      throw new Error("Vault is not waiting for deletion retry.");
    }

    const retainedSnapshot = readRetainedSnapshot(failedRun);

    const now = Date.now();
    const deletionRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
      requestedByUserId: args.userId,
      vaultId: failedRun.vaultId,
      repositoryFullName: failedRun.repositoryFullName,
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
      message: "Queued vault deletion retry.",
      createdAt: now,
    });
    await ctx.db.patch(vault._id, {
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
    runId: id("workflow_vaultDeletion_runs"),
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
    runId: id("workflow_vaultDeletion_runs"),
    step: vVaultDeletionStep,
    level: vVaultDeletionEventLevel,
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
    runId: id("workflow_vaultDeletion_runs"),
    vaultId: id("vaults"),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Deletion run not found.");
    }
    if (run.requestedByUserId !== args.userId || run.vaultId !== args.vaultId) {
      throw new Error("Deletion run does not match vault.");
    }

    const vault = await ctx.db.get(args.vaultId);
    const ownership = await requireOrganizationAccessContext(ctx.db, args.userId);
    if (!vault || !hasOrganizationAccess(ownership, vault)) {
      throw new Error("Vault not found");
    }
    const deletion = readVaultDeletionState(vault);
    if (deletion.state !== "deleting" || deletion.runId !== args.runId) {
      throw new Error("Vault deletion gate does not match run.");
    }

    const now = Date.now();
    await appendDeletionEvent(ctx, {
      run,
      step: "lock_vault",
      level: "info",
      message: "Blocked new vault work.",
      createdAt: now,
    });
    await ctx.db.patch(args.runId, {
      state: "running",
      currentStep: "lock_vault",
      updatedAt: now,
    });
    return null;
  },
});

export const markWorkflowFailed = internalMutation({
  args: {
    runId: id("workflow_vaultDeletion_runs"),
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

    const now = Date.now();
    await ctx.db.patch(args.runId, {
      state: "failed",
      lastError: args.message,
      completedAt: now,
      updatedAt: now,
    });
    const failedRun = await ctx.db.get(args.runId);
    if (!failedRun) {
      throw new Error("Deletion run not found.");
    }
    await appendDeletionEvent(ctx, {
      run: failedRun,
      step: run.currentStep,
      level: "error",
      message: args.message,
      createdAt: now,
    });

    const vault = await ctx.db.get(run.vaultId);
    if (!vault) {
      return null;
    }
    const deletion = readVaultDeletionState(vault);
    if (deletion.state === "deleting" && deletion.runId === args.runId) {
      await ctx.db.patch(vault._id, {
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
    runId: id("workflow_vaultDeletion_runs"),
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

    const now = Date.now();
    await ctx.db.patch(args.runId, {
      state: "succeeded",
      currentStep: "finish",
      snapshot: {
        state: "scrubbed_after_success",
      },
      completedAt: now,
      updatedAt: now,
    });
    const finishedRun = await ctx.db.get(args.runId);
    if (!finishedRun) {
      throw new Error("Deletion run not found.");
    }
    await appendDeletionEvent(ctx, {
      run: finishedRun,
      step: "finish",
      level: "info",
      message: "Deleted vault.",
      createdAt: now,
    });

    return null;
  },
});

export function readRetainedSnapshot(
  run: Doc<"workflow_vaultDeletion_runs">,
): VaultDeletionRetainedSnapshot {
  if (run.snapshot.state !== "retained_for_retry") {
    throw new Error("Deletion retry snapshot is not available.");
  }
  return run.snapshot;
}
