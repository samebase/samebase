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
import { ensureCloudflareResources } from "./cloudflareResources";
import { asRecord, readString, readStringOrNumber } from "./jsonUtils";
import type { AppProvisioningStep, GithubTreeData } from "./schema";
import { sanitizeSlug, vaultSuffix } from "./slugUtils";
import { resolveCloudflareMcpServerUrl } from "./cloudflareMcp";
import {
  isLiveConnectedVault,
  isNoterManagedVault,
  type NoterManagedConnectedVault,
} from "./vault/state";

const PROVISIONING_STALE_MS = 10 * 60 * 1000;
const GITHUB_API_VERSION = "2022-11-28";
const activeProvisioningRunResult = v.object({ active: v.boolean() });
const infrastructurePatchResult = v.object({ applied: v.boolean() });

const convexInfrastructureRecordValidator = v.object({
  convexProjectId: v.string(),
  convexProjectSlug: v.string(),
  convexDeploymentName: v.string(),
  convexDeploymentType: v.union(v.literal("prod"), v.literal("dev")),
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
  if (
    !ownership ||
    !isActiveProvisioningOwner(ownership, { runId: args.runId })
  ) {
    return null;
  }
  const vault = await ctx.db.get(args.vaultId);
  if (!isLiveConnectedVault(vault) || !isNoterManagedVault(vault)) {
    return null;
  }
  return vault;
}

async function readVaultInfrastructure(
  ctx: Pick<MutationCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<Doc<"vaultInfrastructure"> | null> {
  return await ctx.db
    .query("vaultInfrastructure")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
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

async function ensureVaultInfrastructureTarget(
  ctx: Pick<MutationCtx, "db">,
  vault: NoterManagedConnectedVault,
  now: number,
): Promise<void> {
  const existing = await readVaultInfrastructureTarget(ctx, vault._id);
  if (existing) {
    return;
  }

  const suffix = vaultSuffix(vault._id);
  await ctx.db.insert("vaultInfrastructureTargets", {
    vaultId: vault._id,
    convexProjectName: sanitizeSlug(
      `${vault.owner}-${vault.name}-${suffix}`,
      40,
    ),
    cloudflareWorkerName: sanitizeSlug(
      `${vault.owner}-${vault.name}-${suffix}`,
      58,
    ),
    createdAt: now,
    updatedAt: now,
  });
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
  body?: unknown;
}): Promise<unknown> {
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
}): Promise<{ repoId?: string; ownerId?: string }> {
  const repoRaw = await requestGitHubRepoApi({
    githubAccessToken: args.githubAccessToken,
    owner: args.owner,
    repo: args.repo,
    path: "",
    method: "GET",
  });
  const record = asRecord(repoRaw);
  const repoId = readStringOrNumber(record, "id");
  const ownerRecord = asRecord(record["owner"]);
  const ownerId = readStringOrNumber(ownerRecord, "id");
  return { repoId, ownerId };
}

function parseDeployKeyIdentifier(deployKey: string): string {
  const pipeIdx = deployKey.indexOf("|");
  if (pipeIdx === -1) {
    return deployKey.slice(0, 64);
  }
  return deployKey.slice(0, pipeIdx);
}

type CloudflareAccountSummary = {
  id: string;
  name?: string;
  isDefault: boolean;
};

function parseCloudflareAccountInventory(
  raw: string,
): CloudflareAccountSummary[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const accounts: CloudflareAccountSummary[] = [];
  for (const entry of parsed) {
    const record = asRecord(entry);
    const id = readString(record, "id");
    if (!id) {
      continue;
    }
    const isDefaultRaw = record["isDefault"];
    accounts.push({
      id,
      name: readString(record, "name"),
      isDefault: isDefaultRaw === true,
    });
  }
  return accounts;
}

type ConvexProvisionResult = {
  convexProjectId: string;
  convexProjectSlug: string;
  convexTeamSlug: string;
  convexDeploymentName: string;
  convexDeploymentType: "prod" | "dev";
  convexCloudUrl: string;
  convexSiteUrl: string;
};

type ConvexDeployKeyResult = {
  convexDeployKeyId: string;
  deployKey: string;
};

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
}): Promise<ConvexCloudDeployment | null> {
  try {
    const deployment = await requestConvexManagementApi(
      args.convexToken,
      "GET",
      "/projects/{project_id}/deployment",
      {
        params: {
          path: { project_id: args.projectId },
          query:
            args.deploymentType === "prod"
              ? { defaultProd: true }
              : { defaultDev: true },
        },
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
}) {
  const project = await requestConvexManagementApi(
    args.convexToken,
    "GET",
    "/projects/{project_id}",
    { params: { path: { project_id: args.projectId } } },
  );
  if (project.teamId !== args.teamId) {
    throw new Error("Convex project belonged to a different team.");
  }
  return project;
}

async function ensureConvexResources(args: {
  teamId: string;
  convexToken: string;
  projectName: string;
  existing: {
    projectId?: string;
    deploymentName?: string;
  };
  onProjectCreated?: (identity: { projectId: string }) => Promise<void>;
}): Promise<ConvexProvisionResult> {
  const projectName = args.projectName;

  let projectId = args.existing.projectId;

  if (!projectId) {
    const projects = await requestConvexManagementApi(
      args.convexToken,
      "GET",
      "/teams/{team_id}/list_projects",
      { params: { path: { team_id: args.teamId } } },
    );
    for (const project of projects) {
      if (project.name === projectName || project.slug === projectName) {
        throw new Error(
          `Convex project name ${projectName} already exists. Choose another project name and try again.`,
        );
      }
    }
  }

  if (!projectId) {
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
      },
    );

    projectId = createResponse.id;

    // Record the provider identity before later deployment lookups can fail so
    // retries can recognize the project that this run already created.
    await args.onProjectCreated?.({ projectId });
  }

  if (!projectId) {
    throw new Error("Failed to resolve Convex project ID");
  }

  const project = await readConvexProjectDetails({
    convexToken: args.convexToken,
    projectId,
    teamId: args.teamId,
  });

  let productionDeployment: ConvexCloudDeployment | null = null;

  if (args.existing.deploymentName) {
    productionDeployment = requireConvexCloudDeployment({
      deployment: await requestConvexManagementApi(
        args.convexToken,
        "GET",
        "/deployments/{deployment_name}",
        {
          params: {
            path: { deployment_name: args.existing.deploymentName },
          },
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
  });

  productionDeployment ??= await createConvexCloudDeployment({
    convexToken: args.convexToken,
    projectId,
    deploymentType: "prod",
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
  projectId: string;
}): Promise<ConvexPreviewProvisionResult> {
  const defaultDevDeployment = await readDefaultConvexCloudDeployment({
    convexToken: args.convexToken,
    projectId: args.projectId,
    deploymentType: "dev",
  });

  const deployment =
    defaultDevDeployment ??
    (await createConvexCloudDeployment({
      convexToken: args.convexToken,
      projectId: args.projectId,
      deploymentType: "dev",
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
    },
  );

  return {
    convexDeployKeyId: parseDeployKeyIdentifier(deployKey),
    deployKey,
  };
}

function resolveCloudflareBuildConfig(vault: {
  treeData: { tree: Array<{ path: string }> };
}): {
  rootDir: string;
  buildCommand: string;
  deployCommand: string;
  previewDeployCommand: string;
} {
  const hasMonorepoFrontend = vault.treeData.tree.some(
    (entry) => entry.path === "apps/noter/package.json",
  );
  if (hasMonorepoFrontend) {
    return {
      rootDir: "apps/noter",
      buildCommand: "pnpm run build",
      deployCommand: "pnpm exec wrangler deploy",
      previewDeployCommand: "pnpm exec wrangler versions upload",
    };
  }
  return {
    rootDir: "/",
    buildCommand: "pnpm run build",
    deployCommand: "pnpm run deploy",
    previewDeployCommand: "pnpm run deploy:preview",
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

export function selectExistingCloudflareWorkerTag(args: {
  cloudflare: NoterManagedConnectedVault["cloudflare"];
  target: Pick<
    Doc<"vaultInfrastructureTargets">,
    "cloudflareAccountId" | "cloudflareWorkerTag"
  > | null;
  accountId: string;
}): string | undefined {
  if (args.cloudflare.state === "connected") {
    return args.cloudflare.workerTag;
  }
  if (!args.target || args.target.cloudflareAccountId !== args.accountId) {
    return undefined;
  }
  const workerTag = args.target.cloudflareWorkerTag?.trim();
  return workerTag || undefined;
}

type ProvisioningEventCtx = Pick<ActionCtx, "runMutation"> &
  Pick<MutationCtx, "runMutation">;

async function appendProvisioningRunEvent(
  ctx: ProvisioningEventCtx,
  args: {
    runId: Id<"appProvisioningRuns">;
    step: AppProvisioningStep;
    level: "info" | "warn" | "error";
    message: string;
    state:
      | "unchanged"
      | "queued"
      | "running"
      | "succeeded"
      | "failed"
      | "canceled";
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
  const { active } = await ctx.runQuery(
    internal.infraProvisioning.isActiveProvisioningRun,
    {
      vaultId: args.vaultId,
      runId: args.runId,
    },
  );
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

type ProviderStatePatch = Partial<
  Pick<NoterManagedConnectedVault, "cloudflare" | "convex">
>;
type ProviderFailureTarget = "cloudflare" | "convex";

function hasFreshProviderProvisioningLock(args: {
  vault: NoterManagedConnectedVault;
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

  const cloudflare = args.vault.cloudflare;
  return (
    (args.vault.convex.state === "provisioning" &&
      args.now - args.vault.convex.startedAt < PROVISIONING_STALE_MS) ||
    (cloudflare.state === "provisioning" &&
      args.now - cloudflare.startedAt < PROVISIONING_STALE_MS)
  );
}

function buildProviderFailurePatch(args: {
  vault: NoterManagedConnectedVault;
  runId: Id<"appProvisioningRuns">;
  step: AppProvisioningStep | "run_created";
  message?: string;
  now: number;
}): ProviderStatePatch {
  const patch: ProviderStatePatch = {};
  const cloudflare = args.vault.cloudflare;
  const resetConvex = () => {
    if (args.vault.convex.state !== "connected") {
      patch.convex = { state: "not_configured" };
    }
  };
  const resetCloudflare = () => {
    if (cloudflare.state !== "connected") {
      patch.cloudflare = { state: "not_configured" };
    }
  };
  const resetUnconnectedProviders = () => {
    resetConvex();
    resetCloudflare();
  };
  const failConvex = () => {
    if (args.vault.convex.state !== "connected") {
      patch.convex = {
        state: "failed",
        runId: args.runId,
        failedAt: args.now,
      };
    }
  };
  const failCloudflare = () => {
    if (cloudflare.state !== "connected") {
      const failedCloudflare = {
        state: "failed",
        runId: args.runId,
        failedAt: args.now,
      } as const;
      patch.cloudflare = failedCloudflare;
    }
  };

  switch (args.step) {
    case "run_created":
    case "claim_infra":
      resetUnconnectedProviders();
      break;
    case "validate_connections":
      if (args.message) {
        const connectionFailureProvider = resolveConnectionFailureProvider(
          args.message,
        );
        if (connectionFailureProvider === "cloudflare") {
          resetConvex();
          failCloudflare();
          break;
        }
        if (connectionFailureProvider === "convex") {
          failConvex();
          resetCloudflare();
          break;
        }
      }
      resetUnconnectedProviders();
      break;
    case "ensure_convex":
      failConvex();
      if (cloudflare.state !== "connected") {
        const notConfigured = { state: "not_configured" } as const;
        patch.cloudflare = notConfigured;
      }
      break;
    case "ensure_convex_preview":
    case "ensure_cloudflare":
    case "record_domains":
      failCloudflare();
      break;
    case "finish":
      break;
    case "initialize_vault":
    case "create_github_repo":
    case "fetch_github_repo":
    case "connect_github":
    case "create_vault":
    case "seed_starter":
    case "sync_tree":
      break;
  }

  return patch;
}

export function resolveConnectionFailureProvider(
  message: string,
): ProviderFailureTarget | null {
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
  const convexConnection = await ctx.runQuery(
    internal.providerConnections.getByUserAndKind,
    {
      userId,
      kind: "convex",
    },
  );
  const convexToken =
    convexConnection?.kind === "convex"
      ? convexConnection.auth.credential.trim()
      : "";
  const convexTeamId =
    convexConnection?.kind === "convex" ? convexConnection.teamId.trim() : "";

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
  const githubConnection = await ctx.runQuery(
    internal.providerConnections.getByUserAndKind,
    {
      userId,
      kind: "github",
    },
  );
  if (githubConnection?.kind !== "github") {
    throw new Error(
      "GitHub connection is required to provision infrastructure.",
    );
  }
  return { githubAccessToken: githubConnection.auth.credential };
}

export async function resolveCloudflareProvisioningConnection(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<{
  cloudflareToken: string;
  cloudflareServerUrl: string;
  cloudflareAuthMethod: "api_key" | "mcp_oauth";
  cloudflareAccountId: string;
}> {
  const resolvedCloudflareConnection = await ctx.runAction(
    internal.cloudflareMcpOAuth.resolveConnectionForUser,
    {
      userId,
    },
  );
  if (!resolvedCloudflareConnection) {
    throw new Error(
      "Cloudflare connection is required to provision infrastructure. Connect Cloudflare and retry.",
    );
  }

  const cloudflareToken = resolvedCloudflareConnection.auth.credential.trim();
  const cloudflareServerUrl = resolveCloudflareMcpServerUrl(
    resolvedCloudflareConnection,
  );
  let cloudflareAccountId = resolvedCloudflareConnection.accountId?.trim()
    ? resolvedCloudflareConnection.accountId.trim()
    : "";

  if (!cloudflareToken) {
    throw new Error(
      "Cloudflare connection is required to provision infrastructure. Connect Cloudflare and retry.",
    );
  }

  if (!cloudflareAccountId) {
    const accountInventory = await ctx.runAction(
      internal.infraRead.getCloudflareAccountInventory,
      {
        userId,
        limit: 50,
      },
    );
    const accounts = parseCloudflareAccountInventory(accountInventory.raw);
    if (accounts.length === 0) {
      throw new Error(
        "No Cloudflare account is available for provisioning. Reconnect Cloudflare and retry.",
      );
    }
    if (accounts.length > 1) {
      throw new Error(
        "Multiple Cloudflare accounts are available. Select an account before provisioning can continue.",
      );
    }
    cloudflareAccountId = accounts[0].id;
    await ctx.runMutation(internal.providerConnections.upsertCloudflare, {
      userId,
      auth: resolvedCloudflareConnection.auth,
      accountId: cloudflareAccountId,
    });
    console.log("infra:cloudflare:account:auto_selected", {
      accountId: cloudflareAccountId,
      accountCount: accounts.length,
    });
  }

  if (!cloudflareAccountId) {
    throw new Error(
      "Cloudflare account selection is required before provisioning can continue.",
    );
  }

  return {
    cloudflareToken,
    cloudflareServerUrl,
    cloudflareAuthMethod: resolvedCloudflareConnection.auth.method,
    cloudflareAccountId,
  };
}

export const getInfrastructureByVault = internalQuery({
  args: {
    vaultId: v.id("vaults"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vaultInfrastructure")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
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
    convex: convexInfrastructureRecordValidator,
  },
  returns: infrastructurePatchResult,
  handler: async (ctx, args) => {
    const vault = await requireActiveProvisioningVault(ctx, args);
    if (!vault) {
      return { applied: false };
    }

    const existing = await readVaultInfrastructure(ctx, args.vaultId);

    if (existing) {
      await ctx.db.patch(existing._id, args.convex);
      return { applied: true };
    }

    await ctx.db.insert("vaultInfrastructure", {
      vaultId: args.vaultId,
      ...args.convex,
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
    const vault = await requireActiveProvisioningVault(ctx, args);
    if (!vault) {
      return { applied: false };
    }

    const target = await readVaultInfrastructureTarget(ctx, args.vaultId);
    if (!target) {
      return { applied: false };
    }

    await ctx.db.patch(target._id, {
      convexProjectId: args.projectId,
      updatedAt: Date.now(),
    });

    return { applied: true };
  },
});

export const recordConvexDeployKey = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
    convexDeployKeyId: v.string(),
  },
  returns: infrastructurePatchResult,
  handler: async (ctx, args) => {
    const vault = await requireActiveProvisioningVault(ctx, args);
    if (!vault) {
      return { applied: false };
    }

    const existing = await readVaultInfrastructure(ctx, args.vaultId);
    if (!existing) {
      return { applied: false };
    }

    await ctx.db.patch(existing._id, {
      convexDeployKeyId: args.convexDeployKeyId,
    });

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
    productionUrl: v.string(),
  },
  returns: infrastructurePatchResult,
  handler: async (ctx, args) => {
    const vault = await requireActiveProvisioningVault(ctx, args);
    if (!vault) {
      return { applied: false };
    }

    const target = await readVaultInfrastructureTarget(ctx, args.vaultId);
    if (!target) {
      return { applied: false };
    }

    await ctx.db.patch(target._id, {
      cloudflareAccountId: args.accountId,
      cloudflareWorkerName: args.workerName,
      cloudflareWorkerTag: args.workerTag,
      cloudflareProductionUrl: args.productionUrl,
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
    if (
      !ownership ||
      !isActiveProvisioningOwner(ownership, { runId: args.runId })
    ) {
      return { applied: false };
    }

    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || !isNoterManagedVault(vault)) {
      return { applied: false };
    }
    const cloudflare = vault.cloudflare;
    if (cloudflare.state === "connected") {
      return { applied: true };
    }

    const provisioningCloudflare = {
      state: "provisioning",
      runId: args.runId,
      startedAt: Date.now(),
    } as const;
    await ctx.db.patch(args.vaultId, {
      cloudflare: provisioningCloudflare,
    });

    return { applied: true };
  },
});

export const markConvexConnected = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
    projectId: v.string(),
    projectSlug: v.string(),
    deploymentName: v.string(),
  },
  returns: infrastructurePatchResult,
  handler: async (ctx, args) => {
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (
      !ownership ||
      !isActiveProvisioningOwner(ownership, { runId: args.runId })
    ) {
      return { applied: false };
    }

    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || !isNoterManagedVault(vault)) {
      return { applied: false };
    }

    await ctx.db.patch(args.vaultId, {
      convex: {
        state: "connected",
        projectId: args.projectId,
        projectSlug: args.projectSlug,
        deploymentName: args.deploymentName,
        connectedAt: Date.now(),
      },
    });

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
    productionUrl: v.string(),
  },
  returns: infrastructurePatchResult,
  handler: async (ctx, args) => {
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (
      !ownership ||
      !isActiveProvisioningOwner(ownership, { runId: args.runId })
    ) {
      return { applied: false };
    }

    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || !isNoterManagedVault(vault)) {
      return { applied: false };
    }

    const connectedCloudflare = {
      state: "connected",
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      productionUrl: args.productionUrl,
      connectedAt: Date.now(),
    } as const;
    await ctx.db.patch(args.vaultId, {
      cloudflare: connectedCloudflare,
    });

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
    if (
      run.userId !== vault.userId ||
      run.repositoryFullName !== `${vault.owner}/${vault.name}`
    ) {
      throw new Error("Provisioning run does not match vault ownership.");
    }

    const now = Date.now();
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (args.force === false) {
      if (hasFreshProviderProvisioningLock({ vault, ownership, now })) {
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

    await ensureVaultInfrastructureTarget(ctx, vault, now);

    const cloudflare = vault.cloudflare;
    const claimedCloudflare =
      cloudflare.state === "connected"
        ? cloudflare
        : ({ state: "not_configured" } as const);
    await ctx.db.patch(args.vaultId, {
      convex:
        vault.convex.state === "connected"
          ? vault.convex
          : {
              state: "provisioning",
              runId: args.runId,
              startedAt: now,
            },
      cloudflare: claimedCloudflare,
    });

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

    const existing = await ctx.runQuery(
      internal.infraProvisioning.getInfrastructureByVault,
      {
        vaultId: args.vaultId,
      },
    );
    const target = await ctx.runQuery(
      internal.infraProvisioning.getInfrastructureTargetByVault,
      {
        vaultId: args.vaultId,
      },
    );
    const { convexToken, convexTeamId } =
      await resolveConvexProvisioningConnection(ctx, vault.userId);
    const targetConvexProjectName = target?.convexProjectName.trim();
    const targetConvexProjectId = target?.convexProjectId?.trim();
    const convex = await ensureConvexResources({
      teamId: convexTeamId,
      convexToken,
      projectName:
        targetConvexProjectName ||
        sanitizeSlug(
          `${vault.owner}-${vault.name}-${vaultSuffix(args.vaultId)}`,
          40,
        ),
      existing: {
        projectId: existing?.convexProjectId ?? targetConvexProjectId,
        deploymentName: existing?.convexDeploymentName,
      },
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
          throw new Error(
            "Could not record Convex project ownership for retry.",
          );
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
        convex: {
          convexProjectId: convex.convexProjectId,
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
    const convexState = await ctx.runMutation(
      internal.infraProvisioning.markConvexConnected,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        projectId: convex.convexProjectId,
        projectSlug: convex.convexProjectSlug,
        deploymentName: convex.convexDeploymentName,
      },
    );
    if (!convexState.applied) {
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

    const existing = await ctx.runQuery(
      internal.infraProvisioning.getInfrastructureByVault,
      {
        vaultId: args.vaultId,
      },
    );
    if (!existing?.convexProjectId) {
      throw new Error(
        "Convex project is required before preview provisioning can continue.",
      );
    }

    const { convexToken } = await resolveConvexProvisioningConnection(
      ctx,
      vault.userId,
    );
    await ensureConvexPreviewResources({
      convexToken,
      projectId: existing.convexProjectId,
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

    const existing = await ctx.runQuery(
      internal.infraProvisioning.getInfrastructureByVault,
      {
        vaultId: args.vaultId,
      },
    );
    if (
      !existing?.convexProjectId ||
      !existing.convexDeploymentName ||
      !existing.convexCloudUrl
    ) {
      throw new Error(
        "Convex production deployment is required before Cloudflare provisioning can continue.",
      );
    }

    const defaultBranchTree = await ctx.runQuery(
      internal.vault.branches.getVaultBranchTree,
      {
        vaultId: args.vaultId,
        branch: vault.defaultBranch,
      },
    );
    const buildConfigTreeData = selectCloudflareBuildConfigTreeData({
      branchTreeData: defaultBranchTree?.treeData ?? null,
    });
    const defaultBranch = vault.defaultBranch;
    const { githubAccessToken } = await resolveGitHubProvisioningConnection(
      ctx,
      vault.userId,
    );
    const { convexToken } = await resolveConvexProvisioningConnection(
      ctx,
      vault.userId,
    );
    const {
      cloudflareToken,
      cloudflareServerUrl,
      cloudflareAuthMethod,
      cloudflareAccountId,
    } = await resolveCloudflareProvisioningConnection(ctx, vault.userId);
    const target = await ctx.runQuery(
      internal.infraProvisioning.getInfrastructureTargetByVault,
      {
        vaultId: args.vaultId,
      },
    );
    const previewConvex = await ensureConvexPreviewResources({
      convexToken,
      projectId: existing.convexProjectId,
    });
    const productionDeployKey = await createConvexDeployKey({
      convexToken,
      deploymentName: existing.convexDeploymentName,
      name: `noter-${vaultSuffix(args.vaultId)}`,
    });
    const previewDeployKey = await createConvexDeployKey({
      convexToken,
      deploymentName: previewConvex.previewDeploymentName,
      name: `noter-preview-${vaultSuffix(args.vaultId)}`,
    });
    const repoIdentity = await fetchGitHubRepoIdentity({
      githubAccessToken,
      owner: vault.owner,
      repo: vault.name,
    });
    const targetCloudflareWorkerName = target?.cloudflareWorkerName.trim();
    const existingCloudflareWorkerTag = selectExistingCloudflareWorkerTag({
      cloudflare: vault.cloudflare,
      target,
      accountId: cloudflareAccountId,
    });
    const provisionedCloudflare = await ensureCloudflareResources({
      owner: vault.owner,
      repo: vault.name,
      ghRepoId: repoIdentity.repoId ?? vault.ghRepoId,
      ghRepoOwnerId: repoIdentity.ownerId,
      defaultBranch,
      vaultId: args.vaultId,
      workerName:
        targetCloudflareWorkerName ||
        sanitizeSlug(
          `${vault.owner}-${vault.name}-${vaultSuffix(args.vaultId)}`,
          58,
        ),
      cloudflareToken,
      cloudflareServerUrl,
      cloudflareAuthMethod,
      accountId: cloudflareAccountId,
      buildConfig: resolveCloudflareBuildConfig({
        treeData: buildConfigTreeData,
      }),
      existingWorkerTag: existingCloudflareWorkerTag,
      onWorkerResolved: async (worker) => {
        const record = await ctx.runMutation(
          internal.infraProvisioning.recordCloudflareWorkerIdentity,
          {
            vaultId: args.vaultId,
            runId: args.runId,
            accountId: cloudflareAccountId,
            workerName: worker.workerName,
            workerTag: worker.workerTag,
            productionUrl: worker.productionUrl,
          },
        );
        if (!record.applied) {
          throw new Error(
            "Could not record Cloudflare Worker ownership for retry.",
          );
        }
      },
      convex: {
        production: {
          cloudUrl: existing.convexCloudUrl,
          deployKey: productionDeployKey.deployKey,
        },
        preview: {
          cloudUrl: previewConvex.previewCloudUrl,
          deployKey: previewDeployKey.deployKey,
        },
      },
    });
    const { applied } = await ctx.runMutation(
      internal.infraProvisioning.recordConvexDeployKey,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        convexDeployKeyId: productionDeployKey.convexDeployKeyId,
      },
    );
    if (!applied) {
      await cancelSupersededProvisioningRun(ctx, {
        runId: args.runId,
        step: "ensure_cloudflare",
      });
      return null;
    }
    const connectionMark = await ctx.runMutation(
      internal.infraProvisioning.markCloudflareConnected,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        accountId: provisionedCloudflare.accountId,
        workerName: provisionedCloudflare.workerName,
        workerTag: provisionedCloudflare.workerTag,
        productionUrl: provisionedCloudflare.productionUrl,
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

    const domainRecordResult = await ctx.runMutation(
      internal.infraProvisioning.upsertDomainRecord,
      {
        vaultId: args.vaultId,
        branch: defaultBranch,
        kind: "main",
        url: provisionedCloudflare.productionUrl,
        source: "cloudflare_workers_default",
        active: true,
      },
    );
    if (!domainRecordResult.applied) {
      return null;
    }
    await appendProvisioningRunEvent(ctx, {
      runId: args.runId,
      step: "record_domains",
      level: "info",
      message: `Recorded production URL: ${provisionedCloudflare.productionUrl}.`,
      state: "running",
    });

    console.log("infra:provision:success", {
      vaultId: args.vaultId,
      repo: `${vault.owner}/${vault.name}`,
      convexDeploymentName: existing.convexDeploymentName,
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
    if (
      !ownership ||
      !isActiveProvisioningOwner(ownership, { runId: args.runId })
    ) {
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
    if (
      run.state === "succeeded" ||
      run.state === "failed" ||
      run.state === "canceled"
    ) {
      return null;
    }

    const now = Date.now();
    const safeRunError = "Provisioning workflow failed to start.";
    const eventStep = resolveWorkflowFailureEventStep(run);
    const vault = await ctx.db.get(run.vaultId);
    if (vault?.state === "provisioning" && vault.runId === args.runId) {
      await ctx.runMutation(
        internal.vault.records.markGithubProvisioningFailed,
        {
          runId: args.runId,
        },
      );
    } else if (isLiveConnectedVault(vault) && isNoterManagedVault(vault)) {
      const providerPatch = buildProviderFailurePatch({
        vault,
        runId: args.runId,
        step: run.currentStep,
        message: args.message,
        now,
      });
      if (Object.keys(providerPatch).length > 0) {
        await ctx.db.patch(run.vaultId, providerPatch);
      }
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
  if (
    run.trigger === "create" ||
    run.trigger === "connect_existing_repository"
  ) {
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

function resolveSafeWorkflowRunError(args: {
  currentStep: string;
  message: string;
}): string {
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
      await ctx.runMutation(
        internal.vault.records.markGithubProvisioningFailed,
        {
          runId: args.runId,
        },
      );
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

    let sourceSetupFailureLogName:
      | "app:connect_existing:failed"
      | "app:provision:failed"
      | null = null;
    if (run.trigger === "connect_existing_repository") {
      sourceSetupFailureLogName = "app:connect_existing:failed";
    } else if (
      run.trigger === "create" &&
      isCreateAppPreInfrastructureStep(run.currentStep)
    ) {
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
      if (isLiveConnectedVault(vault) && isNoterManagedVault(vault)) {
        const providerPatch = buildProviderFailurePatch({
          vault,
          runId: args.runId,
          step: run.currentStep,
          message: args.message,
          now,
        });
        if (Object.keys(providerPatch).length > 0) {
          await ctx.db.patch(vaultId, providerPatch);
        }
      }
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
