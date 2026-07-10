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
import { CODESPACES_ENABLED } from "../../../shared/featureFlags";
import { assertVaultCodespacesSafeForLocalCleanup } from "./cleanup";

const { boolean, id, literal, object, string, union } = v;

const deletionRequestOptions = object({
  removeCodespaces: boolean(),
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

async function hasProviderConnection(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    kind: ProviderKind;
  },
): Promise<boolean> {
  const connection = await ctx.db
    .query("providerConnections")
    .withIndex("by_user_kind", (q) => q.eq("userId", args.userId).eq("kind", args.kind))
    .unique();
  return connection?.kind === args.kind;
}

async function requireProviderConnection(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    kind: ProviderKind;
  },
): Promise<void> {
  if (await hasProviderConnection(ctx, args)) {
    return;
  }
  throw new Error(providerConnectionMessage(args.kind));
}

async function listVaultConvexDeployments(
  ctx: MutationCtx,
  vaultId: Id<"vaults">,
): Promise<Doc<"vaultConvexDeployments">[]> {
  return await ctx.db
    .query("vaultConvexDeployments")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .collect();
}

async function listCreatedConvexProjectIds(
  ctx: MutationCtx,
  vaultId: Id<"vaults">,
): Promise<string[]> {
  const runs = await ctx.db
    .query("appProvisioningRuns")
    .withIndex("by_vault_and_updated_at", (q) => q.eq("vaultId", vaultId))
    .collect();
  const projectIds = new Set<string>();
  for (const run of runs) {
    if (run.trigger === "connect_convex_deployment" && run.createdConvexProject) {
      projectIds.add(run.createdConvexProject.projectId);
    }
  }
  return [...projectIds];
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

async function buildCodespacesPlan(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    options: DeletionRequestOptions;
  },
): Promise<VaultDeletionPlan["codespaces"]> {
  if (!args.options.removeCodespaces) {
    return {
      action: "skip",
      reason: "not_requested",
    };
  }

  if (!CODESPACES_ENABLED) {
    return {
      action: "skip",
      reason: "feature_disabled",
    };
  }

  await requireProviderConnection(ctx, {
    userId: args.userId,
    kind: "github",
  });

  return {
    action: "delete_connected_codespaces",
  };
}

function buildConvexProjectDeletionPlan(projectIds: string[]): VaultDeletionPlan["convex"] | null {
  const uniqueProjectIds = [...new Set(projectIds)];
  const [projectId, secondProjectId] = uniqueProjectIds;
  if (!projectId) {
    return null;
  }
  if (!secondProjectId) {
    return { action: "delete_project", projectId };
  }
  return { action: "delete_projects", projectIds: uniqueProjectIds };
}

async function buildConvexPlan(
  ctx: MutationCtx,
  args: {
    vault: Doc<"vaults">;
    convexDeployments: Doc<"vaultConvexDeployments">[];
    options: DeletionRequestOptions;
  },
): Promise<VaultDeletionPlan["convex"]> {
  const { vault, convexDeployments, options } = args;
  if (!options.removeConvexProvision) {
    return { action: "skip", reason: "not_requested" };
  }

  const createdProjectIds = isConnectedVault(vault)
    ? await listCreatedConvexProjectIds(ctx, vault._id)
    : [];
  if (!isConnectedVault(vault)) {
    return { action: "skip", reason: "not_recorded" };
  }

  for (const deployment of convexDeployments) {
    if (deployment.origin === "provisioned") {
      createdProjectIds.push(deployment.projectId);
    }
  }

  const projectPlan = buildConvexProjectDeletionPlan(createdProjectIds);
  if (projectPlan) {
    await requireProviderConnection(ctx, {
      userId: vault.userId,
      kind: "convex",
    });
    return projectPlan;
  }

  if (convexDeployments.length > 0) {
    return { action: "skip", reason: "not_managed" };
  }

  return { action: "skip", reason: "not_recorded" };
}

async function buildCloudflarePlan(
  ctx: MutationCtx,
  args: {
    vault: Doc<"vaults">;
    options: DeletionRequestOptions;
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
  const provisionedWorkers = workers
    .filter((worker) => worker.origin === "provisioned")
    .sort(
      (left, right) =>
        left.appRoot.localeCompare(right.appRoot) ||
        left.workerName.localeCompare(right.workerName) ||
        left.accountId.localeCompare(right.accountId),
    );
  if (provisionedWorkers.length === 0) {
    return { action: "skip", reason: "not_recorded" };
  }

  await requireProviderConnection(ctx, {
    userId: vault.userId,
    kind: "cloudflare",
  });
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
    convexDeployments: Doc<"vaultConvexDeployments">[];
    options: DeletionRequestOptions;
  },
): Promise<VaultDeletionPlan> {
  const codespaces = await buildCodespacesPlan(ctx, {
    userId: args.vault.userId,
    options: args.options,
  });
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
          codespaces,
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
          userId: args.vault.userId,
          kind: "github",
        });
      }

      return {
        codespaces,
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
        codespaces,
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

async function assertPlanProviderConnections(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    plan: VaultDeletionPlan;
  },
): Promise<void> {
  if (
    args.plan.codespaces.action === "delete_connected_codespaces" ||
    args.plan.githubRepository.action === "delete_repository"
  ) {
    await requireProviderConnection(ctx, {
      userId: args.userId,
      kind: "github",
    });
  }

  if (args.plan.convex.action !== "skip") {
    await requireProviderConnection(ctx, {
      userId: args.userId,
      kind: "convex",
    });
  }

  if (
    args.plan.cloudflare.action === "delete_worker" ||
    args.plan.cloudflare.action === "delete_workers"
  ) {
    await requireProviderConnection(ctx, {
      userId: args.userId,
      kind: "cloudflare",
    });
  }
}

async function appendDeletionEvent(
  ctx: MutationCtx,
  args: {
    run: Doc<"vaultDeletionRuns">;
    step: VaultDeletionStep;
    level: VaultDeletionEventLevel;
    message: string;
    createdAt: number;
  },
): Promise<void> {
  await ctx.runMutation(internal.vault.deletion.events.append, {
    userId: args.run.userId,
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
    runId: id("vaultDeletionRuns"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

export const createInitialRun = internalMutation({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
    options: deletionRequestOptions,
  },
  returns: object({
    deletionRunId: id("vaultDeletionRuns"),
  }),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== args.userId) {
      throw new Error("Vault not found");
    }
    await assertVaultIsQuiescentForDeletion(ctx, vault);
    if (vault.state === "not_connected" || vault.state === "provisioning") {
      throw new Error("Vault is not ready to delete yet.");
    }
    if (!CODESPACES_ENABLED) {
      await assertVaultCodespacesSafeForLocalCleanup(ctx, vault);
    }

    const convexDeployments = await listVaultConvexDeployments(ctx, args.vaultId);
    const plan = await buildDeletionPlan(ctx, {
      vault,
      convexDeployments,
      options: args.options,
    });
    const now = Date.now();
    const deletionRunId = await ctx.db.insert("vaultDeletionRuns", {
      userId: args.userId,
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
    failedRunId: id("vaultDeletionRuns"),
  },
  returns: object({
    deletionRunId: id("vaultDeletionRuns"),
  }),
  handler: async (ctx, args) => {
    const failedRun = await ctx.db.get(args.failedRunId);
    if (!failedRun || failedRun.userId !== args.userId) {
      throw new Error("Deletion run not found.");
    }
    if (failedRun.state !== "failed") {
      throw new Error("Only failed vault deletion runs can be retried.");
    }

    const vault = await ctx.db.get(failedRun.vaultId);
    if (!vault || vault.userId !== args.userId) {
      throw new Error("Vault not found");
    }
    const deletion = readVaultDeletionState(vault);
    if (deletion.state !== "delete_failed" || deletion.runId !== args.failedRunId) {
      throw new Error("Vault is not waiting for deletion retry.");
    }
    if (!CODESPACES_ENABLED) {
      await assertVaultCodespacesSafeForLocalCleanup(ctx, vault);
    }

    const retainedSnapshot = readRetainedSnapshot(failedRun);
    await assertPlanProviderConnections(ctx, {
      userId: args.userId,
      plan: retainedSnapshot.plan,
    });

    const now = Date.now();
    const deletionRunId = await ctx.db.insert("vaultDeletionRuns", {
      userId: args.userId,
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
    runId: id("vaultDeletionRuns"),
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
    runId: id("vaultDeletionRuns"),
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
    runId: id("vaultDeletionRuns"),
    vaultId: id("vaults"),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Deletion run not found.");
    }
    if (run.userId !== args.userId || run.vaultId !== args.vaultId) {
      throw new Error("Deletion run does not match vault.");
    }

    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== args.userId) {
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
    runId: id("vaultDeletionRuns"),
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
    runId: id("vaultDeletionRuns"),
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

export function readRetainedSnapshot(run: Doc<"vaultDeletionRuns">): VaultDeletionRetainedSnapshot {
  if (run.snapshot.state !== "retained_for_retry") {
    throw new Error("Deletion retry snapshot is not available.");
  }
  return run.snapshot;
}
