import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import {
  getConvexCodeLocationKey,
  normalizeConvexCodeLocation,
  readConvexCodeLocation,
  type ConvexCodeLocation,
} from "../../shared/convexCodeLocation";
import { normalizeConvexConfigPath } from "../../shared/convexConfigPath";
import { vConvexCodeLocation } from "./contracts/convexAttachments";
import {
  requireBillingResourceCapacityForAuthority,
  type BillingResourceAuthority,
} from "../billingResourceQuotas";
import { requireVaultForUser } from "../organizationAccess";
import { requireActiveVaultProvisioningAuthority } from "../vaultWorkflowAuthority";
import { vVaultProviderResourceOrigin, type VaultProviderResourceOrigin } from "./model";
import {
  requireUserVaultInfrastructureIdle,
  requireManualProviderWriteCheckpoint,
  recordManagedProviderWrite,
} from "./infrastructureOperation";
import { isLiveConnectedVault } from "./state";

const { array, id, literal, null: nullValue, object, string, union } = v;

type ConvexProjectGraphReadCtx = Pick<QueryCtx, "db">;

async function requireConnectedVault(
  ctx: ConvexProjectGraphReadCtx,
  args: { vaultId: Id<"vaults">; userId: Id<"users"> },
): Promise<Extract<Doc<"vaults">, { state: "connected" }>> {
  const vault = await requireVaultForUser(ctx.db, args);
  if (!isLiveConnectedVault(vault)) {
    throw new Error("Vault not found.");
  }
  return vault;
}

async function requireActiveManagedProvisioning(
  ctx: ConvexProjectGraphReadCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    runId: Id<"workflow_vaultProvisioning_runs">;
  },
): Promise<{
  vault: Extract<Doc<"vaults">, { state: "connected" }>;
  plan: Doc<"workflow_vaultProvisioning_plans">;
}> {
  const authority = await requireActiveVaultProvisioningAuthority(ctx.db, args);
  if (!isLiveConnectedVault(authority.vault)) {
    throw new Error("Vault not found.");
  }
  const [writeLock, plan] = await Promise.all([
    ctx.db
      .query("workflow_vaultProvisioning_writeLocks")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .unique(),
    ctx.db
      .query("workflow_vaultProvisioning_plans")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .unique(),
  ]);
  if (authority.run.trigger !== "create" && authority.run.trigger !== "retry") {
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
  if (!plan) {
    throw new Error("Infrastructure provisioning plan not found for vault.");
  }
  return { vault: authority.vault, plan };
}

function readPlanConvexConfigPath(plan: Doc<"workflow_vaultProvisioning_plans">): string {
  return normalizeConvexConfigPath(plan.convexConfigPath);
}

async function readMatchingProject(
  ctx: ConvexProjectGraphReadCtx,
  args: {
    vaultId: Id<"vaults">;
    organizationId: Id<"organizations">;
    teamId: string;
    projectId: string;
    codeLocation: ConvexCodeLocation;
  },
) {
  const existing = await ctx.db
    .query("vaultConvexProjects")
    .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
    .unique();
  if (!existing) {
    return null;
  }
  if (
    existing.vaultId === args.vaultId &&
    existing.organizationId === args.organizationId &&
    existing.teamId === args.teamId &&
    getConvexCodeLocationKey(readConvexCodeLocation(existing)) ===
      getConvexCodeLocationKey(args.codeLocation)
  ) {
    return existing;
  }
  throw new Error("Convex project is already attached.");
}

async function insertProject(
  ctx: Pick<MutationCtx, "db">,
  vault: Extract<Doc<"vaults">, { state: "connected" }>,
  args: {
    vaultId: Id<"vaults">;
    billingAuthority: BillingResourceAuthority;
    teamId: string;
    projectId: string;
    codeLocation: ConvexCodeLocation;
    origin: VaultProviderResourceOrigin;
  },
): Promise<Id<"vaultConvexProjects">> {
  if (args.teamId !== vault.convexTeamId) {
    throw new Error("Convex project team does not match the vault destination.");
  }
  const codeLocation = normalizeConvexCodeLocation(args.codeLocation);
  const existing = await readMatchingProject(ctx, {
    vaultId: args.vaultId,
    organizationId: vault.organizationId,
    teamId: args.teamId,
    projectId: args.projectId,
    codeLocation,
  });
  if (existing) {
    if (args.origin === "provisioned" && existing.origin !== "provisioned") {
      await ctx.db.patch(existing._id, { origin: "provisioned" });
    }
    return existing._id;
  }

  await requireBillingResourceCapacityForAuthority(ctx, {
    authority: args.billingAuthority,
    kind: "convex_project",
  });

  const commonFields = {
    vaultId: args.vaultId,
    organizationId: vault.organizationId,
    teamId: args.teamId,
    projectId: args.projectId,
    origin: args.origin,
  };
  switch (codeLocation.kind) {
    case "config":
      return await ctx.db.insert("vaultConvexProjects", {
        ...commonFields,
        convexConfigPath: codeLocation.convexConfigPath,
      });
    case "directory":
      return await ctx.db.insert("vaultConvexProjects", {
        ...commonFields,
        convexDirectoryPath: codeLocation.convexDirectoryPath,
      });
    default:
      codeLocation satisfies never;
      throw new Error("Unsupported Convex code location.");
  }
}

export const requireConvexProjectConnectionVault = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    await requireConnectedVault(ctx, args);
    return null;
  },
});

export const readProjectAttachmentContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    convexProjectId: id("vaultConvexProjects"),
  },
  returns: object({
    organizationId: id("organizations"),
    teamId: string(),
    projectId: string(),
    codeLocation: vConvexCodeLocation,
  }),
  handler: async (ctx, args) => {
    const vault = await requireConnectedVault(ctx, args);
    const project = await ctx.db.get(args.convexProjectId);
    if (
      !project ||
      project.vaultId !== args.vaultId ||
      project.organizationId !== vault.organizationId ||
      project.teamId !== vault.convexTeamId
    ) {
      throw new Error("Convex project attachment not found.");
    }
    return {
      organizationId: project.organizationId,
      teamId: project.teamId,
      projectId: project.projectId,
      codeLocation: readConvexCodeLocation(project),
    };
  },
});

export const readManagedProjectCreateCheckpoint = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    runId: id("workflow_vaultProvisioning_runs"),
    projectName: string(),
    teamId: string(),
  },
  returns: union(
    object({ state: literal("planned") }),
    object({ state: literal("creating") }),
    object({ state: literal("created"), projectId: string() }),
  ),
  handler: async (ctx, args) => {
    const { plan, vault } = await requireActiveManagedProvisioning(ctx, args);
    if (plan.convex.projectName !== args.projectName) {
      throw new Error("Managed Convex project does not match the provisioning plan.");
    }
    if (vault.convexTeamId !== args.teamId) {
      throw new Error("Connected Convex team does not match the vault destination.");
    }
    switch (plan.convex.state) {
      case "planned":
        return { state: "planned" as const };
      case "creating":
        return { state: "creating" as const };
      case "created":
        return {
          state: "created" as const,
          projectId: plan.convex.projectId,
        };
    }
  },
});

export const beginManagedProjectCreate = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    runId: id("workflow_vaultProvisioning_runs"),
    projectName: string(),
    teamId: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const { plan, vault } = await requireActiveManagedProvisioning(ctx, args);
    if (plan.convex.projectName !== args.projectName) {
      throw new Error("Managed Convex project does not match the provisioning plan.");
    }
    if (vault.convexTeamId !== args.teamId) {
      throw new Error("Connected Convex team does not match the vault destination.");
    }
    if (plan.convex.state !== "planned") {
      throw new Error("Managed Convex project creation already started.");
    }
    await ctx.db.patch(plan._id, {
      convex: {
        state: "creating",
        projectName: args.projectName,
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const recordManagedProjectCreated = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    runId: id("workflow_vaultProvisioning_runs"),
    convexConfigPath: string(),
    projectName: string(),
    teamId: string(),
    projectId: string(),
  },
  returns: id("vaultConvexProjects"),
  handler: async (ctx, args): Promise<Id<"vaultConvexProjects">> => {
    const { plan, vault } = await requireActiveManagedProvisioning(ctx, args);
    const convexConfigPath = normalizeConvexConfigPath(args.convexConfigPath);
    if (convexConfigPath !== readPlanConvexConfigPath(plan)) {
      throw new Error("Managed Convex config path does not match the provisioning plan.");
    }
    if (plan.convex.projectName !== args.projectName) {
      throw new Error("Managed Convex project does not match the provisioning plan.");
    }
    let convexProjectId: Id<"vaultConvexProjects">;
    if (plan.convex.state === "created") {
      if (plan.convex.projectId !== args.projectId) {
        throw new Error("Managed Convex project checkpoint already names another project.");
      }
      convexProjectId = await insertProject(ctx, vault, {
        vaultId: args.vaultId,
        billingAuthority: {
          kind: "vault_provisioning",
          runId: args.runId,
          userId: args.userId,
          vaultId: args.vaultId,
        },
        teamId: args.teamId,
        projectId: args.projectId,
        codeLocation: { kind: "config", convexConfigPath },
        origin: "provisioned",
      });
    } else {
      if (plan.convex.state !== "creating" || vault.convexTeamId !== args.teamId) {
        throw new Error("Managed Convex project creation was not started for this vault team.");
      }
      await ctx.db.patch(plan._id, {
        convex: {
          state: "created",
          projectName: args.projectName,
          projectId: args.projectId,
        },
        updatedAt: Date.now(),
      });
      convexProjectId = await insertProject(ctx, vault, {
        vaultId: args.vaultId,
        billingAuthority: {
          kind: "vault_provisioning",
          runId: args.runId,
          userId: args.userId,
          vaultId: args.vaultId,
        },
        teamId: args.teamId,
        projectId: args.projectId,
        codeLocation: { kind: "config", convexConfigPath },
        origin: "provisioned",
      });
    }
    await recordManagedProviderWrite(ctx, {
      vaultId: args.vaultId,
      runId: args.runId,
      provider: "convex",
    });
    return convexProjectId;
  },
});

export const recordManualProjectCreated = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    actionId: string(),
    teamId: string(),
    projectId: string(),
    codeLocation: vConvexCodeLocation,
  },
  returns: id("vaultConvexProjects"),
  handler: async (ctx, args): Promise<Id<"vaultConvexProjects">> => {
    const vault = await requireManualProviderWriteCheckpoint(ctx, {
      vaultId: args.vaultId,
      actionId: args.actionId,
      userId: args.userId,
    });
    return await insertProject(ctx, vault, {
      vaultId: args.vaultId,
      billingAuthority: {
        kind: "manual_provider_write",
        actionId: args.actionId,
        userId: args.userId,
        vaultId: args.vaultId,
      },
      teamId: args.teamId,
      projectId: args.projectId,
      codeLocation: args.codeLocation,
      origin: "provisioned",
    });
  },
});

export const attachProjects = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    projects: array(
      object({
        teamId: string(),
        projectId: string(),
        codeLocation: vConvexCodeLocation,
        origin: vVaultProviderResourceOrigin,
      }),
    ),
  },
  returns: array(id("vaultConvexProjects")),
  handler: async (ctx, args): Promise<Array<Id<"vaultConvexProjects">>> => {
    const vault = await requireUserVaultInfrastructureIdle(ctx, args);
    if (args.projects.some((project) => project.teamId !== vault.convexTeamId)) {
      throw new Error("Convex project team does not match the vault destination.");
    }

    const projectIds = new Set<string>();
    const projects = args.projects.map((project) => ({
      ...project,
      codeLocation: normalizeConvexCodeLocation(project.codeLocation),
    }));
    for (const project of projects) {
      if (projectIds.has(project.projectId)) {
        throw new Error("Convex project appears more than once in the attachment request.");
      }
      projectIds.add(project.projectId);
    }

    const projectAttachmentIds: Array<Id<"vaultConvexProjects">> = [];
    for (const project of projects) {
      projectAttachmentIds.push(
        await insertProject(ctx, vault, {
          vaultId: args.vaultId,
          billingAuthority: {
            kind: "user",
            organizationId: vault.organizationId,
            userId: args.userId,
          },
          ...project,
        }),
      );
    }
    return projectAttachmentIds;
  },
});

export const reconcileProjectCodeLocation = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    convexProjectId: id("vaultConvexProjects"),
    projectId: string(),
    expectedCodeLocation: vConvexCodeLocation,
    nextCodeLocation: vConvexCodeLocation,
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const vault = await requireUserVaultInfrastructureIdle(ctx, args);
    const project = await ctx.db.get(args.convexProjectId);
    const expectedCodeLocation = normalizeConvexCodeLocation(args.expectedCodeLocation);
    const nextCodeLocation = normalizeConvexCodeLocation(args.nextCodeLocation);
    if (
      !project ||
      project.vaultId !== args.vaultId ||
      project.organizationId !== vault.organizationId ||
      project.projectId !== args.projectId ||
      getConvexCodeLocationKey(readConvexCodeLocation(project)) !==
        getConvexCodeLocationKey(expectedCodeLocation)
    ) {
      throw new Error("Convex project attachment changed before code location reconciliation.");
    }
    const commonFields = {
      vaultId: project.vaultId,
      organizationId: project.organizationId,
      teamId: project.teamId,
      projectId: project.projectId,
      origin: project.origin,
    };
    switch (nextCodeLocation.kind) {
      case "config":
        await ctx.db.replace(project._id, {
          ...commonFields,
          convexConfigPath: nextCodeLocation.convexConfigPath,
        });
        break;
      case "directory":
        await ctx.db.replace(project._id, {
          ...commonFields,
          convexDirectoryPath: nextCodeLocation.convexDirectoryPath,
        });
        break;
      default:
        nextCodeLocation satisfies never;
        throw new Error("Unsupported Convex code location.");
    }
    return null;
  },
});

export const detachProject = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    convexProjectId: id("vaultConvexProjects"),
    teamId: string(),
    projectId: string(),
    codeLocation: vConvexCodeLocation,
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const vault = await requireUserVaultInfrastructureIdle(ctx, args);
    const project = await ctx.db.get(args.convexProjectId);
    if (
      !project ||
      project.vaultId !== args.vaultId ||
      project.organizationId !== vault.organizationId
    ) {
      throw new Error("Convex project attachment not found.");
    }
    if (
      project.teamId !== args.teamId ||
      project.projectId !== args.projectId ||
      getConvexCodeLocationKey(readConvexCodeLocation(project)) !==
        getConvexCodeLocationKey(normalizeConvexCodeLocation(args.codeLocation))
    ) {
      throw new Error("Convex project attachment changed before removal.");
    }
    await ctx.db.delete(project._id);
    return null;
  },
});
