import { v, type Infer } from "convex/values";

import { internalQuery } from "../_generated/server";
import { isLiveConnectedVault } from "./state";
import { vVaultCloudflareOrigin, vVaultConvexOrigin } from "./model";

const { array, id, null: nullValue, object, string, union } = v;

export const vProviderResourceObservationTarget = union(
  nullValue(),
  object({
    vaultId: id("vaults"),
    ghRepoId: string(),
    defaultBranch: string(),
    cloudflareWorkers: array(
      object({
        appRoot: string(),
        accountId: string(),
        workerName: string(),
        workerTag: string(),
        origin: vVaultCloudflareOrigin,
      }),
    ),
    convexDeployments: array(
      object({
        appRoot: string(),
        projectId: string(),
        deploymentName: string(),
        origin: vVaultConvexOrigin,
      }),
    ),
  }),
);
export type ProviderResourceObservationTarget = Exclude<
  Infer<typeof vProviderResourceObservationTarget>,
  null
>;

export const read = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
  },
  returns: vProviderResourceObservationTarget,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      return null;
    }

    const [cloudflareWorkers, convexDeployments] = await Promise.all([
      ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .collect(),
      ctx.db
        .query("vaultConvexDeployments")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .collect(),
    ]);

    return {
      vaultId: vault._id,
      ghRepoId: vault.ghRepoId,
      defaultBranch: vault.defaultBranch,
      cloudflareWorkers: cloudflareWorkers
        .map(({ appRoot, accountId, workerName, workerTag, origin }) => ({
          appRoot,
          accountId,
          workerName,
          workerTag,
          origin,
        }))
        .sort(
          (left, right) =>
            left.appRoot.localeCompare(right.appRoot) ||
            left.accountId.localeCompare(right.accountId) ||
            left.workerName.localeCompare(right.workerName),
        ),
      convexDeployments: convexDeployments
        .map(({ appRoot, projectId, deploymentName, origin }) => ({
          appRoot,
          projectId,
          deploymentName,
          origin,
        }))
        .sort(
          (left, right) =>
            left.appRoot.localeCompare(right.appRoot) ||
            left.projectId.localeCompare(right.projectId) ||
            left.deploymentName.localeCompare(right.deploymentName),
        ),
    };
  },
});
