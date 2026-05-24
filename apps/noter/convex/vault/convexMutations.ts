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
import { vVaultConvexOrigin } from "./model";
import { isLiveConnectedVault } from "./state";

const { boolean, id, literal, null: nullValue, object, string, union } = v;
const CONVEX_CONNECTION_STALE_MS = 10 * 60 * 1000;
const CONVEX_DEPLOY_KEYS_NOT_CREATED = {
  production: { state: "not_created" },
  preview: { state: "not_created" },
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
  vault: Doc<"vaults">;
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

  const vault = args.vault;
  return (
    isLiveConnectedVault(vault) &&
    vault.convex.state === "provisioning" &&
    vault.convex.runId !== args.runId &&
    args.now - vault.convex.startedAt < CONVEX_CONNECTION_STALE_MS
  );
}

export const requireConvexDeploymentConnectionVault = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    if (vault.convex.state === "connected") {
      throw new Error("Vault already has a Convex deployment attached.");
    }

    return null;
  },
});

export const claimConvexDeploymentConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
  },
  returns: object({ claimed: boolean() }),
  handler: async (ctx, args) => {
    await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    if (vault.convex.state === "connected") {
      await appendConvexDeploymentConnectionEvent(ctx, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: "Vault already has a Convex deployment attached.",
        state: "canceled",
      });
      return { claimed: false };
    }

    const now = Date.now();
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (
      hasFreshConvexDeploymentConnectionLock({
        vault,
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

    await ctx.db.patch(args.vaultId, {
      convex: {
        state: "provisioning",
        runId: args.runId,
        startedAt: now,
      },
    });
    await appendConvexDeploymentConnectionEvent(ctx, {
      runId: args.runId,
      step: "claim_infra",
      level: "info",
      message: "Started Convex deployment connection.",
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
  },
  returns: object({ active: boolean() }),
  handler: async (ctx, args) => {
    await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    return {
      active:
        vault.convex.state === "provisioning" &&
        vault.convex.runId === args.runId &&
        isActiveConvexDeploymentConnectionOwner(ownership, { runId: args.runId }),
    };
  },
});

export const attachDeploymentForRun = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
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
    if (vault.convex.state === "connected") {
      await appendConvexDeploymentConnectionEvent(ctx, {
        runId: args.runId,
        step: "ensure_convex",
        level: "warn",
        message: "Vault already has a Convex deployment attached.",
        state: "canceled",
      });
      return { attached: false };
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (
      !ownership ||
      !isActiveConvexDeploymentConnectionOwner(ownership, { runId: args.runId }) ||
      vault.convex.state !== "provisioning" ||
      vault.convex.runId !== args.runId
    ) {
      await cancelSupersededConvexDeploymentConnectionRun(ctx, {
        runId: args.runId,
      });
      return { attached: false };
    }

    const existing = await ctx.db
      .query("vaultInfrastructure")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args.convex,
        convexDeployKeys: CONVEX_DEPLOY_KEYS_NOT_CREATED,
      });
    } else {
      await ctx.db.insert("vaultInfrastructure", {
        vaultId: args.vaultId,
        ...args.convex,
        convexDeployKeys: CONVEX_DEPLOY_KEYS_NOT_CREATED,
      });
    }

    await ctx.db.patch(args.vaultId, {
      convex: {
        state: "connected",
        projectId: args.convex.convexProjectId,
        projectSlug: args.convex.convexProjectSlug,
        deploymentName: args.convex.convexDeploymentName,
        origin: args.origin,
        connectedAt: Date.now(),
      },
    });
    await appendConvexDeploymentConnectionEvent(ctx, {
      runId: args.runId,
      step: "ensure_convex",
      level: "info",
      message: `Convex deployment ready: ${args.convex.convexDeploymentName}.`,
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
    if (vault.convex.state !== "connected") {
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
