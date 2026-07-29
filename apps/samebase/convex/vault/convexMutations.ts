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
  const vault = await ctx.db.get(args.vaultId);
  if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
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

function readPlanConvexConfigPath(plan: Doc<"workflow_vaultProvisioning_plans">): string {
  return normalizeConvexConfigPath(plan.convexConfigPath);
}

async function readProjectByProjectId(ctx: ConvexProjectGraphReadCtx, projectId: string) {
  return await ctx.db
    .query("vaultConvexProjects")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .unique();
}

async function insertProject(
  ctx: Pick<MutationCtx, "db">,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    teamId: string;
    projectId: string;
    codeLocation: ConvexCodeLocation;
    origin: VaultProviderResourceOrigin;
  },
): Promise<Id<"vaultConvexProjects">> {
  const codeLocation = normalizeConvexCodeLocation(args.codeLocation);
  const existing = await readProjectByProjectId(ctx, args.projectId);
  if (existing) {
    if (
      existing.vaultId === args.vaultId &&
      existing.userId === args.userId &&
      existing.teamId === args.teamId &&
      getConvexCodeLocationKey(readConvexCodeLocation(existing)) ===
        getConvexCodeLocationKey(codeLocation)
    ) {
      if (args.origin === "provisioned" && existing.origin !== "provisioned") {
        await ctx.db.patch(existing._id, { origin: "provisioned" });
      }
      return existing._id;
    }
    throw new Error("Convex project is already attached.");
  }

  const commonFields = {
    vaultId: args.vaultId,
    userId: args.userId,
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
    teamId: string(),
    projectId: string(),
    codeLocation: vConvexCodeLocation,
  }),
  handler: async (ctx, args) => {
    await requireConnectedVault(ctx, args);
    const project = await ctx.db.get(args.convexProjectId);
    if (!project || project.vaultId !== args.vaultId || project.userId !== args.userId) {
      throw new Error("Convex project attachment not found.");
    }
    return {
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
    object({ state: literal("created"), teamId: string(), projectId: string() }),
  ),
  handler: async (ctx, args) => {
    const plan = await requireActiveManagedProvisioning(ctx, args);
    if (plan.convex.projectName !== args.projectName) {
      throw new Error("Managed Convex project does not match the provisioning plan.");
    }
    if (plan.convex.state !== "planned" && plan.convex.teamId !== args.teamId) {
      throw new Error("Managed Convex project was created under a different team.");
    }
    switch (plan.convex.state) {
      case "planned":
        return { state: "planned" as const };
      case "creating":
        return { state: "creating" as const };
      case "created":
        return {
          state: "created" as const,
          teamId: plan.convex.teamId,
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
    const plan = await requireActiveManagedProvisioning(ctx, args);
    if (plan.convex.projectName !== args.projectName) {
      throw new Error("Managed Convex project does not match the provisioning plan.");
    }
    if (plan.convex.state !== "planned") {
      throw new Error("Managed Convex project creation already started.");
    }
    await ctx.db.patch(plan._id, {
      convex: {
        state: "creating",
        projectName: args.projectName,
        teamId: args.teamId,
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
    const plan = await requireActiveManagedProvisioning(ctx, args);
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
      if (plan.convex.teamId !== args.teamId) {
        throw new Error("Managed Convex project checkpoint already names another team.");
      }
      convexProjectId = await insertProject(ctx, {
        ...args,
        codeLocation: { kind: "config", convexConfigPath },
        origin: "provisioned",
      });
    } else {
      if (plan.convex.state !== "creating" || plan.convex.teamId !== args.teamId) {
        throw new Error("Managed Convex project creation was not started for this team.");
      }
      await ctx.db.patch(plan._id, {
        convex: {
          state: "created",
          projectName: args.projectName,
          teamId: args.teamId,
          projectId: args.projectId,
        },
        updatedAt: Date.now(),
      });
      convexProjectId = await insertProject(ctx, {
        ...args,
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
    await requireManualProviderWriteCheckpoint(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
      actionId: args.actionId,
      action: "create_convex_project",
    });
    return await insertProject(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
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
    await requireUserVaultInfrastructureIdle(ctx, args);

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
        await insertProject(ctx, {
          vaultId: args.vaultId,
          userId: args.userId,
          ...project,
        }),
      );
    }
    return projectAttachmentIds;
  },
});

export const reconcileProjectTeam = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    convexProjectId: id("vaultConvexProjects"),
    projectId: string(),
    expectedTeamId: string(),
    nextTeamId: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    await requireUserVaultInfrastructureIdle(ctx, args);
    const project = await ctx.db.get(args.convexProjectId);
    if (
      !project ||
      project.vaultId !== args.vaultId ||
      project.userId !== args.userId ||
      project.projectId !== args.projectId ||
      project.teamId !== args.expectedTeamId
    ) {
      throw new Error("Convex project attachment changed before team reconciliation.");
    }
    await ctx.db.patch(project._id, { teamId: args.nextTeamId });
    return null;
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
    await requireUserVaultInfrastructureIdle(ctx, args);
    const project = await ctx.db.get(args.convexProjectId);
    const expectedCodeLocation = normalizeConvexCodeLocation(args.expectedCodeLocation);
    const nextCodeLocation = normalizeConvexCodeLocation(args.nextCodeLocation);
    if (
      !project ||
      project.vaultId !== args.vaultId ||
      project.userId !== args.userId ||
      project.projectId !== args.projectId ||
      getConvexCodeLocationKey(readConvexCodeLocation(project)) !==
        getConvexCodeLocationKey(expectedCodeLocation)
    ) {
      throw new Error("Convex project attachment changed before code location reconciliation.");
    }
    const commonFields = {
      vaultId: project.vaultId,
      userId: project.userId,
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
    await requireUserVaultInfrastructureIdle(ctx, args);
    const project = await ctx.db.get(args.convexProjectId);
    if (!project || project.vaultId !== args.vaultId || project.userId !== args.userId) {
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
