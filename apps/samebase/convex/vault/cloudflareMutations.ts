import { v, type Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { vVaultProviderResourceOrigin } from "./model";
import {
  requireManualProviderWriteCheckpoint,
  requireUserVaultInfrastructureIdle,
  recordManagedProviderWrite,
} from "./infrastructureOperation";
import { isLiveConnectedVault } from "./state";

const { array, id, literal, null: nullValue, object, string, union } = v;

const workerConfigurationContextFields = {
  ghRepoId: string(),
  owner: string(),
  name: string(),
  defaultBranch: string(),
  accountId: string(),
  workerName: string(),
  workerTag: string(),
};
export const vWorkerConfigurationContext = object(workerConfigurationContextFields);
export type WorkerConfigurationContext = Infer<typeof vWorkerConfigurationContext>;

export const vManagedWorkerConfigurationContext = object({
  ...workerConfigurationContextFields,
  rootDirectory: string(),
});
export type ManagedWorkerConfigurationContext = Infer<typeof vManagedWorkerConfigurationContext>;

export const vWorkerConvexProjectConfigurationContext = object({
  ...workerConfigurationContextFields,
  convexProject: object({
    convexProjectId: id("vaultConvexProjects"),
    teamId: string(),
    projectId: string(),
  }),
});
export type WorkerConvexProjectConfigurationContext = Infer<
  typeof vWorkerConvexProjectConfigurationContext
>;

export const vManagedWorkerConvexProjectConfigurationContext = object({
  ...workerConfigurationContextFields,
  rootDirectory: string(),
  convexProject: object({
    convexProjectId: id("vaultConvexProjects"),
    teamId: string(),
    projectId: string(),
  }),
});
export type ManagedWorkerConvexProjectConfigurationContext = Infer<
  typeof vManagedWorkerConvexProjectConfigurationContext
>;

type WorkerGraphReadCtx = Pick<QueryCtx, "db">;

async function requireConnectedVault(
  ctx: WorkerGraphReadCtx,
  args: { vaultId: Id<"vaults">; userId: Id<"users"> },
) {
  const vault = await ctx.db.get(args.vaultId);
  if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
    throw new Error("Vault not found.");
  }
  return vault;
}

async function requireActiveManagedProvisioning(
  ctx: WorkerGraphReadCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    runId: Id<"workflow_vaultProvisioning_runs">;
  },
): Promise<Doc<"workflow_vaultProvisioning_plans">> {
  const [run, writeLock, plan] = await Promise.all([
    ctx.db.get(args.runId),
    ctx.db
      .query("workflow_vaultProvisioning_writeLocks")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .unique(),
    ctx.db
      .query("workflow_vaultProvisioning_plans")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .unique(),
  ]);
  if (
    !run ||
    run.vaultId !== args.vaultId ||
    run.userId !== args.userId ||
    (run.trigger !== "create" && run.trigger !== "retry")
  ) {
    throw new Error("Managed provisioning run does not match vault.");
  }
  if (
    !writeLock ||
    writeLock.owner.kind !== "managed_run" ||
    writeLock.state !== "active" ||
    writeLock.owner.runId !== args.runId
  ) {
    throw new Error("Managed provisioning run no longer holds the write lock.");
  }
  if (!plan || plan.userId !== args.userId) {
    throw new Error("Infrastructure provisioning plan not found for vault.");
  }
  return plan;
}

async function requireWorker(
  ctx: WorkerGraphReadCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    workerId: Id<"vaultCloudflareWorkers">;
  },
) {
  const worker = await ctx.db.get(args.workerId);
  if (!worker || worker.vaultId !== args.vaultId || worker.userId !== args.userId) {
    throw new Error("Cloudflare Worker attachment not found.");
  }
  return worker;
}

async function requireConvexProject(
  ctx: WorkerGraphReadCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    convexProjectId: Id<"vaultConvexProjects">;
  },
) {
  const project = await ctx.db.get(args.convexProjectId);
  if (!project || project.vaultId !== args.vaultId || project.userId !== args.userId) {
    throw new Error("Convex project attachment not found.");
  }
  return project;
}

async function readWorkerMatches(
  ctx: WorkerGraphReadCtx,
  args: { accountId: string; workerName: string; workerTag: string },
) {
  const [sameName, sameTag] = await Promise.all([
    ctx.db
      .query("vaultCloudflareWorkers")
      .withIndex("by_account_and_worker", (q) =>
        q.eq("accountId", args.accountId).eq("workerName", args.workerName),
      )
      .unique(),
    ctx.db
      .query("vaultCloudflareWorkers")
      .withIndex("by_account_and_worker_tag", (q) =>
        q.eq("accountId", args.accountId).eq("workerTag", args.workerTag),
      )
      .unique(),
  ]);
  if (sameName && sameTag && sameName._id !== sameTag._id) {
    throw new Error("Cloudflare Worker is already attached.");
  }
  return sameName ?? sameTag;
}

async function insertWorker(
  ctx: Pick<MutationCtx, "db">,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    accountId: string;
    workerName: string;
    workerTag: string;
    origin: "provisioned" | "selected_existing";
  },
): Promise<Id<"vaultCloudflareWorkers">> {
  const existing = await readWorkerMatches(ctx, args);
  if (existing) {
    if (
      existing.vaultId === args.vaultId &&
      existing.userId === args.userId &&
      existing.accountId === args.accountId &&
      existing.workerName === args.workerName &&
      existing.workerTag === args.workerTag
    ) {
      if (args.origin === "provisioned" && existing.origin !== "provisioned") {
        await ctx.db.patch(existing._id, { origin: "provisioned" });
      }
      return existing._id;
    }
    throw new Error("Cloudflare Worker is already attached.");
  }
  return await ctx.db.insert("vaultCloudflareWorkers", {
    vaultId: args.vaultId,
    userId: args.userId,
    accountId: args.accountId,
    workerName: args.workerName,
    workerTag: args.workerTag,
    origin: args.origin,
  });
}

export const attachWorkers = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    workers: array(
      object({
        accountId: string(),
        workerName: string(),
        workerTag: string(),
        origin: vVaultProviderResourceOrigin,
      }),
    ),
  },
  returns: array(id("vaultCloudflareWorkers")),
  handler: async (ctx, args): Promise<Array<Id<"vaultCloudflareWorkers">>> => {
    await requireUserVaultInfrastructureIdle(ctx, args);

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

    const workerAttachmentIds: Array<Id<"vaultCloudflareWorkers">> = [];
    for (const worker of args.workers) {
      workerAttachmentIds.push(
        await insertWorker(ctx, {
          vaultId: args.vaultId,
          userId: args.userId,
          ...worker,
        }),
      );
    }
    return workerAttachmentIds;
  },
});

export const detachWorker = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    await requireUserVaultInfrastructureIdle(ctx, args);
    const worker = await requireWorker(ctx, args);
    if (
      worker.accountId !== args.accountId ||
      worker.workerName !== args.workerName ||
      worker.workerTag !== args.workerTag
    ) {
      throw new Error("Cloudflare Worker attachment changed before removal.");
    }
    await ctx.db.delete(worker._id);
    return null;
  },
});

export const readManagedWorkerCreateCheckpoint = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    runId: id("workflow_vaultProvisioning_runs"),
    accountId: string(),
    workerName: string(),
  },
  returns: union(
    object({ state: literal("planned") }),
    object({ state: literal("creating") }),
    object({
      state: literal("created"),
      workerTag: string(),
    }),
  ),
  handler: async (ctx, args) => {
    const plan = await requireActiveManagedProvisioning(ctx, args);
    if (
      plan.cloudflare.accountId !== args.accountId ||
      plan.cloudflare.workerName !== args.workerName
    ) {
      throw new Error("Managed Cloudflare Worker does not match the provisioning plan.");
    }
    switch (plan.cloudflare.state) {
      case "planned":
        return { state: "planned" as const };
      case "creating":
        return { state: "creating" as const };
      case "created":
        return {
          state: "created" as const,
          workerTag: plan.cloudflare.workerTag,
        };
    }
  },
});

export const beginManagedWorkerCreate = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    runId: id("workflow_vaultProvisioning_runs"),
    accountId: string(),
    workerName: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const plan = await requireActiveManagedProvisioning(ctx, args);
    if (
      plan.cloudflare.accountId !== args.accountId ||
      plan.cloudflare.workerName !== args.workerName
    ) {
      throw new Error("Managed Cloudflare Worker does not match the provisioning plan.");
    }
    if (plan.cloudflare.state !== "planned") {
      throw new Error("Managed Cloudflare Worker creation already started.");
    }
    await ctx.db.patch(plan._id, {
      cloudflare: {
        state: "creating",
        accountId: args.accountId,
        workerName: args.workerName,
        build: plan.cloudflare.build,
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const recordManagedWorkerCreated = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    runId: id("workflow_vaultProvisioning_runs"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
  },
  returns: id("vaultCloudflareWorkers"),
  handler: async (ctx, args): Promise<Id<"vaultCloudflareWorkers">> => {
    const plan = await requireActiveManagedProvisioning(ctx, args);
    if (
      plan.cloudflare.accountId !== args.accountId ||
      plan.cloudflare.workerName !== args.workerName
    ) {
      throw new Error("Managed Cloudflare Worker does not match the provisioning plan.");
    }
    let workerId: Id<"vaultCloudflareWorkers">;
    if (plan.cloudflare.state === "created") {
      if (plan.cloudflare.workerTag !== args.workerTag) {
        throw new Error("Managed Cloudflare Worker checkpoint already names another Worker.");
      }
      workerId = await insertWorker(ctx, { ...args, origin: "provisioned" });
    } else {
      if (plan.cloudflare.state !== "creating") {
        throw new Error("Managed Cloudflare Worker creation was not started.");
      }
      await ctx.db.patch(plan._id, {
        cloudflare: {
          state: "created",
          accountId: args.accountId,
          workerName: args.workerName,
          workerTag: args.workerTag,
          build: plan.cloudflare.build,
        },
        updatedAt: Date.now(),
      });
      workerId = await insertWorker(ctx, { ...args, origin: "provisioned" });
    }
    await recordManagedProviderWrite(ctx, {
      vaultId: args.vaultId,
      runId: args.runId,
      provider: "cloudflare",
    });
    return workerId;
  },
});

export const recordManualConnectedWorker = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    actionId: string(),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
  },
  returns: id("vaultCloudflareWorkers"),
  handler: async (ctx, args): Promise<Id<"vaultCloudflareWorkers">> => {
    await requireManualProviderWriteCheckpoint(ctx, {
      vaultId: args.vaultId,
      actionId: args.actionId,
    });
    return await insertWorker(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      origin: "selected_existing",
    });
  },
});

export const recordManualWorkerCreated = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    actionId: string(),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
  },
  returns: id("vaultCloudflareWorkers"),
  handler: async (ctx, args): Promise<Id<"vaultCloudflareWorkers">> => {
    await requireManualProviderWriteCheckpoint(ctx, {
      vaultId: args.vaultId,
      actionId: args.actionId,
    });
    return await insertWorker(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      origin: "provisioned",
    });
  },
});

export const readWorkerConfigurationContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: vWorkerConfigurationContext,
  handler: async (ctx, args) => {
    const [vault, worker] = await Promise.all([
      requireConnectedVault(ctx, args),
      requireWorker(ctx, args),
    ]);
    return {
      ghRepoId: vault.ghRepoId,
      owner: vault.owner,
      name: vault.name,
      defaultBranch: vault.defaultBranch,
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
    };
  },
});

export const readManagedWorkerConfigurationContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    runId: id("workflow_vaultProvisioning_runs"),
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: vManagedWorkerConfigurationContext,
  handler: async (ctx, args) => {
    const [plan, vault, worker] = await Promise.all([
      requireActiveManagedProvisioning(ctx, args),
      requireConnectedVault(ctx, args),
      requireWorker(ctx, args),
    ]);
    if (
      plan.cloudflare.state !== "created" ||
      plan.cloudflare.accountId !== worker.accountId ||
      plan.cloudflare.workerName !== worker.workerName ||
      plan.cloudflare.workerTag !== worker.workerTag
    ) {
      throw new Error("Managed Cloudflare Worker does not match the active provisioning run.");
    }
    return {
      ghRepoId: vault.ghRepoId,
      owner: vault.owner,
      name: vault.name,
      defaultBranch: vault.defaultBranch,
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
      rootDirectory: plan.cloudflare.build.rootDirectory,
    };
  },
});

export const readWorkerConvexProjectConfigurationContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
    convexProjectId: id("vaultConvexProjects"),
  },
  returns: vWorkerConvexProjectConfigurationContext,
  handler: async (ctx, args) => {
    const [vault, worker, project] = await Promise.all([
      requireConnectedVault(ctx, args),
      requireWorker(ctx, args),
      requireConvexProject(ctx, args),
    ]);
    return {
      ghRepoId: vault.ghRepoId,
      owner: vault.owner,
      name: vault.name,
      defaultBranch: vault.defaultBranch,
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
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
    vaultId: id("vaults"),
    userId: id("users"),
    runId: id("workflow_vaultProvisioning_runs"),
    workerId: id("vaultCloudflareWorkers"),
    convexProjectId: id("vaultConvexProjects"),
  },
  returns: vManagedWorkerConvexProjectConfigurationContext,
  handler: async (ctx, args) => {
    const [plan, vault, worker, project] = await Promise.all([
      requireActiveManagedProvisioning(ctx, args),
      requireConnectedVault(ctx, args),
      requireWorker(ctx, args),
      requireConvexProject(ctx, args),
    ]);
    if (
      plan.cloudflare.state !== "created" ||
      plan.cloudflare.accountId !== worker.accountId ||
      plan.cloudflare.workerName !== worker.workerName ||
      plan.cloudflare.workerTag !== worker.workerTag
    ) {
      throw new Error("Managed Cloudflare Worker does not match the active provisioning run.");
    }
    if (
      plan.convex.state !== "created" ||
      plan.convex.teamId !== project.teamId ||
      plan.convex.projectId !== project.projectId ||
      !("convexConfigPath" in project) ||
      plan.convexConfigPath !== project.convexConfigPath
    ) {
      throw new Error("Managed Convex project does not match the active provisioning run.");
    }
    return {
      ghRepoId: vault.ghRepoId,
      owner: vault.owner,
      name: vault.name,
      defaultBranch: vault.defaultBranch,
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
      rootDirectory: plan.cloudflare.build.rootDirectory,
      convexProject: {
        convexProjectId: project._id,
        teamId: project.teamId,
        projectId: project.projectId,
      },
    };
  },
});
