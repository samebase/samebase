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
  buildVaultCloudflareBuildConfigForAppRoot,
  vVaultCloudflareBuildConfig,
  vVaultCloudflareConnectedBuilds,
  vVaultCloudflareOrigin,
} from "./model";
import { isLiveConnectedVault } from "./state";

const { boolean, id, literal, null: nullValue, object, optional, string, union } = v;
const CLOUDFLARE_CONNECTION_STALE_MS = 10 * 60 * 1000;

const cloudflareBuildsWiringState = union(
  object({
    active: literal(false),
  }),
  object({
    active: literal(true),
    owner: string(),
    repo: string(),
    ghRepoId: string(),
    defaultBranch: string(),
    hasConvexDeployment: boolean(),
    buildConfig: vVaultCloudflareBuildConfig,
    worker: object({
      accountId: string(),
      workerName: string(),
      workerTag: string(),
    }),
  }),
);
const cloudflareWorkerDiscoveryContext = object({
  ghRepoId: string(),
  repositoryFullName: string(),
  expectedRootDirectory: string(),
});
const vConvexPreviewDeploymentReady = object({
  state: literal("ready"),
  deploymentName: string(),
  cloudUrl: string(),
});
const cloudflareConvexBuildAccessWiringState = union(
  object({
    active: literal(false),
  }),
  object({
    active: literal(true),
    ghRepoId: string(),
    repositoryFullName: string(),
    defaultBranch: string(),
    worker: object({
      accountId: string(),
      workerName: string(),
      workerTag: string(),
    }),
    convex: object({
      projectId: string(),
      deploymentName: string(),
    }),
  }),
);
type VaultProvisioningWriteLock = Doc<"workflow_vaultProvisioning_writeLocks">;
type CloudflareWorkerConnectionEventCtx = Pick<MutationCtx, "runMutation">;
type CloudflareWorkerConnectionReadCtx = Pick<QueryCtx, "db">;

function isComposedInfrastructureRun(run: Doc<"workflow_vaultProvisioning_runs">): boolean {
  return run.trigger === "create" || run.trigger === "retry";
}

function isStandaloneCloudflareWorkerConnectionRun(
  run: Doc<"workflow_vaultProvisioning_runs">,
): boolean {
  return run.trigger === "connect_cloudflare_worker";
}

function isStandaloneCloudflareBuildsWiringRun(
  run: Doc<"workflow_vaultProvisioning_runs">,
): boolean {
  return run.trigger === "wire_builds";
}

function isStandaloneCloudflareConvexBuildAccessWiringRun(
  run: Doc<"workflow_vaultProvisioning_runs">,
): boolean {
  return run.trigger === "wire_convex_build_access";
}

async function readVaultProvisioningWriteLock(
  ctx: CloudflareWorkerConnectionReadCtx,
  vaultId: Id<"vaults">,
): Promise<VaultProvisioningWriteLock | null> {
  return await ctx.db
    .query("workflow_vaultProvisioning_writeLocks")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .first();
}

function runHoldsCloudflareProvisioningWriteLock(
  writeLock: VaultProvisioningWriteLock | null,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
  },
): boolean {
  return writeLock?.state === "active" && writeLock.runId === args.runId;
}

async function readCloudflareWorkerForAppRoot(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    appRoot: string;
  },
): Promise<Doc<"vaultCloudflareWorkers"> | null> {
  return await ctx.db
    .query("vaultCloudflareWorkers")
    .withIndex("by_vault_and_appRoot", (q) =>
      q.eq("vaultId", args.vaultId).eq("appRoot", args.appRoot),
    )
    .first();
}

async function readConvexDeploymentForAppRoot(
  ctx: CloudflareWorkerConnectionReadCtx,
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
  ctx: CloudflareWorkerConnectionReadCtx,
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

async function readCloudflareWorkerByProviderIdentity(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    accountId: string;
    workerName: string;
  },
): Promise<Doc<"vaultCloudflareWorkers"> | null> {
  return await ctx.db
    .query("vaultCloudflareWorkers")
    .withIndex("by_vault_and_account_and_worker", (q) =>
      q
        .eq("vaultId", args.vaultId)
        .eq("accountId", args.accountId)
        .eq("workerName", args.workerName),
    )
    .first();
}

async function assertNoExistingCloudflareWorkerTarget(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    appRoot: string;
    accountId?: string;
    workerName?: string;
  },
): Promise<void> {
  const existingAppRootWorker = await readCloudflareWorkerForAppRoot(ctx, args);
  if (existingAppRootWorker) {
    throw new Error("Vault already has a Cloudflare Worker for this app root.");
  }
  if (args.accountId && args.workerName) {
    const existingWorker = await readCloudflareWorkerByProviderIdentity(ctx, {
      vaultId: args.vaultId,
      accountId: args.accountId,
      workerName: args.workerName,
    });
    if (existingWorker) {
      throw new Error("Cloudflare Worker is already attached to this vault.");
    }
  }
}

async function appendCloudflareWorkerConnectionEvent(
  ctx: CloudflareWorkerConnectionEventCtx,
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

async function cancelSupersededCloudflareWorkerConnectionRun(
  ctx: CloudflareWorkerConnectionEventCtx,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
  },
): Promise<void> {
  await appendCloudflareWorkerConnectionEvent(ctx, {
    runId: args.runId,
    step: "claim_infra",
    level: "warn",
    message: "Cloudflare provisioning was superseded by a newer run.",
    state: "canceled",
  });
}

async function requireCloudflareWorkerConnectionRun(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<Doc<"workflow_vaultProvisioning_runs">> {
  const run = await ctx.db.get(args.runId);
  if (!run) {
    throw new Error("Cloudflare Worker connection run not found.");
  }
  if (
    run.userId !== args.userId ||
    run.vaultId !== args.vaultId ||
    (!isStandaloneCloudflareWorkerConnectionRun(run) && !isComposedInfrastructureRun(run))
  ) {
    throw new Error("Cloudflare Worker connection run does not match vault.");
  }
  return run;
}

async function requireCloudflareBuildsWiringRun(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<Doc<"workflow_vaultProvisioning_runs">> {
  const run = await ctx.db.get(args.runId);
  if (!run) {
    throw new Error("Cloudflare Workers Builds wiring run not found.");
  }
  if (
    run.userId !== args.userId ||
    run.vaultId !== args.vaultId ||
    (!isStandaloneCloudflareBuildsWiringRun(run) && !isComposedInfrastructureRun(run))
  ) {
    throw new Error("Cloudflare Workers Builds wiring run does not match vault.");
  }
  return run;
}

async function requireCloudflareConvexBuildAccessWiringRun(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<Doc<"workflow_vaultProvisioning_runs">> {
  const run = await ctx.db.get(args.runId);
  if (!run) {
    throw new Error("Cloudflare Convex build access wiring run not found.");
  }
  if (
    run.userId !== args.userId ||
    run.vaultId !== args.vaultId ||
    (!isStandaloneCloudflareConvexBuildAccessWiringRun(run) && !isComposedInfrastructureRun(run))
  ) {
    throw new Error("Cloudflare Convex build access wiring run does not match vault.");
  }
  return run;
}

async function assertNoActiveCloudflareProvisioning(
  ctx: Pick<QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<void> {
  const writeLock = await ctx.db
    .query("workflow_vaultProvisioning_writeLocks")
    .withIndex("by_vault_and_state", (q) => q.eq("vaultId", vaultId).eq("state", "active"))
    .first();
  if (writeLock) {
    throw new Error("Cloudflare provisioning is already running.");
  }
}

export const requireAttachableVault = internalQuery({
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
    await assertNoExistingCloudflareWorkerTarget(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    await assertNoActiveCloudflareProvisioning(ctx, args.vaultId);

    return null;
  },
});

export const requireCloudflareWorkerConnectionVault = internalQuery({
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
    await assertNoExistingCloudflareWorkerTarget(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });

    return null;
  },
});

export const readCloudflareWorkerDiscoveryContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: cloudflareWorkerDiscoveryContext,
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
    await assertNoExistingCloudflareWorkerTarget(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });

    return {
      ghRepoId: vault.ghRepoId,
      repositoryFullName: `${vault.owner}/${vault.name}`,
      expectedRootDirectory: buildVaultCloudflareBuildConfigForAppRoot({ appRoot }).rootDirectory,
    };
  },
});

export const attachWorker = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    appRoot: string(),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    workersDevUrl: optional(string()),
    origin: vVaultCloudflareOrigin,
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
    await assertNoExistingCloudflareWorkerTarget(ctx, {
      vaultId: args.vaultId,
      appRoot,
      accountId: args.accountId,
      workerName: args.workerName,
    });
    await assertNoActiveCloudflareProvisioning(ctx, args.vaultId);

    const now = Date.now();
    await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId: args.vaultId,
      userId: args.userId,
      appRoot,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      origin: args.origin,
      connectedAt: now,
    });

    return null;
  },
});

export const claimCloudflareWorkerConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
    accountId: string(),
    workerName: string(),
    origin: vVaultCloudflareOrigin,
  },
  returns: object({ claimed: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareWorkerConnectionRun(ctx, args);
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
      await assertNoExistingCloudflareWorkerTarget(ctx, {
        vaultId: args.vaultId,
        appRoot,
        accountId: args.accountId,
        workerName: args.workerName,
      });
    } catch (error) {
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: error instanceof Error ? error.message : "Cloudflare Worker is already attached.",
        state: "canceled",
      });
      return { claimed: false };
    }

    const now = Date.now();
    const writeLock = await readVaultProvisioningWriteLock(ctx, args.vaultId);
    if (
      writeLock &&
      writeLock.state === "active" &&
      writeLock.runId !== args.runId &&
      now - writeLock.updatedAt < CLOUDFLARE_CONNECTION_STALE_MS
    ) {
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: "Cloudflare Worker connection is already running.",
        state: "canceled",
      });
      return { claimed: false };
    }

    if (writeLock) {
      if (writeLock.state === "active" && writeLock.runId !== args.runId) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
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

    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "claim_infra",
      level: "info",
      message: `Started Cloudflare Worker connection for ${appRoot}.`,
      state: "running",
    });

    return { claimed: true };
  },
});

export const readActiveCloudflareWorkerConnection = internalQuery({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: object({ active: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareWorkerConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    await assertVaultAppRootExists(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    const [writeLock, worker] = await Promise.all([
      readVaultProvisioningWriteLock(ctx, args.vaultId),
      readCloudflareWorkerForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
    ]);
    return {
      active: !worker && runHoldsCloudflareProvisioningWriteLock(writeLock, { runId: args.runId }),
    };
  },
});

export const attachWorkerForRun = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    workersDevUrl: optional(string()),
    origin: vVaultCloudflareOrigin,
  },
  returns: object({ attached: boolean() }),
  handler: async (ctx, args) => {
    const run = await requireCloudflareWorkerConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    await assertVaultAppRootExists(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    const existingAppRootWorker = await readCloudflareWorkerForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    try {
      await assertNoExistingCloudflareWorkerTarget(ctx, {
        vaultId: args.vaultId,
        appRoot,
        accountId: args.accountId,
        workerName: args.workerName,
      });
    } catch (error) {
      if (isStandaloneCloudflareWorkerConnectionRun(run)) {
        await appendCloudflareWorkerConnectionEvent(ctx, {
          runId: args.runId,
          step: "attach_worker",
          level: "warn",
          message:
            error instanceof Error ? error.message : "Cloudflare Worker is already attached.",
          state: "canceled",
        });
        return { attached: false };
      }
      throw error;
    }

    const writeLock = await readVaultProvisioningWriteLock(ctx, args.vaultId);
    if (!writeLock || !runHoldsCloudflareProvisioningWriteLock(writeLock, { runId: args.runId })) {
      if (isStandaloneCloudflareWorkerConnectionRun(run)) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
          runId: args.runId,
        });
        return { attached: false };
      }
      throw new Error("Composed infrastructure run no longer holds the provisioning write lock.");
    }

    const now = Date.now();
    if (existingAppRootWorker) {
      await ctx.db.patch(existingAppRootWorker._id, {
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        origin: args.origin,
        connectedAt: now,
      });
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "attach_worker",
        level: "info",
        message: `Cloudflare Worker ready for ${appRoot}: ${args.workerName}.`,
        state: "running",
      });

      return { attached: true };
    }

    await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId: args.vaultId,
      userId: args.userId,
      appRoot,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      origin: args.origin,
      connectedAt: now,
    });
    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "attach_worker",
      level: "info",
      message: `Cloudflare Worker ready for ${appRoot}: ${args.workerName}.`,
      state: "running",
    });

    return { attached: true };
  },
});

export const readCreatedWorkerRollbackSafety = internalQuery({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
    accountId: string(),
    workerName: string(),
  },
  returns: object({ shouldDelete: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareWorkerConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      return { shouldDelete: true };
    }

    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const worker = await readCloudflareWorkerForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    return {
      shouldDelete:
        !worker || worker.accountId !== args.accountId || worker.workerName !== args.workerName,
    };
  },
});

export const finishCloudflareWorkerConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const run = await requireCloudflareWorkerConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }

    const writeLock = await readVaultProvisioningWriteLock(ctx, args.vaultId);
    if (!writeLock || !runHoldsCloudflareProvisioningWriteLock(writeLock, { runId: args.runId })) {
      if (isStandaloneCloudflareWorkerConnectionRun(run)) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
          runId: args.runId,
        });
        return null;
      }
      throw new Error("Composed infrastructure run no longer holds the provisioning write lock.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const worker = await readCloudflareWorkerForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    if (!worker) {
      throw new Error("Cloudflare Worker connection did not attach a Worker.");
    }

    const now = Date.now();
    if (isStandaloneCloudflareWorkerConnectionRun(run)) {
      await ctx.db.patch(writeLock._id, {
        state: "succeeded",
        updatedAt: now,
      });
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "finish",
        level: "info",
        message: "Cloudflare Worker is connected.",
        state: "succeeded",
      });
      return null;
    }

    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "attach_worker",
      level: "info",
      message: "Cloudflare Worker is connected.",
      state: "running",
    });

    return null;
  },
});

export const claimCloudflareBuildsWiring = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: object({ claimed: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareBuildsWiringRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    await assertVaultAppRootExists(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    const worker = await readCloudflareWorkerForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    if (!worker) {
      throw new Error("Cloudflare Worker is required before wiring Workers Builds.");
    }
    const now = Date.now();
    const writeLock = await readVaultProvisioningWriteLock(ctx, args.vaultId);
    if (
      writeLock &&
      writeLock.state === "active" &&
      writeLock.runId !== args.runId &&
      now - writeLock.updatedAt < CLOUDFLARE_CONNECTION_STALE_MS
    ) {
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: "Cloudflare provisioning is already running.",
        state: "canceled",
      });
      return { claimed: false };
    }

    if (writeLock) {
      if (writeLock.state === "active" && writeLock.runId !== args.runId) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
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

    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "claim_infra",
      level: "info",
      message: `Started Cloudflare Workers Builds wiring for ${appRoot}.`,
      state: "running",
    });

    return { claimed: true };
  },
});

export const readActiveCloudflareBuildsWiring = internalQuery({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: cloudflareBuildsWiringState,
  handler: async (ctx, args) => {
    await requireCloudflareBuildsWiringRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    await assertVaultAppRootExists(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    const [convexDeployment, writeLock, worker] = await Promise.all([
      readConvexDeploymentForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
      readVaultProvisioningWriteLock(ctx, args.vaultId),
      readCloudflareWorkerForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
    ]);
    if (!worker || !runHoldsCloudflareProvisioningWriteLock(writeLock, { runId: args.runId })) {
      return { active: false as const };
    }

    return {
      active: true as const,
      owner: vault.owner,
      repo: vault.name,
      ghRepoId: vault.ghRepoId,
      defaultBranch: vault.defaultBranch,
      hasConvexDeployment: convexDeployment !== null,
      buildConfig: buildVaultCloudflareBuildConfigForAppRoot({ appRoot }),
      worker: {
        accountId: worker.accountId,
        workerName: worker.workerName,
        workerTag: worker.workerTag,
      },
    };
  },
});

export const recordCloudflareBuildsForRun = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
    builds: vVaultCloudflareConnectedBuilds,
  },
  returns: object({ applied: boolean() }),
  handler: async (ctx, args) => {
    const run = await requireCloudflareBuildsWiringRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      return { applied: false };
    }

    const writeLock = await readVaultProvisioningWriteLock(ctx, args.vaultId);
    if (!writeLock || !runHoldsCloudflareProvisioningWriteLock(writeLock, { runId: args.runId })) {
      if (isStandaloneCloudflareBuildsWiringRun(run)) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
          runId: args.runId,
        });
        return { applied: false };
      }
      throw new Error("Composed infrastructure run no longer holds the provisioning write lock.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const worker = await readCloudflareWorkerForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    if (!worker) {
      throw new Error("Cloudflare Worker is required before recording Workers Builds.");
    }

    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "wire_builds",
      level: "info",
      message: `Cloudflare Workers Builds connected for ${appRoot}.`,
      state: "running",
    });

    return { applied: true };
  },
});

export const finishCloudflareBuildsWiring = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: object({
    convexBuildAccessRunId: union(id("workflow_vaultProvisioning_runs"), nullValue()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ convexBuildAccessRunId: Id<"workflow_vaultProvisioning_runs"> | null }> => {
    const run = await requireCloudflareBuildsWiringRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }

    const writeLock = await readVaultProvisioningWriteLock(ctx, args.vaultId);
    if (!writeLock || !runHoldsCloudflareProvisioningWriteLock(writeLock, { runId: args.runId })) {
      if (isStandaloneCloudflareBuildsWiringRun(run)) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
          runId: args.runId,
        });
        return { convexBuildAccessRunId: null };
      }
      throw new Error("Composed infrastructure run no longer holds the provisioning write lock.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const [convexDeployment, worker] = await Promise.all([
      readConvexDeploymentForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
      readCloudflareWorkerForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
    ]);
    if (!worker) {
      throw new Error("Cloudflare Worker is required after wiring Workers Builds.");
    }
    const needsConvexBuildAccess = convexDeployment !== null;
    const convexBuildAccessRunId: Id<"workflow_vaultProvisioning_runs"> | null =
      needsConvexBuildAccess && isStandaloneCloudflareBuildsWiringRun(run)
        ? await ctx.runMutation(internal.appProvisioningRuns.createForVault, {
            vaultId: args.vaultId,
            userId: args.userId,
            trigger: "wire_convex_build_access",
          })
        : null;

    const now = Date.now();
    if (isStandaloneCloudflareBuildsWiringRun(run)) {
      await ctx.db.patch(writeLock._id, {
        state: "succeeded",
        updatedAt: now,
      });
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "finish",
        level: "info",
        message: "Cloudflare Workers Builds are connected.",
        state: "succeeded",
      });
      return { convexBuildAccessRunId };
    }

    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "wire_builds",
      level: "info",
      message: "Cloudflare Workers Builds are connected.",
      state: "running",
    });

    return { convexBuildAccessRunId };
  },
});

export const claimCloudflareConvexBuildAccessWiring = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: object({ claimed: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareConvexBuildAccessWiringRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    await assertVaultAppRootExists(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    const [convexDeployment, worker] = await Promise.all([
      readConvexDeploymentForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
      readCloudflareWorkerForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
    ]);
    if (!convexDeployment) {
      throw new Error("Convex deployment is required before wiring Convex build access.");
    }
    if (!worker) {
      throw new Error("Cloudflare Worker is required before wiring Convex build access.");
    }
    const now = Date.now();
    const writeLock = await readVaultProvisioningWriteLock(ctx, args.vaultId);
    if (
      writeLock &&
      writeLock.state === "active" &&
      writeLock.runId !== args.runId &&
      now - writeLock.updatedAt < CLOUDFLARE_CONNECTION_STALE_MS
    ) {
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: "Cloudflare provisioning is already running.",
        state: "canceled",
      });
      return { claimed: false };
    }

    if (writeLock) {
      if (writeLock.state === "active" && writeLock.runId !== args.runId) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
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

    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "claim_infra",
      level: "info",
      message: `Started Convex build access wiring for ${appRoot}.`,
      state: "running",
    });

    return { claimed: true };
  },
});

export const readActiveCloudflareConvexBuildAccessWiring = internalQuery({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: cloudflareConvexBuildAccessWiringState,
  handler: async (ctx, args) => {
    await requireCloudflareConvexBuildAccessWiringRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    await assertVaultAppRootExists(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    const [convexDeployment, writeLock, worker] = await Promise.all([
      readConvexDeploymentForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
      readVaultProvisioningWriteLock(ctx, args.vaultId),
      readCloudflareWorkerForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
    ]);
    if (
      !convexDeployment ||
      !worker ||
      !runHoldsCloudflareProvisioningWriteLock(writeLock, { runId: args.runId })
    ) {
      return { active: false as const };
    }

    return {
      active: true as const,
      ghRepoId: vault.ghRepoId,
      repositoryFullName: `${vault.owner}/${vault.name}`,
      defaultBranch: vault.defaultBranch,
      worker: {
        accountId: worker.accountId,
        workerName: worker.workerName,
        workerTag: worker.workerTag,
      },
      convex: {
        projectId: convexDeployment.projectId,
        deploymentName: convexDeployment.deploymentName,
      },
    };
  },
});

export const recordCloudflareConvexBuildAccessDeployKeyReady = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
    deployment: union(literal("production"), literal("preview")),
  },
  returns: object({ applied: boolean() }),
  handler: async (ctx, args) => {
    const run = await requireCloudflareConvexBuildAccessWiringRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      return { applied: false };
    }

    const writeLock = await readVaultProvisioningWriteLock(ctx, args.vaultId);
    if (!writeLock || !runHoldsCloudflareProvisioningWriteLock(writeLock, { runId: args.runId })) {
      if (isStandaloneCloudflareConvexBuildAccessWiringRun(run)) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
          runId: args.runId,
        });
        return { applied: false };
      }
      throw new Error("Composed infrastructure run no longer holds the provisioning write lock.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const convexDeployment = await readConvexDeploymentForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    if (!convexDeployment) {
      throw new Error("Convex deployment is required before recording deploy key identity.");
    }

    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "wire_convex_build_access",
      level: "info",
      message:
        args.deployment === "production"
          ? "Convex production deploy key ready."
          : "Convex preview deploy key ready.",
      state: "running",
    });

    return { applied: true };
  },
});

export const recordCloudflareConvexBuildAccessForRun = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
    previewDeployment: vConvexPreviewDeploymentReady,
  },
  returns: object({ applied: boolean() }),
  handler: async (ctx, args) => {
    const run = await requireCloudflareConvexBuildAccessWiringRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      return { applied: false };
    }

    const writeLock = await readVaultProvisioningWriteLock(ctx, args.vaultId);
    if (!writeLock || !runHoldsCloudflareProvisioningWriteLock(writeLock, { runId: args.runId })) {
      if (isStandaloneCloudflareConvexBuildAccessWiringRun(run)) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
          runId: args.runId,
        });
        return { applied: false };
      }
      throw new Error("Composed infrastructure run no longer holds the provisioning write lock.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const [convexDeployment, worker] = await Promise.all([
      readConvexDeploymentForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
      readCloudflareWorkerForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
    ]);
    if (!convexDeployment) {
      throw new Error("Convex deployment is required before recording Convex build access.");
    }
    if (!worker) {
      throw new Error("Cloudflare Worker is required before recording Convex build access.");
    }

    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "wire_convex_build_access",
      level: "info",
      message: `Convex build access wired for ${appRoot}.`,
      state: "running",
    });

    return { applied: true };
  },
});

export const finishCloudflareConvexBuildAccessWiring = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const run = await requireCloudflareConvexBuildAccessWiringRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }

    const writeLock = await readVaultProvisioningWriteLock(ctx, args.vaultId);
    if (!writeLock || !runHoldsCloudflareProvisioningWriteLock(writeLock, { runId: args.runId })) {
      if (isStandaloneCloudflareConvexBuildAccessWiringRun(run)) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
          runId: args.runId,
        });
        return null;
      }
      throw new Error("Composed infrastructure run no longer holds the provisioning write lock.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const worker = await readCloudflareWorkerForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    if (!worker) {
      throw new Error("Cloudflare Worker is required after wiring Convex build access.");
    }

    const now = Date.now();
    if (isStandaloneCloudflareConvexBuildAccessWiringRun(run)) {
      await ctx.db.patch(writeLock._id, {
        state: "succeeded",
        updatedAt: now,
      });
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "finish",
        level: "info",
        message: "Convex build access is wired.",
        state: "succeeded",
      });
      return null;
    }

    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "wire_convex_build_access",
      level: "info",
      message: "Convex build access is wired.",
      state: "running",
    });

    return null;
  },
});
