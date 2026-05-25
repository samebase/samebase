import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  isConvexCloudDeployment,
  requestConvexManagementApi,
  type ConvexCloudDeployment,
} from "./convexManagementApi/client";
import { isConvexManagementNotFoundError } from "./convexManagementApi/errors";
import type { PlatformDeploymentResponse } from "./convexManagementApi/types.generated";
import {
  ensureCloudflareResources,
  type CloudflareBuildConfig,
  type ExistingCloudflareWorkerIdentity,
} from "./cloudflareResources";
import { asRecord, readStringOrNumber } from "./jsonUtils";
import type { AppProvisioningStep, GithubTreeData } from "./schema";
import { vaultSuffix } from "./slugUtils";
import {
  isLiveConnectedVault,
  isNoterManagedVault,
  type NoterManagedConnectedVault,
} from "./vault/state";
import type { ConvexDeployKeyState, VaultCloudflareBuildConfig } from "./vault/model";
import {
  formatProviderApiCallLogMessage,
  type ProviderApiCall,
  type ProviderApiCallRecorder,
} from "./providerApiLog";

const PROVISIONING_STALE_MS = 10 * 60 * 1000;
const GITHUB_API_VERSION = "2022-11-28";
const activeProvisioningRunResult = v.object({ active: v.boolean() });
const infrastructurePatchResult = v.object({ applied: v.boolean() });
const vConvexDeployKeyDeployment = v.union(v.literal("production"), v.literal("preview"));

const convexInfrastructureRecordValidator = v.object({
  convexProjectId: v.string(),
  convexTeamSlug: v.string(),
  convexProjectSlug: v.string(),
  convexDeploymentName: v.string(),
  convexDeploymentType: v.literal("prod"),
  convexCloudUrl: v.string(),
  convexSiteUrl: v.string(),
});

async function requireActiveProvisioningVault(
  ctx: MutationCtx,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
  },
): Promise<NoterManagedConnectedVault | null> {
  const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
  if (!ownership || !isActiveProvisioningOwner(ownership, { runId: args.runId })) {
    return null;
  }
  const vault = await ctx.db.get(args.vaultId);
  if (!isLiveConnectedVault(vault) || !isNoterManagedVault(vault)) {
    return null;
  }
  return vault;
}

async function readVaultConvexDeploymentForAppRoot(
  ctx: Pick<MutationCtx, "db">,
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

async function readVaultInfrastructureTarget(
  ctx: Pick<MutationCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<Doc<"vaultInfrastructureTargets"> | null> {
  return await ctx.db
    .query("vaultInfrastructureTargets")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .first();
}

function requireVaultInfrastructureTarget(
  target: Doc<"vaultInfrastructureTargets"> | null,
): Doc<"vaultInfrastructureTargets"> {
  if (!target) {
    throw new Error("Infrastructure target not found for vault.");
  }
  return target;
}

async function assertVaultInfrastructureTargetExists(
  ctx: Pick<MutationCtx, "db">,
  vault: NoterManagedConnectedVault,
): Promise<void> {
  const existing = await readVaultInfrastructureTarget(ctx, vault._id);
  if (existing) {
    return;
  }

  throw new Error("Infrastructure target is required before provisioning can be claimed.");
}

async function readResponseTextSafe(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function parseResponseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

type GitHubRepoRequestMethod = "GET" | "POST" | "PATCH";

async function requestGitHubRepoApi(args: {
  githubAccessToken: string;
  owner: string;
  repo: string;
  path: string;
  method: GitHubRepoRequestMethod;
  recordApiCall?: ProviderApiCallRecorder;
  body?: unknown;
}): Promise<unknown> {
  const recordApiCall = args.recordApiCall;
  if (recordApiCall) {
    const values: Record<string, unknown> = {
      params: {
        path: {
          owner: args.owner,
          repo: args.repo,
        },
      },
    };
    if (args.body !== undefined) {
      values.body = args.body;
    }
    await recordApiCall({
      provider: "GitHub",
      method: args.method,
      endpoint: `/repos/{owner}/{repo}${args.path}`,
      values,
    });
  }
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}${args.path}`;
  const response = await fetch(endpoint, {
    method: args.method,
    headers: {
      Authorization: `Bearer ${args.githubAccessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "Content-Type": "application/json",
    },
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
  });

  if (!response.ok) {
    const responseText = await readResponseTextSafe(response);
    throw new Error(
      `GitHub API request failed (${response.status}) for ${args.owner}/${args.repo}${args.path}: ${responseText}`,
    );
  }

  if (response.status === 204) {
    return null;
  }

  return await parseResponseJsonSafe(response);
}

async function fetchGitHubRepoIdentity(args: {
  githubAccessToken: string;
  owner: string;
  repo: string;
  expectedRepoId: string;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<{ ownerId: string }> {
  const repoRaw = await requestGitHubRepoApi({
    githubAccessToken: args.githubAccessToken,
    owner: args.owner,
    repo: args.repo,
    path: "",
    method: "GET",
    recordApiCall: args.recordApiCall,
  });
  const record = asRecord(repoRaw);
  const repoId = readStringOrNumber(record, "id");
  const ownerRecord = asRecord(record["owner"]);
  const ownerId = readStringOrNumber(ownerRecord, "id");
  if (!repoId) {
    throw new Error("GitHub repository response did not include repo id.");
  }
  if (repoId !== args.expectedRepoId) {
    throw new Error("GitHub repository response did not match the vault repo.");
  }
  if (!ownerId) {
    throw new Error("GitHub repository response did not include owner id.");
  }
  return { ownerId };
}

function parseDeployKeyIdentifier(deployKey: string): string {
  const pipeIdx = deployKey.indexOf("|");
  if (pipeIdx === -1) {
    return deployKey.slice(0, 64);
  }
  return deployKey.slice(0, pipeIdx);
}

type ConvexProvisionResult = {
  convexProjectId: string;
  convexProjectSlug: string;
  convexTeamSlug: string;
  convexDeploymentName: string;
  convexDeploymentType: "prod";
  convexCloudUrl: string;
  convexSiteUrl: string;
};

type ConvexDeployKeyResult = {
  convexDeployKeyId: string;
  deployKey: string;
};

type ExistingConvexResources =
  | { state: "none" }
  | { state: "project_created"; projectId: string }
  | { state: "deployment_created"; projectId: string; deploymentName: string };

function requireConvexCloudDeployment(args: {
  deployment: PlatformDeploymentResponse;
  deploymentType: "prod" | "dev";
  projectId: string;
  description: string;
}): ConvexCloudDeployment {
  if (!isConvexCloudDeployment(args.deployment)) {
    throw new Error(`${args.description} was not cloud.`);
  }
  if (args.deployment.deploymentType !== args.deploymentType) {
    throw new Error(`${args.description} had the wrong deployment type.`);
  }
  if (args.deployment.projectId !== args.projectId) {
    throw new Error(`${args.description} belonged to a different project.`);
  }
  return args.deployment;
}

async function readDefaultConvexCloudDeployment(args: {
  convexToken: string;
  projectId: string;
  deploymentType: "prod" | "dev";
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<ConvexCloudDeployment | null> {
  try {
    const deployment = await requestConvexManagementApi(
      args.convexToken,
      "GET",
      "/projects/{project_id}/deployment",
      {
        params: {
          path: { project_id: args.projectId },
          query: args.deploymentType === "prod" ? { defaultProd: true } : { defaultDev: true },
        },
        recordApiCall: args.recordApiCall,
      },
    );
    return requireConvexCloudDeployment({
      deployment,
      deploymentType: args.deploymentType,
      projectId: args.projectId,
      description:
        args.deploymentType === "prod"
          ? "Default Convex production deployment"
          : "Default Convex dev deployment",
    });
  } catch (error) {
    if (isConvexManagementNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

async function createConvexCloudDeployment(args: {
  convexToken: string;
  projectId: string;
  deploymentType: "prod" | "dev";
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<ConvexCloudDeployment> {
  const deployment = await requestConvexManagementApi(
    args.convexToken,
    "POST",
    "/projects/{project_id}/create_deployment",
    {
      params: { path: { project_id: args.projectId } },
      body: {
        type: args.deploymentType,
      },
      recordApiCall: args.recordApiCall,
    },
  );
  return requireConvexCloudDeployment({
    deployment,
    deploymentType: args.deploymentType,
    projectId: args.projectId,
    description: "Created Convex deployment",
  });
}

async function readConvexProjectDetails(args: {
  convexToken: string;
  projectId: string;
  teamId: string;
  recordApiCall?: ProviderApiCallRecorder;
}) {
  const project = await requestConvexManagementApi(
    args.convexToken,
    "GET",
    "/projects/{project_id}",
    {
      params: { path: { project_id: args.projectId } },
      recordApiCall: args.recordApiCall,
    },
  );
  if (project.teamId !== args.teamId) {
    throw new Error("Convex project belonged to a different team.");
  }
  return project;
}

function selectExistingConvexResources(args: {
  convexDeployment: Doc<"vaultConvexDeployments"> | null;
  target: Doc<"vaultInfrastructureTargets">;
}): ExistingConvexResources {
  if (args.convexDeployment) {
    return {
      state: "deployment_created",
      projectId: args.convexDeployment.projectId,
      deploymentName: args.convexDeployment.deploymentName,
    };
  }

  if (args.target.convex.state === "created") {
    return {
      state: "project_created",
      projectId: args.target.convex.projectId,
    };
  }

  return { state: "none" };
}

async function ensureConvexResources(args: {
  teamId: string;
  convexToken: string;
  projectName: string;
  existing: ExistingConvexResources;
  recordApiCall?: ProviderApiCallRecorder;
  onProjectCreated: (identity: { projectId: string }) => Promise<void>;
}): Promise<ConvexProvisionResult> {
  const projectName = args.projectName;

  let projectId: string;
  if (args.existing.state === "none") {
    const projects = await requestConvexManagementApi(
      args.convexToken,
      "GET",
      "/teams/{team_id}/list_projects",
      {
        params: { path: { team_id: args.teamId } },
        recordApiCall: args.recordApiCall,
      },
    );
    for (const project of projects) {
      if (project.name === projectName || project.slug === projectName) {
        throw new Error(
          `Convex project name ${projectName} already exists. Choose another project name and try again.`,
        );
      }
    }

    const createResponse = await requestConvexManagementApi(
      args.convexToken,
      "POST",
      "/teams/{team_id}/create_project",
      {
        params: { path: { team_id: args.teamId } },
        body: {
          projectName,
          deploymentType: "prod",
        },
        recordApiCall: args.recordApiCall,
      },
    );

    projectId = createResponse.id;

    // Record the provider identity before later deployment lookups can fail so
    // retries can recognize the project that this run already created.
    await args.onProjectCreated({ projectId });
  } else {
    projectId = args.existing.projectId;
  }

  const project = await readConvexProjectDetails({
    convexToken: args.convexToken,
    projectId,
    teamId: args.teamId,
    recordApiCall: args.recordApiCall,
  });

  let productionDeployment: ConvexCloudDeployment | null = null;

  if (args.existing.state === "deployment_created") {
    productionDeployment = requireConvexCloudDeployment({
      deployment: await requestConvexManagementApi(
        args.convexToken,
        "GET",
        "/deployments/{deployment_name}",
        {
          params: {
            path: { deployment_name: args.existing.deploymentName },
          },
          recordApiCall: args.recordApiCall,
        },
      ),
      deploymentType: "prod",
      projectId,
      description: "Recorded Convex production deployment",
    });
  }

  productionDeployment ??= await readDefaultConvexCloudDeployment({
    convexToken: args.convexToken,
    projectId,
    deploymentType: "prod",
    recordApiCall: args.recordApiCall,
  });

  productionDeployment ??= await createConvexCloudDeployment({
    convexToken: args.convexToken,
    projectId,
    deploymentType: "prod",
    recordApiCall: args.recordApiCall,
  });

  if (productionDeployment.isDefault !== true) {
    throw new Error("Convex production deployment was not the default.");
  }

  return {
    convexProjectId: projectId,
    convexProjectSlug: project.slug,
    convexTeamSlug: project.teamSlug,
    convexDeploymentName: productionDeployment.name,
    convexDeploymentType: "prod",
    convexCloudUrl: productionDeployment.deploymentUrl,
    convexSiteUrl: `https://${productionDeployment.name}.convex.site`,
  };
}

type ConvexPreviewProvisionResult = {
  previewDeploymentName: string;
  previewCloudUrl: string;
};

async function ensureConvexPreviewResources(args: {
  convexToken: string;
  teamId: string;
  projectId: string;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<ConvexPreviewProvisionResult> {
  // Preview deployment creation starts from recorded infrastructure, so prove
  // that project still belongs to the currently connected Convex team first.
  await readConvexProjectDetails({
    convexToken: args.convexToken,
    projectId: args.projectId,
    teamId: args.teamId,
    recordApiCall: args.recordApiCall,
  });

  const defaultDevDeployment = await readDefaultConvexCloudDeployment({
    convexToken: args.convexToken,
    projectId: args.projectId,
    deploymentType: "dev",
    recordApiCall: args.recordApiCall,
  });

  const deployment =
    defaultDevDeployment ??
    (await createConvexCloudDeployment({
      convexToken: args.convexToken,
      projectId: args.projectId,
      deploymentType: "dev",
      recordApiCall: args.recordApiCall,
    }));

  return {
    previewDeploymentName: deployment.name,
    previewCloudUrl: deployment.deploymentUrl,
  };
}

async function createConvexDeployKey(args: {
  convexToken: string;
  deploymentName: string;
  name: string;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<ConvexDeployKeyResult> {
  // Create deploy-key secrets inside provider steps so Workflow journals only
  // safe app metadata, never key material.
  const { deployKey } = await requestConvexManagementApi(
    args.convexToken,
    "POST",
    "/deployments/{deployment_name}/create_deploy_key",
    {
      params: { path: { deployment_name: args.deploymentName } },
      body: {
        name: args.name,
      },
      recordApiCall: args.recordApiCall,
    },
  );

  return {
    convexDeployKeyId: parseDeployKeyIdentifier(deployKey),
    deployKey,
  };
}

function toCloudflareBuildConfig(build: VaultCloudflareBuildConfig): CloudflareBuildConfig {
  return {
    rootDir: build.rootDirectory,
    buildCommand: build.buildCommand,
    deployCommand: build.deployCommand,
    previewDeployCommand: build.previewDeployCommand,
    pathIncludes: build.pathIncludes,
    pathExcludes: build.pathExcludes,
  };
}

export function selectCloudflareBuildConfigTreeData(args: {
  branchTreeData: GithubTreeData | null;
}): GithubTreeData {
  if (args.branchTreeData) {
    return args.branchTreeData;
  }
  throw new Error("Default branch tree is not synced yet.");
}

export function selectExistingCloudflareWorker(args: {
  cloudflareTarget: Doc<"vaultInfrastructureTargets">["cloudflare"];
  accountId: string;
}): ExistingCloudflareWorkerIdentity {
  if (
    args.cloudflareTarget.state === "created" &&
    args.cloudflareTarget.accountId === args.accountId
  ) {
    return { state: "created", workerTag: args.cloudflareTarget.workerTag.trim() };
  }
  return { state: "planned" };
}

type ProvisioningEventCtx = Pick<ActionCtx, "runMutation"> & Pick<MutationCtx, "runMutation">;

async function appendProvisioningRunEvent(
  ctx: ProvisioningEventCtx,
  args: {
    runId: Id<"appProvisioningRuns">;
    step: AppProvisioningStep;
    level: "info" | "warn" | "error";
    message: string;
    state: "unchanged" | "queued" | "running" | "succeeded" | "failed" | "canceled";
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
      runId: args.runId,
      step: args.step,
      level: args.level,
      message: args.message,
      state: args.state,
    });
  } catch {
    console.warn("infra:provision:event_append_failed", {
      runId: args.runId,
      step: args.step,
    });
  }
}

async function appendProviderApiCallEvent(
  ctx: ProvisioningEventCtx,
  args: {
    runId: Id<"appProvisioningRuns">;
    step: AppProvisioningStep;
    call: ProviderApiCall;
  },
): Promise<void> {
  await appendProvisioningRunEvent(ctx, {
    runId: args.runId,
    step: args.step,
    level: "info",
    message: formatProviderApiCallLogMessage(args.call),
    state: "running",
  });
}

function createProviderApiCallRecorder(
  ctx: ProvisioningEventCtx,
  args: {
    runId: Id<"appProvisioningRuns">;
    step: AppProvisioningStep;
  },
): ProviderApiCallRecorder {
  return async (call) => {
    await appendProviderApiCallEvent(ctx, {
      runId: args.runId,
      step: args.step,
      call,
    });
  };
}

type VaultInfrastructureOwnership = Doc<"vaultInfrastructureOwnership">;
type ProvisioningOwnershipCtx = Pick<MutationCtx, "db">;

async function getVaultInfrastructureOwnership(
  ctx: ProvisioningOwnershipCtx,
  vaultId: Id<"vaults">,
): Promise<VaultInfrastructureOwnership | null> {
  return await ctx.db
    .query("vaultInfrastructureOwnership")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .first();
}

function isActiveProvisioningOwner(
  ownership: VaultInfrastructureOwnership | null,
  args: {
    runId: Id<"appProvisioningRuns">;
  },
): boolean {
  return ownership?.runId === args.runId && ownership.state === "active";
}

async function cancelSupersededProvisioningRun(
  ctx: ProvisioningEventCtx,
  args: {
    runId: Id<"appProvisioningRuns">;
    step: AppProvisioningStep;
  },
): Promise<void> {
  await appendProvisioningRunEvent(ctx, {
    runId: args.runId,
    step: args.step,
    level: "warn",
    message: "Infrastructure provisioning was superseded by a newer run.",
    state: "canceled",
  });
}

async function ensureActiveProvisioningRun(
  ctx: ActionCtx,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    step: AppProvisioningStep;
  },
): Promise<boolean> {
  const { active } = await ctx.runQuery(internal.infraProvisioning.isActiveProvisioningRun, {
    vaultId: args.vaultId,
    runId: args.runId,
  });
  if (active) {
    return true;
  }

  await cancelSupersededProvisioningRun(ctx, {
    runId: args.runId,
    step: args.step,
  });
  return false;
}

async function getManagedProvisioningVault(
  ctx: ActionCtx,
  vaultId: Id<"vaults">,
): Promise<NoterManagedConnectedVault | null> {
  const vault = await ctx.runQuery(internal.vault.records.getById, {
    id: vaultId,
  });
  if (!isLiveConnectedVault(vault) || !isNoterManagedVault(vault)) {
    return null;
  }
  return vault;
}

type ProviderFailureTarget = "cloudflare" | "convex";

function hasFreshProviderProvisioningLock(args: {
  ownership: VaultInfrastructureOwnership | null;
  now: number;
}): boolean {
  const ownership = args.ownership;
  // Convex can be connected before Cloudflare marks its provider state; the
  // active owner keeps that handoff locked against another non-forced claim.
  if (
    ownership &&
    ownership.state === "active" &&
    args.now - ownership.updatedAt < PROVISIONING_STALE_MS
  ) {
    return true;
  }

  return false;
}

export function resolveConnectionFailureProvider(message: string): ProviderFailureTarget | null {
  const normalizedMessage = message.toLowerCase();
  if (normalizedMessage.includes("cloudflare")) {
    return "cloudflare";
  }
  if (normalizedMessage.includes("convex")) {
    return "convex";
  }
  return null;
}

export async function resolveConvexProvisioningConnection(
  ctx: Pick<ActionCtx, "runQuery">,
  userId: Id<"users">,
): Promise<{ convexToken: string; convexTeamId: string }> {
  const convexConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
    userId,
    kind: "convex",
  });
  const convexToken =
    convexConnection?.kind === "convex" ? convexConnection.auth.credential.trim() : "";
  const convexTeamId = convexConnection?.kind === "convex" ? convexConnection.teamId.trim() : "";

  if (!convexToken || !convexTeamId) {
    throw new Error(
      "Convex connection is required to provision infrastructure. Connect Convex and retry.",
    );
  }

  return { convexToken, convexTeamId };
}

async function resolveGitHubProvisioningConnection(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<{ githubAccessToken: string }> {
  const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
    userId,
    kind: "github",
  });
  if (githubConnection?.kind !== "github") {
    throw new Error("GitHub connection is required to provision infrastructure.");
  }
  return { githubAccessToken: githubConnection.auth.credential };
}

export async function resolveCloudflareProvisioningConnection(
  ctx: ActionCtx,
  userId: Id<"users">,
  options?: { forceRefresh: true },
): Promise<{
  cloudflareToken: string;
  cloudflareAuthMethod: "api_key" | "mcp_oauth";
  cloudflareAccountId: string;
}> {
  const resolveArgs = options ? { userId, forceRefresh: true } : { userId };
  const resolvedCloudflareConnection = await ctx.runAction(
    internal.cloudflareMcpOAuth.resolveConnectionForUser,
    resolveArgs,
  );
  if (!resolvedCloudflareConnection) {
    throw new Error(
      "Cloudflare connection is required to provision infrastructure. Connect Cloudflare and retry.",
    );
  }

  const cloudflareToken = resolvedCloudflareConnection.auth.credential.trim();
  const defaultAccount = resolvedCloudflareConnection.defaultAccount;

  if (!cloudflareToken) {
    throw new Error(
      "Cloudflare connection is required to provision infrastructure. Connect Cloudflare and retry.",
    );
  }

  if (defaultAccount.state !== "selected") {
    throw new Error("Cloudflare account selection is required before provisioning can continue.");
  }
  const cloudflareAccountId = defaultAccount.accountId.trim();
  if (!cloudflareAccountId) {
    throw new Error("Cloudflare account selection is required before provisioning can continue.");
  }

  return {
    cloudflareToken,
    cloudflareAuthMethod: resolvedCloudflareConnection.auth.method,
    cloudflareAccountId,
  };
}

export const getConvexDeploymentByVaultAndAppRoot = internalQuery({
  args: {
    vaultId: v.id("vaults"),
    appRoot: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vaultConvexDeployments")
      .withIndex("by_vault_and_appRoot", (q) =>
        q.eq("vaultId", args.vaultId).eq("appRoot", args.appRoot),
      )
      .first();
  },
});

export const getInfrastructureTargetByVault = internalQuery({
  args: {
    vaultId: v.id("vaults"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vaultInfrastructureTargets")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
  },
});

export const isActiveProvisioningRun = internalQuery({
  args: {
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
  },
  returns: activeProvisioningRunResult,
  handler: async (ctx, args) => {
    const ownership = await ctx.db
      .query("vaultInfrastructureOwnership")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
    return {
      active: ownership?.runId === args.runId && ownership.state === "active",
    };
  },
});

export const recordConvexInfrastructure = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
    appRoot: v.string(),
    convex: convexInfrastructureRecordValidator,
  },
  returns: infrastructurePatchResult,
  handler: async (ctx, args) => {
    const vault = await requireActiveProvisioningVault(ctx, args);
    if (!vault) {
      return { applied: false };
    }

    const existing = await readVaultConvexDeploymentForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot: args.appRoot,
    });
    const now = Date.now();
    const deployKeys = existing?.deployKeys ?? {
      production: { state: "not_created" },
      preview: { state: "not_created" },
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        projectId: args.convex.convexProjectId,
        teamSlug: args.convex.convexTeamSlug,
        projectSlug: args.convex.convexProjectSlug,
        deploymentName: args.convex.convexDeploymentName,
        deploymentType: args.convex.convexDeploymentType,
        cloudUrl: args.convex.convexCloudUrl,
        siteUrl: args.convex.convexSiteUrl,
        deployKeys,
        origin: "provisioned",
        lastObservedAt: now,
      });
      return { applied: true };
    }

    await ctx.db.insert("vaultConvexDeployments", {
      vaultId: args.vaultId,
      userId: vault.userId,
      appRoot: args.appRoot,
      projectId: args.convex.convexProjectId,
      teamSlug: args.convex.convexTeamSlug,
      projectSlug: args.convex.convexProjectSlug,
      deploymentName: args.convex.convexDeploymentName,
      deploymentType: args.convex.convexDeploymentType,
      cloudUrl: args.convex.convexCloudUrl,
      siteUrl: args.convex.convexSiteUrl,
      deployKeys,
      origin: "provisioned",
      connectedAt: now,
      lastObservedAt: now,
    });

    return { applied: true };
  },
});

export const recordConvexProjectIdentity = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
    projectId: v.string(),
  },
  returns: infrastructurePatchResult,
  handler: async (ctx, args) => {
    if (!(await requireActiveProvisioningVault(ctx, args))) {
      return { applied: false };
    }

    const target = await readVaultInfrastructureTarget(ctx, args.vaultId);
    if (!target) {
      throw new Error(
        "Infrastructure target is required before recording Convex project identity.",
      );
    }

    await ctx.db.patch(target._id, {
      convex: {
        state: "created",
        appRoot: target.convex.appRoot,
        projectName: target.convex.projectName,
        projectId: args.projectId,
      },
      updatedAt: Date.now(),
    });

    return { applied: true };
  },
});

export const recordConvexDeployKeyIdentity = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
    deployment: vConvexDeployKeyDeployment,
    convexDeployKeyId: v.string(),
  },
  returns: infrastructurePatchResult,
  handler: async (ctx, args) => {
    if (!(await requireActiveProvisioningVault(ctx, args))) {
      return { applied: false };
    }

    const target = await readVaultInfrastructureTarget(ctx, args.vaultId);
    if (!target) {
      throw new Error(
        "Infrastructure target is required before recording Convex deploy key identity.",
      );
    }

    const existing = await readVaultConvexDeploymentForAppRoot(ctx, {
      vaultId: args.vaultId,
      appRoot: target.convex.appRoot,
    });
    if (!existing) {
      throw new Error("Convex deployment is required before recording deploy key identity.");
    }

    const deployKey: ConvexDeployKeyState = {
      state: "created",
      id: args.convexDeployKeyId,
    };
    const convexDeployKeys =
      args.deployment === "production"
        ? {
            production: deployKey,
            preview: existing.deployKeys.preview,
          }
        : {
            production: existing.deployKeys.production,
            preview: deployKey,
          };

    await ctx.db.patch(existing._id, { deployKeys: convexDeployKeys, lastObservedAt: Date.now() });

    return { applied: true };
  },
});

export const recordCloudflareWorkerIdentity = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
    accountId: v.string(),
    workerName: v.string(),
    workerTag: v.string(),
    workersDevUrl: v.optional(v.string()),
  },
  returns: infrastructurePatchResult,
  handler: async (ctx, args) => {
    if (!(await requireActiveProvisioningVault(ctx, args))) {
      return { applied: false };
    }
    const target = await readVaultInfrastructureTarget(ctx, args.vaultId);
    if (!target) {
      throw new Error("Infrastructure target is required before recording Cloudflare identity.");
    }
    if (target.cloudflare.accountId !== args.accountId) {
      throw new Error("Cloudflare account selection changed before recording Worker identity.");
    }

    await ctx.db.patch(target._id, {
      cloudflare: {
        state: "created",
        appRoot: target.cloudflare.appRoot,
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        workersDevUrl: args.workersDevUrl,
        build: target.cloudflare.build,
      },
      updatedAt: Date.now(),
    });

    return { applied: true };
  },
});

export const markCloudflareProvisioning = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
  },
  returns: infrastructurePatchResult,
  handler: async (ctx, args) => {
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveProvisioningOwner(ownership, { runId: args.runId })) {
      return { applied: false };
    }

    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || !isNoterManagedVault(vault)) {
      return { applied: false };
    }

    return { applied: true };
  },
});

export const markCloudflareConnected = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
    accountId: v.string(),
    workerName: v.string(),
    workerTag: v.string(),
    workersDevUrl: v.optional(v.string()),
    build: v.object({
      rootDirectory: v.string(),
      buildCommand: v.string(),
      deployCommand: v.string(),
      previewDeployCommand: v.string(),
      pathIncludes: v.array(v.string()),
      pathExcludes: v.array(v.string()),
      production: v.object({
        triggerUuid: v.string(),
        buildTokenUuid: v.string(),
      }),
      preview: v.object({
        triggerUuid: v.string(),
        buildTokenUuid: v.string(),
      }),
    }),
  },
  returns: infrastructurePatchResult,
  handler: async (ctx, args) => {
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveProvisioningOwner(ownership, { runId: args.runId })) {
      return { applied: false };
    }

    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || !isNoterManagedVault(vault)) {
      return { applied: false };
    }
    const target = await readVaultInfrastructureTarget(ctx, args.vaultId);
    if (!target) {
      throw new Error("Infrastructure target is required before recording Cloudflare connection.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("vaultCloudflareWorkers")
      .withIndex("by_vault_and_appRoot", (q) =>
        q.eq("vaultId", args.vaultId).eq("appRoot", target.cloudflare.appRoot),
      )
      .first();
    const row = {
      vaultId: args.vaultId,
      userId: vault.userId,
      appRoot: target.cloudflare.appRoot,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      workersDevUrl: args.workersDevUrl,
      origin: "provisioned",
      deployment: {
        state: "workers_builds_connected",
        ...args.build,
      },
      connectedAt: existing?.connectedAt ?? now,
      lastObservedAt: now,
    } as const;
    if (existing) {
      await ctx.db.patch(existing._id, row);
    } else {
      await ctx.db.insert("vaultCloudflareWorkers", row);
    }

    return { applied: true };
  },
});

export const upsertDomainRecord = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    branch: v.string(),
    kind: v.union(v.literal("main"), v.literal("branch_preview")),
    url: v.string(),
    source: v.union(
      v.literal("cloudflare_workers_default"),
      v.literal("cloudflare_workers_custom"),
    ),
    active: v.boolean(),
  },
  returns: infrastructurePatchResult,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || !isNoterManagedVault(vault)) {
      return { applied: false };
    }

    const existing = await ctx.db
      .query("vaultDomains")
      .withIndex("by_vault_and_branch", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        kind: args.kind,
        url: args.url,
        source: args.source,
        active: args.active,
        lastSyncedAt: Date.now(),
      });
      return { applied: true };
    }

    await ctx.db.insert("vaultDomains", {
      vaultId: args.vaultId,
      branch: args.branch,
      kind: args.kind,
      url: args.url,
      source: args.source,
      active: args.active,
      lastSyncedAt: Date.now(),
    });

    return { applied: true };
  },
});

export const claimWorkflowProvisioning = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
    force: v.boolean(),
  },
  returns: v.object({ claimed: v.boolean() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Provisioning run not found.");
    }
    if (run.vaultId !== args.vaultId) {
      throw new Error("Provisioning run does not belong to vault.");
    }

    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || !isNoterManagedVault(vault)) {
      await appendProvisioningRunEvent(ctx, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: "Infrastructure provisioning is no longer available.",
        state: "canceled",
      });
      return { claimed: false };
    }
    if (run.userId !== vault.userId || run.repositoryFullName !== `${vault.owner}/${vault.name}`) {
      throw new Error("Provisioning run does not match vault ownership.");
    }

    const now = Date.now();
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (args.force === false) {
      if (hasFreshProviderProvisioningLock({ ownership, now })) {
        await appendProvisioningRunEvent(ctx, {
          runId: args.runId,
          step: "claim_infra",
          level: "warn",
          message: "Infrastructure provisioning is already running.",
          state: "canceled",
        });
        return { claimed: false };
      }
    }

    await assertVaultInfrastructureTargetExists(ctx, vault);

    const previousVersion = ownership?.provisioningVersion ?? 0;
    const nextVersion = previousVersion + 1;

    if (ownership) {
      if (ownership.state === "active" && ownership.runId !== args.runId) {
        await cancelSupersededProvisioningRun(ctx, {
          runId: ownership.runId,
          step: "claim_infra",
        });
      }
      await ctx.db.patch(ownership._id, {
        runId: args.runId,
        provisioningVersion: nextVersion,
        state: "active",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId: args.vaultId,
        runId: args.runId,
        provisioningVersion: nextVersion,
        state: "active",
        updatedAt: now,
      });
    }

    console.log("infra:provision:start", {
      vaultId: args.vaultId,
      repo: `${vault.owner}/${vault.name}`,
      previousVersion,
      nextVersion,
      force: args.force,
    });

    await appendProvisioningRunEvent(ctx, {
      runId: args.runId,
      step: "claim_infra",
      level: "info",
      message: "Started infrastructure provisioning.",
      state: "running",
    });

    return { claimed: true };
  },
});

export const validateProvisioningConnections = internalAction({
  args: {
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      !(await ensureActiveProvisioningRun(ctx, {
        vaultId: args.vaultId,
        runId: args.runId,
        step: "validate_connections",
      }))
    ) {
      return null;
    }

    const vault = await getManagedProvisioningVault(ctx, args.vaultId);
    if (!vault) {
      throw new Error("Vault not found for infrastructure provisioning.");
    }

    await appendProvisioningRunEvent(ctx, {
      runId: args.runId,
      step: "validate_connections",
      level: "info",
      message: "Checking provider connections.",
      state: "running",
    });

    await Promise.all([
      resolveGitHubProvisioningConnection(ctx, vault.userId),
      resolveConvexProvisioningConnection(ctx, vault.userId),
      resolveCloudflareProvisioningConnection(ctx, vault.userId),
    ]);

    return null;
  },
});

export const ensureConvexInfrastructure = internalAction({
  args: {
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      !(await ensureActiveProvisioningRun(ctx, {
        vaultId: args.vaultId,
        runId: args.runId,
        step: "ensure_convex",
      }))
    ) {
      return null;
    }

    const vault = await getManagedProvisioningVault(ctx, args.vaultId);
    if (!vault) {
      throw new Error("Vault not found for infrastructure provisioning.");
    }

    await appendProvisioningRunEvent(ctx, {
      runId: args.runId,
      step: "ensure_convex",
      level: "info",
      message: "Ensuring Convex project and production deployment.",
      state: "running",
    });

    const target = await ctx.runQuery(internal.infraProvisioning.getInfrastructureTargetByVault, {
      vaultId: args.vaultId,
    });
    const infrastructureTarget = requireVaultInfrastructureTarget(target);
    const existing = await ctx.runQuery(
      internal.infraProvisioning.getConvexDeploymentByVaultAndAppRoot,
      {
        vaultId: args.vaultId,
        appRoot: infrastructureTarget.convex.appRoot,
      },
    );
    const { convexToken, convexTeamId } = await resolveConvexProvisioningConnection(
      ctx,
      vault.userId,
    );
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "ensure_convex",
    });
    const convex = await ensureConvexResources({
      teamId: convexTeamId,
      convexToken,
      projectName: infrastructureTarget.convex.projectName,
      existing: selectExistingConvexResources({
        convexDeployment: existing,
        target: infrastructureTarget,
      }),
      recordApiCall,
      onProjectCreated: async ({ projectId }) => {
        const record = await ctx.runMutation(
          internal.infraProvisioning.recordConvexProjectIdentity,
          {
            vaultId: args.vaultId,
            runId: args.runId,
            projectId,
          },
        );
        if (!record.applied) {
          throw new Error("Could not record Convex project ownership for retry.");
        }
      },
    });
    await ctx.runMutation(internal.providerConnections.setConvexTeamSlug, {
      userId: vault.userId,
      teamId: convexTeamId,
      teamSlug: convex.convexTeamSlug,
    });

    const { applied } = await ctx.runMutation(
      internal.infraProvisioning.recordConvexInfrastructure,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        appRoot: infrastructureTarget.convex.appRoot,
        convex: {
          convexProjectId: convex.convexProjectId,
          convexTeamSlug: convex.convexTeamSlug,
          convexProjectSlug: convex.convexProjectSlug,
          convexDeploymentName: convex.convexDeploymentName,
          convexDeploymentType: convex.convexDeploymentType,
          convexCloudUrl: convex.convexCloudUrl,
          convexSiteUrl: convex.convexSiteUrl,
        },
      },
    );
    if (!applied) {
      await cancelSupersededProvisioningRun(ctx, {
        runId: args.runId,
        step: "ensure_convex",
      });
      return null;
    }

    await appendProvisioningRunEvent(ctx, {
      runId: args.runId,
      step: "ensure_convex",
      level: "info",
      message: `Convex deployment ready: ${convex.convexDeploymentName}.`,
      state: "running",
    });

    return null;
  },
});

export const ensureConvexPreviewInfrastructure = internalAction({
  args: {
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      !(await ensureActiveProvisioningRun(ctx, {
        vaultId: args.vaultId,
        runId: args.runId,
        step: "ensure_convex_preview",
      }))
    ) {
      return null;
    }

    const vault = await getManagedProvisioningVault(ctx, args.vaultId);
    if (!vault) {
      throw new Error("Vault not found for infrastructure provisioning.");
    }

    await appendProvisioningRunEvent(ctx, {
      runId: args.runId,
      step: "ensure_convex_preview",
      level: "info",
      message: "Ensuring Convex preview deployment.",
      state: "running",
    });

    const target = await ctx.runQuery(internal.infraProvisioning.getInfrastructureTargetByVault, {
      vaultId: args.vaultId,
    });
    const infrastructureTarget = requireVaultInfrastructureTarget(target);
    const existing = await ctx.runQuery(
      internal.infraProvisioning.getConvexDeploymentByVaultAndAppRoot,
      {
        vaultId: args.vaultId,
        appRoot: infrastructureTarget.convex.appRoot,
      },
    );
    if (!existing) {
      throw new Error("Convex project is required before preview provisioning can continue.");
    }

    const { convexToken, convexTeamId } = await resolveConvexProvisioningConnection(
      ctx,
      vault.userId,
    );
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "ensure_convex_preview",
    });
    await ensureConvexPreviewResources({
      convexToken,
      teamId: convexTeamId,
      projectId: existing.projectId,
      recordApiCall,
    });

    await appendProvisioningRunEvent(ctx, {
      runId: args.runId,
      step: "ensure_convex_preview",
      level: "info",
      message: "Convex preview deployment ready.",
      state: "running",
    });

    return null;
  },
});

export const ensureCloudflareInfrastructure = internalAction({
  args: {
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      !(await ensureActiveProvisioningRun(ctx, {
        vaultId: args.vaultId,
        runId: args.runId,
        step: "ensure_cloudflare",
      }))
    ) {
      return null;
    }

    const vault = await getManagedProvisioningVault(ctx, args.vaultId);
    if (!vault) {
      throw new Error("Vault not found for infrastructure provisioning.");
    }

    await appendProvisioningRunEvent(ctx, {
      runId: args.runId,
      step: "ensure_cloudflare",
      level: "info",
      message: "Ensuring Cloudflare Worker and deploy settings.",
      state: "running",
    });
    const provisioningMark = await ctx.runMutation(
      internal.infraProvisioning.markCloudflareProvisioning,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
    );
    if (!provisioningMark.applied) {
      await cancelSupersededProvisioningRun(ctx, {
        runId: args.runId,
        step: "ensure_cloudflare",
      });
      return null;
    }

    const defaultBranchTree = await ctx.runQuery(internal.vault.branches.getVaultBranchTree, {
      vaultId: args.vaultId,
      branch: vault.defaultBranch,
    });
    selectCloudflareBuildConfigTreeData({
      branchTreeData: defaultBranchTree?.treeData ?? null,
    });
    const defaultBranch = vault.defaultBranch;
    const { githubAccessToken } = await resolveGitHubProvisioningConnection(ctx, vault.userId);
    const { convexToken, convexTeamId } = await resolveConvexProvisioningConnection(
      ctx,
      vault.userId,
    );
    const { cloudflareToken, cloudflareAuthMethod, cloudflareAccountId } =
      await resolveCloudflareProvisioningConnection(ctx, vault.userId);
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "ensure_cloudflare",
    });
    const target = await ctx.runQuery(internal.infraProvisioning.getInfrastructureTargetByVault, {
      vaultId: args.vaultId,
    });
    const infrastructureTarget = requireVaultInfrastructureTarget(target);
    const cloudflareTarget = infrastructureTarget.cloudflare;
    if (cloudflareTarget.accountId !== cloudflareAccountId) {
      throw new Error("Cloudflare account selection changed before provisioning could complete.");
    }
    const existing = await ctx.runQuery(
      internal.infraProvisioning.getConvexDeploymentByVaultAndAppRoot,
      {
        vaultId: args.vaultId,
        appRoot: cloudflareTarget.appRoot,
      },
    );
    if (!existing) {
      throw new Error(
        "Convex production deployment is required before Cloudflare provisioning can continue.",
      );
    }
    const previewConvex = await ensureConvexPreviewResources({
      convexToken,
      teamId: convexTeamId,
      projectId: existing.projectId,
      recordApiCall,
    });
    const productionDeployKey = await createConvexDeployKey({
      convexToken,
      deploymentName: existing.deploymentName,
      name: `noter-${vaultSuffix(args.vaultId)}`,
      recordApiCall,
    });
    const productionDeployKeyRecord = await ctx.runMutation(
      internal.infraProvisioning.recordConvexDeployKeyIdentity,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        deployment: "production",
        convexDeployKeyId: productionDeployKey.convexDeployKeyId,
      },
    );
    if (!productionDeployKeyRecord.applied) {
      await cancelSupersededProvisioningRun(ctx, {
        runId: args.runId,
        step: "ensure_cloudflare",
      });
      return null;
    }
    const previewDeployKey = await createConvexDeployKey({
      convexToken,
      deploymentName: previewConvex.previewDeploymentName,
      name: `noter-preview-${vaultSuffix(args.vaultId)}`,
      recordApiCall,
    });
    const previewDeployKeyRecord = await ctx.runMutation(
      internal.infraProvisioning.recordConvexDeployKeyIdentity,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        deployment: "preview",
        convexDeployKeyId: previewDeployKey.convexDeployKeyId,
      },
    );
    if (!previewDeployKeyRecord.applied) {
      await cancelSupersededProvisioningRun(ctx, {
        runId: args.runId,
        step: "ensure_cloudflare",
      });
      return null;
    }
    const repoIdentity = await fetchGitHubRepoIdentity({
      githubAccessToken,
      owner: vault.owner,
      repo: vault.name,
      expectedRepoId: vault.ghRepoId,
      recordApiCall,
    });
    const existingCloudflareWorker = selectExistingCloudflareWorker({
      cloudflareTarget,
      accountId: cloudflareAccountId,
    });
    const provisionedCloudflare = await ensureCloudflareResources({
      owner: vault.owner,
      repo: vault.name,
      ghRepoId: vault.ghRepoId,
      ghRepoOwnerId: repoIdentity.ownerId,
      defaultBranch,
      vaultId: args.vaultId,
      workerName: cloudflareTarget.workerName,
      cloudflareToken,
      cloudflareAuthMethod,
      accountId: cloudflareAccountId,
      buildConfig: toCloudflareBuildConfig(cloudflareTarget.build),
      existingWorker: existingCloudflareWorker,
      recordApiCall,
      onWorkerResolved: async (worker) => {
        const record = await ctx.runMutation(
          internal.infraProvisioning.recordCloudflareWorkerIdentity,
          {
            vaultId: args.vaultId,
            runId: args.runId,
            accountId: cloudflareAccountId,
            workerName: worker.workerName,
            workerTag: worker.workerTag,
            workersDevUrl: worker.workersDevUrl,
          },
        );
        if (!record.applied) {
          throw new Error("Could not record Cloudflare Worker ownership for retry.");
        }
      },
      convex: {
        production: {
          cloudUrl: existing.cloudUrl,
          deployKey: productionDeployKey.deployKey,
        },
        preview: {
          cloudUrl: previewConvex.previewCloudUrl,
          deployKey: previewDeployKey.deployKey,
        },
      },
    });
    const connectionMark = await ctx.runMutation(
      internal.infraProvisioning.markCloudflareConnected,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        accountId: provisionedCloudflare.accountId,
        workerName: provisionedCloudflare.workerName,
        workerTag: provisionedCloudflare.workerTag,
        workersDevUrl: provisionedCloudflare.workersDevUrl,
        build: provisionedCloudflare.build,
      },
    );
    if (!connectionMark.applied) {
      await cancelSupersededProvisioningRun(ctx, {
        runId: args.runId,
        step: "ensure_cloudflare",
      });
      return null;
    }

    await appendProvisioningRunEvent(ctx, {
      runId: args.runId,
      step: "ensure_cloudflare",
      level: "info",
      message: `Cloudflare Worker ready: ${provisionedCloudflare.workerName}.`,
      state: "running",
    });

    if (
      !(await ensureActiveProvisioningRun(ctx, {
        vaultId: args.vaultId,
        runId: args.runId,
        step: "record_domains",
      }))
    ) {
      return null;
    }

    const workersDevUrl = provisionedCloudflare.workersDevUrl;
    if (workersDevUrl) {
      const domainRecordResult = await ctx.runMutation(
        internal.infraProvisioning.upsertDomainRecord,
        {
          vaultId: args.vaultId,
          branch: defaultBranch,
          kind: "main",
          url: workersDevUrl,
          source: "cloudflare_workers_default",
          active: true,
        },
      );
      if (!domainRecordResult.applied) {
        await cancelSupersededProvisioningRun(ctx, {
          runId: args.runId,
          step: "record_domains",
        });
        return null;
      }
      await appendProvisioningRunEvent(ctx, {
        runId: args.runId,
        step: "record_domains",
        level: "info",
        message: `Recorded production URL: ${workersDevUrl}.`,
        state: "running",
      });
    } else {
      await appendProvisioningRunEvent(ctx, {
        runId: args.runId,
        step: "record_domains",
        level: "warn",
        message: "Cloudflare Worker ready, but workers.dev URL was not available yet.",
        state: "running",
      });
    }

    console.log("infra:provision:success", {
      vaultId: args.vaultId,
      repo: `${vault.owner}/${vault.name}`,
      convexDeploymentName: existing.deploymentName,
      cloudflareAccountId: provisionedCloudflare.accountId,
      cloudflareWorkerName: provisionedCloudflare.workerName,
      cloudflareWorkerTag: provisionedCloudflare.workerTag,
    });

    return null;
  },
});

export const finishWorkflowProvisioning = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveProvisioningOwner(ownership, { runId: args.runId })) {
      await cancelSupersededProvisioningRun(ctx, {
        runId: args.runId,
        step: "finish",
      });
      return null;
    }

    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || !isNoterManagedVault(vault)) {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(ownership._id, {
      state: "succeeded",
      updatedAt: now,
    });
    await appendProvisioningRunEvent(ctx, {
      runId: args.runId,
      step: "finish",
      level: "info",
      message: "App infrastructure is ready.",
      state: "succeeded",
    });

    return null;
  },
});

export const markWorkflowStartupFailed = internalMutation({
  args: {
    runId: v.id("appProvisioningRuns"),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Provisioning run not found.");
    }
    if (run.state === "succeeded" || run.state === "failed" || run.state === "canceled") {
      return null;
    }

    const now = Date.now();
    const safeRunError = "Provisioning workflow failed to start.";
    const eventStep = resolveWorkflowFailureEventStep(run);
    const vault = await ctx.db.get(run.vaultId);
    if (vault?.state === "provisioning" && vault.runId === args.runId) {
      await ctx.runMutation(internal.vault.records.markGithubProvisioningFailed, {
        runId: args.runId,
      });
    }

    await recordWorkflowRunFailure(ctx, {
      eventStep,
      now,
      run,
      safeRunError,
    });

    console.error("infra:provision:start_failed", {
      vaultId: run.vaultId,
      repo: run.repositoryFullName,
      message: args.message,
    });

    return null;
  },
});

function resolveWorkflowFailureEventStep(
  run: Pick<Doc<"appProvisioningRuns">, "currentStep" | "trigger">,
): AppProvisioningStep {
  if (run.currentStep !== "run_created") {
    return run.currentStep;
  }
  if (run.trigger === "create" || run.trigger === "connect_existing_repository") {
    return "validate_connections";
  }
  return "claim_infra";
}

async function recordWorkflowRunFailure(
  ctx: MutationCtx,
  args: {
    eventStep: AppProvisioningStep;
    now: number;
    run: Doc<"appProvisioningRuns">;
    safeRunError: string;
  },
): Promise<void> {
  await ctx.db.patch(args.run._id, {
    state: "failed",
    lastError: args.safeRunError,
    updatedAt: args.now,
    completedAt: args.now,
  });
  await ctx.runMutation(internal.appProvisioningEvents.append, {
    userId: args.run.userId,
    vaultId: args.run.vaultId,
    repositoryFullName: args.run.repositoryFullName,
    runId: args.run._id,
    step: args.eventStep,
    level: "error",
    message: args.safeRunError,
    createdAt: args.now,
  });
}

const USER_FACING_PROVISIONING_ERROR_MARKERS = [
  "Cloudflare connection is missing Workers Builds write access.",
  "Cloudflare Workers needs a configured workers.dev subdomain",
  "Cloudflare Workers Builds has no build API token",
  "Cloudflare has multiple Workers build tokens",
  "GitHub owner id is required before Cloudflare Workers Builds can connect the repository.",
  "GitHub repository response did not include repo id.",
  "GitHub repository response did not match the vault repo.",
  "GitHub repository response did not include owner id.",
];

function extractUserFacingProvisioningError(message: string): string | null {
  const firstLine = message.trim().split("\n")[0]?.trim();
  if (!firstLine) {
    return null;
  }

  let cleaned = firstLine;
  for (;;) {
    if (cleaned.startsWith("Error: Uncaught Error: ")) {
      cleaned = cleaned.slice("Error: Uncaught Error: ".length);
      continue;
    }
    if (cleaned.startsWith("Uncaught Error: ")) {
      cleaned = cleaned.slice("Uncaught Error: ".length);
      continue;
    }
    if (cleaned.startsWith("Error: ")) {
      cleaned = cleaned.slice("Error: ".length);
      continue;
    }
    break;
  }

  for (const marker of USER_FACING_PROVISIONING_ERROR_MARKERS) {
    if (cleaned.includes(marker)) {
      return cleaned;
    }
  }

  return null;
}

function resolveSafeWorkflowRunError(args: { currentStep: string; message: string }): string {
  if (args.currentStep === "run_created") {
    return "Provisioning failed before the first step.";
  }

  return (
    extractUserFacingProvisioningError(args.message) ??
    `Provisioning failed during ${args.currentStep}.`
  );
}

function isCreateAppPreInfrastructureStep(step: string): boolean {
  return (
    step === "run_created" ||
    step === "initialize_vault" ||
    step === "validate_connections" ||
    step === "create_github_repo" ||
    step === "fetch_github_repo" ||
    step === "connect_github" ||
    step === "create_vault" ||
    step === "seed_starter" ||
    step === "sync_tree"
  );
}

export const markWorkflowProvisioningFailed = internalMutation({
  args: {
    runId: v.id("appProvisioningRuns"),
    workflowId: v.string(),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Provisioning run not found.");
    }
    if (run.state === "succeeded" || run.state === "canceled") {
      return null;
    }
    if (run.workflowId && run.workflowId !== args.workflowId) {
      throw new Error("Workflow failure id does not match run.");
    }

    const now = Date.now();
    const eventStep = resolveWorkflowFailureEventStep(run);
    const vaultId = run.vaultId;
    const vault = await ctx.db.get(vaultId);
    const safeRunError = resolveSafeWorkflowRunError({
      currentStep: run.currentStep,
      message: args.message,
    });
    if (vault?.state === "provisioning" && vault.runId === args.runId) {
      await ctx.runMutation(internal.vault.records.markGithubProvisioningFailed, {
        runId: args.runId,
      });
      await recordWorkflowRunFailure(ctx, {
        eventStep,
        now,
        run,
        safeRunError,
      });
      console.error(
        vault.githubMode === "connect_existing_repository"
          ? "app:connect_existing:failed"
          : "app:provision:failed",
        {
          vaultId,
          repo: run.repositoryFullName,
          step: run.currentStep,
          message: args.message,
        },
      );
      return null;
    }

    if (run.trigger === "connect_convex_deployment") {
      const ownership = await getVaultInfrastructureOwnership(ctx, vaultId);
      const ownsActiveClaim = isActiveProvisioningOwner(ownership, { runId: args.runId });
      if (ownership && ownsActiveClaim) {
        await ctx.db.patch(ownership._id, {
          state: "failed",
          updatedAt: now,
        });
      }
      await recordWorkflowRunFailure(ctx, {
        eventStep,
        now,
        run,
        safeRunError,
      });
      console.error("convex:deployment_connection:failed", {
        vaultId,
        repo: run.repositoryFullName,
        step: run.currentStep,
        message: args.message,
      });
      return null;
    }

    if (run.trigger === "connect_cloudflare_worker") {
      const ownership = await getVaultInfrastructureOwnership(ctx, vaultId);
      if (ownership && isActiveProvisioningOwner(ownership, { runId: args.runId })) {
        await ctx.db.patch(ownership._id, {
          state: "failed",
          updatedAt: now,
        });
      }
      await recordWorkflowRunFailure(ctx, {
        eventStep,
        now,
        run,
        safeRunError,
      });
      console.error("cloudflare:worker_connection:failed", {
        vaultId,
        repo: run.repositoryFullName,
        step: run.currentStep,
        message: args.message,
      });
      return null;
    }

    let sourceSetupFailureLogName: "app:connect_existing:failed" | "app:provision:failed" | null =
      null;
    if (run.trigger === "connect_existing_repository") {
      sourceSetupFailureLogName = "app:connect_existing:failed";
    } else if (run.trigger === "create" && isCreateAppPreInfrastructureStep(run.currentStep)) {
      sourceSetupFailureLogName = "app:provision:failed";
    }
    if (sourceSetupFailureLogName) {
      await recordWorkflowRunFailure(ctx, {
        eventStep,
        now,
        run,
        safeRunError,
      });
      console.error(sourceSetupFailureLogName, {
        vaultId,
        repo: run.repositoryFullName,
        step: run.currentStep,
        message: args.message,
      });
      return null;
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, vaultId);
    const ownsActiveClaim = isActiveProvisioningOwner(ownership, {
      runId: args.runId,
    });
    const failedBeforeClaim = run.currentStep === "run_created";
    if (!ownsActiveClaim && !failedBeforeClaim) {
      await cancelSupersededProvisioningRun(ctx, {
        runId: args.runId,
        step: eventStep,
      });
      return null;
    }

    if (ownsActiveClaim && ownership) {
      await ctx.db.patch(ownership._id, {
        state: "failed",
        updatedAt: now,
      });
    }
    await recordWorkflowRunFailure(ctx, {
      eventStep,
      now,
      run,
      safeRunError,
    });

    console.error("infra:provision:failed", {
      vaultId,
      repo: run.repositoryFullName,
      step: run.currentStep,
      message: args.message,
    });

    return null;
  },
});
