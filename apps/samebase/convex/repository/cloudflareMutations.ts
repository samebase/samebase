import { v, type Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import {
  requireBillingResourceCapacityForAuthority,
  type BillingResourceAuthority,
} from "../billingResourceQuotas";
import { requireRepositoryForUser, requireRepositoryOrganization } from "../organizationAccess";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { vRepositoryProviderResourceOrigin } from "./model";
import {
  requireManualProviderWriteContinuation,
  requireUserRepositoryInfrastructureIdle,
  recordManagedProviderWrite,
} from "./infrastructureOperation";
import { isLiveConnectedRepository } from "./state";
import {
  requireActiveRepositoryProvisioningAuthority,
  requireActiveRepositoryProvisioningContinuation,
} from "../repositoryWorkflowAuthority";
import { normalizeRepositoryRootDirectory } from "../../shared/repositoryRootDirectory";

const { array, id, literal, object, string, union } = v;

const workerConfigurationContextFields = {
  organizationId: id("organizations"),
  githubRepositoryDatabaseId: string(),
  githubOwnerLogin: string(),
  githubRepositoryName: string(),
  defaultBranch: string(),
  accountId: string(),
  workerName: string(),
  workerTag: string(),
  rootDirectory: string(),
};
export const vWorkerConfigurationContext = object(workerConfigurationContextFields);
export type WorkerConfigurationContext = Infer<typeof vWorkerConfigurationContext>;

export const vManagedWorkerConfigurationContext = object({
  ...workerConfigurationContextFields,
  buildTokenUuid: string(),
});
export type ManagedWorkerConfigurationContext = Infer<typeof vManagedWorkerConfigurationContext>;

export const vWorkerConvexProjectConfigurationContext = object({
  ...workerConfigurationContextFields,
  convexProject: object({
    convexProjectId: id("repositoryConvexProjects"),
    teamId: string(),
    projectId: string(),
  }),
});
export type WorkerConvexProjectConfigurationContext = Infer<
  typeof vWorkerConvexProjectConfigurationContext
>;

export const vManagedWorkerConvexProjectConfigurationContext = object({
  ...workerConfigurationContextFields,
  convexProject: object({
    convexProjectId: id("repositoryConvexProjects"),
    teamId: string(),
    projectId: string(),
  }),
});
export type ManagedWorkerConvexProjectConfigurationContext = Infer<
  typeof vManagedWorkerConvexProjectConfigurationContext
>;

type WorkerGraphReadCtx = Pick<QueryCtx, "db">;

async function requireConnectedRepository(
  ctx: WorkerGraphReadCtx,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
) {
  const repository = await requireRepositoryForUser(ctx.db, args);
  if (!isLiveConnectedRepository(repository)) {
    throw new Error("Repository not found.");
  }
  return repository;
}

async function requireActiveManagedProvisioning(
  ctx: WorkerGraphReadCtx,
  args: {
    repositoryId: Id<"repositories">;
    userId: Id<"users">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
  },
): Promise<{
  repository: Extract<Doc<"repositories">, { state: "connected" }>;
  plan: Doc<"workflow_repositoryProvisioning_plans">;
}> {
  const authority = await requireActiveRepositoryProvisioningAuthority(ctx.db, args);
  if (!isLiveConnectedRepository(authority.repository)) {
    throw new Error("Repository not found.");
  }
  const [writeLock, plan] = await Promise.all([
    ctx.db
      .query("workflow_repositoryProvisioning_writeLocks")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .unique(),
    ctx.db
      .query("workflow_repositoryProvisioning_plans")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .unique(),
  ]);
  if (authority.run.trigger !== "create" && authority.run.trigger !== "retry") {
    throw new Error("Managed provisioning run does not match repository.");
  }
  if (
    !writeLock ||
    writeLock.owner.kind !== "managed_run" ||
    writeLock.state !== "active" ||
    writeLock.owner.runId !== args.runId
  ) {
    throw new Error("Managed provisioning run no longer holds the write lock.");
  }
  if (!plan) {
    throw new Error("Infrastructure provisioning plan not found for repository.");
  }
  return { repository: authority.repository, plan };
}

async function requireWorker(
  ctx: WorkerGraphReadCtx,
  repository: Extract<Doc<"repositories">, { state: "connected" }>,
  args: {
    repositoryId: Id<"repositories">;
    workerId: Id<"repositoryCloudflareWorkers">;
  },
) {
  const worker = await ctx.db.get(args.workerId);
  if (
    !worker ||
    worker.repositoryId !== args.repositoryId ||
    worker.organizationId !== repository.organizationId ||
    worker.accountId !== repository.cloudflareAccountId
  ) {
    throw new Error("Cloudflare Worker attachment not found.");
  }
  return worker;
}

async function requireConvexProject(
  ctx: WorkerGraphReadCtx,
  repository: Extract<Doc<"repositories">, { state: "connected" }>,
  args: {
    repositoryId: Id<"repositories">;
    userId: Id<"users">;
    convexProjectId: Id<"repositoryConvexProjects">;
  },
) {
  const project = await ctx.db.get(args.convexProjectId);
  if (
    !project ||
    project.repositoryId !== args.repositoryId ||
    project.organizationId !== repository.organizationId ||
    project.teamId !== repository.convexTeamId
  ) {
    throw new Error("Convex project attachment not found.");
  }
  return project;
}

async function readMatchingWorker(
  ctx: WorkerGraphReadCtx,
  args: {
    repositoryId: Id<"repositories">;
    organizationId: Id<"organizations">;
    accountId: string;
    workerName: string;
    workerTag: string;
  },
) {
  const [sameName, sameTag] = await Promise.all([
    ctx.db
      .query("repositoryCloudflareWorkers")
      .withIndex("by_account_and_worker", (q) =>
        q.eq("accountId", args.accountId).eq("workerName", args.workerName),
      )
      .unique(),
    ctx.db
      .query("repositoryCloudflareWorkers")
      .withIndex("by_account_and_worker_tag", (q) =>
        q.eq("accountId", args.accountId).eq("workerTag", args.workerTag),
      )
      .unique(),
  ]);
  if (sameName && sameTag && sameName._id !== sameTag._id) {
    throw new Error("Cloudflare Worker is already attached.");
  }
  const existing = sameName ?? sameTag;
  if (!existing) {
    return null;
  }
  if (
    existing.repositoryId === args.repositoryId &&
    existing.organizationId === args.organizationId &&
    existing.accountId === args.accountId &&
    existing.workerName === args.workerName &&
    existing.workerTag === args.workerTag
  ) {
    return existing;
  }
  throw new Error("Cloudflare Worker is already attached.");
}

async function insertWorker(
  ctx: Pick<MutationCtx, "db">,
  repository: Extract<Doc<"repositories">, { state: "connected" }>,
  args: {
    repositoryId: Id<"repositories">;
    billingAuthority: BillingResourceAuthority;
    accountId: string;
    workerName: string;
    workerTag: string;
    rootDirectory: string;
    origin: "provisioned" | "selected_existing";
  },
): Promise<Id<"repositoryCloudflareWorkers">> {
  if (args.accountId !== repository.cloudflareAccountId) {
    throw new Error("Cloudflare Worker account does not match the repository destination.");
  }
  const rootDirectory = normalizeRepositoryRootDirectory(args.rootDirectory);
  const existing = await readMatchingWorker(ctx, {
    repositoryId: args.repositoryId,
    organizationId: repository.organizationId,
    accountId: args.accountId,
    workerName: args.workerName,
    workerTag: args.workerTag,
  });
  if (existing) {
    if (existing.rootDirectory !== rootDirectory) {
      throw new Error("Cloudflare Worker root directory changed before attachment.");
    }
    if (args.origin === "provisioned" && existing.origin !== "provisioned") {
      await ctx.db.patch(existing._id, { origin: "provisioned" });
    }
    return existing._id;
  }

  await requireBillingResourceCapacityForAuthority(ctx, {
    authority: args.billingAuthority,
  });

  return await ctx.db.insert("repositoryCloudflareWorkers", {
    repositoryId: args.repositoryId,
    organizationId: repository.organizationId,
    accountId: args.accountId,
    workerName: args.workerName,
    workerTag: args.workerTag,
    rootDirectory,
    origin: args.origin,
  });
}

export const attachWorkers = internalMutation({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    workers: array(
      object({
        accountId: string(),
        workerName: string(),
        workerTag: string(),
        rootDirectory: string(),
        origin: vRepositoryProviderResourceOrigin,
      }),
    ),
  },
  returns: array(id("repositoryCloudflareWorkers")),
  handler: async (ctx, args): Promise<Array<Id<"repositoryCloudflareWorkers">>> => {
    const repository = await requireUserRepositoryInfrastructureIdle(ctx, args);
    if (args.workers.some((worker) => worker.accountId !== repository.cloudflareAccountId)) {
      throw new Error("Cloudflare Worker account does not match the repository destination.");
    }

    const workerNames = new Set<string>();
    const workerTags = new Set<string>();
    for (const worker of args.workers) {
      const nameIdentity = `${worker.accountId}\u0000${worker.workerName}`;
      const tagIdentity = `${worker.accountId}\u0000${worker.workerTag}`;
      if (workerNames.has(nameIdentity) || workerTags.has(tagIdentity)) {
        throw new Error("Cloudflare Worker appears more than once in the attachment request.");
      }
      workerNames.add(nameIdentity);
      workerTags.add(tagIdentity);
    }
    const workerAttachmentIds: Array<Id<"repositoryCloudflareWorkers">> = [];
    for (const worker of args.workers) {
      workerAttachmentIds.push(
        await insertWorker(ctx, repository, {
          repositoryId: args.repositoryId,
          billingAuthority: {
            kind: "user",
            organizationId: repository.organizationId,
            userId: args.userId,
          },
          ...worker,
        }),
      );
    }
    return workerAttachmentIds;
  },
});

/** Removes the attachment record only; the Worker keeps running in Cloudflare. */
export async function detachWorkerForUser(
  ctx: MutationCtx,
  args: {
    repositoryId: Id<"repositories">;
    userId: Id<"users">;
    workerId: Id<"repositoryCloudflareWorkers">;
  },
): Promise<void> {
  const repository = await requireUserRepositoryInfrastructureIdle(ctx, args);
  const worker = await requireWorker(ctx, repository, args);
  await ctx.db.delete(worker._id);
}

export const updateWorkerName = internalMutation({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    workerId: id("repositoryCloudflareWorkers"),
    accountId: string(),
    workerTag: string(),
    expectedStoredWorkerName: string(),
    workerName: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const repository = await requireUserRepositoryInfrastructureIdle(ctx, args);
    const worker = await requireWorker(ctx, repository, args);
    if (
      worker.accountId !== args.accountId ||
      worker.workerTag !== args.workerTag ||
      worker.workerName !== args.expectedStoredWorkerName
    ) {
      throw new Error("Cloudflare Worker attachment changed before the name update.");
    }

    const workerName = args.workerName.trim();
    if (!workerName) {
      throw new Error("Cloudflare Worker name is required.");
    }
    const occupied = await ctx.db
      .query("repositoryCloudflareWorkers")
      .withIndex("by_account_and_worker", (q) =>
        q.eq("accountId", worker.accountId).eq("workerName", workerName),
      )
      .unique();
    if (occupied && occupied._id !== worker._id) {
      throw new Error("Cloudflare Worker name is already attached.");
    }
    const plan = await ctx.db
      .query("workflow_repositoryProvisioning_plans")
      .withIndex("by_repository", (q) => q.eq("repositoryId", worker.repositoryId))
      .unique();
    if (plan?.cloudflare.state === "created" && plan.cloudflare.workerTag === worker.workerTag) {
      if (plan.cloudflare.workerName !== args.expectedStoredWorkerName) {
        throw new Error("Managed Cloudflare Worker checkpoint changed before the name update.");
      }
      await ctx.db.patch(plan._id, {
        cloudflare: {
          state: "created",
          workerName,
          workerTag: plan.cloudflare.workerTag,
          rootDirectory: plan.cloudflare.rootDirectory,
          buildTokenUuid: plan.cloudflare.buildTokenUuid,
        },
        updatedAt: Date.now(),
      });
    }
    if (worker.workerName !== workerName) {
      await ctx.db.patch(worker._id, { workerName });
    }
    return null;
  },
});

export const updateWorkerRootDirectory = internalMutation({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    workerId: id("repositoryCloudflareWorkers"),
    accountId: string(),
    workerTag: string(),
    expectedStoredRootDirectory: string(),
    rootDirectory: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const repository = await requireUserRepositoryInfrastructureIdle(ctx, args);
    const worker = await requireWorker(ctx, repository, args);
    if (
      worker.accountId !== args.accountId ||
      worker.workerTag !== args.workerTag ||
      worker.rootDirectory !== args.expectedStoredRootDirectory
    ) {
      throw new Error("Cloudflare Worker attachment changed before the root update.");
    }
    const rootDirectory = normalizeRepositoryRootDirectory(args.rootDirectory);
    const plan = await ctx.db
      .query("workflow_repositoryProvisioning_plans")
      .withIndex("by_repository", (q) => q.eq("repositoryId", worker.repositoryId))
      .unique();
    if (plan?.cloudflare.state === "created" && plan.cloudflare.workerTag === worker.workerTag) {
      if (
        plan.cloudflare.rootDirectory !== args.expectedStoredRootDirectory &&
        plan.cloudflare.rootDirectory !== rootDirectory
      ) {
        throw new Error("Managed Cloudflare Worker checkpoint changed before the root update.");
      }
      if (plan.cloudflare.rootDirectory !== rootDirectory) {
        await ctx.db.patch(plan._id, {
          cloudflare: {
            state: "created",
            workerName: plan.cloudflare.workerName,
            workerTag: plan.cloudflare.workerTag,
            rootDirectory,
            buildTokenUuid: plan.cloudflare.buildTokenUuid,
          },
          updatedAt: Date.now(),
        });
      }
    }
    if (worker.rootDirectory !== rootDirectory) {
      await ctx.db.patch(worker._id, { rootDirectory });
    }
    return null;
  },
});

export const readManagedWorkerCreateCheckpoint = internalQuery({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    runId: id("workflow_repositoryProvisioning_runs"),
    accountId: string(),
    workerName: string(),
  },
  returns: union(
    object({ state: literal("planned"), buildTokenUuid: string() }),
    object({ state: literal("creating"), buildTokenUuid: string() }),
    object({
      state: literal("created"),
      workerTag: string(),
      buildTokenUuid: string(),
    }),
  ),
  handler: async (ctx, args) => {
    const { plan, repository } = await requireActiveManagedProvisioning(ctx, args);
    if (
      repository.cloudflareAccountId !== args.accountId ||
      plan.cloudflare.workerName !== args.workerName
    ) {
      throw new Error("Managed Cloudflare Worker does not match the provisioning plan.");
    }
    switch (plan.cloudflare.state) {
      case "planned": {
        const buildTokenUuid = plan.cloudflare.buildTokenUuid;
        if (buildTokenUuid === null) {
          throw new Error("Select a Cloudflare Workers Builds token and retry.");
        }
        return { state: "planned" as const, buildTokenUuid };
      }
      case "creating":
        return {
          state: "creating" as const,
          buildTokenUuid: plan.cloudflare.buildTokenUuid,
        };
      case "created":
        return {
          state: "created" as const,
          workerTag: plan.cloudflare.workerTag,
          buildTokenUuid: plan.cloudflare.buildTokenUuid,
        };
    }
  },
});

export const beginManagedWorkerCreate = internalMutation({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    runId: id("workflow_repositoryProvisioning_runs"),
    accountId: string(),
    workerName: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { plan, repository } = await requireActiveManagedProvisioning(ctx, args);
    if (
      repository.cloudflareAccountId !== args.accountId ||
      plan.cloudflare.workerName !== args.workerName
    ) {
      throw new Error("Managed Cloudflare Worker does not match the provisioning plan.");
    }
    if (plan.cloudflare.state !== "planned") {
      throw new Error("Managed Cloudflare Worker creation already started.");
    }
    const buildTokenUuid = plan.cloudflare.buildTokenUuid;
    if (buildTokenUuid === null) {
      throw new Error("Select a Cloudflare Workers Builds token and retry.");
    }
    await requireActiveRepositoryProvisioningContinuation(ctx, args);
    await ctx.db.patch(plan._id, {
      cloudflare: {
        state: "creating",
        workerName: args.workerName,
        rootDirectory: plan.cloudflare.rootDirectory,
        buildTokenUuid,
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const recordManagedWorkerCreated = internalMutation({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    runId: id("workflow_repositoryProvisioning_runs"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
  },
  returns: id("repositoryCloudflareWorkers"),
  handler: async (ctx, args): Promise<Id<"repositoryCloudflareWorkers">> => {
    const { plan, repository } = await requireActiveManagedProvisioning(ctx, args);
    if (
      repository.cloudflareAccountId !== args.accountId ||
      plan.cloudflare.workerName !== args.workerName
    ) {
      throw new Error("Managed Cloudflare Worker does not match the provisioning plan.");
    }
    await requireActiveRepositoryProvisioningContinuation(ctx, args);
    let workerId: Id<"repositoryCloudflareWorkers">;
    if (plan.cloudflare.state === "created") {
      if (plan.cloudflare.workerTag !== args.workerTag) {
        throw new Error("Managed Cloudflare Worker checkpoint already names another Worker.");
      }
      workerId = await insertWorker(ctx, repository, {
        repositoryId: args.repositoryId,
        billingAuthority: {
          kind: "repository_provisioning",
          runId: args.runId,
          userId: args.userId,
          repositoryId: args.repositoryId,
        },
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        rootDirectory: plan.cloudflare.rootDirectory,
        origin: "provisioned",
      });
    } else {
      if (plan.cloudflare.state !== "creating") {
        throw new Error("Managed Cloudflare Worker creation was not started.");
      }
      await ctx.db.patch(plan._id, {
        cloudflare: {
          state: "created",
          workerName: args.workerName,
          workerTag: args.workerTag,
          rootDirectory: plan.cloudflare.rootDirectory,
          buildTokenUuid: plan.cloudflare.buildTokenUuid,
        },
        updatedAt: Date.now(),
      });
      workerId = await insertWorker(ctx, repository, {
        repositoryId: args.repositoryId,
        billingAuthority: {
          kind: "repository_provisioning",
          runId: args.runId,
          userId: args.userId,
          repositoryId: args.repositoryId,
        },
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        rootDirectory: plan.cloudflare.rootDirectory,
        origin: "provisioned",
      });
    }
    await recordManagedProviderWrite(ctx, {
      repositoryId: args.repositoryId,
      runId: args.runId,
      provider: "cloudflare",
    });
    return workerId;
  },
});

export const recordManualConnectedWorker = internalMutation({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    actionId: string(),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    rootDirectory: string(),
  },
  returns: id("repositoryCloudflareWorkers"),
  handler: async (ctx, args): Promise<Id<"repositoryCloudflareWorkers">> => {
    const repository = await requireManualProviderWriteContinuation(ctx, {
      repositoryId: args.repositoryId,
      actionId: args.actionId,
      userId: args.userId,
    });
    return await insertWorker(ctx, repository, {
      repositoryId: args.repositoryId,
      billingAuthority: {
        kind: "manual_provider_write",
        actionId: args.actionId,
        userId: args.userId,
        repositoryId: args.repositoryId,
      },
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      rootDirectory: normalizeRepositoryRootDirectory(args.rootDirectory),
      origin: "selected_existing",
    });
  },
});

export const recordManualWorkerCreated = internalMutation({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    actionId: string(),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    rootDirectory: string(),
  },
  returns: id("repositoryCloudflareWorkers"),
  handler: async (ctx, args): Promise<Id<"repositoryCloudflareWorkers">> => {
    const repository = await requireManualProviderWriteContinuation(ctx, {
      repositoryId: args.repositoryId,
      actionId: args.actionId,
      userId: args.userId,
    });
    return await insertWorker(ctx, repository, {
      repositoryId: args.repositoryId,
      billingAuthority: {
        kind: "manual_provider_write",
        actionId: args.actionId,
        userId: args.userId,
        repositoryId: args.repositoryId,
      },
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      rootDirectory: normalizeRepositoryRootDirectory(args.rootDirectory),
      origin: "provisioned",
    });
  },
});

export const readWorkerConfigurationContext = internalQuery({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    workerId: id("repositoryCloudflareWorkers"),
  },
  returns: vWorkerConfigurationContext,
  handler: async (ctx, args) => {
    const repository = await requireConnectedRepository(ctx, args);
    const [worker, organization] = await Promise.all([
      requireWorker(ctx, repository, args),
      requireRepositoryOrganization(ctx.db, repository),
    ]);
    return {
      organizationId: repository.organizationId,
      githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
      githubOwnerLogin: organization.githubOwnerLogin,
      githubRepositoryName: repository.githubRepositoryName,
      defaultBranch: repository.defaultBranch,
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
      rootDirectory: worker.rootDirectory,
    };
  },
});

export const readManagedWorkerConfigurationContext = internalQuery({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    runId: id("workflow_repositoryProvisioning_runs"),
    workerId: id("repositoryCloudflareWorkers"),
  },
  returns: vManagedWorkerConfigurationContext,
  handler: async (ctx, args) => {
    const { plan, repository } = await requireActiveManagedProvisioning(ctx, args);
    const [worker, organization] = await Promise.all([
      requireWorker(ctx, repository, args),
      requireRepositoryOrganization(ctx.db, repository),
    ]);
    if (
      plan.cloudflare.state !== "created" ||
      repository.cloudflareAccountId !== worker.accountId ||
      plan.cloudflare.workerName !== worker.workerName ||
      plan.cloudflare.workerTag !== worker.workerTag
    ) {
      throw new Error("Managed Cloudflare Worker does not match the active provisioning run.");
    }
    return {
      organizationId: repository.organizationId,
      githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
      githubOwnerLogin: organization.githubOwnerLogin,
      githubRepositoryName: repository.githubRepositoryName,
      defaultBranch: repository.defaultBranch,
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
      rootDirectory: plan.cloudflare.rootDirectory,
      buildTokenUuid: plan.cloudflare.buildTokenUuid,
    };
  },
});

export const readWorkerConvexProjectConfigurationContext = internalQuery({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    workerId: id("repositoryCloudflareWorkers"),
    convexProjectId: id("repositoryConvexProjects"),
  },
  returns: vWorkerConvexProjectConfigurationContext,
  handler: async (ctx, args) => {
    const repository = await requireConnectedRepository(ctx, args);
    const [worker, project, organization] = await Promise.all([
      requireWorker(ctx, repository, args),
      requireConvexProject(ctx, repository, args),
      requireRepositoryOrganization(ctx.db, repository),
    ]);
    return {
      organizationId: repository.organizationId,
      githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
      githubOwnerLogin: organization.githubOwnerLogin,
      githubRepositoryName: repository.githubRepositoryName,
      defaultBranch: repository.defaultBranch,
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
      rootDirectory: worker.rootDirectory,
      convexProject: {
        convexProjectId: project._id,
        teamId: project.teamId,
        projectId: project.projectId,
      },
    };
  },
});

export const readManagedWorkerConvexProjectConfigurationContext = internalQuery({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    runId: id("workflow_repositoryProvisioning_runs"),
    workerId: id("repositoryCloudflareWorkers"),
    convexProjectId: id("repositoryConvexProjects"),
  },
  returns: vManagedWorkerConvexProjectConfigurationContext,
  handler: async (ctx, args) => {
    const { plan, repository } = await requireActiveManagedProvisioning(ctx, args);
    const [worker, project, organization] = await Promise.all([
      requireWorker(ctx, repository, args),
      requireConvexProject(ctx, repository, args),
      requireRepositoryOrganization(ctx.db, repository),
    ]);
    if (
      plan.cloudflare.state !== "created" ||
      repository.cloudflareAccountId !== worker.accountId ||
      plan.cloudflare.workerName !== worker.workerName ||
      plan.cloudflare.workerTag !== worker.workerTag
    ) {
      throw new Error("Managed Cloudflare Worker does not match the active provisioning run.");
    }
    if (
      plan.convex.state !== "created" ||
      repository.convexTeamId !== project.teamId ||
      plan.convex.projectId !== project.projectId ||
      !("convexConfigPath" in project) ||
      plan.convexConfigPath !== project.convexConfigPath
    ) {
      throw new Error("Managed Convex project does not match the active provisioning run.");
    }
    return {
      organizationId: repository.organizationId,
      githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
      githubOwnerLogin: organization.githubOwnerLogin,
      githubRepositoryName: repository.githubRepositoryName,
      defaultBranch: repository.defaultBranch,
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
      rootDirectory: plan.cloudflare.rootDirectory,
      convexProject: {
        convexProjectId: project._id,
        teamId: project.teamId,
        projectId: project.projectId,
      },
    };
  },
});
