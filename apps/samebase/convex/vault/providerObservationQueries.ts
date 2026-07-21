import { v, type Infer } from "convex/values";

import { internalQuery } from "../_generated/server";
import { isLiveConnectedVault } from "./state";

const { array, id, object, string } = v;

const vVaultProviderObservationContext = object({
  ghRepoId: string(),
  owner: string(),
  name: string(),
  defaultBranch: string(),
  cloudflareWorkers: array(
    object({
      workerId: id("vaultCloudflareWorkers"),
      accountId: string(),
      workerName: string(),
      workerTag: string(),
    }),
  ),
  convexProjects: array(
    object({
      convexProjectId: id("vaultConvexProjects"),
      teamId: string(),
      projectId: string(),
      convexConfigPath: string(),
    }),
  ),
});
export type VaultProviderObservationContext = Infer<typeof vVaultProviderObservationContext>;

export const readProviderAttachmentVaultContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
  },
  returns: object({
    ghRepoId: string(),
    owner: string(),
    name: string(),
    defaultBranch: string(),
  }),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    return {
      ghRepoId: vault.ghRepoId,
      owner: vault.owner,
      name: vault.name,
      defaultBranch: vault.defaultBranch,
    };
  },
});

export const readVaultProviderObservationContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
  },
  returns: vVaultProviderObservationContext,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const [workers, projects] = await Promise.all([
      ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .collect(),
      ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .collect(),
    ]);

    return {
      ghRepoId: vault.ghRepoId,
      owner: vault.owner,
      name: vault.name,
      defaultBranch: vault.defaultBranch,
      cloudflareWorkers: workers
        .map((worker) => ({
          workerId: worker._id,
          accountId: worker.accountId,
          workerName: worker.workerName,
          workerTag: worker.workerTag,
        }))
        .sort(
          (left, right) =>
            left.workerName.localeCompare(right.workerName) ||
            left.workerId.localeCompare(right.workerId),
        ),
      convexProjects: projects
        .map((project) => ({
          convexProjectId: project._id,
          teamId: project.teamId,
          projectId: project.projectId,
          convexConfigPath: project.convexConfigPath,
        }))
        .sort(
          (left, right) =>
            left.convexConfigPath.localeCompare(right.convexConfigPath) ||
            left.projectId.localeCompare(right.projectId) ||
            left.convexProjectId.localeCompare(right.convexProjectId),
        ),
    };
  },
});
