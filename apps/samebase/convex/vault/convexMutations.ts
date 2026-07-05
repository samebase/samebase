import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { AppProvisioningStep } from "../schema";
import { normalizeVaultAppRoot } from "../../shared/vaultAppRoot";
import { vVaultConvexOrigin } from "./model";
import { isLiveConnectedVault } from "./state";

const { boolean, id, literal, null: nullValue, object, string, union } = v;
const CONVEX_CONNECTION_STALE_MS = 10 * 60 * 1000;
const CONVEX_DEPLOY_KEYS_NOT_CREATED = {
  production: { state: "not_created" },
  preview: { state: "not_created" },
} as const;
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

type VaultInfrastructureOwnership = Doc<"vaultInfrastructureOwnership">;
type ConvexDeploymentConnectionEventCtx = Pick<MutationCtx, "runMutation">;
type ConvexDeploymentConnectionReadCtx = Pick<QueryCtx, "db">;

async function getVaultInfrastructureOwnership(
  ctx: ConvexDeploymentConnectionReadCtx,
  vaultId: Id<"vaults">,
): Promise<VaultInfrastructureOwnership | null> {
  return await ctx.db
    .query("vaultInfrastructureOwnership")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .first();
}

async function readConvexDeploymentForAppRoot(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    appRoot: string;
  },
): Promise<Doc<"vaultConvexDeployments"> | null> {
  return await ctx.db
    .query("vaultConvexDeployments")
    .withIndex("by_vault_and_appRoot", (q) =>
      q.eq("vaultId", args.vaultId).eq("appRoot", args.appRoot),
    )
    .first();
}

async function assertVaultAppRootExists(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    appRoot: string;
  },
): Promise<void> {
  const app = await ctx.db
    .query("vaultApps")
    .withIndex("by_vault_and_appRoot", (q) =>
      q.eq("vaultId", args.vaultId).eq("appRoot", args.appRoot),
    )
    .first();
  if (!app) {
    throw new Error("Vault app root not found.");
  }
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
    appRoot: string;
    projectId?: string;
  },
): Promise<void> {
  const existingAppRootDeployment = await readConvexDeploymentForAppRoot(ctx, args);
  if (existingAppRootDeployment) {
    throw new Error("Vault already has a Convex deployment for this app root.");
  }
  if (args.projectId) {
    const existingProject = await readConvexDeploymentByProviderIdentity(ctx, {
      vaultId: args.vaultId,
      projectId: args.projectId,
    });
    if (existingProject) {
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
    run.trigger !== "connect_convex_deployment"
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
    appRoot: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    await assertVaultAppRootExists(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    await assertNoExistingConvexDeploymentTarget(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });

    return null;
  },
});

export const claimConvexDeploymentConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: object({ claimed: boolean() }),
  handler: async (ctx, args) => {
    await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    await assertVaultAppRootExists(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    try {
      await assertNoExistingConvexDeploymentTarget(ctx, {
        vaultId: args.vaultId,
        appRoot,
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

    const nextProvisioningVersion =
      ownership && ownership.runId === args.runId
        ? ownership.provisioningVersion
        : (ownership?.provisioningVersion ?? 0) + 1;
    if (ownership) {
      if (ownership.state === "active" && ownership.runId !== args.runId) {
        await cancelSupersededConvexDeploymentConnectionRun(ctx, {
          runId: ownership.runId,
        });
      }
      await ctx.db.patch(ownership._id, {
        runId: args.runId,
        provisioningVersion: nextProvisioningVersion,
        state: "active",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId: args.vaultId,
        runId: args.runId,
        provisioningVersion: nextProvisioningVersion,
        state: "active",
        updatedAt: now,
      });
    }

    await appendConvexDeploymentConnectionEvent(ctx, {
      runId: args.runId,
      step: "claim_infra",
      level: "info",
      message: `Started Convex deployment connection for ${appRoot}.`,
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
    appRoot: string(),
  },
  returns: object({ active: boolean() }),
  handler: async (ctx, args) => {
    await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    await assertVaultAppRootExists(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    const [ownership, deployment] = await Promise.all([
      getVaultInfrastructureOwnership(ctx, args.vaultId),
      readConvexDeploymentForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
    ]);
    return {
      active:
        !deployment && isActiveConvexDeploymentConnectionOwner(ownership, { runId: args.runId }),
    };
  },
});

export const attachDeploymentForRun = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appRoot: string(),
    convex: convexInfrastructureRecordValidator,
    origin: vVaultConvexOrigin,
  },
  returns: object({ attached: boolean() }),
  handler: async (ctx, args) => {
    await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    await assertVaultAppRootExists(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    try {
      await assertNoExistingConvexDeploymentTarget(ctx, {
        vaultId: args.vaultId,
        appRoot,
        projectId: args.convex.convexProjectId,
      });
    } catch (error) {
      await appendConvexDeploymentConnectionEvent(ctx, {
        runId: args.runId,
        step: "attach_convex",
        level: "warn",
        message: error instanceof Error ? error.message : "Convex deployment is already attached.",
        state: "canceled",
      });
      return { attached: false };
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveConvexDeploymentConnectionOwner(ownership, { runId: args.runId })) {
      await cancelSupersededConvexDeploymentConnectionRun(ctx, {
        runId: args.runId,
      });
      return { attached: false };
    }

    const now = Date.now();
    await ctx.db.insert("vaultConvexDeployments", {
      vaultId: args.vaultId,
      userId: args.userId,
      appRoot,
      projectId: args.convex.convexProjectId,
      teamSlug: args.convex.convexTeamSlug,
      projectSlug: args.convex.convexProjectSlug,
      deploymentName: args.convex.convexDeploymentName,
      deploymentType: args.convex.convexDeploymentType,
      cloudUrl: args.convex.convexCloudUrl,
      siteUrl: args.convex.convexSiteUrl,
      previewDeployment: CONVEX_PREVIEW_DEPLOYMENT_NOT_ENSURED,
      deployKeys: CONVEX_DEPLOY_KEYS_NOT_CREATED,
      origin: args.origin,
      connectedAt: now,
      lastObservedAt: now,
    });
    await appendConvexDeploymentConnectionEvent(ctx, {
      runId: args.runId,
      step: "attach_convex",
      level: "info",
      message: `Convex deployment ready for ${appRoot}: ${args.convex.convexDeploymentName}.`,
      state: "running",
    });

    return { attached: true };
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
          run.trigger === "connect_convex_deployment" &&
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
    appRoot: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveConvexDeploymentConnectionOwner(ownership, { runId: args.runId })) {
      await cancelSupersededConvexDeploymentConnectionRun(ctx, {
        runId: args.runId,
      });
      return null;
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const deployment = await readConvexDeploymentForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    if (!deployment) {
      throw new Error("Convex deployment connection did not attach a deployment.");
    }

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
  },
});
