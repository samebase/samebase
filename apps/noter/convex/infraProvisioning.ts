import { Infer, v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  createInfraProviders,
  getRequiredEnv,
  type ConvexManagementProvider,
  type NetlifyManagementProvider,
} from "./infraProviders";

const PROVISIONING_STALE_MS = 10 * 60 * 1000;

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
          repo: {
            provider: "github",
            repo_path: `${args.owner}/${args.repo}`,
            repo_branch: args.defaultBranch,
          },
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

    console.log("infra:netlify:site:resolved", {
      vaultId: args.vaultId,
      siteId,
      accountId,
      siteName,
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

    let buildHookId = args.existing.buildHookId;
    for (const hook of hooks) {
      const hookRecord = asRecord(hook);
      if (readString(hookRecord, "branch") === args.defaultBranch) {
        buildHookId = readString(hookRecord, "id") ?? buildHookId;
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
      buildHookId = readString(hookRecord, "id") ?? buildHookId;
      console.log("infra:netlify:hooks:created", {
        vaultId: args.vaultId,
        siteId,
        buildHookId,
        branch: args.defaultBranch,
      });
    }

    step = "trigger_build";
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
    let netlifySuccess = false;

    try {
      const providers = createInfraProviders();
      const convexTeamId = getRequiredEnv("CONVEX_TEAM_ID");
      const netlifyTeamSlug = getRequiredEnv("NETLIFY_TEAM_ID");
      const defaultBranch = process.env.INFRA_DEFAULT_BRANCH ?? "main";

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

      const netlify = await ensureNetlifyResources({
        netlifyProvider: providers.netlify,
        teamSlug: netlifyTeamSlug,
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
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
      });

      netlifySuccess = true;

      await ctx.runMutation(internal.infraProvisioning.upsertInfrastructureRecord, {
        vaultId: args.vaultId,
        patch: {
          status: "ready",
          provisioningVersion: nextVersion,
          lastProvisionedAt: Date.now(),

          netlifySiteId: netlify.netlifySiteId,
          netlifySiteName: netlify.netlifySiteName,
          netlifyTeamId: netlify.netlifyTeamId,
          netlifyDefaultUrl: netlify.netlifyDefaultUrl,
          netlifyProductionUrl: netlify.netlifyProductionUrl,
          netlifyBuildHookId: netlify.netlifyBuildHookId,
          lastError: undefined,
        },
      });

      const mainUrl = netlify.netlifyProductionUrl ?? netlify.netlifyDefaultUrl;
      if (mainUrl) {
        await ctx.runMutation(internal.infraProvisioning.upsertDomainRecord, {
          vaultId: args.vaultId,
          branch: defaultBranch,
          kind: "main",
          url: mainUrl,
          source: "netlify_default",
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
        netlifySiteId: netlify.netlifySiteId,
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
