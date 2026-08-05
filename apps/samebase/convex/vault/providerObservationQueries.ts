import { v, type Infer } from "convex/values";

import { internalQuery } from "../_generated/server";
import { getConvexCodeLocationKey, readConvexCodeLocation } from "../../shared/convexCodeLocation";
import { requireVaultForUser } from "../organizationAccess";
import { vConvexCodeLocation } from "./contracts/convexAttachments";
import { isLiveConnectedVault } from "./state";

const { array, id, object, string } = v;

const vVaultProviderObservationContext = object({
  organizationId: id("organizations"),
  ghRepoId: string(),
  owner: string(),
  name: string(),
  defaultBranch: string(),
  cloudflareWorkers: array(
    object({
      workerId: id("vaultCloudflareWorkers"),
      providerConnectionId: id("providerConnections"),
      accountId: string(),
      workerName: string(),
      workerTag: string(),
    }),
  ),
  convexProjects: array(
    object({
      convexProjectId: id("vaultConvexProjects"),
      providerConnectionId: id("providerConnections"),
      teamId: string(),
      projectId: string(),
      codeLocation: vConvexCodeLocation,
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
    organizationId: id("organizations"),
    ghRepoId: string(),
    owner: string(),
    name: string(),
    defaultBranch: string(),
  }),
  handler: async (ctx, args) => {
    const vault = await requireVaultForUser(ctx.db, args);
    if (!isLiveConnectedVault(vault)) {
      throw new Error("Vault not found.");
    }
    return {
      organizationId: vault.organizationId,
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
    const vault = await requireVaultForUser(ctx.db, args);
    if (!isLiveConnectedVault(vault)) {
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
    if (
      workers.some((worker) => worker.organizationId !== vault.organizationId) ||
      projects.some((project) => project.organizationId !== vault.organizationId)
    ) {
      throw new Error("Vault provider attachment not found.");
    }

    return {
      organizationId: vault.organizationId,
      ghRepoId: vault.ghRepoId,
      owner: vault.owner,
      name: vault.name,
      defaultBranch: vault.defaultBranch,
      cloudflareWorkers: workers
        .map((worker) => ({
          workerId: worker._id,
          providerConnectionId: worker.providerConnectionId,
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
          providerConnectionId: project.providerConnectionId,
          teamId: project.teamId,
          projectId: project.projectId,
          codeLocation: readConvexCodeLocation(project),
        }))
        .sort(
          (left, right) =>
            getConvexCodeLocationKey(left.codeLocation).localeCompare(
              getConvexCodeLocationKey(right.codeLocation),
            ) ||
            left.projectId.localeCompare(right.projectId) ||
            left.convexProjectId.localeCompare(right.convexProjectId),
        ),
    };
  },
});
