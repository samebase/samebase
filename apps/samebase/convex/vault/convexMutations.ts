import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { vVaultProviderResourceOrigin, type VaultProviderResourceOrigin } from "./model";
import { isLiveConnectedVault } from "./state";

const { id, literal, null: nullValue, object, string, union } = v;

type ConvexProjectGraphReadCtx = Pick<QueryCtx, "db">;

async function requireVaultApp(
  ctx: ConvexProjectGraphReadCtx,
  args: { vaultId: Id<"vaults">; userId: Id<"users">; appId: Id<"vaultApps"> },
) {
  const app = await ctx.db.get(args.appId);
  if (!app || app.vaultId !== args.vaultId || app.userId !== args.userId) {
    throw new Error("Vault app not found.");
  }
  return app;
}

async function requireConnectedVault(
  ctx: ConvexProjectGraphReadCtx,
  args: { vaultId: Id<"vaults">; userId: Id<"users"> },
): Promise<void> {
  const vault = await ctx.db.get(args.vaultId);
  if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
    throw new Error("Vault not found.");
  }
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
  if (!writeLock || writeLock.state !== "active" || writeLock.runId !== args.runId) {
    throw new Error("Managed provisioning run no longer holds the write lock.");
  }
  if (!plan || plan.userId !== args.userId) {
    throw new Error("Infrastructure provisioning plan not found for vault.");
  }
  return plan;
}

async function readProjectByProviderIdentity(
  ctx: ConvexProjectGraphReadCtx,
  args: { teamId: string; projectId: string },
) {
  return await ctx.db
    .query("vaultConvexProjects")
    .withIndex("by_team_and_project", (q) =>
      q.eq("teamId", args.teamId).eq("projectId", args.projectId),
    )
    .unique();
}

async function insertProject(
  ctx: Pick<MutationCtx, "db">,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    appId: Id<"vaultApps">;
    teamId: string;
    projectId: string;
    origin: VaultProviderResourceOrigin;
  },
): Promise<Id<"vaultConvexProjects">> {
  const [appProject, providerProject] = await Promise.all([
    ctx.db
      .query("vaultConvexProjects")
      .withIndex("by_app", (q) => q.eq("appId", args.appId))
      .unique(),
    readProjectByProviderIdentity(ctx, args),
  ]);
  if (appProject) {
    if (appProject.teamId === args.teamId && appProject.projectId === args.projectId) {
      if (args.origin === "provisioned" && appProject.origin !== "provisioned") {
        await ctx.db.patch(appProject._id, { origin: "provisioned" });
      }
      return appProject._id;
    }
    throw new Error("Vault app already has a Convex project.");
  }
  if (providerProject) {
    throw new Error("Convex project is already attached.");
  }
  return await ctx.db.insert("vaultConvexProjects", {
    vaultId: args.vaultId,
    userId: args.userId,
    appId: args.appId,
    teamId: args.teamId,
    projectId: args.projectId,
    origin: args.origin,
    createdAt: Date.now(),
  });
}

export const requireConvexProjectConnectionVault = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    appId: id("vaultApps"),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    await requireConnectedVault(ctx, args);
    await requireVaultApp(ctx, args);
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
    appId: id("vaultApps"),
    projectName: string(),
    teamId: string(),
    projectId: string(),
  },
  returns: id("vaultConvexProjects"),
  handler: async (ctx, args): Promise<Id<"vaultConvexProjects">> => {
    const [plan] = await Promise.all([
      requireActiveManagedProvisioning(ctx, args),
      requireVaultApp(ctx, args),
    ]);
    if (plan.convex.projectName !== args.projectName) {
      throw new Error("Managed Convex project does not match the provisioning plan.");
    }
    if (plan.convex.state === "created") {
      if (plan.convex.projectId !== args.projectId) {
        throw new Error("Managed Convex project checkpoint already names another project.");
      }
      if (plan.convex.teamId !== args.teamId) {
        throw new Error("Managed Convex project checkpoint already names another team.");
      }
      return await insertProject(ctx, { ...args, origin: "provisioned" });
    }
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
    return await insertProject(ctx, { ...args, origin: "provisioned" });
  },
});

export const attachProject = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    appId: id("vaultApps"),
    teamId: string(),
    projectId: string(),
    origin: vVaultProviderResourceOrigin,
  },
  returns: id("vaultConvexProjects"),
  handler: async (ctx, args): Promise<Id<"vaultConvexProjects">> => {
    await requireConnectedVault(ctx, args);
    await requireVaultApp(ctx, args);
    return await insertProject(ctx, args);
  },
});

export const removeMissingProjectAttachment = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    convexProjectId: id("vaultConvexProjects"),
    teamId: string(),
    projectId: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    await requireConnectedVault(ctx, args);
    const project = await ctx.db.get(args.convexProjectId);
    if (!project || project.vaultId !== args.vaultId || project.userId !== args.userId) {
      throw new Error("Convex project attachment not found.");
    }
    if (project.teamId !== args.teamId || project.projectId !== args.projectId) {
      throw new Error("Convex project attachment changed before removal.");
    }
    await ctx.db.delete(project._id);
    return null;
  },
});
