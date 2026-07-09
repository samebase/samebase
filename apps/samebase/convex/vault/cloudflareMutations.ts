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
import { normalizeVaultAppRoot } from "../../shared/vaultAppRoot";
import {
  buildVaultCloudflareBuildConfigForAppRoot,
  buildVaultCloudflareDeploymentNotConfigured,
  buildVaultCloudflareDeploymentWithConnectedBuilds,
  isVaultProviderUpstreamPresent,
  readVaultProviderUpstreamPresence,
  vConvexDeployKeys,
  vVaultCloudflareBuildConfig,
  vVaultCloudflareConnectedBuilds,
  vVaultCloudflareDeployment,
  vVaultCloudflareOrigin,
  VAULT_PROVIDER_UPSTREAM_MISSING,
  VAULT_PROVIDER_UPSTREAM_PRESENT,
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
      build: vVaultCloudflareConnectedBuilds,
    }),
    convex: object({
      projectId: string(),
      deploymentName: string(),
      cloudUrl: string(),
      deployKeys: vConvexDeployKeys,
    }),
  }),
);
const cloudflareInfrastructureVerificationConvexBuildAccess = union(
  literal("confirmed"),
  literal("contradicted"),
  literal("not_checked"),
);
const cloudflareInfrastructureVerificationWorker = union(
  literal("confirmed"),
  literal("missing_upstream"),
);
const cloudflareInfrastructureVerificationConvexDeployment = union(
  literal("confirmed"),
  literal("missing_upstream"),
  literal("not_checked"),
);
const cloudflareInfrastructureVerificationResult = union(
  object({
    worker: literal("confirmed"),
    builds: literal("adopted"),
    connectedBuilds: vVaultCloudflareConnectedBuilds,
    convexDeployment: cloudflareInfrastructureVerificationConvexDeployment,
    convexBuildAccess: cloudflareInfrastructureVerificationConvexBuildAccess,
  }),
  object({
    worker: cloudflareInfrastructureVerificationWorker,
    builds: union(literal("confirmed"), literal("contradicted"), literal("not_checked")),
    convexDeployment: cloudflareInfrastructureVerificationConvexDeployment,
    convexBuildAccess: cloudflareInfrastructureVerificationConvexBuildAccess,
  }),
);
type CloudflareInfrastructureVerificationResult = Infer<
  typeof cloudflareInfrastructureVerificationResult
>;
const cloudflareInfrastructureVerificationState = union(
  object({
    active: literal(false),
  }),
  object({
    active: literal(true),
    ghRepoId: string(),
    defaultBranch: string(),
    hasConvexDeployment: boolean(),
    buildConfig: vVaultCloudflareBuildConfig,
    worker: object({
      accountId: string(),
      workerName: string(),
      workerTag: string(),
      deployment: vVaultCloudflareDeployment,
    }),
    convexDeployment: union(
      object({
        projectId: string(),
        deploymentName: string(),
      }),
      nullValue(),
    ),
  }),
);

type VaultInfrastructureOwnership = Doc<"vaultInfrastructureOwnership">;
type CloudflareWorkerConnectionEventCtx = Pick<MutationCtx, "runMutation">;
type CloudflareWorkerConnectionReadCtx = Pick<QueryCtx, "db">;

function isComposedInfrastructureRun(run: Doc<"appProvisioningRuns">): boolean {
  return run.trigger === "create" || run.trigger === "retry";
}

function isStandaloneCloudflareWorkerConnectionRun(run: Doc<"appProvisioningRuns">): boolean {
  return run.trigger === "connect_cloudflare_worker";
}

function isStandaloneCloudflareBuildsWiringRun(run: Doc<"appProvisioningRuns">): boolean {
  return run.trigger === "wire_builds";
}

function isStandaloneCloudflareConvexBuildAccessWiringRun(
  run: Doc<"appProvisioningRuns">,
): boolean {
  return run.trigger === "wire_convex_build_access";
}

function isStandaloneCloudflareInfrastructureVerificationRun(
  run: Doc<"appProvisioningRuns">,
): boolean {
  return run.trigger === "verify_infrastructure";
}

async function getVaultInfrastructureOwnership(
  ctx: CloudflareWorkerConnectionReadCtx,
  vaultId: Id<"vaults">,
): Promise<VaultInfrastructureOwnership | null> {
  return await ctx.db
    .query("vaultInfrastructureOwnership")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .first();
}

function isActiveCloudflareProvisioningOwner(
  ownership: VaultInfrastructureOwnership | null,
  args: {
    runId: Id<"appProvisioningRuns">;
  },
): boolean {
  return ownership?.state === "active" && ownership.runId === args.runId;
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
  if (existingAppRootWorker && isVaultProviderUpstreamPresent(existingAppRootWorker)) {
    throw new Error("Vault already has a Cloudflare Worker for this app root.");
  }
  if (args.accountId && args.workerName) {
    const existingWorker = await readCloudflareWorkerByProviderIdentity(ctx, {
      vaultId: args.vaultId,
      accountId: args.accountId,
      workerName: args.workerName,
    });
    if (
      existingWorker &&
      (isVaultProviderUpstreamPresent(existingWorker) ||
        !existingAppRootWorker ||
        existingWorker._id !== existingAppRootWorker._id)
    ) {
      throw new Error("Cloudflare Worker is already attached to this vault.");
    }
  }
}

async function appendCloudflareWorkerConnectionEvent(
  ctx: CloudflareWorkerConnectionEventCtx,
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

async function cancelSupersededCloudflareWorkerConnectionRun(
  ctx: CloudflareWorkerConnectionEventCtx,
  args: {
    runId: Id<"appProvisioningRuns">;
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
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<Doc<"appProvisioningRuns">> {
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
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<Doc<"appProvisioningRuns">> {
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
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<Doc<"appProvisioningRuns">> {
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

async function requireCloudflareInfrastructureVerificationRun(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<Doc<"appProvisioningRuns">> {
  const run = await ctx.db.get(args.runId);
  if (!run) {
    throw new Error("Cloudflare infrastructure verification run not found.");
  }
  if (
    run.userId !== args.userId ||
    run.vaultId !== args.vaultId ||
    !isStandaloneCloudflareInfrastructureVerificationRun(run)
  ) {
    throw new Error("Cloudflare infrastructure verification run does not match vault.");
  }
  return run;
}

async function assertNoActiveCloudflareProvisioning(
  ctx: Pick<QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<void> {
  const ownership = await ctx.db
    .query("vaultInfrastructureOwnership")
    .withIndex("by_vault_and_state", (q) => q.eq("vaultId", vaultId).eq("state", "active"))
    .first();
  if (ownership) {
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

export const requireCloudflareInfrastructureVerificationVault = internalQuery({
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
    const worker = await readCloudflareWorkerForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    if (!worker) {
      throw new Error("Cloudflare Worker is required before verifying infrastructure.");
    }
    await assertNoActiveCloudflareProvisioning(ctx, args.vaultId);

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
    const existingAppRootWorker = await readCloudflareWorkerForAppRoot(ctx, {
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
    if (existingAppRootWorker) {
      await ctx.db.patch(existingAppRootWorker._id, {
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        workersDevUrl: args.workersDevUrl,
        origin: args.origin,
        upstream: VAULT_PROVIDER_UPSTREAM_PRESENT,
        deployment: buildVaultCloudflareDeploymentNotConfigured(),
        connectedAt: now,
        lastObservedAt: now,
      });
      return null;
    }

    await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId: args.vaultId,
      userId: args.userId,
      appRoot,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      workersDevUrl: args.workersDevUrl,
      origin: args.origin,
      upstream: VAULT_PROVIDER_UPSTREAM_PRESENT,
      deployment: buildVaultCloudflareDeploymentNotConfigured(),
      connectedAt: now,
      lastObservedAt: now,
    });

    return null;
  },
});

export const claimCloudflareWorkerConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
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
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (
      ownership &&
      ownership.state === "active" &&
      ownership.runId !== args.runId &&
      now - ownership.updatedAt < CLOUDFLARE_CONNECTION_STALE_MS
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

    if (ownership) {
      if (ownership.state === "active" && ownership.runId !== args.runId) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
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
    runId: id("appProvisioningRuns"),
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
    const [ownership, worker] = await Promise.all([
      getVaultInfrastructureOwnership(ctx, args.vaultId),
      readCloudflareWorkerForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
    ]);
    return {
      active:
        (!worker || !isVaultProviderUpstreamPresent(worker)) &&
        isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId }),
    };
  },
});

export const attachWorkerForRun = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
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

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })) {
      if (isStandaloneCloudflareWorkerConnectionRun(run)) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
          runId: args.runId,
        });
        return { attached: false };
      }
      throw new Error("Composed infrastructure run no longer owns provisioning.");
    }

    const now = Date.now();
    if (existingAppRootWorker) {
      await ctx.db.patch(existingAppRootWorker._id, {
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        workersDevUrl: args.workersDevUrl,
        origin: args.origin,
        upstream: VAULT_PROVIDER_UPSTREAM_PRESENT,
        deployment: buildVaultCloudflareDeploymentNotConfigured(),
        connectedAt: now,
        lastObservedAt: now,
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
      workersDevUrl: args.workersDevUrl,
      origin: args.origin,
      upstream: VAULT_PROVIDER_UPSTREAM_PRESENT,
      deployment: buildVaultCloudflareDeploymentNotConfigured(),
      connectedAt: now,
      lastObservedAt: now,
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
    runId: id("appProvisioningRuns"),
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
    runId: id("appProvisioningRuns"),
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

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })) {
      if (isStandaloneCloudflareWorkerConnectionRun(run)) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
          runId: args.runId,
        });
        return null;
      }
      throw new Error("Composed infrastructure run no longer owns provisioning.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const worker = await readCloudflareWorkerForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    if (!worker || !isVaultProviderUpstreamPresent(worker)) {
      throw new Error("Cloudflare Worker connection did not attach a Worker.");
    }

    const now = Date.now();
    if (isStandaloneCloudflareWorkerConnectionRun(run)) {
      await ctx.db.patch(ownership._id, {
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
    runId: id("appProvisioningRuns"),
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
    if (!isVaultProviderUpstreamPresent(worker)) {
      throw new Error("Cloudflare Worker must be reconnected before wiring Workers Builds.");
    }
    if (worker.deployment.builds.state === "connected") {
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "wire_builds",
        level: "info",
        message: "Cloudflare Workers Builds are already connected.",
        state: "succeeded",
      });
      return { claimed: false };
    }

    const now = Date.now();
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (
      ownership &&
      ownership.state === "active" &&
      ownership.runId !== args.runId &&
      now - ownership.updatedAt < CLOUDFLARE_CONNECTION_STALE_MS
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

    if (ownership) {
      if (ownership.state === "active" && ownership.runId !== args.runId) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
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
    runId: id("appProvisioningRuns"),
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
    const [convexDeployment, ownership, worker] = await Promise.all([
      readConvexDeploymentForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
      getVaultInfrastructureOwnership(ctx, args.vaultId),
      readCloudflareWorkerForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
    ]);
    if (
      !worker ||
      !isVaultProviderUpstreamPresent(worker) ||
      worker.deployment.builds.state === "connected" ||
      !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })
    ) {
      return { active: false as const };
    }

    return {
      active: true as const,
      owner: vault.owner,
      repo: vault.name,
      ghRepoId: vault.ghRepoId,
      defaultBranch: vault.defaultBranch,
      hasConvexDeployment:
        convexDeployment !== null && isVaultProviderUpstreamPresent(convexDeployment),
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
    runId: id("appProvisioningRuns"),
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

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })) {
      if (isStandaloneCloudflareBuildsWiringRun(run)) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
          runId: args.runId,
        });
        return { applied: false };
      }
      throw new Error("Composed infrastructure run no longer owns provisioning.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const worker = await readCloudflareWorkerForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    if (!worker) {
      throw new Error("Cloudflare Worker is required before recording Workers Builds.");
    }

    const previousBuilds = worker.deployment.builds;
    const preservesConvexBuildAccess =
      previousBuilds.state === "connected" &&
      previousBuilds.production.triggerUuid === args.builds.production.triggerUuid &&
      previousBuilds.preview.triggerUuid === args.builds.preview.triggerUuid;

    await ctx.db.patch(worker._id, {
      deployment: buildVaultCloudflareDeploymentWithConnectedBuilds({
        builds: args.builds,
        convexBuildAccess: preservesConvexBuildAccess
          ? worker.deployment.convexBuildAccess
          : { state: "not_wired" },
      }),
      lastObservedAt: Date.now(),
    });
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
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: object({ convexBuildAccessRunId: union(id("appProvisioningRuns"), nullValue()) }),
  handler: async (
    ctx,
    args,
  ): Promise<{ convexBuildAccessRunId: Id<"appProvisioningRuns"> | null }> => {
    const run = await requireCloudflareBuildsWiringRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })) {
      if (isStandaloneCloudflareBuildsWiringRun(run)) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
          runId: args.runId,
        });
        return { convexBuildAccessRunId: null };
      }
      throw new Error("Composed infrastructure run no longer owns provisioning.");
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
    if (!worker || worker.deployment.builds.state !== "connected") {
      throw new Error("Cloudflare Workers Builds were not recorded.");
    }
    const needsConvexBuildAccess =
      convexDeployment !== null &&
      isVaultProviderUpstreamPresent(convexDeployment) &&
      worker.deployment.convexBuildAccess.state !== "wired";
    const convexBuildAccessRunId: Id<"appProvisioningRuns"> | null =
      needsConvexBuildAccess && isStandaloneCloudflareBuildsWiringRun(run)
        ? await ctx.runMutation(internal.appProvisioningRuns.createForVault, {
            vaultId: args.vaultId,
            userId: args.userId,
            trigger: "wire_convex_build_access",
          })
        : null;

    const now = Date.now();
    if (isStandaloneCloudflareBuildsWiringRun(run)) {
      await ctx.db.patch(ownership._id, {
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
    runId: id("appProvisioningRuns"),
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
    if (!isVaultProviderUpstreamPresent(convexDeployment)) {
      throw new Error("Convex deployment must be reconnected before wiring Convex build access.");
    }
    if (!worker) {
      throw new Error("Cloudflare Worker is required before wiring Convex build access.");
    }
    if (!isVaultProviderUpstreamPresent(worker)) {
      throw new Error("Cloudflare Worker must be reconnected before wiring Convex build access.");
    }
    if (worker.deployment.builds.state !== "connected") {
      throw new Error("Cloudflare Workers Builds are required before wiring Convex build access.");
    }
    if (worker.deployment.convexBuildAccess.state === "wired") {
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "wire_convex_build_access",
        level: "info",
        message: "Convex build access is already wired.",
        state: "succeeded",
      });
      return { claimed: false };
    }

    const now = Date.now();
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (
      ownership &&
      ownership.state === "active" &&
      ownership.runId !== args.runId &&
      now - ownership.updatedAt < CLOUDFLARE_CONNECTION_STALE_MS
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

    if (ownership) {
      if (ownership.state === "active" && ownership.runId !== args.runId) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
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
    runId: id("appProvisioningRuns"),
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
    const [convexDeployment, ownership, worker] = await Promise.all([
      readConvexDeploymentForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
      getVaultInfrastructureOwnership(ctx, args.vaultId),
      readCloudflareWorkerForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
    ]);
    if (
      !convexDeployment ||
      !isVaultProviderUpstreamPresent(convexDeployment) ||
      !worker ||
      !isVaultProviderUpstreamPresent(worker) ||
      worker.deployment.builds.state !== "connected" ||
      worker.deployment.convexBuildAccess.state === "wired" ||
      !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })
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
        build: worker.deployment.builds,
      },
      convex: {
        projectId: convexDeployment.projectId,
        deploymentName: convexDeployment.deploymentName,
        cloudUrl: convexDeployment.cloudUrl,
        deployKeys: convexDeployment.deployKeys,
      },
    };
  },
});

export const recordCloudflareConvexBuildAccessDeployKey = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appRoot: string(),
    deployment: union(literal("production"), literal("preview")),
    convexDeployKeyId: string(),
  },
  returns: object({ applied: boolean() }),
  handler: async (ctx, args) => {
    const run = await requireCloudflareConvexBuildAccessWiringRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      return { applied: false };
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })) {
      if (isStandaloneCloudflareConvexBuildAccessWiringRun(run)) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
          runId: args.runId,
        });
        return { applied: false };
      }
      throw new Error("Composed infrastructure run no longer owns provisioning.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const convexDeployment = await readConvexDeploymentForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    if (!convexDeployment) {
      throw new Error("Convex deployment is required before recording deploy key identity.");
    }

    const deployKey = {
      state: "created" as const,
      id: args.convexDeployKeyId,
    };
    const deployKeys =
      args.deployment === "production"
        ? {
            production: deployKey,
            preview: convexDeployment.deployKeys.preview,
          }
        : {
            production: convexDeployment.deployKeys.production,
            preview: deployKey,
          };

    await ctx.db.patch(convexDeployment._id, {
      deployKeys,
      lastObservedAt: Date.now(),
    });
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
    runId: id("appProvisioningRuns"),
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

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })) {
      if (isStandaloneCloudflareConvexBuildAccessWiringRun(run)) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
          runId: args.runId,
        });
        return { applied: false };
      }
      throw new Error("Composed infrastructure run no longer owns provisioning.");
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
    if (!worker || worker.deployment.builds.state !== "connected") {
      throw new Error(
        "Cloudflare Workers Builds are required before recording Convex build access.",
      );
    }
    if (
      convexDeployment.deployKeys.production.state !== "created" ||
      convexDeployment.deployKeys.preview.state !== "created"
    ) {
      throw new Error("Convex deploy keys are required before recording Convex build access.");
    }

    const now = Date.now();
    await ctx.db.patch(convexDeployment._id, {
      previewDeployment: args.previewDeployment,
      lastObservedAt: now,
    });
    await ctx.db.patch(worker._id, {
      deployment: buildVaultCloudflareDeploymentWithConnectedBuilds({
        builds: worker.deployment.builds,
        convexBuildAccess: { state: "wired" },
      }),
      lastObservedAt: now,
    });
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
    runId: id("appProvisioningRuns"),
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

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })) {
      if (isStandaloneCloudflareConvexBuildAccessWiringRun(run)) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
          runId: args.runId,
        });
        return null;
      }
      throw new Error("Composed infrastructure run no longer owns provisioning.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const worker = await readCloudflareWorkerForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    if (!worker || worker.deployment.convexBuildAccess.state !== "wired") {
      throw new Error("Convex build access was not recorded.");
    }

    const now = Date.now();
    if (isStandaloneCloudflareConvexBuildAccessWiringRun(run)) {
      await ctx.db.patch(ownership._id, {
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

function resolveInfrastructureVerificationPatch(args: {
  appRoot: string;
  hasConfirmedConvexDeployment: boolean;
  providerResult: CloudflareInfrastructureVerificationResult;
  worker: Doc<"vaultCloudflareWorkers">;
}): {
  deployment: Doc<"vaultCloudflareWorkers">["deployment"];
  message: string;
  shouldPatchWorker: boolean;
} {
  const currentDeployment = args.worker.deployment;
  if (args.providerResult.worker === "missing_upstream") {
    return {
      deployment: buildVaultCloudflareDeploymentNotConfigured(),
      message: `Cloudflare Worker is missing upstream for ${args.appRoot}; marked Worker missing.`,
      shouldPatchWorker: true,
    };
  }

  if (
    currentDeployment.builds.state === "connected" &&
    args.providerResult.builds === "contradicted"
  ) {
    return {
      deployment: buildVaultCloudflareDeploymentNotConfigured(),
      message: `Cloudflare Workers Builds triggers are missing for ${args.appRoot}; marked Builds not connected.`,
      shouldPatchWorker: true,
    };
  }

  if (
    currentDeployment.builds.state === "not_connected" &&
    args.providerResult.builds === "adopted"
  ) {
    const convexBuildAccessConfirmed =
      args.providerResult.convexBuildAccess === "confirmed" && args.hasConfirmedConvexDeployment;
    return {
      deployment: buildVaultCloudflareDeploymentWithConnectedBuilds({
        builds: args.providerResult.connectedBuilds,
        convexBuildAccess: convexBuildAccessConfirmed ? { state: "wired" } : { state: "not_wired" },
      }),
      message:
        args.providerResult.convexBuildAccess !== "not_checked" && !convexBuildAccessConfirmed
          ? `Cloudflare Workers Builds already match ${args.appRoot}; recorded Builds connected and marked deploy keys missing.`
          : `Cloudflare Workers Builds already match ${args.appRoot}; recorded Builds connected.`,
      shouldPatchWorker: true,
    };
  }

  if (currentDeployment.convexBuildAccess.state === "wired") {
    if (currentDeployment.builds.state === "not_connected") {
      return {
        deployment: buildVaultCloudflareDeploymentNotConfigured(),
        message: `Cloudflare Workers Builds are not connected for ${args.appRoot}; marked deploy keys missing.`,
        shouldPatchWorker: true,
      };
    }
    if (!args.hasConfirmedConvexDeployment) {
      return {
        deployment: buildVaultCloudflareDeploymentWithConnectedBuilds({
          builds: currentDeployment.builds,
          convexBuildAccess: { state: "not_wired" },
        }),
        message: `Cloudflare Convex build access has no attached Convex deployment for ${args.appRoot}; marked deploy keys missing.`,
        shouldPatchWorker: true,
      };
    }
  }

  if (
    currentDeployment.builds.state === "connected" &&
    args.providerResult.convexBuildAccess === "contradicted"
  ) {
    return {
      deployment: buildVaultCloudflareDeploymentWithConnectedBuilds({
        builds: currentDeployment.builds,
        convexBuildAccess: { state: "not_wired" },
      }),
      message: `Cloudflare Workers Builds deploy-key variables are missing for ${args.appRoot}; marked deploy keys missing.`,
      shouldPatchWorker: true,
    };
  }

  if (
    currentDeployment.builds.state === "connected" &&
    (args.providerResult.builds === "confirmed" ||
      args.providerResult.convexBuildAccess === "confirmed")
  ) {
    return {
      deployment: currentDeployment,
      message: `Cloudflare infrastructure verified for ${args.appRoot}.`,
      shouldPatchWorker: true,
    };
  }

  return {
    deployment: currentDeployment,
    message: `No connected Cloudflare infrastructure state to verify for ${args.appRoot}.`,
    shouldPatchWorker: false,
  };
}

export const claimCloudflareInfrastructureVerification = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: object({ claimed: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareInfrastructureVerificationRun(ctx, args);
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
      throw new Error("Cloudflare Worker is required before verifying infrastructure.");
    }

    const now = Date.now();
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (
      ownership &&
      ownership.state === "active" &&
      ownership.runId !== args.runId &&
      now - ownership.updatedAt < CLOUDFLARE_CONNECTION_STALE_MS
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

    if (ownership) {
      if (ownership.state === "active" && ownership.runId !== args.runId) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
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

    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "claim_infra",
      level: "info",
      message: `Started infrastructure verification for ${appRoot}.`,
      state: "running",
    });

    return { claimed: true };
  },
});

export const readActiveCloudflareInfrastructureVerification = internalQuery({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: cloudflareInfrastructureVerificationState,
  handler: async (ctx, args) => {
    await requireCloudflareInfrastructureVerificationRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    await assertVaultAppRootExists(ctx, {
      vaultId: args.vaultId,
      appRoot,
    });
    const [convexDeployment, ownership, worker] = await Promise.all([
      readConvexDeploymentForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
      getVaultInfrastructureOwnership(ctx, args.vaultId),
      readCloudflareWorkerForAppRoot(ctx, {
        vaultId: args.vaultId,
        appRoot,
      }),
    ]);
    if (!worker || !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })) {
      return { active: false as const };
    }

    return {
      active: true as const,
      ghRepoId: vault.ghRepoId,
      defaultBranch: vault.defaultBranch,
      hasConvexDeployment:
        convexDeployment !== null && isVaultProviderUpstreamPresent(convexDeployment),
      buildConfig: buildVaultCloudflareBuildConfigForAppRoot({ appRoot }),
      worker: {
        accountId: worker.accountId,
        workerName: worker.workerName,
        workerTag: worker.workerTag,
        deployment: worker.deployment,
      },
      convexDeployment: convexDeployment
        ? {
            projectId: convexDeployment.projectId,
            deploymentName: convexDeployment.deploymentName,
          }
        : null,
    };
  },
});

export const recordCloudflareInfrastructureVerification = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appRoot: string(),
    providerResult: cloudflareInfrastructureVerificationResult,
  },
  returns: object({ applied: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareInfrastructureVerificationRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      return { applied: false };
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })) {
      await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
        runId: args.runId,
      });
      return { applied: false };
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
      throw new Error(
        "Cloudflare Worker is required before recording infrastructure verification.",
      );
    }

    const patch = resolveInfrastructureVerificationPatch({
      appRoot,
      hasConfirmedConvexDeployment:
        convexDeployment !== null && args.providerResult.convexDeployment === "confirmed",
      providerResult: args.providerResult,
      worker,
    });
    const workerUpstream =
      args.providerResult.worker === "missing_upstream"
        ? VAULT_PROVIDER_UPSTREAM_MISSING
        : VAULT_PROVIDER_UPSTREAM_PRESENT;
    if (
      patch.shouldPatchWorker ||
      readVaultProviderUpstreamPresence(worker).state !== workerUpstream.state
    ) {
      await ctx.db.patch(worker._id, {
        deployment: patch.deployment,
        upstream: workerUpstream,
        lastObservedAt: Date.now(),
      });
    }
    const messages: string[] = [];
    if (convexDeployment && args.providerResult.convexDeployment !== "not_checked") {
      const convexUpstream =
        args.providerResult.convexDeployment === "missing_upstream"
          ? VAULT_PROVIDER_UPSTREAM_MISSING
          : VAULT_PROVIDER_UPSTREAM_PRESENT;
      await ctx.db.patch(convexDeployment._id, {
        upstream: convexUpstream,
        lastObservedAt: Date.now(),
      });
      if (convexUpstream.state === "missing_upstream") {
        messages.push(
          `Convex deployment is missing upstream for ${appRoot}; marked deployment missing.`,
        );
      }
    }
    messages.push(patch.message);
    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "verify_infrastructure",
      level: "info",
      message: messages.join(" "),
      state: "running",
    });

    return { applied: true };
  },
});

export const recordCloudflareInfrastructureVerificationUnverifiable = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appRoot: string(),
    message: string(),
  },
  returns: object({ applied: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareInfrastructureVerificationRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      return { applied: false };
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })) {
      await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
        runId: args.runId,
      });
      return { applied: false };
    }

    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "verify_infrastructure",
      level: "warn",
      message: args.message,
      state: "running",
    });

    return { applied: true };
  },
});

export const finishCloudflareInfrastructureVerification = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    await requireCloudflareInfrastructureVerificationRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })) {
      await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
        runId: args.runId,
      });
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(ownership._id, {
      state: "succeeded",
      updatedAt: now,
    });
    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "finish",
      level: "info",
      message: "Infrastructure verification finished.",
      state: "succeeded",
    });

    return null;
  },
});
