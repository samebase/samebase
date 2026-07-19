import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { AppProvisioningStep } from "../appProvisioningModel";
import { normalizeVaultAppRoot } from "../../shared/vaultAppRoot";
import {
  vVaultConvexDeploymentAttachmentIntent,
  vVaultConvexOrigin,
  type VaultConvexDeploymentAttachmentIntent,
  type VaultConvexDeploymentAttachmentSnapshot,
} from "./model";
import { isLiveConnectedVault } from "./state";

const { boolean, id, literal, null: nullValue, object, string, union } = v;
const CONVEX_CONNECTION_STALE_MS = 10 * 60 * 1000;
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

type VaultProvisioningWriteLock = Doc<"workflow_vaultProvisioning_writeLocks">;
type ConvexDeploymentConnectionEventCtx = Pick<MutationCtx, "runMutation">;
type ConvexDeploymentConnectionReadCtx = Pick<QueryCtx, "db">;

function isComposedInfrastructureRun(run: Doc<"workflow_vaultProvisioning_runs">): boolean {
  return run.trigger === "create" || run.trigger === "retry";
}

function isStandaloneConvexDeploymentConnectionRun(
  run: Doc<"workflow_vaultProvisioning_runs">,
): boolean {
  return run.trigger === "connect_convex_deployment";
}

async function readVaultProvisioningWriteLock(
  ctx: ConvexDeploymentConnectionReadCtx,
  vaultId: Id<"vaults">,
): Promise<VaultProvisioningWriteLock | null> {
  return await ctx.db
    .query("workflow_vaultProvisioning_writeLocks")
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

function toConvexDeploymentAttachmentSnapshot(
  deployment: Doc<"vaultConvexDeployments">,
): VaultConvexDeploymentAttachmentSnapshot {
  return {
    attachmentId: deployment._id,
    connectedAt: deployment.connectedAt,
    projectId: deployment.projectId,
    deploymentName: deployment.deploymentName,
    origin: deployment.origin,
  };
}

function matchesConvexDeploymentAttachmentSnapshot(
  deployment: Doc<"vaultConvexDeployments">,
  expected: VaultConvexDeploymentAttachmentSnapshot,
): boolean {
  return (
    deployment._id === expected.attachmentId &&
    deployment.connectedAt === expected.connectedAt &&
    deployment.projectId === expected.projectId &&
    deployment.deploymentName === expected.deploymentName &&
    deployment.origin === expected.origin
  );
}

async function assertConvexDeploymentTargetMatchesIntent(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    appRoot: string;
    attachmentIntent: VaultConvexDeploymentAttachmentIntent;
    projectId?: string;
  },
): Promise<void> {
  const existingAppRootDeployment = await readConvexDeploymentForAppRoot(ctx, args);
  switch (args.attachmentIntent.mode) {
    case "attach":
      if (existingAppRootDeployment) {
        throw new Error("Vault already has a Convex deployment for this app root.");
      }
      break;
    case "replace_missing":
      if (
        !existingAppRootDeployment ||
        !matchesConvexDeploymentAttachmentSnapshot(
          existingAppRootDeployment,
          args.attachmentIntent.expected,
        )
      ) {
        throw new Error("Convex deployment attachment changed before it could be replaced.");
      }
      break;
    default:
      args.attachmentIntent satisfies never;
  }
  if (args.projectId) {
    const existingProject = await readConvexDeploymentByProviderIdentity(ctx, {
      vaultId: args.vaultId,
      projectId: args.projectId,
    });
    if (
      existingProject &&
      (args.attachmentIntent.mode === "attach" ||
        existingProject._id !== args.attachmentIntent.expected.attachmentId)
    ) {
      throw new Error("Convex project is already attached to this vault.");
    }
  }
}

function runHoldsConvexProvisioningWriteLock(
  writeLock: VaultProvisioningWriteLock | null,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
  },
): boolean {
  return writeLock?.state === "active" && writeLock.runId === args.runId;
}

async function appendConvexDeploymentConnectionEvent(
  ctx: ConvexDeploymentConnectionEventCtx,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
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
    runId: Id<"workflow_vaultProvisioning_runs">;
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
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<Doc<"workflow_vaultProvisioning_runs">> {
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
  writeLock: VaultProvisioningWriteLock | null;
  runId: Id<"workflow_vaultProvisioning_runs">;
  now: number;
}): boolean {
  const writeLock = args.writeLock;
  if (
    writeLock &&
    writeLock.state === "active" &&
    writeLock.runId !== args.runId &&
    args.now - writeLock.updatedAt < CONVEX_CONNECTION_STALE_MS
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
  returns: vVaultConvexDeploymentAttachmentIntent,
  handler: async (ctx, args): Promise<VaultConvexDeploymentAttachmentIntent> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    await assertVaultAppRootExists(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    const existingDeployment = await readConvexDeploymentForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });

    return existingDeployment
      ? {
          mode: "replace_missing",
          expected: toConvexDeploymentAttachmentSnapshot(existingDeployment),
        }
      : { mode: "attach" };
  },
});

export const claimConvexDeploymentConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
    attachmentIntent: vVaultConvexDeploymentAttachmentIntent,
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
      await assertConvexDeploymentTargetMatchesIntent(ctx, {
        vaultId: args.vaultId,
        appRoot,
        attachmentIntent: args.attachmentIntent,
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
    const writeLock = await readVaultProvisioningWriteLock(ctx, args.vaultId);
    if (
      hasFreshConvexDeploymentConnectionLock({
        writeLock,
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

    if (writeLock) {
      if (writeLock.state === "active" && writeLock.runId !== args.runId) {
        await cancelSupersededConvexDeploymentConnectionRun(ctx, {
          runId: writeLock.runId,
        });
      }
      await ctx.db.patch(writeLock._id, {
        runId: args.runId,
        state: "active",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
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
      message: `Started Convex deployment connection for ${appRoot}.`,
      state: "running",
    });

    return { claimed: true };
  },
});

export const readActiveConvexDeploymentConnection = internalQuery({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
    attachmentIntent: vVaultConvexDeploymentAttachmentIntent,
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
    const [writeLock, deployment] = await Promise.all([
      readVaultProvisioningWriteLock(ctx, args.vaultId),
      readConvexDeploymentForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
    ]);
    const targetStillMatches =
      args.attachmentIntent.mode === "attach"
        ? !deployment
        : deployment !== null &&
          matchesConvexDeploymentAttachmentSnapshot(deployment, args.attachmentIntent.expected);
    return {
      active:
        targetStillMatches && runHoldsConvexProvisioningWriteLock(writeLock, { runId: args.runId }),
    };
  },
});

export const attachDeploymentForRun = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
    convex: convexInfrastructureRecordValidator,
    origin: vVaultConvexOrigin,
    attachmentIntent: vVaultConvexDeploymentAttachmentIntent,
  },
  returns: object({ attached: boolean() }),
  handler: async (ctx, args) => {
    const run = await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    await assertVaultAppRootExists(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    const existingAppRootDeployment = await readConvexDeploymentForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    try {
      await assertConvexDeploymentTargetMatchesIntent(ctx, {
        vaultId: args.vaultId,
        appRoot,
        attachmentIntent: args.attachmentIntent,
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
        return { attached: false };
      }
      throw error;
    }

    const writeLock = await readVaultProvisioningWriteLock(ctx, args.vaultId);
    if (!writeLock || !runHoldsConvexProvisioningWriteLock(writeLock, { runId: args.runId })) {
      if (isStandaloneConvexDeploymentConnectionRun(run)) {
        await cancelSupersededConvexDeploymentConnectionRun(ctx, {
          runId: args.runId,
        });
        return { attached: false };
      }
      throw new Error("Composed infrastructure run no longer holds the provisioning write lock.");
    }

    const now = Date.now();
    if (args.attachmentIntent.mode === "replace_missing") {
      if (!existingAppRootDeployment) {
        throw new Error("Convex deployment attachment disappeared before replacement.");
      }
      await ctx.db.patch(existingAppRootDeployment._id, {
        projectId: args.convex.convexProjectId,
        deploymentName: args.convex.convexDeploymentName,
        origin: args.origin,
        connectedAt: now,
      });
      await appendConvexDeploymentConnectionEvent(ctx, {
        runId: args.runId,
        step: "attach_convex",
        level: "info",
        message: `Convex deployment ready for ${appRoot}: ${args.convex.convexDeploymentName}.`,
        state: "running",
      });

      return { attached: true };
    }

    if (existingAppRootDeployment) {
      throw new Error("Vault already has a Convex deployment for this app root.");
    }

    await ctx.db.insert("vaultConvexDeployments", {
      vaultId: args.vaultId,
      userId: args.userId,
      appRoot,
      projectId: args.convex.convexProjectId,
      deploymentName: args.convex.convexDeploymentName,
      origin: args.origin,
      connectedAt: now,
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
    runId: id("workflow_vaultProvisioning_runs"),
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
    runId: id("workflow_vaultProvisioning_runs"),
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
      .query("workflow_vaultProvisioning_runs")
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
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
    attachmentIntent: vVaultConvexDeploymentAttachmentIntent,
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const run = await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }

    const writeLock = await readVaultProvisioningWriteLock(ctx, args.vaultId);
    if (!writeLock || !runHoldsConvexProvisioningWriteLock(writeLock, { runId: args.runId })) {
      if (isStandaloneConvexDeploymentConnectionRun(run)) {
        await cancelSupersededConvexDeploymentConnectionRun(ctx, {
          runId: args.runId,
        });
        return null;
      }
      throw new Error("Composed infrastructure run no longer holds the provisioning write lock.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const deployment = await readConvexDeploymentForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    if (!deployment) {
      throw new Error("Convex deployment connection did not attach a deployment.");
    }
    if (
      args.attachmentIntent.mode === "replace_missing" &&
      matchesConvexDeploymentAttachmentSnapshot(deployment, args.attachmentIntent.expected)
    ) {
      throw new Error("Convex deployment connection did not replace the missing deployment.");
    }

    if (isStandaloneConvexDeploymentConnectionRun(run)) {
      await ctx.db.patch(writeLock._id, {
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
