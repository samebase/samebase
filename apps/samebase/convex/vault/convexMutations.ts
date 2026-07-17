import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { AppProvisioningStep } from "../schema";
import {
  isVaultProviderUpstreamPresent,
  vVaultConvexOrigin,
  VAULT_PROVIDER_UPSTREAM_PRESENT,
} from "./model";
import { isLiveConnectedVault } from "./state";

const { boolean, id, literal, null: nullValue, object, string, union } = v;
const CONVEX_CONNECTION_STALE_MS = 10 * 60 * 1000;
const CONVEX_PREVIEW_DEPLOYMENT_NOT_ENSURED = {
  state: "not_ensured",
} as const;

const createdConvexProjectValidator = object({
  projectName: string(),
  projectId: string(),
  projectSlug: string(),
});

const convexInfrastructureRecordValidator = object({
  convexProjectId: string(),
  convexTeamSlug: string(),
  convexProjectSlug: string(),
  convexDeploymentName: string(),
  convexDeploymentType: literal("prod"),
  convexCloudUrl: string(),
  convexSiteUrl: string(),
});
const convexDeploymentAttachmentResult = union(
  object({ state: literal("attached"), deploymentId: id("vaultConvexDeployments") }),
  object({ state: literal("not_attached") }),
);
type ConvexDeploymentAttachmentResult = Infer<typeof convexDeploymentAttachmentResult>;

type VaultInfrastructureOwnership = Doc<"vaultInfrastructureOwnership">;
type ConvexDeploymentConnectionEventCtx = Pick<MutationCtx, "runMutation">;
type ConvexDeploymentConnectionReadCtx = Pick<QueryCtx, "db">;

function isComposedInfrastructureRun(run: Doc<"appProvisioningRuns">): boolean {
  return run.trigger === "create" || run.trigger === "retry";
}

function isStandaloneConvexDeploymentConnectionRun(run: Doc<"appProvisioningRuns">): boolean {
  return run.trigger === "connect_convex_deployment";
}

async function getVaultInfrastructureOwnership(
  ctx: ConvexDeploymentConnectionReadCtx,
  vaultId: Id<"vaults">,
): Promise<VaultInfrastructureOwnership | null> {
  return await ctx.db
    .query("vaultInfrastructureOwnership")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .first();
}

async function readConvexDeploymentForApp(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    appId: Id<"vaultApps">;
  },
): Promise<Doc<"vaultConvexDeployments"> | null> {
  return await ctx.db
    .query("vaultConvexDeployments")
    .withIndex("by_app", (q) => q.eq("appId", args.appId))
    .unique();
}

async function requireVaultApp(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    appId: Id<"vaultApps">;
    userId: Id<"users">;
  },
): Promise<Doc<"vaultApps">> {
  const app = await ctx.db.get(args.appId);
  if (!app || app.vaultId !== args.vaultId || app.userId !== args.userId) {
    throw new Error("Vault app not found.");
  }
  return app;
}

async function readConvexDeploymentByProviderIdentity(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    projectId: string;
  },
): Promise<Doc<"vaultConvexDeployments"> | null> {
  return await ctx.db
    .query("vaultConvexDeployments")
    .withIndex("by_vault_and_project", (q) =>
      q.eq("vaultId", args.vaultId).eq("projectId", args.projectId),
    )
    .first();
}

async function assertNoExistingConvexDeploymentTarget(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    appId: Id<"vaultApps">;
    projectId?: string;
  },
): Promise<void> {
  const existingAppDeployment = await readConvexDeploymentForApp(ctx, args);
  if (existingAppDeployment && isVaultProviderUpstreamPresent(existingAppDeployment)) {
    throw new Error("Vault app already has a Convex deployment.");
  }
  if (args.projectId) {
    const existingProject = await readConvexDeploymentByProviderIdentity(ctx, {
      vaultId: args.vaultId,
      projectId: args.projectId,
    });
    if (
      existingProject &&
      (isVaultProviderUpstreamPresent(existingProject) ||
        !existingAppDeployment ||
        existingProject._id !== existingAppDeployment._id)
    ) {
      throw new Error("Convex project is already attached to this vault.");
    }
  }
}

function isActiveConvexDeploymentConnectionOwner(
  ownership: VaultInfrastructureOwnership | null,
  args: {
    runId: Id<"appProvisioningRuns">;
  },
): boolean {
  return ownership?.state === "active" && ownership.runId === args.runId;
}

async function appendConvexDeploymentConnectionEvent(
  ctx: ConvexDeploymentConnectionEventCtx,
  args: {
    runId: Id<"appProvisioningRuns">;
    step: AppProvisioningStep;
    level: "info" | "warn" | "error";
    message: string;
    state: "unchanged" | "queued" | "running" | "succeeded" | "failed" | "canceled";
  },
): Promise<void> {
  await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, args);
}

async function cancelSupersededConvexDeploymentConnectionRun(
  ctx: ConvexDeploymentConnectionEventCtx,
  args: {
    runId: Id<"appProvisioningRuns">;
  },
): Promise<void> {
  await appendConvexDeploymentConnectionEvent(ctx, {
    runId: args.runId,
    step: "claim_infra",
    level: "warn",
    message: "Convex deployment connection was superseded by a newer run.",
    state: "canceled",
  });
}

async function requireConvexDeploymentConnectionRun(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<Doc<"appProvisioningRuns">> {
  const run = await ctx.db.get(args.runId);
  if (!run) {
    throw new Error("Convex deployment connection run not found.");
  }
  if (
    run.userId !== args.userId ||
    run.vaultId !== args.vaultId ||
    (!isStandaloneConvexDeploymentConnectionRun(run) && !isComposedInfrastructureRun(run))
  ) {
    throw new Error("Convex deployment connection run does not match vault.");
  }
  return run;
}

function hasFreshConvexDeploymentConnectionLock(args: {
  ownership: VaultInfrastructureOwnership | null;
  runId: Id<"appProvisioningRuns">;
  now: number;
}): boolean {
  const ownership = args.ownership;
  if (
    ownership &&
    ownership.state === "active" &&
    ownership.runId !== args.runId &&
    args.now - ownership.updatedAt < CONVEX_CONNECTION_STALE_MS
  ) {
    return true;
  }

  return false;
}

export const requireConvexDeploymentConnectionVault = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    appId: id("vaultApps"),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    await requireVaultApp(ctx, args);
    await assertNoExistingConvexDeploymentTarget(ctx, {
      vaultId: args.vaultId,
      appId: args.appId,
    });

    return null;
  },
});

export const claimConvexDeploymentConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
  },
  returns: object({ claimed: boolean() }),
  handler: async (ctx, args) => {
    await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const app = await requireVaultApp(ctx, args);
    try {
      await assertNoExistingConvexDeploymentTarget(ctx, {
        vaultId: args.vaultId,
        appId: args.appId,
      });
    } catch (error) {
      await appendConvexDeploymentConnectionEvent(ctx, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: error instanceof Error ? error.message : "Convex deployment is already attached.",
        state: "canceled",
      });
      return { claimed: false };
    }

    const now = Date.now();
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (
      hasFreshConvexDeploymentConnectionLock({
        ownership,
        runId: args.runId,
        now,
      })
    ) {
      await appendConvexDeploymentConnectionEvent(ctx, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: "Convex deployment connection is already running.",
        state: "canceled",
      });
      return { claimed: false };
    }

    if (ownership) {
      if (ownership.state === "active" && ownership.runId !== args.runId) {
        await cancelSupersededConvexDeploymentConnectionRun(ctx, {
          runId: ownership.runId,
        });
      }
      await ctx.db.patch(ownership._id, {
        runId: args.runId,
        state: "active",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId: args.vaultId,
        runId: args.runId,
        state: "active",
        updatedAt: now,
      });
    }

    await appendConvexDeploymentConnectionEvent(ctx, {
      runId: args.runId,
      step: "claim_infra",
      level: "info",
      message: `Started Convex deployment connection for ${app.rootDirectory}.`,
      state: "running",
    });

    return { claimed: true };
  },
});

export const readActiveConvexDeploymentConnection = internalQuery({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
  },
  returns: object({ active: boolean() }),
  handler: async (ctx, args) => {
    await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    await requireVaultApp(ctx, args);
    const [ownership, deployment] = await Promise.all([
      getVaultInfrastructureOwnership(ctx, args.vaultId),
      readConvexDeploymentForApp(ctx, { appId: args.appId }),
    ]);
    return {
      active:
        (!deployment || !isVaultProviderUpstreamPresent(deployment)) &&
        isActiveConvexDeploymentConnectionOwner(ownership, { runId: args.runId }),
    };
  },
});

export const attachDeploymentForRun = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
    convex: convexInfrastructureRecordValidator,
    origin: vVaultConvexOrigin,
  },
  returns: convexDeploymentAttachmentResult,
  handler: async (ctx, args): Promise<ConvexDeploymentAttachmentResult> => {
    const run = await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const app = await requireVaultApp(ctx, args);
    const existingAppDeployment = await readConvexDeploymentForApp(ctx, {
      appId: args.appId,
    });
    try {
      await assertNoExistingConvexDeploymentTarget(ctx, {
        vaultId: args.vaultId,
        appId: args.appId,
        projectId: args.convex.convexProjectId,
      });
    } catch (error) {
      if (isStandaloneConvexDeploymentConnectionRun(run)) {
        await appendConvexDeploymentConnectionEvent(ctx, {
          runId: args.runId,
          step: "attach_convex",
          level: "warn",
          message:
            error instanceof Error ? error.message : "Convex deployment is already attached.",
          state: "canceled",
        });
        return { state: "not_attached" };
      }
      throw error;
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveConvexDeploymentConnectionOwner(ownership, { runId: args.runId })) {
      if (isStandaloneConvexDeploymentConnectionRun(run)) {
        await cancelSupersededConvexDeploymentConnectionRun(ctx, {
          runId: args.runId,
        });
        return { state: "not_attached" };
      }
      throw new Error("Composed infrastructure run no longer owns provisioning.");
    }

    const now = Date.now();
    if (existingAppDeployment) {
      await ctx.db.patch(existingAppDeployment._id, {
        projectId: args.convex.convexProjectId,
        teamSlug: args.convex.convexTeamSlug,
        projectSlug: args.convex.convexProjectSlug,
        deploymentName: args.convex.convexDeploymentName,
        deploymentType: args.convex.convexDeploymentType,
        cloudUrl: args.convex.convexCloudUrl,
        siteUrl: args.convex.convexSiteUrl,
        previewDeployment: CONVEX_PREVIEW_DEPLOYMENT_NOT_ENSURED,
        origin: args.origin,
        upstream: VAULT_PROVIDER_UPSTREAM_PRESENT,
        connectedAt: now,
        lastObservedAt: now,
      });
      await appendConvexDeploymentConnectionEvent(ctx, {
        runId: args.runId,
        step: "attach_convex",
        level: "info",
        message: `Convex deployment ready for ${app.rootDirectory}: ${args.convex.convexDeploymentName}.`,
        state: "running",
      });

      return { state: "attached", deploymentId: existingAppDeployment._id };
    }

    const deploymentId = await ctx.db.insert("vaultConvexDeployments", {
      vaultId: args.vaultId,
      userId: args.userId,
      appId: args.appId,
      projectId: args.convex.convexProjectId,
      teamSlug: args.convex.convexTeamSlug,
      projectSlug: args.convex.convexProjectSlug,
      deploymentName: args.convex.convexDeploymentName,
      deploymentType: args.convex.convexDeploymentType,
      cloudUrl: args.convex.convexCloudUrl,
      siteUrl: args.convex.convexSiteUrl,
      previewDeployment: CONVEX_PREVIEW_DEPLOYMENT_NOT_ENSURED,
      origin: args.origin,
      upstream: VAULT_PROVIDER_UPSTREAM_PRESENT,
      connectedAt: now,
      lastObservedAt: now,
    });
    await appendConvexDeploymentConnectionEvent(ctx, {
      runId: args.runId,
      step: "attach_convex",
      level: "info",
      message: `Convex deployment ready for ${app.rootDirectory}: ${args.convex.convexDeploymentName}.`,
      state: "running",
    });

    return { state: "attached", deploymentId };
  },
});

export const recordCreatedProjectForRun = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    projectName: string(),
    projectId: string(),
    projectSlug: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }

    await ctx.db.patch(args.runId, {
      createdConvexProject: {
        projectName: args.projectName,
        projectId: args.projectId,
        projectSlug: args.projectSlug,
      },
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const readReusableCreatedProjectForRun = internalQuery({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    projectName: string(),
  },
  returns: union(createdConvexProjectValidator, nullValue()),
  handler: async (ctx, args) => {
    await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }

    const runs = await ctx.db
      .query("appProvisioningRuns")
      .withIndex("by_vault_and_updated_at", (q) => q.eq("vaultId", args.vaultId))
      .collect();
    const reusableRuns = runs
      .filter(
        (run) =>
          run.userId === args.userId &&
          (isStandaloneConvexDeploymentConnectionRun(run) || isComposedInfrastructureRun(run)) &&
          run.createdConvexProject?.projectName === args.projectName,
      )
      .sort(
        (left, right) =>
          right.updatedAt - left.updatedAt ||
          right._creationTime - left._creationTime ||
          right._id.localeCompare(left._id),
      );

    return reusableRuns[0]?.createdConvexProject ?? null;
  },
});

export const finishConvexDeploymentConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    deploymentId: id("vaultConvexDeployments"),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const run = await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveConvexDeploymentConnectionOwner(ownership, { runId: args.runId })) {
      if (isStandaloneConvexDeploymentConnectionRun(run)) {
        await cancelSupersededConvexDeploymentConnectionRun(ctx, {
          runId: args.runId,
        });
        return null;
      }
      throw new Error("Composed infrastructure run no longer owns provisioning.");
    }
    const deployment = await ctx.db.get(args.deploymentId);
    if (
      !deployment ||
      deployment.vaultId !== args.vaultId ||
      deployment.userId !== args.userId ||
      !isVaultProviderUpstreamPresent(deployment)
    ) {
      throw new Error("Convex deployment connection did not attach a deployment.");
    }

    if (isStandaloneConvexDeploymentConnectionRun(run)) {
      await ctx.db.patch(ownership._id, {
        state: "succeeded",
        updatedAt: Date.now(),
      });
      await appendConvexDeploymentConnectionEvent(ctx, {
        runId: args.runId,
        step: "finish",
        level: "info",
        message: "Convex deployment is connected.",
        state: "succeeded",
      });
      return null;
    }

    await appendConvexDeploymentConnectionEvent(ctx, {
      runId: args.runId,
      step: "attach_convex",
      level: "info",
      message: "Convex deployment is connected.",
      state: "running",
    });

    return null;
  },
});
