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
import { markConvexDeploymentDependenciesNotWired } from "./deploymentDependencies";
import {
  buildVaultCloudflareBuildConfig,
  isVaultProviderUpstreamPresent,
  readVaultProviderUpstreamPresence,
  type VaultCloudflareBuildConfig,
  type VaultCloudflareConnectedBuilds,
  vVaultCloudflareBuildConfig,
  vVaultCloudflareBuilds,
  vVaultCloudflareConnectedBuilds,
  vVaultCloudflareOrigin,
  vVaultWorkerDeploymentWiring,
  VAULT_PROVIDER_UPSTREAM_MISSING,
  VAULT_PROVIDER_UPSTREAM_PRESENT,
} from "./model";
import { isLiveConnectedVault } from "./state";

const { boolean, id, literal, null: nullValue, object, optional, string, union } = v;
const CLOUDFLARE_CONNECTION_STALE_MS = 10 * 60 * 1000;
const CONVEX_DEPLOY_KEYS_NOT_CREATED = {
  production: { state: "not_created" },
  preview: { state: "not_created" },
} as const;

const vVaultAppReference = object({
  appId: id("vaultApps"),
  rootDirectory: string(),
});
const vCloudflareWorkerReference = object({
  workerId: id("vaultCloudflareWorkers"),
  accountId: string(),
  workerName: string(),
  workerTag: string(),
});

const cloudflareBuildsWiringState = union(
  object({
    active: literal(false),
  }),
  object({
    active: literal(true),
    ghRepoId: string(),
    ghRepoNodeId: string(),
    defaultBranch: string(),
    hasConvexDeployment: boolean(),
    buildConfig: vVaultCloudflareBuildConfig,
    app: vVaultAppReference,
    worker: vCloudflareWorkerReference,
  }),
);
const cloudflareWorkerDiscoveryContext = object({
  ghRepoId: string(),
  repositoryFullName: string(),
  expectedRootDirectory: string(),
});
const cloudflareWorkerAttachmentResult = union(
  object({ state: literal("attached"), workerId: id("vaultCloudflareWorkers") }),
  object({ state: literal("not_attached") }),
);
type CloudflareWorkerAttachmentResult = Infer<typeof cloudflareWorkerAttachmentResult>;
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
    ghRepoNodeId: string(),
    repositoryFullName: string(),
    defaultBranch: string(),
    buildConfig: vVaultCloudflareBuildConfig,
    worker: object({
      workerId: id("vaultCloudflareWorkers"),
      accountId: string(),
      workerName: string(),
      workerTag: string(),
    }),
    workerApp: vVaultAppReference,
    convex: object({
      convexDeploymentId: id("vaultConvexDeployments"),
      projectId: string(),
      deploymentName: string(),
      cloudUrl: string(),
    }),
    convexApp: vVaultAppReference,
    dependency: object({
      dependencyId: id("vaultWorkerDeploymentDependencies"),
      wiring: vVaultWorkerDeploymentWiring,
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
    buildConfig: vVaultCloudflareBuildConfig,
    worker: object({
      workerId: id("vaultCloudflareWorkers"),
      accountId: string(),
      workerName: string(),
      workerTag: string(),
      builds: vVaultCloudflareBuilds,
    }),
    workerApp: vVaultAppReference,
    dependency: union(
      object({
        dependencyId: id("vaultWorkerDeploymentDependencies"),
        wiring: vVaultWorkerDeploymentWiring,
        convexApp: vVaultAppReference,
        convexDeployment: object({
          convexDeploymentId: id("vaultConvexDeployments"),
          projectId: string(),
          deploymentName: string(),
        }),
      }),
      nullValue(),
    ),
  }),
);

type VaultInfrastructureOwnership = Doc<"vaultInfrastructureOwnership">;
type CloudflareWorkerConnectionEventCtx = Pick<MutationCtx, "runMutation">;
type CloudflareWorkerConnectionReadCtx = Pick<QueryCtx, "db">;

function haveEqualStringItems(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function matchesCloudflareBuildConfig(
  left: VaultCloudflareConnectedBuilds,
  right: VaultCloudflareBuildConfig,
): boolean {
  return (
    left.buildCommand === right.buildCommand &&
    left.deployCommand === right.deployCommand &&
    left.previewDeployCommand === right.previewDeployCommand &&
    haveEqualStringItems(left.pathIncludes, right.pathIncludes) &&
    haveEqualStringItems(left.pathExcludes, right.pathExcludes)
  );
}

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

async function requireVaultApp(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    appId: Id<"vaultApps">;
  },
): Promise<Doc<"vaultApps">> {
  const app = await ctx.db.get(args.appId);
  if (!app || app.vaultId !== args.vaultId || app.userId !== args.userId) {
    throw new Error("Vault app not found.");
  }
  return app;
}

async function requireCloudflareWorker(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    workerId: Id<"vaultCloudflareWorkers">;
  },
): Promise<Doc<"vaultCloudflareWorkers">> {
  const worker = await ctx.db.get(args.workerId);
  if (!worker || worker.vaultId !== args.vaultId || worker.userId !== args.userId) {
    throw new Error("Cloudflare Worker not found.");
  }
  return worker;
}

async function requireConvexDeployment(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    convexDeploymentId: Id<"vaultConvexDeployments">;
  },
): Promise<Doc<"vaultConvexDeployments">> {
  const deployment = await ctx.db.get(args.convexDeploymentId);
  if (!deployment || deployment.vaultId !== args.vaultId || deployment.userId !== args.userId) {
    throw new Error("Convex deployment not found.");
  }
  return deployment;
}

async function readWorkerDeploymentDependency(
  ctx: CloudflareWorkerConnectionReadCtx,
  workerId: Id<"vaultCloudflareWorkers">,
): Promise<Doc<"vaultWorkerDeploymentDependencies"> | null> {
  return await ctx.db
    .query("vaultWorkerDeploymentDependencies")
    .withIndex("by_worker", (q) => q.eq("workerId", workerId))
    .unique();
}

async function requireWorkerDeploymentDependency(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    workerId: Id<"vaultCloudflareWorkers">;
    convexDeploymentId: Id<"vaultConvexDeployments">;
  },
): Promise<Doc<"vaultWorkerDeploymentDependencies">> {
  const dependency = await readWorkerDeploymentDependency(ctx, args.workerId);
  if (
    !dependency ||
    dependency.vaultId !== args.vaultId ||
    dependency.userId !== args.userId ||
    dependency.convexDeploymentId !== args.convexDeploymentId
  ) {
    throw new Error("Worker Convex deployment dependency not found.");
  }
  return dependency;
}

async function markWorkerDeploymentDependencyNotWired(
  ctx: Pick<MutationCtx, "db">,
  workerId: Id<"vaultCloudflareWorkers">,
  now: number,
): Promise<void> {
  const dependency = await readWorkerDeploymentDependency(ctx, workerId);
  if (!dependency || dependency.wiring.state === "not_wired") {
    return;
  }

  await ctx.db.patch(dependency._id, {
    wiring: {
      state: "not_wired",
      deployKeys: dependency.wiring.deployKeys,
    },
    updatedAt: now,
  });
}

async function readWorkerDeploymentDependencyContext(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    workerId: Id<"vaultCloudflareWorkers">;
  },
): Promise<{
  dependency: Doc<"vaultWorkerDeploymentDependencies">;
  convexDeployment: Doc<"vaultConvexDeployments">;
  convexApp: Doc<"vaultApps">;
} | null> {
  const dependency = await readWorkerDeploymentDependency(ctx, args.workerId);
  if (!dependency) {
    return null;
  }
  if (dependency.vaultId !== args.vaultId || dependency.userId !== args.userId) {
    throw new Error("Worker Convex deployment dependency does not match vault.");
  }

  const convexDeployment = await requireConvexDeployment(ctx, {
    vaultId: args.vaultId,
    userId: args.userId,
    convexDeploymentId: dependency.convexDeploymentId,
  });
  const convexApp = await requireVaultApp(ctx, {
    vaultId: args.vaultId,
    userId: args.userId,
    appId: convexDeployment.appId,
  });

  return { dependency, convexDeployment, convexApp };
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
    .unique();
}

async function assertNoExistingCloudflareWorkerTarget(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    appId: Id<"vaultApps">;
    accountId: string;
    workerName: string;
  },
): Promise<void> {
  const existingWorker = await readCloudflareWorkerByProviderIdentity(ctx, args);
  if (existingWorker && isVaultProviderUpstreamPresent(existingWorker)) {
    throw new Error("Cloudflare Worker is already attached to this vault.");
  }
  if (existingWorker && existingWorker.appId !== args.appId) {
    throw new Error("Cloudflare Worker is already recorded for another app.");
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
    appId: id("vaultApps"),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    await requireVaultApp(ctx, args);
    await assertNoActiveCloudflareProvisioning(ctx, args.vaultId);

    return null;
  },
});

export const requireCloudflareWorkerConnectionVault = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    appId: id("vaultApps"),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    await requireVaultApp(ctx, args);

    return null;
  },
});

export const requireCloudflareInfrastructureVerificationVault = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    await requireCloudflareWorker(ctx, args);
    await assertNoActiveCloudflareProvisioning(ctx, args.vaultId);

    return null;
  },
});

export const readCloudflareWorkerDiscoveryContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    appId: id("vaultApps"),
  },
  returns: cloudflareWorkerDiscoveryContext,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const app = await requireVaultApp(ctx, args);

    return {
      ghRepoId: vault.ghRepoId,
      repositoryFullName: `${vault.routeOwner}/${vault.routeName}`,
      expectedRootDirectory: app.rootDirectory,
    };
  },
});

export const attachWorker = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    appId: id("vaultApps"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    workersDevUrl: optional(string()),
    origin: vVaultCloudflareOrigin,
  },
  returns: id("vaultCloudflareWorkers"),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    await requireVaultApp(ctx, args);
    const existingWorker = await readCloudflareWorkerByProviderIdentity(ctx, args);
    await assertNoExistingCloudflareWorkerTarget(ctx, {
      vaultId: args.vaultId,
      appId: args.appId,
      accountId: args.accountId,
      workerName: args.workerName,
    });
    await assertNoActiveCloudflareProvisioning(ctx, args.vaultId);

    const now = Date.now();
    if (existingWorker) {
      await ctx.db.patch(existingWorker._id, {
        appId: args.appId,
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        workersDevUrl: args.workersDevUrl,
        origin: args.origin,
        upstream: VAULT_PROVIDER_UPSTREAM_PRESENT,
        builds: { state: "not_connected" },
        connectedAt: now,
        lastObservedAt: now,
      });
      await markWorkerDeploymentDependencyNotWired(ctx, existingWorker._id, now);
      return existingWorker._id;
    }

    return await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId: args.vaultId,
      userId: args.userId,
      appId: args.appId,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      workersDevUrl: args.workersDevUrl,
      origin: args.origin,
      upstream: VAULT_PROVIDER_UPSTREAM_PRESENT,
      builds: { state: "not_connected" },
      connectedAt: now,
      lastObservedAt: now,
    });
  },
});

export const claimCloudflareWorkerConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
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
    const app = await requireVaultApp(ctx, args);
    try {
      await assertNoExistingCloudflareWorkerTarget(ctx, {
        vaultId: args.vaultId,
        appId: args.appId,
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
      message: `Started Cloudflare Worker connection for ${app.rootDirectory}.`,
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
    appId: id("vaultApps"),
  },
  returns: object({ active: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareWorkerConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    await requireVaultApp(ctx, args);
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    return {
      active: isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId }),
    };
  },
});

export const attachWorkerForRun = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    workersDevUrl: optional(string()),
    origin: vVaultCloudflareOrigin,
  },
  returns: cloudflareWorkerAttachmentResult,
  handler: async (ctx, args): Promise<CloudflareWorkerAttachmentResult> => {
    const run = await requireCloudflareWorkerConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const app = await requireVaultApp(ctx, args);
    const existingWorker = await readCloudflareWorkerByProviderIdentity(ctx, args);
    try {
      await assertNoExistingCloudflareWorkerTarget(ctx, {
        vaultId: args.vaultId,
        appId: args.appId,
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
        return { state: "not_attached" };
      }
      throw error;
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })) {
      if (isStandaloneCloudflareWorkerConnectionRun(run)) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
          runId: args.runId,
        });
        return { state: "not_attached" };
      }
      throw new Error("Composed infrastructure run no longer owns provisioning.");
    }

    const now = Date.now();
    if (existingWorker) {
      await ctx.db.patch(existingWorker._id, {
        appId: args.appId,
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        workersDevUrl: args.workersDevUrl,
        origin: args.origin,
        upstream: VAULT_PROVIDER_UPSTREAM_PRESENT,
        builds: { state: "not_connected" },
        connectedAt: now,
        lastObservedAt: now,
      });
      await markWorkerDeploymentDependencyNotWired(ctx, existingWorker._id, now);
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "attach_worker",
        level: "info",
        message: `Cloudflare Worker ready for ${app.rootDirectory}: ${args.workerName}.`,
        state: "running",
      });

      return { state: "attached", workerId: existingWorker._id };
    }

    const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId: args.vaultId,
      userId: args.userId,
      appId: args.appId,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      workersDevUrl: args.workersDevUrl,
      origin: args.origin,
      upstream: VAULT_PROVIDER_UPSTREAM_PRESENT,
      builds: { state: "not_connected" },
      connectedAt: now,
      lastObservedAt: now,
    });
    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "attach_worker",
      level: "info",
      message: `Cloudflare Worker ready for ${app.rootDirectory}: ${args.workerName}.`,
      state: "running",
    });

    return { state: "attached", workerId };
  },
});

export const readCreatedWorkerRollbackSafety = internalQuery({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
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

    const worker = await readCloudflareWorkerByProviderIdentity(ctx, {
      vaultId: args.vaultId,
      accountId: args.accountId,
      workerName: args.workerName,
    });
    return {
      shouldDelete:
        !worker || worker.appId !== args.appId || !isVaultProviderUpstreamPresent(worker),
    };
  },
});

export const finishCloudflareWorkerConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
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
    const worker = await requireCloudflareWorker(ctx, args);
    if (!isVaultProviderUpstreamPresent(worker)) {
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
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: object({ claimed: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareBuildsWiringRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const worker = await requireCloudflareWorker(ctx, args);
    const app = await requireVaultApp(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
      appId: worker.appId,
    });
    if (!isVaultProviderUpstreamPresent(worker)) {
      throw new Error("Cloudflare Worker must be reconnected before wiring Workers Builds.");
    }
    if (worker.builds.state === "connected") {
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
      message: `Started Cloudflare Workers Builds wiring for ${app.rootDirectory}.`,
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
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: cloudflareBuildsWiringState,
  handler: async (ctx, args) => {
    await requireCloudflareBuildsWiringRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const worker = await requireCloudflareWorker(ctx, args);
    const [app, dependencyContext, ownership] = await Promise.all([
      requireVaultApp(ctx, {
        vaultId: args.vaultId,
        userId: args.userId,
        appId: worker.appId,
      }),
      readWorkerDeploymentDependencyContext(ctx, args),
      getVaultInfrastructureOwnership(ctx, args.vaultId),
    ]);
    if (
      !isVaultProviderUpstreamPresent(worker) ||
      worker.builds.state === "connected" ||
      !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })
    ) {
      return { active: false as const };
    }

    return {
      active: true as const,
      ghRepoId: vault.ghRepoId,
      ghRepoNodeId: vault.ghRepoNodeId,
      defaultBranch: vault.defaultBranch,
      hasConvexDeployment:
        dependencyContext !== null &&
        isVaultProviderUpstreamPresent(dependencyContext.convexDeployment),
      buildConfig: buildVaultCloudflareBuildConfig({
        rootDirectory: app.rootDirectory,
        dependencyRootDirectories: dependencyContext
          ? [dependencyContext.convexApp.rootDirectory]
          : [],
      }),
      app: {
        appId: app._id,
        rootDirectory: app.rootDirectory,
      },
      worker: {
        workerId: worker._id,
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
    workerId: id("vaultCloudflareWorkers"),
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
    const worker = await requireCloudflareWorker(ctx, args);
    const app = await requireVaultApp(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
      appId: worker.appId,
    });

    const previousBuilds = worker.builds;
    const preservesDependencyWiring =
      previousBuilds.state === "connected" &&
      previousBuilds.production.triggerUuid === args.builds.production.triggerUuid &&
      previousBuilds.preview.triggerUuid === args.builds.preview.triggerUuid;

    const now = Date.now();
    await ctx.db.patch(worker._id, {
      builds: args.builds,
      lastObservedAt: now,
    });
    if (!preservesDependencyWiring) {
      await markWorkerDeploymentDependencyNotWired(ctx, worker._id, now);
    }
    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "wire_builds",
      level: "info",
      message: `Cloudflare Workers Builds connected for ${app.rootDirectory}.`,
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
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
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
        return null;
      }
      throw new Error("Composed infrastructure run no longer owns provisioning.");
    }
    const worker = await requireCloudflareWorker(ctx, args);
    if (worker.builds.state !== "connected") {
      throw new Error("Cloudflare Workers Builds were not recorded.");
    }

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
      return null;
    }

    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "wire_builds",
      level: "info",
      message: "Cloudflare Workers Builds are connected.",
      state: "running",
    });

    return null;
  },
});

export const claimCloudflareConvexBuildAccessWiring = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
    convexDeploymentId: id("vaultConvexDeployments"),
  },
  returns: object({ claimed: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareConvexBuildAccessWiringRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const [convexDeployment, worker] = await Promise.all([
      requireConvexDeployment(ctx, args),
      requireCloudflareWorker(ctx, args),
    ]);
    if (!isVaultProviderUpstreamPresent(convexDeployment)) {
      throw new Error("Convex deployment must be reconnected before wiring Convex build access.");
    }
    if (!isVaultProviderUpstreamPresent(worker)) {
      throw new Error("Cloudflare Worker must be reconnected before wiring Convex build access.");
    }
    const existingDependency = await readWorkerDeploymentDependency(ctx, worker._id);
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

    if (!existingDependency) {
      await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId: args.vaultId,
        userId: args.userId,
        workerId: worker._id,
        convexDeploymentId: convexDeployment._id,
        wiring: {
          state: "not_wired",
          deployKeys: CONVEX_DEPLOY_KEYS_NOT_CREATED,
        },
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(existingDependency._id, {
        convexDeploymentId: convexDeployment._id,
        wiring: {
          state: "not_wired",
          deployKeys: existingDependency.wiring.deployKeys,
        },
        updatedAt: now,
      });
    }

    const [workerApp, convexApp] = await Promise.all([
      requireVaultApp(ctx, {
        vaultId: args.vaultId,
        userId: args.userId,
        appId: worker.appId,
      }),
      requireVaultApp(ctx, {
        vaultId: args.vaultId,
        userId: args.userId,
        appId: convexDeployment.appId,
      }),
    ]);
    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "claim_infra",
      level: "info",
      message: `Started Convex build access wiring from ${workerApp.rootDirectory} to ${convexApp.rootDirectory}.`,
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
    workerId: id("vaultCloudflareWorkers"),
    convexDeploymentId: id("vaultConvexDeployments"),
  },
  returns: cloudflareConvexBuildAccessWiringState,
  handler: async (ctx, args) => {
    await requireCloudflareConvexBuildAccessWiringRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const [convexDeployment, dependency, ownership, worker] = await Promise.all([
      requireConvexDeployment(ctx, args),
      requireWorkerDeploymentDependency(ctx, args),
      getVaultInfrastructureOwnership(ctx, args.vaultId),
      requireCloudflareWorker(ctx, args),
    ]);
    if (
      !isVaultProviderUpstreamPresent(convexDeployment) ||
      !isVaultProviderUpstreamPresent(worker) ||
      !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })
    ) {
      return { active: false as const };
    }

    const [workerApp, convexApp] = await Promise.all([
      requireVaultApp(ctx, {
        vaultId: args.vaultId,
        userId: args.userId,
        appId: worker.appId,
      }),
      requireVaultApp(ctx, {
        vaultId: args.vaultId,
        userId: args.userId,
        appId: convexDeployment.appId,
      }),
    ]);
    const buildConfig = buildVaultCloudflareBuildConfig({
      rootDirectory: workerApp.rootDirectory,
      dependencyRootDirectories: [convexApp.rootDirectory],
    });

    return {
      active: true as const,
      ghRepoId: vault.ghRepoId,
      ghRepoNodeId: vault.ghRepoNodeId,
      repositoryFullName: `${vault.routeOwner}/${vault.routeName}`,
      defaultBranch: vault.defaultBranch,
      buildConfig,
      worker: {
        workerId: worker._id,
        accountId: worker.accountId,
        workerName: worker.workerName,
        workerTag: worker.workerTag,
      },
      workerApp: {
        appId: workerApp._id,
        rootDirectory: workerApp.rootDirectory,
      },
      convex: {
        convexDeploymentId: convexDeployment._id,
        projectId: convexDeployment.projectId,
        deploymentName: convexDeployment.deploymentName,
        cloudUrl: convexDeployment.cloudUrl,
      },
      convexApp: {
        appId: convexApp._id,
        rootDirectory: convexApp.rootDirectory,
      },
      dependency: {
        dependencyId: dependency._id,
        wiring: dependency.wiring,
      },
    };
  },
});

export const recordCloudflareConvexBuildAccessDeployKey = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
    convexDeploymentId: id("vaultConvexDeployments"),
    deployment: union(literal("production"), literal("preview")),
    convexDeployKeyName: string(),
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
    const [, convexDeployment] = await Promise.all([
      requireCloudflareWorker(ctx, args),
      requireConvexDeployment(ctx, args),
    ]);
    const dependency = await requireWorkerDeploymentDependency(ctx, args);

    const deployKeys =
      args.deployment === "production"
        ? {
            production: {
              state: "created" as const,
              name: args.convexDeployKeyName,
              deploymentName: convexDeployment.deploymentName,
            },
            preview: dependency.wiring.deployKeys.preview,
          }
        : {
            production: dependency.wiring.deployKeys.production,
            preview: {
              state: "created" as const,
              name: args.convexDeployKeyName,
              projectId: convexDeployment.projectId,
            },
          };

    await ctx.db.patch(dependency._id, {
      wiring: {
        state: "not_wired",
        deployKeys,
      },
      updatedAt: Date.now(),
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
    workerId: id("vaultCloudflareWorkers"),
    convexDeploymentId: id("vaultConvexDeployments"),
    builds: vVaultCloudflareConnectedBuilds,
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
    const [convexDeployment, dependency, worker] = await Promise.all([
      requireConvexDeployment(ctx, args),
      requireWorkerDeploymentDependency(ctx, args),
      requireCloudflareWorker(ctx, args),
    ]);
    if (
      dependency.wiring.deployKeys.production.state !== "created" ||
      dependency.wiring.deployKeys.preview.state !== "created"
    ) {
      throw new Error("Convex deploy keys are required before recording Convex build access.");
    }

    const [workerApp, convexApp] = await Promise.all([
      requireVaultApp(ctx, {
        vaultId: args.vaultId,
        userId: args.userId,
        appId: worker.appId,
      }),
      requireVaultApp(ctx, {
        vaultId: args.vaultId,
        userId: args.userId,
        appId: convexDeployment.appId,
      }),
    ]);
    const buildConfig = buildVaultCloudflareBuildConfig({
      rootDirectory: workerApp.rootDirectory,
      dependencyRootDirectories: [convexApp.rootDirectory],
    });
    if (!matchesCloudflareBuildConfig(args.builds, buildConfig)) {
      throw new Error("Cloudflare Workers Builds result does not match the deployment dependency.");
    }

    const now = Date.now();
    await ctx.db.patch(convexDeployment._id, {
      previewDeployment: args.previewDeployment,
      lastObservedAt: now,
    });
    await ctx.db.patch(worker._id, {
      builds: args.builds,
      lastObservedAt: now,
    });
    await ctx.db.patch(dependency._id, {
      wiring: {
        state: "wired",
        deployKeys: {
          production: dependency.wiring.deployKeys.production,
          preview: dependency.wiring.deployKeys.preview,
        },
      },
      updatedAt: now,
    });
    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "wire_convex_build_access",
      level: "info",
      message: `Convex build access wired from ${workerApp.rootDirectory} to ${convexApp.rootDirectory}.`,
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
    workerId: id("vaultCloudflareWorkers"),
    convexDeploymentId: id("vaultConvexDeployments"),
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
    const [worker] = await Promise.all([
      requireCloudflareWorker(ctx, args),
      requireConvexDeployment(ctx, args),
    ]);
    const dependency = await requireWorkerDeploymentDependency(ctx, args);
    if (worker.builds.state !== "connected" || dependency.wiring.state !== "wired") {
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

function buildNotWiredDependencyWiring(
  dependency: Doc<"vaultWorkerDeploymentDependencies">,
): Doc<"vaultWorkerDeploymentDependencies">["wiring"] {
  return {
    state: "not_wired",
    deployKeys: dependency.wiring.deployKeys,
  };
}

function resolveInfrastructureVerificationPatch(args: {
  rootDirectory: string;
  hasConfirmedConvexDeployment: boolean;
  providerResult: CloudflareInfrastructureVerificationResult;
  worker: Doc<"vaultCloudflareWorkers">;
  dependency: Doc<"vaultWorkerDeploymentDependencies"> | null;
}): {
  builds: Doc<"vaultCloudflareWorkers">["builds"];
  dependencyWiring: Doc<"vaultWorkerDeploymentDependencies">["wiring"] | null;
  message: string;
  shouldPatchWorker: boolean;
  shouldPatchDependency: boolean;
} {
  const dependency = args.dependency;
  const currentBuilds = args.worker.builds;
  const notWiredDependency = dependency ? buildNotWiredDependencyWiring(dependency) : null;

  if (args.providerResult.worker === "missing_upstream") {
    return {
      builds: { state: "not_connected" },
      dependencyWiring: notWiredDependency,
      message: `Cloudflare Worker is missing upstream for ${args.rootDirectory}; marked Worker missing.`,
      shouldPatchWorker: true,
      shouldPatchDependency: dependency?.wiring.state === "wired",
    };
  }

  if (currentBuilds.state === "connected" && args.providerResult.builds === "contradicted") {
    return {
      builds: { state: "not_connected" },
      dependencyWiring: notWiredDependency,
      message: `Cloudflare Workers Builds triggers are missing for ${args.rootDirectory}; marked Builds not connected.`,
      shouldPatchWorker: true,
      shouldPatchDependency: dependency?.wiring.state === "wired",
    };
  }

  const providerBuilds =
    args.providerResult.builds === "adopted" ? args.providerResult.connectedBuilds : currentBuilds;
  if (
    providerBuilds.state === "connected" &&
    args.providerResult.convexBuildAccess === "confirmed" &&
    args.hasConfirmedConvexDeployment &&
    dependency &&
    dependency.wiring.deployKeys.production.state === "created" &&
    dependency.wiring.deployKeys.preview.state === "created"
  ) {
    return {
      builds: providerBuilds,
      dependencyWiring: {
        state: "wired",
        deployKeys: {
          production: dependency.wiring.deployKeys.production,
          preview: dependency.wiring.deployKeys.preview,
        },
      },
      message: `Cloudflare infrastructure verified for ${args.rootDirectory}.`,
      shouldPatchWorker: true,
      shouldPatchDependency: dependency.wiring.state !== "wired",
    };
  }

  if (currentBuilds.state === "not_connected" && args.providerResult.builds === "adopted") {
    return {
      builds: args.providerResult.connectedBuilds,
      dependencyWiring: notWiredDependency,
      message:
        args.providerResult.convexBuildAccess === "confirmed"
          ? `Cloudflare Workers Builds already match ${args.rootDirectory}; recorded Builds connected but left deploy keys repairable because Samebase lacks complete key identity.`
          : `Cloudflare Workers Builds already match ${args.rootDirectory}; recorded Builds connected.`,
      shouldPatchWorker: true,
      shouldPatchDependency: dependency?.wiring.state === "wired",
    };
  }

  if (dependency?.wiring.state === "wired" && currentBuilds.state === "not_connected") {
    return {
      builds: currentBuilds,
      dependencyWiring: notWiredDependency,
      message: `Cloudflare Workers Builds are not connected for ${args.rootDirectory}; marked deploy keys missing.`,
      shouldPatchWorker: false,
      shouldPatchDependency: true,
    };
  }

  if (dependency?.wiring.state === "wired" && !args.hasConfirmedConvexDeployment) {
    return {
      builds: currentBuilds,
      dependencyWiring: notWiredDependency,
      message: `Cloudflare Convex build access has no connected Convex deployment for ${args.rootDirectory}; marked deploy keys missing.`,
      shouldPatchWorker: false,
      shouldPatchDependency: true,
    };
  }

  if (
    dependency &&
    currentBuilds.state === "connected" &&
    args.providerResult.convexBuildAccess === "contradicted"
  ) {
    return {
      builds: currentBuilds,
      dependencyWiring: notWiredDependency,
      message: `Cloudflare Workers Builds deploy-key variables are missing for ${args.rootDirectory}; marked deploy keys missing.`,
      shouldPatchWorker: true,
      shouldPatchDependency: dependency.wiring.state === "wired",
    };
  }

  if (
    currentBuilds.state === "connected" &&
    (args.providerResult.builds === "confirmed" ||
      args.providerResult.convexBuildAccess === "confirmed")
  ) {
    return {
      builds: currentBuilds,
      dependencyWiring: dependency?.wiring ?? null,
      message:
        args.providerResult.convexBuildAccess === "confirmed" && dependency
          ? `Cloudflare infrastructure is present for ${args.rootDirectory}, but Samebase left deploy keys repairable because their recorded identity is incomplete.`
          : `Cloudflare infrastructure verified for ${args.rootDirectory}.`,
      shouldPatchWorker: true,
      shouldPatchDependency: false,
    };
  }

  return {
    builds: currentBuilds,
    dependencyWiring: dependency?.wiring ?? null,
    message: `No connected Cloudflare infrastructure state to verify for ${args.rootDirectory}.`,
    shouldPatchWorker: false,
    shouldPatchDependency: false,
  };
}

export const claimCloudflareInfrastructureVerification = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: object({ claimed: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareInfrastructureVerificationRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const worker = await requireCloudflareWorker(ctx, args);
    const app = await requireVaultApp(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
      appId: worker.appId,
    });

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
      message: `Started infrastructure verification for ${app.rootDirectory}.`,
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
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: cloudflareInfrastructureVerificationState,
  handler: async (ctx, args) => {
    await requireCloudflareInfrastructureVerificationRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const worker = await requireCloudflareWorker(ctx, args);
    const [app, dependencyContext, ownership] = await Promise.all([
      requireVaultApp(ctx, {
        vaultId: args.vaultId,
        userId: args.userId,
        appId: worker.appId,
      }),
      readWorkerDeploymentDependencyContext(ctx, args),
      getVaultInfrastructureOwnership(ctx, args.vaultId),
    ]);
    if (!isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })) {
      return { active: false as const };
    }

    return {
      active: true as const,
      ghRepoId: vault.ghRepoId,
      defaultBranch: vault.defaultBranch,
      buildConfig: buildVaultCloudflareBuildConfig({
        rootDirectory: app.rootDirectory,
        dependencyRootDirectories: dependencyContext
          ? [dependencyContext.convexApp.rootDirectory]
          : [],
      }),
      worker: {
        workerId: worker._id,
        accountId: worker.accountId,
        workerName: worker.workerName,
        workerTag: worker.workerTag,
        builds: worker.builds,
      },
      workerApp: {
        appId: app._id,
        rootDirectory: app.rootDirectory,
      },
      dependency: dependencyContext
        ? {
            dependencyId: dependencyContext.dependency._id,
            wiring: dependencyContext.dependency.wiring,
            convexApp: {
              appId: dependencyContext.convexApp._id,
              rootDirectory: dependencyContext.convexApp.rootDirectory,
            },
            convexDeployment: {
              convexDeploymentId: dependencyContext.convexDeployment._id,
              projectId: dependencyContext.convexDeployment.projectId,
              deploymentName: dependencyContext.convexDeployment.deploymentName,
            },
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
    workerId: id("vaultCloudflareWorkers"),
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
    const worker = await requireCloudflareWorker(ctx, args);
    const [app, dependencyContext] = await Promise.all([
      requireVaultApp(ctx, {
        vaultId: args.vaultId,
        userId: args.userId,
        appId: worker.appId,
      }),
      readWorkerDeploymentDependencyContext(ctx, args),
    ]);

    const patch = resolveInfrastructureVerificationPatch({
      rootDirectory: app.rootDirectory,
      hasConfirmedConvexDeployment:
        dependencyContext !== null && args.providerResult.convexDeployment === "confirmed",
      providerResult: args.providerResult,
      worker,
      dependency: dependencyContext?.dependency ?? null,
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
        builds: patch.builds,
        upstream: workerUpstream,
        lastObservedAt: Date.now(),
      });
    }
    if (patch.shouldPatchDependency && dependencyContext && patch.dependencyWiring) {
      await ctx.db.patch(dependencyContext.dependency._id, {
        wiring: patch.dependencyWiring,
        updatedAt: Date.now(),
      });
    }
    const messages: string[] = [];
    if (dependencyContext && args.providerResult.convexDeployment !== "not_checked") {
      const convexUpstream =
        args.providerResult.convexDeployment === "missing_upstream"
          ? VAULT_PROVIDER_UPSTREAM_MISSING
          : VAULT_PROVIDER_UPSTREAM_PRESENT;
      const observedAt = Date.now();
      if (convexUpstream.state === "missing_upstream") {
        await markConvexDeploymentDependenciesNotWired(
          ctx,
          dependencyContext.convexDeployment._id,
          observedAt,
        );
      }
      await ctx.db.patch(dependencyContext.convexDeployment._id, {
        upstream: convexUpstream,
        lastObservedAt: observedAt,
      });
      if (convexUpstream.state === "missing_upstream") {
        messages.push(
          `Convex deployment is missing upstream for ${app.rootDirectory}; marked deployment missing.`,
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
    workerId: id("vaultCloudflareWorkers"),
    message: string(),
  },
  returns: object({ applied: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareInfrastructureVerificationRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      return { applied: false };
    }
    await requireCloudflareWorker(ctx, args);

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
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    await requireCloudflareInfrastructureVerificationRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    await requireCloudflareWorker(ctx, args);

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
