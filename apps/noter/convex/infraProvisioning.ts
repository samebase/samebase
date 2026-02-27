import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  createInfraProviders,
  type ConvexManagementProvider,
} from "./infraProviders";
import {
  ensureHostingResources,
  getProvisionedMainUrl,
  type ProvisionedByProvider,
} from "./hostingProviders";
import {
  asRecord,
  readString,
  readStringOrNumber,
  toErrorMessage,
} from "./jsonUtils";

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
  convexDeploymentType: v.optional(
    v.union(v.literal("prod"), v.literal("dev")),
  ),
  convexCloudUrl: v.optional(v.string()),
  convexSiteUrl: v.optional(v.string()),
  convexDeployKeyId: v.optional(v.string()),

  netlifySiteId: v.optional(v.string()),
  netlifySiteName: v.optional(v.string()),
  netlifyTeamId: v.optional(v.string()),
  netlifyDefaultUrl: v.optional(v.string()),
  netlifyProductionUrl: v.optional(v.string()),
  netlifyBuildHookId: v.optional(v.string()),
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
    (lowered.includes("key is already in use") ||
      lowered.includes("already exists"))
  ) {
    return;
  }

  throw new Error(
    `GitHub deploy key creation failed (${response.status}) for ${args.owner}/${args.repo}: ${responseText}`,
  );
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

  const siteUrl =
    args.existing.siteUrl ?? `https://${deploymentName}.convex.site`;

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
    source: v.union(v.literal("netlify_default"), v.literal("netlify_custom")),
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

    const { claimed } = await ctx.runMutation(
      internal.infraProvisioning.claimProvisioning,
      {
        vaultId: args.vaultId,
        force: args.force,
      },
    );

    if (!claimed) {
      return null;
    }

    const existing = await ctx.runQuery(
      internal.infraProvisioning.getInfrastructureByVault,
      {
        vaultId: args.vaultId,
      },
    );

    const nextVersion = (existing?.provisioningVersion ?? 0) + 1;

    await ctx.runMutation(
      internal.infraProvisioning.upsertInfrastructureRecord,
      {
        vaultId: args.vaultId,
        patch: {
          status: "provisioning",
          provisioningVersion: nextVersion,
          lastError: undefined,
        },
      },
    );

    console.log("infra:provision:start", {
      vaultId: args.vaultId,
      repo: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
      previousVersion: existing?.provisioningVersion ?? 0,
      nextVersion,
      force: args.force ?? false,
    });

    let convexSuccess = false;
    let netlifySuccess = false;

    try {
      const defaultBranch = process.env.INFRA_DEFAULT_BRANCH ?? "main";
      const [githubConnection, convexConnection, netlifyConnection] =
        await Promise.all([
          ctx.runQuery(internal.providerConnections.getByUserAndKind, {
            userId: vault.userId,
            kind: "github",
          }),
          ctx.runQuery(internal.providerConnections.getByUserAndKind, {
            userId: vault.userId,
            kind: "convex",
          }),
          ctx.runQuery(internal.providerConnections.getByUserAndKind, {
            userId: vault.userId,
            kind: "netlify",
          }),
        ]);

      if (githubConnection?.kind !== "github") {
        throw new Error(
          "GitHub connection is required to provision infrastructure.",
        );
      }
      const githubAccessToken = githubConnection.auth.credential;

      const convexToken =
        convexConnection?.kind === "convex"
          ? convexConnection.auth.credential.trim()
          : "";
      const convexTeamId =
        convexConnection?.kind === "convex"
          ? convexConnection.teamId.trim()
          : "";

      if (!convexToken || !convexTeamId) {
        throw new Error(
          "Convex connection is required to provision infrastructure. Connect Convex and retry.",
        );
      }

      const netlifyToken =
        netlifyConnection?.kind === "netlify"
          ? netlifyConnection.auth.credential.trim()
          : "";
      const netlifyTeamSlug =
        netlifyConnection?.kind === "netlify"
          ? netlifyConnection.teamSlug?.trim() ?? ""
          : "";
      const netlifyTeamId =
        netlifyConnection?.kind === "netlify"
          ? netlifyConnection.teamId.trim()
          : "";
      const netlifyTeam = netlifyTeamSlug || netlifyTeamId;

      if (!netlifyToken || !netlifyTeam) {
        throw new Error(
          "Netlify connection is required to provision infrastructure. Connect Netlify and retry.",
        );
      }

      const providers = createInfraProviders({
        convexToken,
        netlifyToken,
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

      await ctx.runMutation(
        internal.infraProvisioning.upsertInfrastructureRecord,
        {
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
        },
      );

      const repoIdentity = await fetchGitHubRepoIdentity({
        githubAccessToken,
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
      });

      const provisionedHosting: ProvisionedByProvider =
        await ensureHostingResources({
          provider: "netlify",
          netlifyProvider: providers.netlify,
          teamSlug: netlifyTeam,
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          ghRepoId: repoIdentity.repoId ?? vault.ghRepoId,
          githubAccessToken,
          defaultBranch,
          vaultId: args.vaultId,
          existing: {
            siteId: existing?.netlifySiteId,
            siteName: existing?.netlifySiteName,
            defaultUrl: existing?.netlifyDefaultUrl,
            productionUrl: existing?.netlifyProductionUrl,
            buildHookId: existing?.netlifyBuildHookId,
          },
          convex: {
            cloudUrl: convex.convexCloudUrl,
            siteUrl: convex.convexSiteUrl,
            deployKey: convex.deployKey,
          },
          addGitHubDeployKey,
          ensureGitHubPushWebhook,
        });

      switch (provisionedHosting.provider) {
        case "netlify": {
          netlifySuccess = true;

          await ctx.runMutation(
            internal.infraProvisioning.upsertInfrastructureRecord,
            {
              vaultId: args.vaultId,
              patch: {
                status: "ready",
                provisioningVersion: nextVersion,
                lastProvisionedAt: Date.now(),

                netlifySiteId: provisionedHosting.siteId,
                netlifySiteName: provisionedHosting.siteName,
                netlifyTeamId: provisionedHosting.teamId,
                netlifyDefaultUrl: provisionedHosting.defaultUrl,
                netlifyProductionUrl: provisionedHosting.productionUrl,
                netlifyBuildHookId: provisionedHosting.buildHookId,
                lastError: undefined,
              },
            },
          );

          const mainUrl = getProvisionedMainUrl(provisionedHosting);
          if (mainUrl) {
            await ctx.runMutation(
              internal.infraProvisioning.upsertDomainRecord,
              {
                vaultId: args.vaultId,
                branch: defaultBranch,
                kind: "main",
                url: mainUrl,
                source: "netlify_default",
                active: true,
              },
            );
          }

          console.log("infra:provision:success", {
            vaultId: args.vaultId,
            repo: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
            convexDeploymentName: convex.convexDeploymentName,
            netlifySite: provisionedHosting.siteName,
          });
          break;
        }
        case "railway":
          throw new Error(
            "Railway hosting provisioning is not implemented yet.",
          );
        default:
          provisionedHosting satisfies never;
      }

      await ctx.runMutation(internal.infraProvisioning.setProvisioningState, {
        vaultId: args.vaultId,
        infraState: "ready",
      });

      return null;
    } catch (error) {
      const message = toErrorMessage(error);
      const infraState = convexSuccess || netlifySuccess ? "partial" : "failed";

      console.error("infra:provision:failed", {
        vaultId: args.vaultId,
        repo: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
        infraState,
        convexSuccess,
        netlifySuccess,
        message,
      });

      await ctx.runMutation(
        internal.infraProvisioning.upsertInfrastructureRecord,
        {
          vaultId: args.vaultId,
          patch: {
            status: infraState,
            provisioningVersion: nextVersion,
            lastError: message,
            lastProvisionedAt: Date.now(),
          },
        },
      );

      await ctx.runMutation(internal.infraProvisioning.setProvisioningState, {
        vaultId: args.vaultId,
        infraState,
        infraLastError: message,
      });

      return null;
    }
  },
});
