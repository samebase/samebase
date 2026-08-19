import { v, type Infer } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import { internalQuery, type DatabaseReader } from "../_generated/server";
import { getConvexCodeLocationKey, readConvexCodeLocation } from "../../shared/convexCodeLocation";
import { requireVaultForUser, requireVaultOrganization } from "../organizationAccess";
import { vConvexCodeLocation } from "./contracts/convexAttachments";
import { isLiveConnectedVault } from "./state";
import { requireActiveVaultProvisioningAuthority } from "../vaultWorkflowAuthority";

const { array, id, object, optional, string } = v;

const vVaultProviderObservationContext = object({
  organizationId: id("organizations"),
  convexTeamId: optional(string()),
  cloudflareAccountId: optional(string()),
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
      rootDirectory: string(),
    }),
  ),
  convexProjects: array(
    object({
      convexProjectId: id("vaultConvexProjects"),
      teamId: string(),
      projectId: string(),
      codeLocation: vConvexCodeLocation,
    }),
  ),
});
export type VaultProviderObservationContext = Infer<typeof vVaultProviderObservationContext>;

const vProviderAttachmentVaultContext = object({
  organizationId: id("organizations"),
  convexTeamId: optional(string()),
  cloudflareAccountId: optional(string()),
  ghRepoId: string(),
  owner: string(),
  name: string(),
  defaultBranch: string(),
});

async function readProviderAttachmentContext(db: DatabaseReader, vault: Doc<"vaults">) {
  if (!isLiveConnectedVault(vault)) {
    throw new Error("Vault not found.");
  }
  const organization = await requireVaultOrganization(db, vault);
  return {
    organizationId: vault.organizationId,
    convexTeamId: vault.convexTeamId,
    cloudflareAccountId: vault.cloudflareAccountId,
    ghRepoId: vault.ghRepoId,
    owner: organization.githubOwnerLogin,
    name: vault.name,
    defaultBranch: vault.defaultBranch,
  };
}

export const readProviderAttachmentVaultContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
  },
  returns: vProviderAttachmentVaultContext,
  handler: async (ctx, args) => {
    const vault = await requireVaultForUser(ctx.db, args);
    return await readProviderAttachmentContext(ctx.db, vault);
  },
});

export const readProviderAttachmentVaultContextForProvisioningRun = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    runId: id("workflow_vaultProvisioning_runs"),
  },
  returns: vProviderAttachmentVaultContext,
  handler: async (ctx, args) => {
    const authority = await requireActiveVaultProvisioningAuthority(ctx.db, args);
    return await readProviderAttachmentContext(ctx.db, authority.vault);
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
    const [workers, projects, organization] = await Promise.all([
      ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .collect(),
      ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .collect(),
      requireVaultOrganization(ctx.db, vault),
    ]);
    if (
      workers.some((worker) => worker.organizationId !== vault.organizationId) ||
      workers.some((worker) => worker.accountId !== vault.cloudflareAccountId) ||
      projects.some((project) => project.organizationId !== vault.organizationId) ||
      projects.some((project) => project.teamId !== vault.convexTeamId)
    ) {
      throw new Error("Vault provider attachment not found.");
    }

    return {
      organizationId: vault.organizationId,
      convexTeamId: vault.convexTeamId,
      cloudflareAccountId: vault.cloudflareAccountId,
      ghRepoId: vault.ghRepoId,
      owner: organization.githubOwnerLogin,
      name: vault.name,
      defaultBranch: vault.defaultBranch,
      cloudflareWorkers: workers
        .map((worker) => ({
          workerId: worker._id,
          accountId: worker.accountId,
          workerName: worker.workerName,
          workerTag: worker.workerTag,
          rootDirectory: worker.rootDirectory,
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
