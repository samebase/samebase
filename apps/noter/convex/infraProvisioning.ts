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
  createInfraProviders,
  type ConvexManagementProvider,
} from "./infraProviders";
import {
  ensureHostingResources,
  getProvisionedMainUrl,
} from "./hostingProviders";
import { hostingStateValidator } from "./hostingState";
import { resolveCloudflareHostingState } from "./hostingStateHelpers";
import { asRecord, readString, readStringOrNumber } from "./jsonUtils";
import type { AppProvisioningStep, GithubTreeData } from "./schema";
import { sanitizeSlug, vaultSuffix } from "./slugUtils";
import { resolveCloudflareMcpServerUrl } from "./cloudflareMcp";
import {
  isConnectedVault,
  isNoterManagedVault,
  type NoterManagedConnectedVault,
} from "./vaultState";

const PROVISIONING_STALE_MS = 10 * 60 * 1000;
const GITHUB_API_VERSION = "2022-11-28";
const activeProvisioningRunResult = v.object({ active: v.boolean() });
const infrastructurePatchResult = v.object({ applied: v.boolean() });

const infraPatchValidator = v.object({
  status: v.optional(
    v.union(
      v.literal("not_started"),
      v.literal("provisioning"),
      v.literal("ready"),
      v.literal("failed"),
      v.literal("partial"),
    ),
  ),
  lastError: v.optional(v.string()),
  provisioningVersion: v.optional(v.number()),
  lastProvisionedAt: v.optional(v.number()),

  convexProjectId: v.optional(v.string()),
  convexProjectSlug: v.optional(v.string()),
  convexDeploymentName: v.optional(v.string()),
  convexDeploymentType: v.optional(
    v.union(v.literal("prod"), v.literal("dev")),
  ),
  convexCloudUrl: v.optional(v.string()),
  convexSiteUrl: v.optional(v.string()),
  convexDeployKeyId: v.optional(v.string()),

  hosting: v.optional(hostingStateValidator),
});

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
  convexProjectSlug?: string;
  convexDeploymentName: string;
  convexDeploymentType: "prod" | "dev";
  convexCloudUrl: string;
  convexSiteUrl: string;
};

type ConvexDeployKeyResult = {
  convexDeployKeyId: string;
  deployKey: string;
};

async function ensureConvexResources(args: {
  teamId: string;
  convexProvider: ConvexManagementProvider;
  owner: string;
  repo: string;
  vaultId: string;
  existing: {
    projectId?: string;
    projectSlug?: string;
    deploymentName?: string;
    cloudUrl?: string;
    siteUrl?: string;
  };
}): Promise<ConvexProvisionResult> {
  const suffix = vaultSuffix(args.vaultId);
  const projectName = sanitizeSlug(`${args.owner}-${args.repo}-${suffix}`, 40);

  let projectId = args.existing.projectId;
  let projectSlug = args.existing.projectSlug;

  const projectsRaw = await args.convexProvider.request(
    `/teams/${encodeURIComponent(args.teamId)}/list_projects`,
    "GET",
  );
  const projects = Array.isArray(projectsRaw) ? projectsRaw : [];

  if (!projectId) {
    for (const project of projects) {
      const projectRecord = asRecord(project);
      const name = readString(projectRecord, "name");
      if (name === projectName) {
        projectId = readStringOrNumber(projectRecord, "id");
        projectSlug = readString(projectRecord, "slug");
        break;
      }
    }
  }

  let deploymentName = args.existing.deploymentName;
  let deploymentUrl = args.existing.cloudUrl;

  if (!projectId) {
    const createResponseRaw = await args.convexProvider.request(
      `/teams/${encodeURIComponent(args.teamId)}/create_project`,
      "POST",
      {
        projectName,
        deploymentType: "prod",
      },
    );

    const createResponse = asRecord(createResponseRaw);
    projectId = readStringOrNumber(createResponse, "projectId");
    deploymentName = readString(createResponse, "deploymentName");
    deploymentUrl = readString(createResponse, "deploymentUrl");

    const refreshedProjectsRaw = await args.convexProvider.request(
      `/teams/${encodeURIComponent(args.teamId)}/list_projects`,
      "GET",
    );
    const refreshedProjects = Array.isArray(refreshedProjectsRaw)
      ? refreshedProjectsRaw
      : [];
    for (const project of refreshedProjects) {
      const projectRecord = asRecord(project);
      if (readStringOrNumber(projectRecord, "id") === projectId) {
        projectSlug = readString(projectRecord, "slug");
        break;
      }
    }
  }

  if (!projectId) {
    throw new Error("Failed to resolve Convex project ID");
  }

  if (!deploymentName) {
    const deploymentsRaw = await args.convexProvider.request(
      `/projects/${encodeURIComponent(projectId)}/list_deployments`,
      "GET",
    );
    const deployments = Array.isArray(deploymentsRaw) ? deploymentsRaw : [];

    for (const deployment of deployments) {
      const deploymentRecord = asRecord(deployment);
      const deploymentType = readString(deploymentRecord, "deploymentType");
      const deploymentKind = readString(deploymentRecord, "kind");
      if (deploymentType === "prod" && deploymentKind === "cloud") {
        deploymentName = readString(deploymentRecord, "name");
        break;
      }
    }
  }

  if (!deploymentName) {
    const createdDeploymentRaw = await args.convexProvider.request(
      `/projects/${encodeURIComponent(projectId)}/create_deployment`,
      "POST",
      {
        type: "prod",
      },
    );

    const createdDeployment = asRecord(createdDeploymentRaw);
    deploymentName = readString(createdDeployment, "name");
  }

  if (!deploymentName) {
    throw new Error("Failed to resolve Convex deployment name");
  }

  if (!deploymentUrl) {
    deploymentUrl = args.existing.cloudUrl;
  }
  if (!deploymentUrl) {
    deploymentUrl = `https://${deploymentName}.convex.cloud`;
  }

  const siteUrl =
    args.existing.siteUrl ?? `https://${deploymentName}.convex.site`;

  return {
    convexProjectId: projectId,
    convexProjectSlug: projectSlug,
    convexDeploymentName: deploymentName,
    convexDeploymentType: "prod",
    convexCloudUrl: deploymentUrl,
    convexSiteUrl: siteUrl,
  };
}

type ConvexPreviewProvisionResult = {
  previewDeploymentName: string;
  previewCloudUrl: string;
};

async function ensureConvexPreviewResources(args: {
  convexProvider: ConvexManagementProvider;
  projectId: string;
  vaultId: string;
}): Promise<ConvexPreviewProvisionResult> {
  const deploymentsRaw = await args.convexProvider.request(
    `/projects/${encodeURIComponent(args.projectId)}/list_deployments`,
    "GET",
  );
  const deployments = Array.isArray(deploymentsRaw) ? deploymentsRaw : [];

  let deploymentName: string | undefined;
  let deploymentUrl: string | undefined;

  for (const deployment of deployments) {
    const deploymentRecord = asRecord(deployment);
    const deploymentType = readString(deploymentRecord, "deploymentType");
    const kind = readString(deploymentRecord, "kind");
    if (deploymentType === "dev" && kind === "cloud") {
      deploymentName = readString(deploymentRecord, "name");
      deploymentUrl =
        readString(deploymentRecord, "deploymentUrl") ??
        readString(deploymentRecord, "url");
      break;
    }
  }

  if (!deploymentName) {
    const createdRaw = await args.convexProvider.request(
      `/projects/${encodeURIComponent(args.projectId)}/create_deployment`,
      "POST",
      {
        type: "dev",
      },
    );
    const created = asRecord(createdRaw);
    deploymentName = readString(created, "name");
    deploymentUrl =
      readString(created, "deploymentUrl") ?? readString(created, "url");
  }

  if (!deploymentName) {
    throw new Error("Failed to resolve Convex preview deployment name.");
  }

  if (!deploymentUrl) {
    deploymentUrl = `https://${deploymentName}.convex.cloud`;
  }

  return {
    previewDeploymentName: deploymentName,
    previewCloudUrl: deploymentUrl,
  };
}

async function createConvexDeployKey(args: {
  convexProvider: ConvexManagementProvider;
  deploymentName: string;
  name: string;
}): Promise<ConvexDeployKeyResult> {
  // Create deploy-key secrets inside provider steps so Workflow journals only
  // safe app metadata, never key material.
  const deployKeyRaw = await args.convexProvider.request(
    `/deployments/${encodeURIComponent(args.deploymentName)}/create_deploy_key`,
    "POST",
    {
      name: args.name,
    },
  );
  const deployKeyRecord = asRecord(deployKeyRaw);
  const deployKey = readString(deployKeyRecord, "deployKey");
  if (!deployKey) {
    throw new Error("Failed to create Convex deploy key.");
  }

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
  destinationDir: string;
} {
  const hasMonorepoFrontend = vault.treeData.tree.some(
    (entry) => entry.path === "apps/noter/package.json",
  );
  if (hasMonorepoFrontend) {
    return {
      rootDir: "apps/noter",
      buildCommand: "npx convex deploy --cmd 'pnpm run build'",
      destinationDir: "dist",
    };
  }
  return {
    rootDir: "/",
    buildCommand: "pnpm run build:cloudflare",
    destinationDir: "dist",
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
  const vault = await ctx.runQuery(internal.vault.getById, {
    id: vaultId,
  });
  if (!isConnectedVault(vault) || !isNoterManagedVault(vault)) {
    return null;
  }
  return vault;
}

async function resolveConvexProvisioningConnection(
  ctx: ActionCtx,
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

async function resolveCloudflareProvisioningConnection(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<{
  cloudflareToken: string;
  cloudflareServerUrl: string;
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

  return { cloudflareToken, cloudflareServerUrl, cloudflareAccountId };
}

export function resolveInfraStateAfterWorkflowFailure(args: {
  convexProjectId?: string;
  hosting: unknown;
}): "failed" | "partial" {
  return args.convexProjectId || args.hosting ? "partial" : "failed";
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

export const upsertInfrastructureRecord = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
    patch: infraPatchValidator,
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

    const existing = await ctx.db
      .query("vaultInfrastructure")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args.patch);
      return { applied: true };
    }

    await ctx.db.insert("vaultInfrastructure", {
      vaultId: args.vaultId,
      status: args.patch.status ?? "not_started",
      provisioningVersion: args.patch.provisioningVersion ?? 0,
      lastError: args.patch.lastError,
      lastProvisionedAt: args.patch.lastProvisionedAt,

      convexProjectId: args.patch.convexProjectId,
      convexProjectSlug: args.patch.convexProjectSlug,
      convexDeploymentName: args.patch.convexDeploymentName,
      convexDeploymentType: args.patch.convexDeploymentType,
      convexCloudUrl: args.patch.convexCloudUrl,
      convexSiteUrl: args.patch.convexSiteUrl,
      convexDeployKeyId: args.patch.convexDeployKeyId,

      hosting: args.patch.hosting,
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
      v.literal("cloudflare_pages_default"),
      v.literal("cloudflare_pages_custom"),
    ),
    active: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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
      return null;
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

    return null;
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
    if (!isConnectedVault(vault) || !isNoterManagedVault(vault)) {
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
    if (args.force === false) {
      if (
        vault.infraState === "provisioning" &&
        vault.infraProvisioningStartedAt &&
        now - vault.infraProvisioningStartedAt < PROVISIONING_STALE_MS
      ) {
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

    await ctx.db.patch(args.vaultId, {
      infraState: "provisioning",
      infraLastError: undefined,
      infraProvisioningStartedAt: now,
    });

    const existing = await ctx.db
      .query("vaultInfrastructure")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
    const nextVersion = (existing?.provisioningVersion ?? 0) + 1;

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "provisioning",
        provisioningVersion: nextVersion,
        lastError: undefined,
      });
    } else {
      await ctx.db.insert("vaultInfrastructure", {
        vaultId: args.vaultId,
        status: "provisioning",
        provisioningVersion: nextVersion,
      });
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (ownership?.state === "active" && ownership.runId !== args.runId) {
      await cancelSupersededProvisioningRun(ctx, {
        runId: ownership.runId,
        step: "claim_infra",
      });
    }
    if (ownership) {
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
      previousVersion: existing?.provisioningVersion ?? 0,
      nextVersion,
      force: args.force,
      hostingProvider: "cloudflare",
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
    const { convexToken, convexTeamId } =
      await resolveConvexProvisioningConnection(ctx, vault.userId);
    const providers = createInfraProviders({
      convexToken,
    });
    const convex = await ensureConvexResources({
      teamId: convexTeamId,
      convexProvider: providers.convex,
      owner: vault.owner,
      repo: vault.name,
      vaultId: args.vaultId,
      existing: {
        projectId: existing?.convexProjectId,
        projectSlug: existing?.convexProjectSlug,
        deploymentName: existing?.convexDeploymentName,
        cloudUrl: existing?.convexCloudUrl,
        siteUrl: existing?.convexSiteUrl,
      },
    });

    const { applied } = await ctx.runMutation(
      internal.infraProvisioning.upsertInfrastructureRecord,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        patch: {
          status: "provisioning",
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
    const providers = createInfraProviders({
      convexToken,
    });
    await ensureConvexPreviewResources({
      convexProvider: providers.convex,
      projectId: existing.convexProjectId,
      vaultId: args.vaultId,
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
      message: "Ensuring Cloudflare Pages project and deploy settings.",
      state: "running",
    });

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
      internal.vault.getVaultBranchTree,
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
    const { cloudflareToken, cloudflareServerUrl, cloudflareAccountId } =
      await resolveCloudflareProvisioningConnection(ctx, vault.userId);
    const providers = createInfraProviders({
      convexToken,
    });
    const previewConvex = await ensureConvexPreviewResources({
      convexProvider: providers.convex,
      projectId: existing.convexProjectId,
      vaultId: args.vaultId,
    });
    const productionDeployKey = await createConvexDeployKey({
      convexProvider: providers.convex,
      deploymentName: existing.convexDeploymentName,
      name: `noter-${vaultSuffix(args.vaultId)}`,
    });
    const previewDeployKey = await createConvexDeployKey({
      convexProvider: providers.convex,
      deploymentName: previewConvex.previewDeploymentName,
      name: `noter-preview-${vaultSuffix(args.vaultId)}`,
    });
    const repoIdentity = await fetchGitHubRepoIdentity({
      githubAccessToken,
      owner: vault.owner,
      repo: vault.name,
    });
    const cloudflareExisting = resolveCloudflareHostingState(existing);
    const provisionedHosting = await ensureHostingResources({
      provider: "cloudflare",
      owner: vault.owner,
      repo: vault.name,
      ghRepoId: repoIdentity.repoId ?? vault.ghRepoId,
      ghRepoOwnerId: repoIdentity.ownerId,
      defaultBranch,
      vaultId: args.vaultId,
      cloudflareToken,
      cloudflareServerUrl,
      accountId: cloudflareAccountId,
      buildConfig: resolveCloudflareBuildConfig({
        treeData: buildConfigTreeData,
      }),
      existing: {
        accountId: cloudflareExisting?.accountId,
        projectName: cloudflareExisting?.projectName,
        subdomain: cloudflareExisting?.subdomain,
        productionUrl: cloudflareExisting?.productionUrl,
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
      internal.infraProvisioning.upsertInfrastructureRecord,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        patch: {
          status: "ready",
          lastProvisionedAt: Date.now(),
          hosting: provisionedHosting,
          lastError: undefined,
          convexDeployKeyId: productionDeployKey.convexDeployKeyId,
        },
      },
    );
    if (!applied) {
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
      message: `Cloudflare Pages project ready: ${provisionedHosting.projectName}.`,
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

    const mainUrl = getProvisionedMainUrl(provisionedHosting);
    if (mainUrl) {
      await ctx.runMutation(internal.infraProvisioning.upsertDomainRecord, {
        vaultId: args.vaultId,
        branch: defaultBranch,
        kind: "main",
        url: mainUrl,
        source: "cloudflare_pages_default",
        active: true,
      });
      await appendProvisioningRunEvent(ctx, {
        runId: args.runId,
        step: "record_domains",
        level: "info",
        message: `Recorded production URL: ${mainUrl}.`,
        state: "running",
      });
    }

    console.log("infra:provision:success", {
      vaultId: args.vaultId,
      repo: `${vault.owner}/${vault.name}`,
      convexDeploymentName: existing.convexDeploymentName,
      cloudflareAccountId: provisionedHosting.accountId,
      cloudflareProjectName: provisionedHosting.projectName,
      cloudflareSubdomain: provisionedHosting.subdomain,
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
    if (!isConnectedVault(vault) || !isNoterManagedVault(vault)) {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(args.vaultId, {
      infraState: "ready",
      infraLastError: undefined,
      infraLastProvisionedAt: now,
      infraProvisioningStartedAt: undefined,
    });
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
    const eventStep =
      run.currentStep === "run_created" && run.trigger === "create"
        ? "validate_connections"
        : run.currentStep === "run_created"
          ? "claim_infra"
          : run.currentStep;
    const vault = await ctx.db.get(run.vaultId);
    if (
      vault?.state === "provisioning" &&
      vault.githubMode === "create_repository" &&
      vault.runId === args.runId
    ) {
      await ctx.runMutation(
        internal.vault.markNoterManagedGithubProvisioningFailed,
        {
          runId: args.runId,
        },
      );
    } else if (
      isConnectedVault(vault) &&
      isNoterManagedVault(vault) &&
      vault.infraState !== "ready"
    ) {
      await ctx.db.patch(run.vaultId, {
        infraState: "failed",
        infraLastError: args.message,
        infraLastProvisionedAt: now,
        infraProvisioningStartedAt: undefined,
      });
    }

    await ctx.db.patch(args.runId, {
      state: "failed",
      lastError: safeRunError,
      updatedAt: now,
      completedAt: now,
    });
    await ctx.runMutation(internal.appProvisioningEvents.append, {
      userId: run.userId,
      vaultId: run.vaultId,
      repositoryFullName: run.repositoryFullName,
      runId: args.runId,
      step: eventStep,
      level: "error",
      message: safeRunError,
      createdAt: now,
    });

    console.error("infra:provision:start_failed", {
      vaultId: run.vaultId,
      repo: run.repositoryFullName,
      message: args.message,
    });

    return null;
  },
});

function isCreateAppPreInfrastructureStep(step: string): boolean {
  return (
    step === "run_created" ||
    step === "validate_connections" ||
    step === "create_github_repo" ||
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
    const eventStep =
      run.currentStep === "run_created" && run.trigger === "create"
        ? "validate_connections"
        : run.currentStep === "run_created"
          ? "claim_infra"
          : run.currentStep;
    const vaultId = run.vaultId;
    const vault = await ctx.db.get(vaultId);
    const safeRunError =
      run.currentStep === "run_created"
        ? "Provisioning failed before the first step."
        : `Provisioning failed during ${run.currentStep}.`;
    if (
      vault?.state === "provisioning" &&
      vault.githubMode === "create_repository" &&
      vault.runId === args.runId
    ) {
      await ctx.runMutation(
        internal.vault.markNoterManagedGithubProvisioningFailed,
        {
          runId: args.runId,
        },
      );
      await ctx.db.patch(args.runId, {
        state: "failed",
        lastError: safeRunError,
        updatedAt: now,
        completedAt: now,
      });
      await ctx.runMutation(internal.appProvisioningEvents.append, {
        userId: run.userId,
        vaultId,
        repositoryFullName: run.repositoryFullName,
        runId: args.runId,
        step: eventStep,
        level: "error",
        message: safeRunError,
        createdAt: now,
      });
      console.error("app:provision:failed", {
        vaultId,
        repo: run.repositoryFullName,
        step: run.currentStep,
        message: args.message,
      });
      return null;
    }
    if (
      run.trigger === "create" &&
      isCreateAppPreInfrastructureStep(run.currentStep)
    ) {
      await ctx.db.patch(args.runId, {
        state: "failed",
        lastError: safeRunError,
        updatedAt: now,
        completedAt: now,
      });
      await ctx.runMutation(internal.appProvisioningEvents.append, {
        userId: run.userId,
        vaultId,
        repositoryFullName: run.repositoryFullName,
        runId: args.runId,
        step: eventStep,
        level: "error",
        message: safeRunError,
        createdAt: now,
      });
      console.error("app:provision:failed", {
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

    const infrastructure = await ctx.db
      .query("vaultInfrastructure")
      .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
      .first();
    const infraState = resolveInfraStateAfterWorkflowFailure({
      convexProjectId: infrastructure?.convexProjectId,
      hosting: infrastructure?.hosting,
    });
    if (ownsActiveClaim && ownership) {
      if (infrastructure) {
        await ctx.db.patch(infrastructure._id, {
          status: infraState,
          lastError: args.message,
          lastProvisionedAt: now,
        });
      } else {
        await ctx.db.insert("vaultInfrastructure", {
          vaultId,
          status: infraState,
          lastError: args.message,
          lastProvisionedAt: now,
          provisioningVersion: ownership.provisioningVersion,
        });
      }

      await ctx.db.patch(vaultId, {
        infraState,
        infraLastError: args.message,
        infraLastProvisionedAt: now,
        infraProvisioningStartedAt: undefined,
      });
      await ctx.db.patch(ownership._id, {
        state: "failed",
        updatedAt: now,
      });
    }
    await ctx.db.patch(args.runId, {
      state: "failed",
      lastError: safeRunError,
      updatedAt: now,
      completedAt: now,
    });
    await ctx.runMutation(internal.appProvisioningEvents.append, {
      userId: run.userId,
      vaultId,
      repositoryFullName: run.repositoryFullName,
      runId: args.runId,
      step: eventStep,
      level: "error",
      message: safeRunError,
      createdAt: now,
    });

    console.error("infra:provision:failed", {
      vaultId,
      repo: run.repositoryFullName,
      infraState,
      step: run.currentStep,
      message: args.message,
    });

    return null;
  },
});
