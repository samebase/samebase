import { Infer, v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  createInfraProviders,
  getRequiredEnv,
  type ConvexManagementProvider,
  type NetlifyManagementProvider,
  type CloudflareManagementProvider,
} from "./infraProviders";

const PROVISIONING_STALE_MS = 10 * 60 * 1000;
const GITHUB_API_VERSION = "2022-11-28";

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
  convexDeploymentType: v.optional(v.union(v.literal("prod"), v.literal("dev"))),
  convexCloudUrl: v.optional(v.string()),
  convexSiteUrl: v.optional(v.string()),
  convexDeployKeyId: v.optional(v.string()),

  netlifySiteId: v.optional(v.string()),
  netlifySiteName: v.optional(v.string()),
  netlifyTeamId: v.optional(v.string()),
  netlifyDefaultUrl: v.optional(v.string()),
  netlifyProductionUrl: v.optional(v.string()),
  netlifyBuildHookId: v.optional(v.string()),

  cloudflarePagesProjectId: v.optional(v.string()),
  cloudflarePagesProjectName: v.optional(v.string()),
  cloudflarePagesAccountId: v.optional(v.string()),
  cloudflarePagesAccountName: v.optional(v.string()),
  cloudflarePagesSubdomain: v.optional(v.string()),
  cloudflarePagesDefaultUrl: v.optional(v.string()),
  cloudflarePagesProductionUrl: v.optional(v.string()),
});

type InfraPatch = Infer<typeof infraPatchValidator>;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function readString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readStringOrNumber(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return undefined;
}

function readArray(record: JsonRecord, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
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

async function ensureGitHubPushWebhook(args: {
  githubAccessToken: string;
  owner: string;
  repo: string;
  webhookUrl: string;
}): Promise<void> {
  const configPayload = {
    url: args.webhookUrl,
    content_type: "json",
    insecure_ssl: "0",
  };

  const hooks: unknown[] = [];
  const pageSize = 100;
  for (let page = 1; ; page += 1) {
    const hooksPageRaw = await requestGitHubRepoApi({
      githubAccessToken: args.githubAccessToken,
      owner: args.owner,
      repo: args.repo,
      path: `/hooks?per_page=${pageSize}&page=${page}`,
      method: "GET",
    });
    const hooksPage = Array.isArray(hooksPageRaw) ? hooksPageRaw : [];
    hooks.push(...hooksPage);
    if (hooksPage.length < pageSize) {
      break;
    }
  }

  let hookId: string | undefined;
  for (const hook of hooks) {
    const hookRecord = asRecord(hook);
    const hookName = readString(hookRecord, "name");
    const hookConfig = asRecord(hookRecord["config"]);
    const currentHookUrl = readString(hookConfig, "url");
    if (hookName !== "web" || currentHookUrl !== args.webhookUrl) {
      continue;
    }

    hookId = readStringOrNumber(hookRecord, "id");
    if (hookId) {
      break;
    }
  }

  if (!hookId) {
    await requestGitHubRepoApi({
      githubAccessToken: args.githubAccessToken,
      owner: args.owner,
      repo: args.repo,
      path: "/hooks",
      method: "POST",
      body: {
        name: "web",
        active: true,
        events: ["push"],
        config: configPayload,
      },
    });
    return;
  }

  await requestGitHubRepoApi({
    githubAccessToken: args.githubAccessToken,
    owner: args.owner,
    repo: args.repo,
    path: `/hooks/${encodeURIComponent(hookId)}`,
    method: "PATCH",
    body: {
      active: true,
      events: ["push"],
      config: configPayload,
    },
  });
}

async function addGitHubDeployKey(args: {
  githubAccessToken: string;
  owner: string;
  repo: string;
  title: string;
  publicKey: string;
}): Promise<void> {
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/keys`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.githubAccessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: args.title,
      key: args.publicKey,
      read_only: true,
    }),
  });

  if (response.ok) {
    return;
  }

  const responseText = await readResponseTextSafe(response);
  const lowered = responseText.toLowerCase();
  if (
    response.status === 422 &&
    (lowered.includes("key is already in use") || lowered.includes("already exists"))
  ) {
    return;
  }

  throw new Error(
    `GitHub deploy key creation failed (${response.status}) for ${args.owner}/${args.repo}: ${responseText}`,
  );
}

async function createNetlifyDeployKey(args: {
  netlifyProvider: NetlifyManagementProvider;
}): Promise<{ deployKeyId: string; publicKey: string }> {
  const deployKeyRaw = await args.netlifyProvider.request(
    "/deploy_keys",
    "POST",
  );
  const deployKey = asRecord(deployKeyRaw);
  const deployKeyId = readStringOrNumber(deployKey, "id");
  const publicKey = readString(deployKey, "public_key");

  if (!deployKeyId || !publicKey) {
    throw new Error("Failed to create Netlify deploy key");
  }

  return {
    deployKeyId,
    publicKey,
  };
}

function sanitizeSlug(input: string, maxLen = 58): string {
  const sanitized = input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (sanitized.length === 0) {
    return "vault";
  }
  return sanitized.slice(0, maxLen);
}

function vaultSuffix(vaultId: string): string {
  const alnumOnly = vaultId.replace(/[^a-zA-Z0-9]/g, "");
  return alnumOnly.slice(-6).toLowerCase() || "vault";
}

function parseDeployKeyIdentifier(deployKey: string): string {
  const pipeIdx = deployKey.indexOf("|");
  if (pipeIdx === -1) {
    return deployKey.slice(0, 64);
  }
  return deployKey.slice(0, pipeIdx);
}

function ensureHttpsUrl(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `https://${url}`;
}

type ConvexProvisionResult = {
  convexProjectId: string;
  convexProjectSlug?: string;
  convexDeploymentName: string;
  convexDeploymentType: "prod" | "dev";
  convexCloudUrl: string;
  convexSiteUrl: string;
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

  const siteUrl = args.existing.siteUrl ?? `https://${deploymentName}.convex.site`;

  const deployKeyRaw = await args.convexProvider.request(
    `/deployments/${encodeURIComponent(deploymentName)}/create_deploy_key`,
    "POST",
    {
      name: `noter-${suffix}`,
    },
  );
  const deployKeyRecord = asRecord(deployKeyRaw);
  const deployKey = readString(deployKeyRecord, "deployKey");
  if (!deployKey) {
    throw new Error("Failed to create Convex deploy key");
  }

  return {
    convexProjectId: projectId,
    convexProjectSlug: projectSlug,
    convexDeploymentName: deploymentName,
    convexDeploymentType: "prod",
    convexCloudUrl: deploymentUrl,
    convexSiteUrl: siteUrl,
    convexDeployKeyId: parseDeployKeyIdentifier(deployKey),
    deployKey,
  };
}

type NetlifyProvisionResult = {
  netlifySiteId: string;
  netlifySiteName: string;
  netlifyTeamId: string;
  netlifyDefaultUrl?: string;
  netlifyProductionUrl?: string;
  netlifyBuildHookId?: string;
};

type CloudflareProvisionResult = {
  cloudflarePagesProjectId?: string;
  cloudflarePagesProjectName: string;
  cloudflarePagesAccountId: string;
  cloudflarePagesAccountName?: string;
  cloudflarePagesSubdomain?: string;
  cloudflarePagesDefaultUrl?: string;
  cloudflarePagesProductionUrl?: string;
};

const NETLIFY_ENV_CONTEXTS = [
  "production",
  "deploy-preview",
  "branch-deploy",
  "dev",
] as const;

async function setNetlifyEnvironmentVariables(args: {
  netlifyProvider: NetlifyManagementProvider;
  accountId: string;
  siteId: string;
  vars: Record<string, string>;
}): Promise<void> {
  const varKeys = Object.keys(args.vars);
  console.log("infra:netlify:env:set:start", {
    siteId: args.siteId,
    accountId: args.accountId,
    keys: varKeys,
    contexts: NETLIFY_ENV_CONTEXTS,
  });

  const envVarsPayload = Object.entries(args.vars).map(([key, value]) => ({
    key,
    scopes: ["builds", "functions", "runtime"],
    values: NETLIFY_ENV_CONTEXTS.map((context) => ({
      context,
      value,
    })),
    is_secret: key.includes("KEY") || key.includes("TOKEN"),
  }));

  try {
    await args.netlifyProvider.request(
      `/accounts/${encodeURIComponent(args.accountId)}/env?site_id=${encodeURIComponent(args.siteId)}`,
      "POST",
      envVarsPayload,
    );
    console.log("infra:netlify:env:set:success", {
      siteId: args.siteId,
      accountId: args.accountId,
      keys: varKeys,
    });
  } catch (error) {
    console.error("infra:netlify:env:set:failed", {
      siteId: args.siteId,
      accountId: args.accountId,
      keys: varKeys,
      message: toErrorMessage(error),
    });
    throw error;
  }
}

async function ensureNetlifyResources(args: {
  netlifyProvider: NetlifyManagementProvider;
  teamSlug: string;
  owner: string;
  repo: string;
  ghRepoId: string;
  githubAccessToken: string;
  defaultBranch: string;
  vaultId: string;
  existing: {
    siteId?: string;
    siteName?: string;
    defaultUrl?: string;
    productionUrl?: string;
    buildHookId?: string;
  };
  convex: {
    cloudUrl: string;
    siteUrl: string;
    deployKey: string;
  };
}): Promise<NetlifyProvisionResult> {
  const suffix = vaultSuffix(args.vaultId);
  const siteName =
    args.existing.siteName ??
    sanitizeSlug(`${args.owner}-${args.repo}-${suffix}`, 48);
  const repoIdNumber = Number.parseInt(args.ghRepoId, 10);
  const repoId =
    Number.isFinite(repoIdNumber) && repoIdNumber > 0
      ? repoIdNumber
      : args.ghRepoId;

  console.log("infra:netlify:provision:start", {
    vaultId: args.vaultId,
    teamSlug: args.teamSlug,
    repo: `${args.owner}/${args.repo}`,
    siteName,
    existingSiteId: args.existing.siteId,
    existingBuildHookId: args.existing.buildHookId,
  });

  let step = "resolve_site";
  let siteResponse: JsonRecord | null = null;

  try {
    let netlifyDeployKeyId: string | undefined;
    let repoLinkagePatched = false;

    if (args.existing.siteId) {
      step = "read_existing_site";
      const existingSiteRaw = await args.netlifyProvider.request(
        `/sites/${encodeURIComponent(args.existing.siteId)}`,
        "GET",
      );
      siteResponse = asRecord(existingSiteRaw);
    }

    if (!siteResponse) {
      step = "find_site_by_name";
      const sitesRaw = await args.netlifyProvider.request(
        `/${encodeURIComponent(args.teamSlug)}/sites?name=${encodeURIComponent(siteName)}`,
        "GET",
      );
      const sites = Array.isArray(sitesRaw) ? sitesRaw : [];
      console.log("infra:netlify:site:search", {
        vaultId: args.vaultId,
        siteName,
        count: sites.length,
      });

      for (const site of sites) {
        const siteRecord = asRecord(site);
        if (readString(siteRecord, "name") === siteName) {
          siteResponse = siteRecord;
          break;
        }
      }
    }

    if (!siteResponse) {
      step = "create_site";
      const createSiteRaw = await args.netlifyProvider.request(
        `/${encodeURIComponent(args.teamSlug)}/sites?configure_dns=false`,
        "POST",
        {
          name: siteName,
        },
      );
      siteResponse = asRecord(createSiteRaw);
    }

    const siteId = readString(siteResponse, "id");
    if (!siteId) {
      throw new Error("Failed to resolve Netlify site ID");
    }

    const accountId = readString(siteResponse, "account_id");
    if (!accountId) {
      throw new Error("Failed to resolve Netlify account ID for environment setup");
    }

    const siteRepo = asRecord(siteResponse["repo"]);
    netlifyDeployKeyId = readStringOrNumber(siteRepo, "deploy_key_id");
    const currentRepoPath =
      readString(siteRepo, "repo_path") ?? readString(siteRepo, "repo");
    const currentRepoBranch =
      readString(siteRepo, "repo_branch") ?? readString(siteRepo, "branch");
    let needsRepoPatch =
      currentRepoPath !== `${args.owner}/${args.repo}` ||
      currentRepoBranch !== args.defaultBranch ||
      typeof netlifyDeployKeyId !== "string" ||
      netlifyDeployKeyId.length === 0;

    console.log("infra:netlify:site:resolved", {
      vaultId: args.vaultId,
      siteId,
      accountId,
      siteName,
      deployKeyConfigured: typeof netlifyDeployKeyId === "string",
    });

    step = "set_env";
    await setNetlifyEnvironmentVariables({
      netlifyProvider: args.netlifyProvider,
      accountId,
      siteId,
      vars: {
        VITE_CONVEX_URL: args.convex.cloudUrl,
        VITE_CONVEX_SITE_URL: args.convex.siteUrl,
        CONVEX_DEPLOY_KEY: args.convex.deployKey,
      },
    });

    if (!netlifyDeployKeyId) {
      step = "ensure_deploy_key";
      const netlifyDeployKey = await createNetlifyDeployKey({
        netlifyProvider: args.netlifyProvider,
      });
      netlifyDeployKeyId = netlifyDeployKey.deployKeyId;

      await addGitHubDeployKey({
        githubAccessToken: args.githubAccessToken,
        owner: args.owner,
        repo: args.repo,
        title: `netlify-${siteName}`,
        publicKey: netlifyDeployKey.publicKey,
      });
    }

    if (needsRepoPatch) {
      step = "patch_site_repo";
      await args.netlifyProvider.request(
        `/sites/${encodeURIComponent(siteId)}`,
        "PATCH",
        {
          repo: {
            provider: "github",
            repo: `${args.owner}/${args.repo}`,
            repo_id: repoId,
            branch: args.defaultBranch,
            private: true,
            public_repo: false,
            deploy_key_id: netlifyDeployKeyId,
            repo_path: `${args.owner}/${args.repo}`,
            repo_branch: args.defaultBranch,
          },
        },
      );
      repoLinkagePatched = true;
      needsRepoPatch = false;
    }

    step = "list_build_hooks";
    const hooksRaw = await args.netlifyProvider.request(
      `/sites/${encodeURIComponent(siteId)}/build_hooks`,
      "GET",
    );
    const hooks = Array.isArray(hooksRaw) ? hooksRaw : [];
    console.log("infra:netlify:hooks:list", {
      vaultId: args.vaultId,
      siteId,
      count: hooks.length,
      defaultBranch: args.defaultBranch,
    });

    let buildHookId: string | undefined;
    let buildHookUrl: string | undefined;
    for (const hook of hooks) {
      const hookRecord = asRecord(hook);
      if (readString(hookRecord, "branch") === args.defaultBranch) {
        const hookId = readStringOrNumber(hookRecord, "id");
        if (!hookId) {
          continue;
        }
        buildHookId = hookId;
        buildHookUrl =
          readString(hookRecord, "url") ??
          `https://api.netlify.com/build_hooks/${encodeURIComponent(hookId)}`;
        break;
      }
    }

    if (!buildHookId) {
      step = "create_build_hook";
      const hookRaw = await args.netlifyProvider.request(
        `/sites/${encodeURIComponent(siteId)}/build_hooks`,
        "POST",
        {
          title: `noter-${args.defaultBranch}`,
          branch: args.defaultBranch,
        },
      );
      const hookRecord = asRecord(hookRaw);
      const hookId = readStringOrNumber(hookRecord, "id");
      if (!hookId) {
        throw new Error("Failed to create Netlify build hook");
      }
      buildHookId = hookId;
      buildHookUrl =
        readString(hookRecord, "url") ??
        `https://api.netlify.com/build_hooks/${encodeURIComponent(hookId)}`;
      console.log("infra:netlify:hooks:created", {
        vaultId: args.vaultId,
        siteId,
        buildHookId,
        buildHookUrl,
        branch: args.defaultBranch,
      });
    }

    if (!buildHookId || !buildHookUrl) {
      throw new Error("Failed to resolve Netlify build hook URL");
    }

    step = "ensure_push_webhook";
    await ensureGitHubPushWebhook({
      githubAccessToken: args.githubAccessToken,
      owner: args.owner,
      repo: args.repo,
      webhookUrl: buildHookUrl,
    });

    step = "trigger_build";
    if (repoLinkagePatched) {
      console.log("infra:netlify:build:skipped_manual_trigger", {
        vaultId: args.vaultId,
        siteId,
        branch: args.defaultBranch,
        reason: "repo_linkage_recently_patched",
      });
    } else {
      try {
        await args.netlifyProvider.request(
          `/sites/${encodeURIComponent(siteId)}/builds?branch=${encodeURIComponent(args.defaultBranch)}`,
          "POST",
          {},
        );
        console.log("infra:netlify:build:triggered", {
          vaultId: args.vaultId,
          siteId,
          branch: args.defaultBranch,
        });
      } catch (error) {
        console.warn("infra:netlify:build:trigger_failed", {
          vaultId: args.vaultId,
          siteId,
          branch: args.defaultBranch,
          message: toErrorMessage(error),
        });
      }
    }

    step = "refresh_site";
    const refreshedSiteRaw = await args.netlifyProvider.request(
      `/sites/${encodeURIComponent(siteId)}`,
      "GET",
    );
    const refreshedSite = asRecord(refreshedSiteRaw);

    const result = {
      netlifySiteId: siteId,
      netlifySiteName: readString(refreshedSite, "name") ?? siteName,
      netlifyTeamId: args.teamSlug,
      netlifyDefaultUrl:
        readString(refreshedSite, "deploy_url") ?? readString(refreshedSite, "url"),
      netlifyProductionUrl:
        readString(refreshedSite, "ssl_url") ?? readString(refreshedSite, "url"),
      netlifyBuildHookId: buildHookId,
    };

    console.log("infra:netlify:provision:success", {
      vaultId: args.vaultId,
      siteId: result.netlifySiteId,
      siteName: result.netlifySiteName,
      defaultUrl: result.netlifyDefaultUrl,
      productionUrl: result.netlifyProductionUrl,
      buildHookId: result.netlifyBuildHookId,
    });

    return result;
  } catch (error) {
    console.error("infra:netlify:provision:failed", {
      vaultId: args.vaultId,
      teamSlug: args.teamSlug,
      repo: `${args.owner}/${args.repo}`,
      siteName,
      step,
      message: toErrorMessage(error),
    });
    throw error;
  }
}

function buildCloudflareEnvVars(
  vars: Record<string, string>,
): Record<string, { type: "plain_text" | "secret_text"; value: string }> {
  return Object.fromEntries(
    Object.entries(vars).map(([key, value]) => [
      key,
      {
        type:
          key.includes("TOKEN") || key.includes("KEY") || key.includes("SECRET")
            ? "secret_text"
            : "plain_text",
        value,
      },
    ]),
  );
}

async function setCloudflareEnvironmentVariables(args: {
  cloudflareProvider: CloudflareManagementProvider;
  accountId: string;
  projectName: string;
  vars: Record<string, string>;
}): Promise<void> {
  const payload = {
    deployment_configs: {
      production: {
        env_vars: buildCloudflareEnvVars(args.vars),
      },
      preview: {
        env_vars: buildCloudflareEnvVars(args.vars),
      },
    },
  };

  await args.cloudflareProvider.request(
    `/accounts/${encodeURIComponent(args.accountId)}/pages/projects/${encodeURIComponent(args.projectName)}`,
    "PATCH",
    payload,
  );
}

async function ensureCloudflareResources(args: {
  cloudflareProvider: CloudflareManagementProvider;
  accountId: string;
  accountName?: string;
  owner: string;
  ownerId?: string;
  repo: string;
  repoId?: string;
  defaultBranch: string;
  vaultId: string;
  existing: {
    projectName?: string;
    projectId?: string;
    subdomain?: string;
    defaultUrl?: string;
    productionUrl?: string;
  };
  convex: {
    cloudUrl: string;
    siteUrl: string;
    deployKey: string;
  };
}): Promise<CloudflareProvisionResult> {
  const suffix = vaultSuffix(args.vaultId);
  const projectName =
    args.existing.projectName ??
    sanitizeSlug(`${args.owner}-${args.repo}-${suffix}`, 48);

  console.log("infra:cloudflare:provision:start", {
    vaultId: args.vaultId,
    accountId: args.accountId,
    projectName,
  });

  let project: JsonRecord | null = null;

  if (args.existing.projectName) {
    try {
      const existingProjectRaw = await args.cloudflareProvider.request(
        `/accounts/${encodeURIComponent(args.accountId)}/pages/projects/${encodeURIComponent(projectName)}`,
        "GET",
      );
      project = asRecord(existingProjectRaw);
    } catch (error) {
      console.warn("infra:cloudflare:project:read_failed", {
        vaultId: args.vaultId,
        projectName,
        message: toErrorMessage(error),
      });
    }
  }

  if (!project) {
    const projectsRaw = await args.cloudflareProvider.request(
      `/accounts/${encodeURIComponent(args.accountId)}/pages/projects`,
      "GET",
    );
    const projects = Array.isArray(projectsRaw) ? projectsRaw : [];
    for (const entry of projects) {
      const record = asRecord(entry);
      if (readString(record, "name") === projectName) {
        project = record;
        break;
      }
    }
  }

  if (!project) {
    const createPayload = {
      name: projectName,
      production_branch: args.defaultBranch,
      build_config: {
        build_command: "pnpm install --frozen-lockfile && pnpm build",
        destination_dir: "dist",
        root_dir: "/",
      },
      source: {
        type: "github",
        config: {
          owner: args.owner,
          repo_name: args.repo,
          production_branch: args.defaultBranch,
          deployments_enabled: true,
          production_deployments_enabled: true,
          preview_deployment_setting: "all",
          pr_comments_enabled: false,
          ...(args.repoId ? { repo_id: args.repoId } : {}),
          ...(args.ownerId ? { owner_id: args.ownerId } : {}),
        },
      },
      deployment_configs: {
        production: {
          env_vars: buildCloudflareEnvVars({
            VITE_CONVEX_URL: args.convex.cloudUrl,
            VITE_CONVEX_SITE_URL: args.convex.siteUrl,
            CONVEX_DEPLOY_KEY: args.convex.deployKey,
          }),
        },
        preview: {
          env_vars: buildCloudflareEnvVars({
            VITE_CONVEX_URL: args.convex.cloudUrl,
            VITE_CONVEX_SITE_URL: args.convex.siteUrl,
            CONVEX_DEPLOY_KEY: args.convex.deployKey,
          }),
        },
      },
    };

    const createdProjectRaw = await args.cloudflareProvider.request(
      `/accounts/${encodeURIComponent(args.accountId)}/pages/projects`,
      "POST",
      createPayload,
    );
    project = asRecord(createdProjectRaw);
  }

  if (!project) {
    throw new Error("Failed to resolve Cloudflare Pages project.");
  }

  await setCloudflareEnvironmentVariables({
    cloudflareProvider: args.cloudflareProvider,
    accountId: args.accountId,
    projectName,
    vars: {
      VITE_CONVEX_URL: args.convex.cloudUrl,
      VITE_CONVEX_SITE_URL: args.convex.siteUrl,
      CONVEX_DEPLOY_KEY: args.convex.deployKey,
    },
  });

  const projectId = readStringOrNumber(project, "id");
  const subdomain =
    readString(project, "subdomain") ?? args.existing.subdomain ?? undefined;
  const canonicalDeployment = asRecord(project["canonical_deployment"]);
  const canonicalUrl = readString(canonicalDeployment, "url");
  const defaultUrl = ensureHttpsUrl(subdomain ?? canonicalUrl);
  const productionUrl = ensureHttpsUrl(canonicalUrl ?? subdomain);

  console.log("infra:cloudflare:provision:success", {
    vaultId: args.vaultId,
    projectName,
    projectId,
    subdomain,
    defaultUrl,
  });

  return {
    cloudflarePagesProjectId: projectId,
    cloudflarePagesProjectName: projectName,
    cloudflarePagesAccountId: args.accountId,
    cloudflarePagesAccountName: args.accountName,
    cloudflarePagesSubdomain: subdomain,
    cloudflarePagesDefaultUrl: defaultUrl,
    cloudflarePagesProductionUrl: productionUrl,
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

export const claimProvisioning = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    force: v.optional(v.boolean()),
  },
  returns: v.object({ claimed: v.boolean() }),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      return { claimed: false };
    }

    const now = Date.now();
    if (!args.force) {
      if (
        vault.infraState === "provisioning" &&
        vault.infraProvisioningStartedAt &&
        now - vault.infraProvisioningStartedAt < PROVISIONING_STALE_MS
      ) {
        return { claimed: false };
      }
    }

    await ctx.db.patch(args.vaultId, {
      infraState: "provisioning",
      infraLastError: undefined,
      infraProvisioningStartedAt: now,
    });

    return { claimed: true };
  },
});

export const setProvisioningState = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    infraState: v.union(
      v.literal("not_started"),
      v.literal("provisioning"),
      v.literal("ready"),
      v.literal("failed"),
      v.literal("partial"),
    ),
    infraLastError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.vaultId, {
      infraState: args.infraState,
      infraLastError: args.infraLastError,
      infraLastProvisionedAt: Date.now(),
      infraProvisioningStartedAt: undefined,
    });
    return null;
  },
});

export const upsertInfrastructureRecord = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    patch: infraPatchValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("vaultInfrastructure")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args.patch);
      return null;
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

      netlifySiteId: args.patch.netlifySiteId,
      netlifySiteName: args.patch.netlifySiteName,
      netlifyTeamId: args.patch.netlifyTeamId,
      netlifyDefaultUrl: args.patch.netlifyDefaultUrl,
      netlifyProductionUrl: args.patch.netlifyProductionUrl,
      netlifyBuildHookId: args.patch.netlifyBuildHookId,

      cloudflarePagesProjectId: args.patch.cloudflarePagesProjectId,
      cloudflarePagesProjectName: args.patch.cloudflarePagesProjectName,
      cloudflarePagesAccountId: args.patch.cloudflarePagesAccountId,
      cloudflarePagesAccountName: args.patch.cloudflarePagesAccountName,
      cloudflarePagesSubdomain: args.patch.cloudflarePagesSubdomain,
      cloudflarePagesDefaultUrl: args.patch.cloudflarePagesDefaultUrl,
      cloudflarePagesProductionUrl: args.patch.cloudflarePagesProductionUrl,
    });

    return null;
  },
});

export const upsertDomainRecord = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    branch: v.string(),
    kind: v.union(v.literal("main"), v.literal("branch_preview")),
    url: v.string(),
    source: v.union(
      v.literal("netlify_default"),
      v.literal("netlify_custom"),
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

export const provisionVaultInfrastructure = internalAction({
  args: {
    vaultId: v.id("vaults"),
    force: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.isNoterManaged !== true) {
      return null;
    }

    const { claimed } = await ctx.runMutation(internal.infraProvisioning.claimProvisioning, {
      vaultId: args.vaultId,
      force: args.force,
    });

    if (!claimed) {
      return null;
    }

    const existing = await ctx.runQuery(internal.infraProvisioning.getInfrastructureByVault, {
      vaultId: args.vaultId,
    });

    const nextVersion = (existing?.provisioningVersion ?? 0) + 1;

    await ctx.runMutation(internal.infraProvisioning.upsertInfrastructureRecord, {
      vaultId: args.vaultId,
      patch: {
        status: "provisioning",
        provisioningVersion: nextVersion,
        lastError: undefined,
      },
    });

    console.log("infra:provision:start", {
      vaultId: args.vaultId,
      repo: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
      previousVersion: existing?.provisioningVersion ?? 0,
      nextVersion,
      force: args.force ?? false,
    });

    let convexSuccess = false;
    let cloudflareSuccess = false;

    try {
      const allowOperatorFallback = process.env.ALLOW_OPERATOR_FALLBACK === "true";
      const defaultBranch = process.env.INFRA_DEFAULT_BRANCH ?? "main";
      const user = await ctx.runQuery(internal.users.getById, {
        userId: vault.userId,
      });

      if (!user?.githubAccessToken) {
        throw new Error("GitHub connection is required to provision infrastructure.");
      }

      const userConvexToken = user.convexAccessToken?.trim();
      const userConvexTeamId = user.convexTeamId?.trim();
      const convexToken =
        userConvexToken ??
        (allowOperatorFallback ? getRequiredEnv("CONVEX_MANAGEMENT_TOKEN") : "");
      const convexTeamId =
        userConvexTeamId ??
        (allowOperatorFallback ? getRequiredEnv("CONVEX_TEAM_ID") : "");

      if (!convexToken || !convexTeamId) {
        throw new Error(
          "Convex connection is required to provision infrastructure. Connect Convex and retry.",
        );
      }

      const cloudflareToken =
        user.cloudflareAccessToken ?? process.env.CLOUDFLARE_API_TOKEN ?? "";
      const cloudflareAccountId =
        user.cloudflareAccountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? "";

      if (!cloudflareToken || !cloudflareAccountId) {
        throw new Error(
          "Cloudflare Pages is not configured. Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID.",
        );
      }

      const providers = createInfraProviders({
        convexToken,
        cloudflareToken,
      });

      const convex = await ensureConvexResources({
        teamId: convexTeamId,
        convexProvider: providers.convex,
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        vaultId: args.vaultId,
        existing: {
          projectId: existing?.convexProjectId,
          projectSlug: existing?.convexProjectSlug,
          deploymentName: existing?.convexDeploymentName,
          cloudUrl: existing?.convexCloudUrl,
          siteUrl: existing?.convexSiteUrl,
        },
      });

      convexSuccess = true;

      await ctx.runMutation(internal.infraProvisioning.upsertInfrastructureRecord, {
        vaultId: args.vaultId,
        patch: {
          status: "provisioning",
          provisioningVersion: nextVersion,

          convexProjectId: convex.convexProjectId,
          convexProjectSlug: convex.convexProjectSlug,
          convexDeploymentName: convex.convexDeploymentName,
          convexDeploymentType: convex.convexDeploymentType,
          convexCloudUrl: convex.convexCloudUrl,
          convexSiteUrl: convex.convexSiteUrl,
          convexDeployKeyId: convex.convexDeployKeyId,
        },
      });

      const repoIdentity = await fetchGitHubRepoIdentity({
        githubAccessToken: user.githubAccessToken,
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
      });

      const cloudflare = await ensureCloudflareResources({
        cloudflareProvider: providers.cloudflare,
        accountId: cloudflareAccountId,
        accountName: user.cloudflareAccountName,
        owner: vault.ghRepoOwner,
        ownerId: repoIdentity.ownerId,
        repo: vault.ghRepoName,
        repoId: repoIdentity.repoId ?? vault.ghRepoId,
        defaultBranch,
        vaultId: args.vaultId,
        existing: {
          projectName: existing?.cloudflarePagesProjectName,
          projectId: existing?.cloudflarePagesProjectId,
          subdomain: existing?.cloudflarePagesSubdomain,
          defaultUrl: existing?.cloudflarePagesDefaultUrl,
          productionUrl: existing?.cloudflarePagesProductionUrl,
        },
        convex: {
          cloudUrl: convex.convexCloudUrl,
          siteUrl: convex.convexSiteUrl,
          deployKey: convex.deployKey,
        },
      });

      cloudflareSuccess = true;

      await ctx.runMutation(internal.infraProvisioning.upsertInfrastructureRecord, {
        vaultId: args.vaultId,
        patch: {
          status: "ready",
          provisioningVersion: nextVersion,
          lastProvisionedAt: Date.now(),

          cloudflarePagesProjectId: cloudflare.cloudflarePagesProjectId,
          cloudflarePagesProjectName: cloudflare.cloudflarePagesProjectName,
          cloudflarePagesAccountId: cloudflare.cloudflarePagesAccountId,
          cloudflarePagesAccountName: cloudflare.cloudflarePagesAccountName,
          cloudflarePagesSubdomain: cloudflare.cloudflarePagesSubdomain,
          cloudflarePagesDefaultUrl: cloudflare.cloudflarePagesDefaultUrl,
          cloudflarePagesProductionUrl: cloudflare.cloudflarePagesProductionUrl,
          lastError: undefined,
        },
      });

      const mainUrl =
        cloudflare.cloudflarePagesProductionUrl ??
        cloudflare.cloudflarePagesDefaultUrl;
      if (mainUrl) {
        await ctx.runMutation(internal.infraProvisioning.upsertDomainRecord, {
          vaultId: args.vaultId,
          branch: defaultBranch,
          kind: "main",
          url: mainUrl,
          source: "cloudflare_pages_default",
          active: true,
        });
      }

      await ctx.runMutation(internal.infraProvisioning.setProvisioningState, {
        vaultId: args.vaultId,
        infraState: "ready",
      });

      console.log("infra:provision:success", {
        vaultId: args.vaultId,
        repo: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
        convexDeploymentName: convex.convexDeploymentName,
        cloudflareProject: cloudflare.cloudflarePagesProjectName,
      });

      return null;
    } catch (error) {
      const message = toErrorMessage(error);
      const infraState = convexSuccess || cloudflareSuccess ? "partial" : "failed";

      console.error("infra:provision:failed", {
        vaultId: args.vaultId,
        repo: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
        infraState,
        convexSuccess,
        cloudflareSuccess,
        message,
      });

      await ctx.runMutation(internal.infraProvisioning.upsertInfrastructureRecord, {
        vaultId: args.vaultId,
        patch: {
          status: infraState,
          provisioningVersion: nextVersion,
          lastError: message,
          lastProvisionedAt: Date.now(),
        },
      });

      await ctx.runMutation(internal.infraProvisioning.setProvisioningState, {
        vaultId: args.vaultId,
        infraState,
        infraLastError: message,
      });

      return null;
    }
  },
});
