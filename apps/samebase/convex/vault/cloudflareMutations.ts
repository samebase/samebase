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
  isWorkerDeploymentDependencyCurrentlyWired,
  readCurrentWorkerDeploymentDeployKeys,
} from "./deploymentDependencies";
import {
  buildVaultCloudflareBuildConfig,
  isVaultProviderUpstreamPresent,
  type VaultCloudflareBuildConfig,
  type VaultCloudflareConnectedBuilds,
  vVaultCloudflareBuildConfig,
  vVaultCloudflareBuilds,
  vVaultCloudflareConnectedBuilds,
  vVaultCloudflareWorkerCreationLifecycle,
  vVaultCloudflareOrigin,
  vVaultWorkersDevAvailability,
  vVaultWorkerDeploymentWiring,
  VAULT_PROVIDER_UPSTREAM_MISSING,
  VAULT_PROVIDER_UPSTREAM_PRESENT,
} from "./model";
import { isLiveConnectedVault } from "./state";

const { boolean, id, literal, null: nullValue, object, string, union } = v;
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
    owner: string(),
    repo: string(),
    ghRepoId: string(),
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
const cloudflareWorkerAttachmentProvenance = union(
  object({ state: literal("selected_existing") }),
  object({
    state: literal("recovered_existing"),
    creationClaimId: id("vaultCloudflareWorkerCreationClaims"),
  }),
  object({
    state: literal("provisioned"),
    creationClaimId: id("vaultCloudflareWorkerCreationClaims"),
  }),
);
const cloudflareWorkerCreationClaim = object({
  claimId: id("vaultCloudflareWorkerCreationClaims"),
  accountId: string(),
  workerName: string(),
  lifecycle: vVaultCloudflareWorkerCreationLifecycle,
});
type AllowedCloudflareWorkerCreationClaim =
  | { state: "none" }
  | { state: "same_app" }
  | { state: "exact"; claimId: Id<"vaultCloudflareWorkerCreationClaims"> };
const vCloudflareConvexBuildAccessDeployKey = union(
  object({
    deployment: literal("production"),
    value: object({
      teamId: string(),
      name: string(),
      deploymentName: string(),
    }),
  }),
  object({
    deployment: literal("preview"),
    value: object({
      teamId: string(),
      name: string(),
      projectId: string(),
    }),
  }),
);
const cloudflareConvexBuildAccessWiringState = union(
  object({
    active: literal(false),
  }),
  object({
    active: literal(true),
    owner: string(),
    repo: string(),
    ghRepoId: string(),
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
      teamId: string(),
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
    workerName: string(),
    workersDev: vVaultWorkersDevAvailability,
    builds: literal("adopted"),
    connectedBuilds: vVaultCloudflareConnectedBuilds,
    convexDeployment: cloudflareInfrastructureVerificationConvexDeployment,
    convexBuildAccess: cloudflareInfrastructureVerificationConvexBuildAccess,
  }),
  object({
    worker: cloudflareInfrastructureVerificationWorker,
    workerName: string(),
    workersDev: vVaultWorkersDevAvailability,
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
        currentlyWired: boolean(),
        wiring: vVaultWorkerDeploymentWiring,
        convexApp: vVaultAppReference,
        convexDeployment: object({
          convexDeploymentId: id("vaultConvexDeployments"),
          teamId: string(),
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
    accountId: string;
    workerName: string;
    workerTag?: string;
  },
): Promise<Doc<"vaultCloudflareWorkers"> | null> {
  const workerTag = args.workerTag;
  const [workerByName, workerByTag] = await Promise.all([
    ctx.db
      .query("vaultCloudflareWorkers")
      .withIndex("by_account_and_worker", (q) =>
        q.eq("accountId", args.accountId).eq("workerName", args.workerName),
      )
      .unique(),
    workerTag
      ? ctx.db
          .query("vaultCloudflareWorkers")
          .withIndex("by_account_and_worker_tag", (q) =>
            q.eq("accountId", args.accountId).eq("workerTag", workerTag),
          )
          .unique()
      : null,
  ]);
  if (workerByName && workerByTag && workerByName._id !== workerByTag._id) {
    throw new Error("Cloudflare Worker name and stable identity are attached separately.");
  }
  return workerByTag ?? workerByName;
}

async function readCloudflareWorkerCreationClaimByProviderIdentity(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    accountId: string;
    workerName: string;
    workerTag?: string;
  },
): Promise<Doc<"vaultCloudflareWorkerCreationClaims"> | null> {
  const workerTag = args.workerTag;
  const [claimByName, claimByTag] = await Promise.all([
    ctx.db
      .query("vaultCloudflareWorkerCreationClaims")
      .withIndex("by_account_and_worker", (q) =>
        q.eq("accountId", args.accountId).eq("workerName", args.workerName),
      )
      .unique(),
    workerTag
      ? ctx.db
          .query("vaultCloudflareWorkerCreationClaims")
          .withIndex("by_account_and_worker_tag", (q) =>
            q.eq("accountId", args.accountId).eq("lifecycle.workerTag", workerTag),
          )
          .unique()
      : null,
  ]);
  if (claimByName && claimByTag && claimByName._id !== claimByTag._id) {
    throw new Error("Cloudflare Worker identities are owned by different creation claims.");
  }
  return claimByTag ?? claimByName;
}

async function readCloudflareWorkerCreationClaimByVault(
  ctx: CloudflareWorkerConnectionReadCtx,
  vaultId: Id<"vaults">,
): Promise<Doc<"vaultCloudflareWorkerCreationClaims"> | null> {
  return await ctx.db
    .query("vaultCloudflareWorkerCreationClaims")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .unique();
}

async function assertNoExistingCloudflareWorkerTarget(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    appId: Id<"vaultApps">;
    accountId: string;
    workerName: string;
    workerTag?: string;
    allowedCreationClaim: AllowedCloudflareWorkerCreationClaim;
  },
): Promise<void> {
  const [existingWorker, vaultCreationClaim, providerCreationClaim] = await Promise.all([
    readCloudflareWorkerByProviderIdentity(ctx, args),
    readCloudflareWorkerCreationClaimByVault(ctx, args.vaultId),
    readCloudflareWorkerCreationClaimByProviderIdentity(ctx, args),
  ]);
  if (
    existingWorker &&
    (existingWorker.vaultId !== args.vaultId || existingWorker.appId !== args.appId)
  ) {
    throw new Error("Cloudflare Worker is already attached to another app.");
  }
  if (existingWorker && isVaultProviderUpstreamPresent(existingWorker)) {
    throw new Error("Cloudflare Worker is already attached.");
  }
  if (
    vaultCreationClaim &&
    providerCreationClaim &&
    vaultCreationClaim._id !== providerCreationClaim._id
  ) {
    throw new Error("Cloudflare Worker identities are owned by different creation claims.");
  }
  const creationClaim = vaultCreationClaim ?? providerCreationClaim;
  if (!creationClaim) {
    return;
  }
  const sameApp = creationClaim.vaultId === args.vaultId && creationClaim.appId === args.appId;
  switch (args.allowedCreationClaim.state) {
    case "none":
      throw new Error("Cloudflare Worker creation is already owned by another operation.");
    case "same_app":
      if (
        sameApp &&
        creationClaim.accountId === args.accountId &&
        creationClaim.workerName === args.workerName
      ) {
        return;
      }
      throw new Error("Cloudflare Worker creation is already owned by another app.");
    case "exact":
      if (sameApp && creationClaim._id === args.allowedCreationClaim.claimId) {
        return;
      }
      throw new Error("Cloudflare Worker creation claim does not match this app.");
    default:
      args.allowedCreationClaim satisfies never;
  }
}

async function requireCreatedCloudflareWorkerClaim(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    appId: Id<"vaultApps">;
    accountId: string;
    workerName: string;
    workerTag: string;
    creationClaimId: Id<"vaultCloudflareWorkerCreationClaims">;
  },
): Promise<Doc<"vaultCloudflareWorkerCreationClaims">> {
  const claim = await ctx.db.get(args.creationClaimId);
  if (
    !claim ||
    claim.vaultId !== args.vaultId ||
    claim.runId !== args.runId ||
    claim.userId !== args.userId ||
    claim.appId !== args.appId ||
    claim.accountId !== args.accountId ||
    claim.lifecycle.state !== "created" ||
    claim.lifecycle.workerTag !== args.workerTag
  ) {
    throw new Error("Cloudflare Worker creation claim does not match the created Worker.");
  }
  return claim;
}

async function requireRecoverableCloudflareWorkerClaim(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    appId: Id<"vaultApps">;
    accountId: string;
    workerName: string;
    workerTag: string;
    creationClaimId: Id<"vaultCloudflareWorkerCreationClaims">;
  },
): Promise<Doc<"vaultCloudflareWorkerCreationClaims">> {
  const claim = await ctx.db.get(args.creationClaimId);
  if (
    !claim ||
    claim.vaultId !== args.vaultId ||
    claim.runId !== args.runId ||
    claim.userId !== args.userId ||
    claim.appId !== args.appId ||
    claim.accountId !== args.accountId ||
    claim.workerName !== args.workerName ||
    claim.lifecycle.state !== "creating"
  ) {
    throw new Error("Cloudflare Worker creation claim does not match the recovered Worker.");
  }
  return claim;
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
      repositoryFullName: `${vault.owner}/${vault.name}`,
      expectedRootDirectory: app.rootDirectory,
    };
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
    let creationClaim: Doc<"vaultCloudflareWorkerCreationClaims"> | null = null;
    try {
      await assertNoExistingCloudflareWorkerTarget(ctx, {
        vaultId: args.vaultId,
        appId: args.appId,
        accountId: args.accountId,
        workerName: args.workerName,
        allowedCreationClaim:
          args.origin === "provisioned" ? { state: "same_app" } : { state: "none" },
      });
      if (args.origin === "provisioned") {
        creationClaim = await readCloudflareWorkerCreationClaimByProviderIdentity(ctx, args);
      }
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
    if (ownership && ownership.state === "active" && ownership.runId !== args.runId) {
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: "Cloudflare Worker connection is already running.",
        state: "canceled",
      });
      return { claimed: false };
    }
    if (ownership && ownership.state !== "active" && ownership.runId === args.runId) {
      return { claimed: false };
    }

    if (ownership) {
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

    if (args.origin === "provisioned") {
      if (creationClaim) {
        await ctx.db.patch(creationClaim._id, {
          runId: args.runId,
          updatedAt: now,
        });
      }
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

export const readCloudflareWorkerCreationClaimForRun = internalQuery({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
  },
  returns: union(cloudflareWorkerCreationClaim, nullValue()),
  handler: async (ctx, args) => {
    await requireCloudflareWorkerConnectionRun(ctx, args);
    const claim = await ctx.db
      .query("vaultCloudflareWorkerCreationClaims")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .unique();
    if (!claim) {
      return null;
    }
    if (
      claim.vaultId !== args.vaultId ||
      claim.userId !== args.userId ||
      claim.appId !== args.appId
    ) {
      throw new Error("Cloudflare Worker creation claim does not match the run.");
    }
    return {
      claimId: claim._id,
      accountId: claim.accountId,
      workerName: claim.workerName,
      lifecycle: claim.lifecycle,
    };
  },
});

export const beginCloudflareWorkerCreation = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
    accountId: string(),
    workerName: string(),
  },
  returns: cloudflareWorkerCreationClaim,
  handler: async (ctx, args) => {
    await requireCloudflareWorkerConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    await requireVaultApp(ctx, args);
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })) {
      throw new Error("Cloudflare provisioning run no longer owns provider creation.");
    }

    const [vaultCreationClaim, providerCreationClaim] = await Promise.all([
      readCloudflareWorkerCreationClaimByVault(ctx, args.vaultId),
      readCloudflareWorkerCreationClaimByProviderIdentity(ctx, args),
    ]);
    if (
      vaultCreationClaim &&
      providerCreationClaim &&
      vaultCreationClaim._id !== providerCreationClaim._id
    ) {
      throw new Error("Cloudflare Worker identities are owned by different creation claims.");
    }
    const existingClaim = vaultCreationClaim ?? providerCreationClaim;
    if (existingClaim) {
      if (
        existingClaim.vaultId !== args.vaultId ||
        existingClaim.userId !== args.userId ||
        existingClaim.appId !== args.appId ||
        existingClaim.accountId !== args.accountId ||
        existingClaim.workerName !== args.workerName
      ) {
        throw new Error("Cloudflare Worker creation does not match this app and target.");
      }
      await ctx.db.patch(existingClaim._id, {
        runId: args.runId,
        updatedAt: Date.now(),
      });
      return {
        claimId: existingClaim._id,
        accountId: existingClaim.accountId,
        workerName: existingClaim.workerName,
        lifecycle: existingClaim.lifecycle,
      };
    }

    await assertNoExistingCloudflareWorkerTarget(ctx, {
      vaultId: args.vaultId,
      appId: args.appId,
      accountId: args.accountId,
      workerName: args.workerName,
      allowedCreationClaim: { state: "none" },
    });
    const now = Date.now();
    const lifecycle = { state: "creating" } as const;
    const claimId = await ctx.db.insert("vaultCloudflareWorkerCreationClaims", {
      vaultId: args.vaultId,
      userId: args.userId,
      appId: args.appId,
      runId: args.runId,
      accountId: args.accountId,
      workerName: args.workerName,
      lifecycle,
      createdAt: now,
      updatedAt: now,
    });
    return {
      claimId,
      accountId: args.accountId,
      workerName: args.workerName,
      lifecycle,
    };
  },
});

export const recordCreatedCloudflareWorker = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
    creationClaimId: id("vaultCloudflareWorkerCreationClaims"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    await requireCloudflareWorkerConnectionRun(ctx, args);
    const claim = await ctx.db.get(args.creationClaimId);
    if (
      !claim ||
      claim.vaultId !== args.vaultId ||
      claim.runId !== args.runId ||
      claim.userId !== args.userId ||
      claim.appId !== args.appId ||
      claim.accountId !== args.accountId ||
      claim.workerName !== args.workerName
    ) {
      throw new Error("Cloudflare Worker creation claim does not match the run.");
    }
    if (claim.lifecycle.state === "created") {
      if (claim.lifecycle.workerTag !== args.workerTag) {
        throw new Error("Cloudflare returned a different Worker for the creation claim.");
      }
      return null;
    }
    await assertNoExistingCloudflareWorkerTarget(ctx, {
      vaultId: args.vaultId,
      appId: args.appId,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      allowedCreationClaim: { state: "exact", claimId: claim._id },
    });
    await ctx.db.patch(claim._id, {
      lifecycle: {
        state: "created",
        workerTag: args.workerTag,
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const resetMissingCloudflareWorkerCreation = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
    creationClaimId: id("vaultCloudflareWorkerCreationClaims"),
    accountId: string(),
    workerTag: string(),
  },
  returns: cloudflareWorkerCreationClaim,
  handler: async (ctx, args) => {
    await requireCloudflareWorkerConnectionRun(ctx, args);
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })) {
      throw new Error("Cloudflare provisioning run no longer owns provider recovery.");
    }
    const claim = await ctx.db.get(args.creationClaimId);
    if (
      !claim ||
      claim.vaultId !== args.vaultId ||
      claim.runId !== args.runId ||
      claim.userId !== args.userId ||
      claim.appId !== args.appId ||
      claim.accountId !== args.accountId ||
      claim.lifecycle.state !== "created" ||
      claim.lifecycle.workerTag !== args.workerTag
    ) {
      throw new Error("Cloudflare Worker creation claim does not match the missing Worker.");
    }
    const lifecycle = { state: "creating" } as const;
    await ctx.db.patch(claim._id, { lifecycle, updatedAt: Date.now() });
    return {
      claimId: claim._id,
      accountId: claim.accountId,
      workerName: claim.workerName,
      lifecycle,
    };
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
    workersDev: vVaultWorkersDevAvailability,
    provenance: cloudflareWorkerAttachmentProvenance,
  },
  returns: cloudflareWorkerAttachmentResult,
  handler: async (ctx, args): Promise<CloudflareWorkerAttachmentResult> => {
    const run = await requireCloudflareWorkerConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const app = await requireVaultApp(ctx, args);
    let infrastructureTarget: Doc<"vaultInfrastructureTargets"> | null = null;
    let infrastructureTargetWorker: Doc<"vaultCloudflareWorkers"> | null = null;
    if (isComposedInfrastructureRun(run)) {
      infrastructureTarget = await ctx.db
        .query("vaultInfrastructureTargets")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .unique();
      if (
        !infrastructureTarget ||
        infrastructureTarget.appId !== args.appId ||
        infrastructureTarget.cloudflare.accountId !== args.accountId
      ) {
        throw new Error("Infrastructure target does not match the attached Worker.");
      }
      if (infrastructureTarget.cloudflare.state === "attached") {
        infrastructureTargetWorker = await ctx.db.get(infrastructureTarget.cloudflare.workerId);
        if (
          !infrastructureTargetWorker ||
          infrastructureTargetWorker.vaultId !== args.vaultId ||
          infrastructureTargetWorker.userId !== args.userId ||
          infrastructureTargetWorker.appId !== args.appId
        ) {
          throw new Error("Infrastructure target references an invalid Worker.");
        }
        if (isVaultProviderUpstreamPresent(infrastructureTargetWorker)) {
          throw new Error("Infrastructure target already references a present Worker.");
        }
      }
    }
    const existingWorker = await readCloudflareWorkerByProviderIdentity(ctx, args);
    try {
      await assertNoExistingCloudflareWorkerTarget(ctx, {
        vaultId: args.vaultId,
        appId: args.appId,
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        allowedCreationClaim:
          args.provenance.state !== "selected_existing"
            ? {
                state: "exact",
                claimId: args.provenance.creationClaimId,
              }
            : { state: "none" },
      });
    } catch (error) {
      if (isStandaloneCloudflareWorkerConnectionRun(run)) {
        const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
        if (ownership && isActiveCloudflareProvisioningOwner(ownership, { runId: args.runId })) {
          await ctx.db.patch(ownership._id, {
            state: "failed",
            updatedAt: Date.now(),
          });
        }
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

    const creationClaim =
      args.provenance.state === "selected_existing"
        ? null
        : args.provenance.state === "provisioned"
          ? await requireCreatedCloudflareWorkerClaim(ctx, {
              ...args,
              creationClaimId: args.provenance.creationClaimId,
            })
          : await requireRecoverableCloudflareWorkerClaim(ctx, {
              ...args,
              creationClaimId: args.provenance.creationClaimId,
            });
    if (
      infrastructureTarget &&
      infrastructureTarget.cloudflare.workerName !== (creationClaim?.workerName ?? args.workerName)
    ) {
      throw new Error("Infrastructure target does not match the attached Worker.");
    }
    if (
      infrastructureTargetWorker &&
      existingWorker &&
      infrastructureTargetWorker._id !== existingWorker._id
    ) {
      throw new Error(
        "Cloudflare Worker provider identity is already represented by another Worker row.",
      );
    }
    const origin = args.provenance.state === "provisioned" ? "provisioned" : "selected_existing";
    const now = Date.now();
    let workerId: Id<"vaultCloudflareWorkers">;
    const workerToUpdate = infrastructureTargetWorker ?? existingWorker;
    if (workerToUpdate) {
      await ctx.db.patch(workerToUpdate._id, {
        appId: args.appId,
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        workersDev: args.workersDev,
        origin,
        upstream: VAULT_PROVIDER_UPSTREAM_PRESENT,
        builds: { state: "not_connected" },
        connectedAt: now,
        lastObservedAt: now,
      });
      await markWorkerDeploymentDependencyNotWired(ctx, workerToUpdate._id, now);
      workerId = workerToUpdate._id;
    } else {
      workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: args.vaultId,
        userId: args.userId,
        appId: args.appId,
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        workersDev: args.workersDev,
        origin,
        upstream: VAULT_PROVIDER_UPSTREAM_PRESENT,
        builds: { state: "not_connected" },
        connectedAt: now,
        lastObservedAt: now,
      });
    }
    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "attach_worker",
      level: "info",
      message: `Cloudflare Worker ready for ${app.rootDirectory}: ${args.workerName}.`,
      state: "running",
    });

    if (infrastructureTarget) {
      if (
        infrastructureTarget.cloudflare.state === "attached" &&
        infrastructureTarget.cloudflare.workerId !== workerId
      ) {
        throw new Error("Infrastructure target already references another Worker.");
      }
      await ctx.db.patch(infrastructureTarget._id, {
        cloudflare: {
          state: "attached",
          accountId: infrastructureTarget.cloudflare.accountId,
          workerName: infrastructureTarget.cloudflare.workerName,
          workerId,
        },
      });
    }

    if (creationClaim) {
      await ctx.db.delete(creationClaim._id);
    }
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
    }

    return { state: "attached", workerId };
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
    if (
      isStandaloneCloudflareWorkerConnectionRun(run) &&
      ownership?.runId === args.runId &&
      ownership.state === "succeeded"
    ) {
      const worker = await requireCloudflareWorker(ctx, args);
      if (!isVaultProviderUpstreamPresent(worker)) {
        throw new Error("Cloudflare Worker connection did not attach a Worker.");
      }
      return null;
    }
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
    if (ownership && ownership.state === "active" && ownership.runId !== args.runId) {
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: "Cloudflare provisioning is already running.",
        state: "canceled",
      });
      return { claimed: false };
    }
    if (ownership && ownership.state !== "active" && ownership.runId === args.runId) {
      return { claimed: false };
    }

    if (ownership) {
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
      owner: vault.owner,
      repo: vault.name,
      ghRepoId: vault.ghRepoId,
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
    if (existingDependency) {
      const { production, preview } = existingDependency.wiring.deployKeys;
      if (
        (production.state !== "not_created" && production.teamId !== convexDeployment.teamId) ||
        (preview.state !== "not_created" && preview.teamId !== convexDeployment.teamId)
      ) {
        throw new Error(
          "Reconnect the Convex team that owns the recorded deploy keys and remove them before changing teams.",
        );
      }
    }
    const now = Date.now();
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (ownership && ownership.state === "active" && ownership.runId !== args.runId) {
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: "Cloudflare provisioning is already running.",
        state: "canceled",
      });
      return { claimed: false };
    }
    if (ownership && ownership.state !== "active" && ownership.runId === args.runId) {
      return { claimed: false };
    }

    if (ownership) {
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
      owner: vault.owner,
      repo: vault.name,
      ghRepoId: vault.ghRepoId,
      repositoryFullName: `${vault.owner}/${vault.name}`,
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
        teamId: convexDeployment.teamId,
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

export const beginCloudflareConvexBuildAccessDeployKeyCreation = internalMutation({
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

    if (args.deployment === "production") {
      if (dependency.wiring.deployKeys.production.state !== "not_created") {
        return { applied: false };
      }
      await ctx.db.patch(dependency._id, {
        wiring: {
          state: "not_wired",
          deployKeys: {
            production: {
              state: "creating",
              runId: args.runId,
              teamId: convexDeployment.teamId,
              name: args.convexDeployKeyName,
              deploymentName: convexDeployment.deploymentName,
            },
            preview: dependency.wiring.deployKeys.preview,
          },
        },
        updatedAt: Date.now(),
      });
      return { applied: true };
    }

    if (dependency.wiring.deployKeys.preview.state !== "not_created") {
      return { applied: false };
    }
    await ctx.db.patch(dependency._id, {
      wiring: {
        state: "not_wired",
        deployKeys: {
          production: dependency.wiring.deployKeys.production,
          preview: {
            state: "creating",
            runId: args.runId,
            teamId: convexDeployment.teamId,
            name: args.convexDeployKeyName,
            projectId: convexDeployment.projectId,
          },
        },
      },
      updatedAt: Date.now(),
    });
    return { applied: true };
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

    if (args.deployment === "production") {
      const current = dependency.wiring.deployKeys.production;
      if (
        current.state !== "creating" ||
        current.runId !== args.runId ||
        current.teamId !== convexDeployment.teamId ||
        current.name !== args.convexDeployKeyName ||
        current.deploymentName !== convexDeployment.deploymentName
      ) {
        return { applied: false };
      }
      await ctx.db.patch(dependency._id, {
        wiring: {
          state: "not_wired",
          deployKeys: {
            production: {
              state: "created",
              teamId: current.teamId,
              name: current.name,
              deploymentName: current.deploymentName,
            },
            preview: dependency.wiring.deployKeys.preview,
          },
        },
        updatedAt: Date.now(),
      });
    } else {
      const current = dependency.wiring.deployKeys.preview;
      if (
        current.state !== "creating" ||
        current.runId !== args.runId ||
        current.teamId !== convexDeployment.teamId ||
        current.name !== args.convexDeployKeyName ||
        current.projectId !== convexDeployment.projectId
      ) {
        return { applied: false };
      }
      await ctx.db.patch(dependency._id, {
        wiring: {
          state: "not_wired",
          deployKeys: {
            production: dependency.wiring.deployKeys.production,
            preview: {
              state: "created",
              teamId: current.teamId,
              name: current.name,
              projectId: current.projectId,
            },
          },
        },
        updatedAt: Date.now(),
      });
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

export const clearCloudflareConvexBuildAccessDeployKey = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
    convexDeploymentId: id("vaultConvexDeployments"),
    deployKey: vCloudflareConvexBuildAccessDeployKey,
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
    await Promise.all([requireCloudflareWorker(ctx, args), requireConvexDeployment(ctx, args)]);
    const dependency = await requireWorkerDeploymentDependency(ctx, args);

    if (args.deployKey.deployment === "production") {
      const current = dependency.wiring.deployKeys.production;
      if (
        current.state === "not_created" ||
        current.teamId !== args.deployKey.value.teamId ||
        current.name !== args.deployKey.value.name ||
        current.deploymentName !== args.deployKey.value.deploymentName
      ) {
        return { applied: false };
      }
      await ctx.db.patch(dependency._id, {
        wiring: {
          state: "not_wired",
          deployKeys: {
            production: { state: "not_created" },
            preview: dependency.wiring.deployKeys.preview,
          },
        },
        updatedAt: Date.now(),
      });
      return { applied: true };
    }

    const current = dependency.wiring.deployKeys.preview;
    if (
      current.state === "not_created" ||
      current.teamId !== args.deployKey.value.teamId ||
      current.name !== args.deployKey.value.name ||
      current.projectId !== args.deployKey.value.projectId
    ) {
      return { applied: false };
    }
    await ctx.db.patch(dependency._id, {
      wiring: {
        state: "not_wired",
        deployKeys: {
          production: dependency.wiring.deployKeys.production,
          preview: { state: "not_created" },
        },
      },
      updatedAt: Date.now(),
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
    const deployKeys = readCurrentWorkerDeploymentDeployKeys(dependency, convexDeployment);
    if (!isVaultProviderUpstreamPresent(convexDeployment) || !deployKeys) {
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
      lastObservedAt: now,
    });
    await ctx.db.patch(worker._id, {
      builds: args.builds,
      lastObservedAt: now,
    });
    await ctx.db.patch(dependency._id, {
      wiring: {
        state: "wired",
        deployKeys,
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
    const [worker, convexDeployment] = await Promise.all([
      requireCloudflareWorker(ctx, args),
      requireConvexDeployment(ctx, args),
    ]);
    const dependency = await requireWorkerDeploymentDependency(ctx, args);
    if (
      worker.builds.state !== "connected" ||
      !isWorkerDeploymentDependencyCurrentlyWired(dependency, convexDeployment)
    ) {
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
  providerResult: CloudflareInfrastructureVerificationResult;
  worker: Doc<"vaultCloudflareWorkers">;
  dependency: Doc<"vaultWorkerDeploymentDependencies"> | null;
  convexDeployment: Doc<"vaultConvexDeployments"> | null;
}): {
  builds: Doc<"vaultCloudflareWorkers">["builds"];
  dependencyWiring: Doc<"vaultWorkerDeploymentDependencies">["wiring"] | null;
  message: string;
  shouldPatchDependency: boolean;
} {
  const dependency = args.dependency;
  const convexDeployment = args.convexDeployment;
  const currentDeployKeys =
    dependency && convexDeployment
      ? readCurrentWorkerDeploymentDeployKeys(dependency, convexDeployment)
      : null;
  const currentBuilds = args.worker.builds;
  const notWiredDependency = dependency ? buildNotWiredDependencyWiring(dependency) : null;

  if (args.providerResult.worker === "missing_upstream") {
    return {
      builds: { state: "not_connected" },
      dependencyWiring: notWiredDependency,
      message: `Cloudflare Worker is missing upstream for ${args.rootDirectory}; marked Worker missing.`,
      shouldPatchDependency: dependency?.wiring.state === "wired",
    };
  }

  if (currentBuilds.state === "connected" && args.providerResult.builds === "contradicted") {
    return {
      builds: { state: "not_connected" },
      dependencyWiring: notWiredDependency,
      message: `Cloudflare Workers Builds triggers are missing for ${args.rootDirectory}; marked Builds not connected.`,
      shouldPatchDependency: dependency?.wiring.state === "wired",
    };
  }

  const providerBuilds =
    args.providerResult.builds === "adopted" ? args.providerResult.connectedBuilds : currentBuilds;
  if (
    providerBuilds.state === "connected" &&
    args.providerResult.convexBuildAccess === "confirmed" &&
    dependency &&
    convexDeployment &&
    args.providerResult.convexDeployment === "confirmed" &&
    currentDeployKeys
  ) {
    return {
      builds: providerBuilds,
      dependencyWiring: {
        state: "wired",
        deployKeys: currentDeployKeys,
      },
      message: `Cloudflare infrastructure verified for ${args.rootDirectory}.`,
      shouldPatchDependency: !isWorkerDeploymentDependencyCurrentlyWired(
        dependency,
        convexDeployment,
      ),
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
      shouldPatchDependency: dependency?.wiring.state === "wired",
    };
  }

  if (dependency?.wiring.state === "wired" && currentBuilds.state === "not_connected") {
    return {
      builds: currentBuilds,
      dependencyWiring: notWiredDependency,
      message: `Cloudflare Workers Builds are not connected for ${args.rootDirectory}; marked deploy keys missing.`,
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
      shouldPatchDependency: false,
    };
  }

  return {
    builds: currentBuilds,
    dependencyWiring: dependency?.wiring ?? null,
    message: `No connected Cloudflare infrastructure state to verify for ${args.rootDirectory}.`,
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
    if (ownership && ownership.state === "active" && ownership.runId !== args.runId) {
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: "Cloudflare provisioning is already running.",
        state: "canceled",
      });
      return { claimed: false };
    }
    if (ownership && ownership.state !== "active" && ownership.runId === args.runId) {
      return { claimed: false };
    }

    if (ownership) {
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
            currentlyWired: isWorkerDeploymentDependencyCurrentlyWired(
              dependencyContext.dependency,
              dependencyContext.convexDeployment,
            ),
            wiring: dependencyContext.dependency.wiring,
            convexApp: {
              appId: dependencyContext.convexApp._id,
              rootDirectory: dependencyContext.convexApp.rootDirectory,
            },
            convexDeployment: {
              convexDeploymentId: dependencyContext.convexDeployment._id,
              teamId: dependencyContext.convexDeployment.teamId,
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
    if (args.providerResult.worker === "confirmed") {
      const [workerByProviderIdentity, creationClaim] = await Promise.all([
        readCloudflareWorkerByProviderIdentity(ctx, {
          accountId: worker.accountId,
          workerName: args.providerResult.workerName,
          workerTag: worker.workerTag,
        }),
        readCloudflareWorkerCreationClaimByProviderIdentity(ctx, {
          accountId: worker.accountId,
          workerName: args.providerResult.workerName,
          workerTag: worker.workerTag,
        }),
      ]);
      if (workerByProviderIdentity && workerByProviderIdentity._id !== worker._id) {
        throw new Error("Cloudflare Worker identity is already attached to another app.");
      }
      if (creationClaim) {
        throw new Error("Cloudflare Worker identity is owned by an unfinished creation.");
      }
    }

    const patch = resolveInfrastructureVerificationPatch({
      rootDirectory: app.rootDirectory,
      providerResult: args.providerResult,
      worker,
      dependency: dependencyContext?.dependency ?? null,
      convexDeployment: dependencyContext?.convexDeployment ?? null,
    });
    const workerUpstream =
      args.providerResult.worker === "missing_upstream"
        ? VAULT_PROVIDER_UPSTREAM_MISSING
        : VAULT_PROVIDER_UPSTREAM_PRESENT;
    await ctx.db.patch(worker._id, {
      builds: patch.builds,
      workerName:
        args.providerResult.worker === "confirmed"
          ? args.providerResult.workerName
          : worker.workerName,
      workersDev: args.providerResult.workersDev,
      upstream: workerUpstream,
      lastObservedAt: Date.now(),
    });
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
