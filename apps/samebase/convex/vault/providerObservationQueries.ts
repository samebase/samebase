import { v, type Infer } from "convex/values";

import { internalQuery } from "../_generated/server";
import { isLiveConnectedVault } from "./state";

const { array, id, object, string } = v;

const vVaultProviderObservationContext = object({
  ghRepoId: string(),
  cloudflareWorkers: array(
    object({
      workerId: id("vaultCloudflareWorkers"),
      accountId: string(),
      workerName: string(),
      workerTag: string(),
      rootDirectory: string(),
    }),
  ),
  convexProjects: array(
    object({
      convexProjectId: id("vaultConvexProjects"),
      teamId: string(),
      projectId: string(),
    }),
  ),
});
export type VaultProviderObservationContext = Infer<
  typeof vVaultProviderObservationContext
>;

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
    const [apps, workers, projects] = await Promise.all([
      ctx.db
        .query("vaultApps")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .collect(),
      ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .collect(),
      ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .collect(),
    ]);
    const appsById = new Map(apps.map((app) => [app._id, app]));

    return {
      ghRepoId: vault.ghRepoId,
      cloudflareWorkers: workers
        .map((worker) => {
          const app = appsById.get(worker.appId);
          if (!app) {
            throw new Error("Cloudflare Worker references a missing vault app.");
          }
          return {
            workerId: worker._id,
            accountId: worker.accountId,
            workerName: worker.workerName,
            workerTag: worker.workerTag,
            rootDirectory: app.rootDirectory,
          };
        })
        .sort(
          (left, right) =>
            left.rootDirectory.localeCompare(right.rootDirectory) ||
            left.workerName.localeCompare(right.workerName) ||
            left.workerId.localeCompare(right.workerId),
        ),
      convexProjects: projects
        .map((project) => ({
          convexProjectId: project._id,
          teamId: project.teamId,
          projectId: project.projectId,
        }))
        .sort(
          (left, right) =>
            left.projectId.localeCompare(right.projectId) ||
            left.convexProjectId.localeCompare(right.convexProjectId),
        ),
    };
  },
});
