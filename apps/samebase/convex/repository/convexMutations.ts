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
import { vConvexDeploymentRegion } from "../convexDeploymentRegionModel";
import { vConvexCodeLocation } from "./contracts/convexAttachments";
import {
  requireBillingResourceCapacityForAuthority,
  type BillingResourceAuthority,
} from "../billingResourceQuotas";
import { requireRepositoryForUser } from "../organizationAccess";
import {
  requireActiveRepositoryProvisioningAuthority,
  requireActiveRepositoryProvisioningContinuation,
} from "../repositoryWorkflowAuthority";
import { vRepositoryProviderResourceOrigin, type RepositoryProviderResourceOrigin } from "./model";
import {
  requireUserRepositoryInfrastructureIdle,
  requireManualProviderWriteContinuation,
  recordManagedProviderWrite,
} from "./infrastructureOperation";
import { isLiveConnectedRepository } from "./state";
import { requireSamebaseProvisioningPlan, type SamebaseProvisioningPlan } from "./provisioningPlan";

const { array, id, literal, object, string, union } = v;

type ConvexProjectGraphReadCtx = Pick<QueryCtx, "db">;

async function requireConnectedRepository(
  ctx: ConvexProjectGraphReadCtx,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
): Promise<Extract<Doc<"repositories">, { state: "connected" }>> {
  const repository = await requireRepositoryForUser(ctx.db, args);
  if (!isLiveConnectedRepository(repository)) {
    throw new Error("Repository not found.");
  }
  return repository;
}

async function requireActiveManagedProvisioning(
  ctx: ConvexProjectGraphReadCtx,
  args: {
    repositoryId: Id<"repositories">;
    userId: Id<"users">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
  },
): Promise<{
  repository: Extract<Doc<"repositories">, { state: "connected" }>;
  plan: SamebaseProvisioningPlan;
}> {
  const authority = await requireActiveRepositoryProvisioningAuthority(ctx.db, args);
  if (!isLiveConnectedRepository(authority.repository)) {
    throw new Error("Repository not found.");
  }
  const [writeLock, plan] = await Promise.all([
    ctx.db
      .query("workflow_repositoryProvisioning_writeLocks")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .unique(),
    ctx.db
      .query("workflow_repositoryProvisioning_plans")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .unique(),
  ]);
  if (authority.run.trigger !== "create" && authority.run.trigger !== "retry") {
    throw new Error("Managed provisioning run does not match repository.");
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
    throw new Error("Infrastructure provisioning plan not found for repository.");
  }
  return { repository: authority.repository, plan: requireSamebaseProvisioningPlan(plan) };
}

function readPlanConvexConfigPath(plan: SamebaseProvisioningPlan): string {
  return normalizeConvexConfigPath(plan.convexConfigPath);
}

async function readMatchingProject(
  ctx: ConvexProjectGraphReadCtx,
  args: {
    repositoryId: Id<"repositories">;
    organizationId: Id<"organizations">;
    teamId: string;
    projectId: string;
    codeLocation: ConvexCodeLocation;
  },
) {
  const existing = await ctx.db
    .query("repositoryConvexProjects")
    .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
    .unique();
  if (!existing) {
    return null;
  }
  if (
    existing.repositoryId === args.repositoryId &&
    existing.organizationId === args.organizationId &&
    existing.teamId === args.teamId &&
    getConvexCodeLocationKey(readConvexCodeLocation(existing)) ===
      getConvexCodeLocationKey(args.codeLocation)
  ) {
    return existing;
  }
  throw new Error("Convex project is already attached.");
}

/**
Attaches one Convex project, or returns this repository's row with the same identity. A provisioned
or setup_stack insert takes over the row's origin; a selected_existing insert never changes it.
*/
export async function insertProject(
  ctx: Pick<MutationCtx, "db">,
  repository: Extract<Doc<"repositories">, { state: "connected" }>,
  args: {
    repositoryId: Id<"repositories">;
    billingAuthority: BillingResourceAuthority;
    teamId: string;
    projectId: string;
    codeLocation: ConvexCodeLocation;
    origin: RepositoryProviderResourceOrigin;
  },
): Promise<Id<"repositoryConvexProjects">> {
  if (args.teamId !== repository.convexTeamId) {
    throw new Error("Convex project team does not match the repository destination.");
  }
  const codeLocation = normalizeConvexCodeLocation(args.codeLocation);
  const existing = await readMatchingProject(ctx, {
    repositoryId: args.repositoryId,
    organizationId: repository.organizationId,
    teamId: args.teamId,
    projectId: args.projectId,
    codeLocation,
  });
  if (existing) {
    if (args.origin !== "selected_existing" && existing.origin !== args.origin) {
      await ctx.db.patch(existing._id, { origin: args.origin });
    }
    return existing._id;
  }

  await requireBillingResourceCapacityForAuthority(ctx, {
    authority: args.billingAuthority,
  });

  const commonFields = {
    repositoryId: args.repositoryId,
    organizationId: repository.organizationId,
    teamId: args.teamId,
    projectId: args.projectId,
    origin: args.origin,
  };
  switch (codeLocation.kind) {
    case "config":
      return await ctx.db.insert("repositoryConvexProjects", {
        ...commonFields,
        convexConfigPath: codeLocation.convexConfigPath,
      });
    case "directory":
      return await ctx.db.insert("repositoryConvexProjects", {
        ...commonFields,
        convexDirectoryPath: codeLocation.convexDirectoryPath,
      });
    default:
      codeLocation satisfies never;
      throw new Error("Unsupported Convex code location.");
  }
}

export const requireConvexProjectConnectionRepository = internalQuery({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireConnectedRepository(ctx, args);
    return null;
  },
});

export const readProjectAttachmentContext = internalQuery({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    convexProjectId: id("repositoryConvexProjects"),
  },
  returns: object({
    organizationId: id("organizations"),
    teamId: string(),
    projectId: string(),
    codeLocation: vConvexCodeLocation,
  }),
  handler: async (ctx, args) => {
    const repository = await requireConnectedRepository(ctx, args);
    const project = await ctx.db.get(args.convexProjectId);
    if (
      !project ||
      project.repositoryId !== args.repositoryId ||
      project.organizationId !== repository.organizationId ||
      project.teamId !== repository.convexTeamId
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
    repositoryId: id("repositories"),
    userId: id("users"),
    runId: id("workflow_repositoryProvisioning_runs"),
    projectName: string(),
    teamId: string(),
  },
  returns: union(
    object({ state: literal("planned"), deploymentRegion: vConvexDeploymentRegion }),
    object({ state: literal("creating"), deploymentRegion: vConvexDeploymentRegion }),
    object({
      state: literal("created"),
      deploymentRegion: vConvexDeploymentRegion,
      projectId: string(),
    }),
  ),
  handler: async (ctx, args) => {
    const { plan, repository } = await requireActiveManagedProvisioning(ctx, args);
    if (plan.convex.projectName !== args.projectName) {
      throw new Error("Managed Convex project does not match the provisioning plan.");
    }
    if (repository.convexTeamId !== args.teamId) {
      throw new Error("Connected Convex team does not match the repository destination.");
    }
    switch (plan.convex.state) {
      case "planned":
        return { state: "planned" as const, deploymentRegion: plan.convex.deploymentRegion };
      case "creating":
        return { state: "creating" as const, deploymentRegion: plan.convex.deploymentRegion };
      case "created":
        return {
          state: "created" as const,
          deploymentRegion: plan.convex.deploymentRegion,
          projectId: plan.convex.projectId,
        };
    }
  },
});

export const beginManagedProjectCreate = internalMutation({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    runId: id("workflow_repositoryProvisioning_runs"),
    projectName: string(),
    teamId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { plan, repository } = await requireActiveManagedProvisioning(ctx, args);
    if (plan.convex.projectName !== args.projectName) {
      throw new Error("Managed Convex project does not match the provisioning plan.");
    }
    if (repository.convexTeamId !== args.teamId) {
      throw new Error("Connected Convex team does not match the repository destination.");
    }
    if (plan.convex.state !== "planned") {
      throw new Error("Managed Convex project creation already started.");
    }
    await requireActiveRepositoryProvisioningContinuation(ctx, args);
    await ctx.db.patch(plan._id, {
      convex: {
        state: "creating",
        projectName: args.projectName,
        deploymentRegion: plan.convex.deploymentRegion,
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const recordManagedProjectCreated = internalMutation({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    runId: id("workflow_repositoryProvisioning_runs"),
    convexConfigPath: string(),
    projectName: string(),
    teamId: string(),
    projectId: string(),
  },
  returns: id("repositoryConvexProjects"),
  handler: async (ctx, args): Promise<Id<"repositoryConvexProjects">> => {
    const { plan, repository } = await requireActiveManagedProvisioning(ctx, args);
    const convexConfigPath = normalizeConvexConfigPath(args.convexConfigPath);
    if (convexConfigPath !== readPlanConvexConfigPath(plan)) {
      throw new Error("Managed Convex config path does not match the provisioning plan.");
    }
    if (plan.convex.projectName !== args.projectName) {
      throw new Error("Managed Convex project does not match the provisioning plan.");
    }
    await requireActiveRepositoryProvisioningContinuation(ctx, args);
    let convexProjectId: Id<"repositoryConvexProjects">;
    if (plan.convex.state === "created") {
      if (plan.convex.projectId !== args.projectId) {
        throw new Error("Managed Convex project checkpoint already names another project.");
      }
      convexProjectId = await insertProject(ctx, repository, {
        repositoryId: args.repositoryId,
        billingAuthority: {
          kind: "repository_provisioning",
          runId: args.runId,
          userId: args.userId,
          repositoryId: args.repositoryId,
        },
        teamId: args.teamId,
        projectId: args.projectId,
        codeLocation: { kind: "config", convexConfigPath },
        origin: "provisioned",
      });
    } else {
      if (plan.convex.state !== "creating" || repository.convexTeamId !== args.teamId) {
        throw new Error(
          "Managed Convex project creation was not started for this repository team.",
        );
      }
      await ctx.db.patch(plan._id, {
        convex: {
          state: "created",
          projectName: args.projectName,
          deploymentRegion: plan.convex.deploymentRegion,
          projectId: args.projectId,
        },
        updatedAt: Date.now(),
      });
      convexProjectId = await insertProject(ctx, repository, {
        repositoryId: args.repositoryId,
        billingAuthority: {
          kind: "repository_provisioning",
          runId: args.runId,
          userId: args.userId,
          repositoryId: args.repositoryId,
        },
        teamId: args.teamId,
        projectId: args.projectId,
        codeLocation: { kind: "config", convexConfigPath },
        origin: "provisioned",
      });
    }
    await recordManagedProviderWrite(ctx, {
      repositoryId: args.repositoryId,
      runId: args.runId,
      provider: "convex",
    });
    return convexProjectId;
  },
});

export const recordManualProjectCreated = internalMutation({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    actionId: string(),
    teamId: string(),
    projectId: string(),
    codeLocation: vConvexCodeLocation,
  },
  returns: id("repositoryConvexProjects"),
  handler: async (ctx, args): Promise<Id<"repositoryConvexProjects">> => {
    const repository = await requireManualProviderWriteContinuation(ctx, {
      repositoryId: args.repositoryId,
      actionId: args.actionId,
      userId: args.userId,
    });
    return await insertProject(ctx, repository, {
      repositoryId: args.repositoryId,
      billingAuthority: {
        kind: "manual_provider_write",
        actionId: args.actionId,
        userId: args.userId,
        repositoryId: args.repositoryId,
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
    repositoryId: id("repositories"),
    userId: id("users"),
    projects: array(
      object({
        teamId: string(),
        projectId: string(),
        codeLocation: vConvexCodeLocation,
        origin: vRepositoryProviderResourceOrigin,
      }),
    ),
  },
  returns: array(id("repositoryConvexProjects")),
  handler: async (ctx, args): Promise<Array<Id<"repositoryConvexProjects">>> => {
    const repository = await requireUserRepositoryInfrastructureIdle(ctx, args);
    if (args.projects.some((project) => project.teamId !== repository.convexTeamId)) {
      throw new Error("Convex project team does not match the repository destination.");
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
    const projectAttachmentIds: Array<Id<"repositoryConvexProjects">> = [];
    for (const project of projects) {
      projectAttachmentIds.push(
        await insertProject(ctx, repository, {
          repositoryId: args.repositoryId,
          billingAuthority: {
            kind: "user",
            organizationId: repository.organizationId,
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
    repositoryId: id("repositories"),
    userId: id("users"),
    convexProjectId: id("repositoryConvexProjects"),
    projectId: string(),
    expectedCodeLocation: vConvexCodeLocation,
    nextCodeLocation: vConvexCodeLocation,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const repository = await requireUserRepositoryInfrastructureIdle(ctx, args);
    const project = await ctx.db.get(args.convexProjectId);
    const expectedCodeLocation = normalizeConvexCodeLocation(args.expectedCodeLocation);
    const nextCodeLocation = normalizeConvexCodeLocation(args.nextCodeLocation);
    if (
      !project ||
      project.repositoryId !== args.repositoryId ||
      project.organizationId !== repository.organizationId ||
      project.projectId !== args.projectId ||
      getConvexCodeLocationKey(readConvexCodeLocation(project)) !==
        getConvexCodeLocationKey(expectedCodeLocation)
    ) {
      throw new Error("Convex project attachment changed before code location reconciliation.");
    }
    const commonFields = {
      repositoryId: project.repositoryId,
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

/** Removes the attachment record only; the Convex project keeps running in Convex. */
export async function detachProjectForUser(
  ctx: MutationCtx,
  args: {
    repositoryId: Id<"repositories">;
    userId: Id<"users">;
    convexProjectId: Id<"repositoryConvexProjects">;
  },
): Promise<void> {
  const repository = await requireUserRepositoryInfrastructureIdle(ctx, args);
  const project = await ctx.db.get(args.convexProjectId);
  if (
    !project ||
    project.repositoryId !== args.repositoryId ||
    project.organizationId !== repository.organizationId
  ) {
    throw new Error("Convex project attachment not found.");
  }
  await ctx.db.delete(project._id);
}
