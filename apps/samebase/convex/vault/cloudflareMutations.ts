import { v, type Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { vVaultProviderResourceOrigin } from "./model";
import { isLiveConnectedVault } from "./state";

const { id, literal, null: nullValue, object, string, union } = v;

const workerConfigurationContextFields = {
  ghRepoId: string(),
  owner: string(),
  name: string(),
  defaultBranch: string(),
  rootDirectory: string(),
  accountId: string(),
  workerName: string(),
  workerTag: string(),
};
export const vWorkerConfigurationContext = object(workerConfigurationContextFields);
export type WorkerConfigurationContext = Infer<typeof vWorkerConfigurationContext>;

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
  if (!writeLock || writeLock.state !== "active" || writeLock.runId !== args.runId) {
    throw new Error("Managed provisioning run no longer holds the write lock.");
  }
  if (!plan || plan.userId !== args.userId) {
    throw new Error("Infrastructure provisioning plan not found for vault.");
  }
  return plan;
}

async function requireVaultApp(
  ctx: WorkerGraphReadCtx,
  args: { vaultId: Id<"vaults">; userId: Id<"users">; appId: Id<"vaultApps"> },
) {
  const app = await ctx.db.get(args.appId);
  if (!app || app.vaultId !== args.vaultId || app.userId !== args.userId) {
    throw new Error("Vault app not found.");
  }
  return app;
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

async function insertWorker(
  ctx: Pick<MutationCtx, "db">,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    appId: Id<"vaultApps">;
    accountId: string;
    workerName: string;
    workerTag: string;
    origin: "provisioned" | "selected_existing";
  },
): Promise<Id<"vaultCloudflareWorkers">> {
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
  const existing = sameName ?? sameTag;
  if (existing) {
    if (
      existing.vaultId === args.vaultId &&
      existing.appId === args.appId &&
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
    appId: args.appId,
    accountId: args.accountId,
    workerName: args.workerName,
    workerTag: args.workerTag,
    origin: args.origin,
    createdAt: Date.now(),
  });
}

export const readWorkerAttachmentContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    appId: id("vaultApps"),
  },
  returns: object({
    ghRepoId: string(),
    owner: string(),
    name: string(),
    defaultBranch: string(),
    rootDirectory: string(),
  }),
  handler: async (ctx, args) => {
    const [vault, app] = await Promise.all([
      requireConnectedVault(ctx, args),
      requireVaultApp(ctx, args),
    ]);
    return {
      ghRepoId: vault.ghRepoId,
      owner: vault.owner,
      name: vault.name,
      defaultBranch: vault.defaultBranch,
      rootDirectory: app.rootDirectory,
    };
  },
});

export const attachWorker = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    appId: id("vaultApps"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    origin: vVaultProviderResourceOrigin,
  },
  returns: id("vaultCloudflareWorkers"),
  handler: async (ctx, args): Promise<Id<"vaultCloudflareWorkers">> => {
    await Promise.all([requireConnectedVault(ctx, args), requireVaultApp(ctx, args)]);
    return await insertWorker(ctx, args);
  },
});

export const removeMissingWorkerAttachment = internalMutation({
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
    await requireConnectedVault(ctx, args);
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
    appId: id("vaultApps"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
  },
  returns: id("vaultCloudflareWorkers"),
  handler: async (ctx, args): Promise<Id<"vaultCloudflareWorkers">> => {
    const [plan] = await Promise.all([
      requireActiveManagedProvisioning(ctx, args),
      requireVaultApp(ctx, args),
    ]);
    if (
      plan.cloudflare.accountId !== args.accountId ||
      plan.cloudflare.workerName !== args.workerName
    ) {
      throw new Error("Managed Cloudflare Worker does not match the provisioning plan.");
    }
    if (plan.cloudflare.state === "created") {
      if (plan.cloudflare.workerTag !== args.workerTag) {
        throw new Error("Managed Cloudflare Worker checkpoint already names another Worker.");
      }
      return await insertWorker(ctx, { ...args, origin: "provisioned" });
    }
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
    return await insertWorker(ctx, { ...args, origin: "provisioned" });
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
    const app = await requireVaultApp(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
      appId: worker.appId,
    });
    return {
      ghRepoId: vault.ghRepoId,
      owner: vault.owner,
      name: vault.name,
      defaultBranch: vault.defaultBranch,
      rootDirectory: app.rootDirectory,
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
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
    const app = await requireVaultApp(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
      appId: worker.appId,
    });
    return {
      ghRepoId: vault.ghRepoId,
      owner: vault.owner,
      name: vault.name,
      defaultBranch: vault.defaultBranch,
      rootDirectory: app.rootDirectory,
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
