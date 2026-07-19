import { v, type Infer } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import { vVaultProviderResourceOrigin } from "./model";
import { isLiveConnectedVault } from "./state";

const { id, object, string } = v;

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
    const [sameName, sameTag] = await Promise.all([
      ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_user_and_account_and_worker", (q) =>
          q
            .eq("userId", args.userId)
            .eq("accountId", args.accountId)
            .eq("workerName", args.workerName),
        )
        .unique(),
      ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_user_and_account_and_worker_tag", (q) =>
          q
            .eq("userId", args.userId)
            .eq("accountId", args.accountId)
            .eq("workerTag", args.workerTag),
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
