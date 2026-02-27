import type { NetlifyManagementProvider } from "./infraProviders";
import {
  asRecord,
  clamp,
  readString,
  readStringOrNumber,
  toErrorMessage,
  type JsonRecord,
} from "./jsonUtils";
import { sanitizeSlug, vaultSuffix } from "./slugUtils";

const NETLIFY_ENV_CONTEXTS = [
  "production",
  "deploy-preview",
  "branch-deploy",
  "dev",
] as const;

type AddGitHubDeployKeyArgs = {
  githubAccessToken: string;
  owner: string;
  repo: string;
  title: string;
  publicKey: string;
};

type EnsureGitHubPushWebhookArgs = {
  githubAccessToken: string;
  owner: string;
  repo: string;
  webhookUrl: string;
};

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
    is_secret: /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key),
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

export type HostingProvider = "netlify" | "railway";

type NetlifyProvisionExistingState = {
  siteId?: string;
  siteName?: string;
  defaultUrl?: string;
  productionUrl?: string;
  buildHookId?: string;
};

type NetlifyProvisionConvexState = {
  cloudUrl: string;
  siteUrl: string;
  deployKey: string;
};

export type ProvisionedByProvider =
  | {
      provider: "netlify";
      siteId: string;
      siteName: string;
      teamId: string;
      defaultUrl?: string;
      productionUrl?: string;
      buildHookId: string;
    }
  | {
      provider: "railway";
      projectId: string;
      environmentId: string;
      serviceId: string;
      domain: string;
    };

type EnsureNetlifyResourcesArgs = {
  provider: "netlify";
  netlifyProvider: NetlifyManagementProvider;
  teamSlug: string;
  owner: string;
  repo: string;
  ghRepoId: string;
  githubAccessToken: string;
  defaultBranch: string;
  vaultId: string;
  existing: NetlifyProvisionExistingState;
  convex: NetlifyProvisionConvexState;
  addGitHubDeployKey(args: AddGitHubDeployKeyArgs): Promise<void>;
  ensureGitHubPushWebhook(args: EnsureGitHubPushWebhookArgs): Promise<void>;
};

type EnsureRailwayResourcesArgs = {
  provider: "railway";
};

type EnsureHostingResourcesArgs =
  | EnsureNetlifyResourcesArgs
  | EnsureRailwayResourcesArgs;

async function ensureNetlifyResources(
  args: EnsureNetlifyResourcesArgs,
): Promise<Extract<ProvisionedByProvider, { provider: "netlify" }>> {
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
      try {
        const existingSiteRaw = await args.netlifyProvider.request(
          `/sites/${encodeURIComponent(args.existing.siteId)}`,
          "GET",
        );
        siteResponse = asRecord(existingSiteRaw);
      } catch (error) {
        step = "read_existing_site_failed";
        siteResponse = null;
        console.warn("infra:netlify:site:read_existing_failed", {
          vaultId: args.vaultId,
          siteId: args.existing.siteId,
          message: toErrorMessage(error),
        });
      }
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
      throw new Error(
        "Failed to resolve Netlify account ID for environment setup",
      );
    }

    const siteRepo = asRecord(siteResponse["repo"]);
    netlifyDeployKeyId = readStringOrNumber(siteRepo, "deploy_key_id");
    const currentRepoPath =
      readString(siteRepo, "repo_path") ?? readString(siteRepo, "repo");
    const currentRepoBranch =
      readString(siteRepo, "repo_branch") ?? readString(siteRepo, "branch");
    const needsRepoPatch =
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

      await args.addGitHubDeployKey({
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
    await args.ensureGitHubPushWebhook({
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

    const result: Extract<ProvisionedByProvider, { provider: "netlify" }> = {
      provider: "netlify",
      siteId,
      siteName: readString(refreshedSite, "name") ?? siteName,
      teamId: accountId,
      defaultUrl:
        readString(refreshedSite, "deploy_url") ??
        readString(refreshedSite, "url"),
      productionUrl:
        readString(refreshedSite, "ssl_url") ??
        readString(refreshedSite, "url"),
      buildHookId,
    };

    console.log("infra:netlify:provision:success", {
      vaultId: args.vaultId,
      siteId: result.siteId,
      siteName: result.siteName,
      defaultUrl: result.defaultUrl,
      productionUrl: result.productionUrl,
      buildHookId: result.buildHookId,
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

export async function ensureHostingResources(
  args: EnsureHostingResourcesArgs,
): Promise<ProvisionedByProvider> {
  switch (args.provider) {
    case "netlify":
      return await ensureNetlifyResources(args);
    case "railway":
      throw new Error("Railway hosting provisioning is not implemented yet.");
    default:
      args satisfies never;
      throw new Error("Unsupported hosting provider.");
  }
}

export function getProvisionedMainUrl(
  args: ProvisionedByProvider,
): string | undefined {
  switch (args.provider) {
    case "netlify":
      return args.productionUrl ?? args.defaultUrl;
    case "railway":
      return args.domain;
    default:
      args satisfies never;
      return undefined;
  }
}

export type HostingStatusReadResult = {
  summary: string;
  endpoint: string;
  raw: string;
  rowCount: number;
};

export type HostingLogsReadResult = {
  summary: string;
  endpoint: string;
  raw: string;
  logLineCount: number;
};

export type HostingInventoryReadResult = {
  summary: string;
  endpoint: string;
  raw: string;
  rowCount: number;
};

type ReadNetlifySiteStatusArgs = {
  provider: "netlify";
  netlifyProvider: NetlifyManagementProvider;
  siteId: string;
  siteName?: string;
};

type ReadRailwaySiteStatusArgs = {
  provider: "railway";
};

type ReadHostingSiteStatusArgs =
  | ReadNetlifySiteStatusArgs
  | ReadRailwaySiteStatusArgs;

export async function readHostingSiteStatus(
  args: ReadHostingSiteStatusArgs,
): Promise<HostingStatusReadResult> {
  switch (args.provider) {
    case "netlify": {
      const endpoint = `/sites/${encodeURIComponent(args.siteId)}`;
      const payload = await args.netlifyProvider.request(endpoint, "GET");
      return {
        summary: `Netlify site status for ${args.siteName ?? args.siteId}`,
        endpoint,
        raw: JSON.stringify(payload, null, 2),
        rowCount: 1,
      };
    }
    case "railway":
      throw new Error("Railway hosting status read is not implemented yet.");
    default:
      args satisfies never;
      throw new Error("Unsupported hosting provider.");
  }
}

type ReadNetlifyLogsArgs = {
  provider: "netlify";
  netlifyProvider: NetlifyManagementProvider;
  siteId: string;
  maxEntries: number;
};

type ReadRailwayLogsArgs = {
  provider: "railway";
};

type ReadHostingLogsArgs = ReadNetlifyLogsArgs | ReadRailwayLogsArgs;

export async function readHostingLogs(
  args: ReadHostingLogsArgs,
): Promise<HostingLogsReadResult> {
  switch (args.provider) {
    case "netlify": {
      const maxEntries = clamp(args.maxEntries, 1, 50);
      const deploysEndpoint = `/sites/${encodeURIComponent(args.siteId)}/deploys?per_page=${maxEntries}&page=1`;
      const buildsEndpoint = `/sites/${encodeURIComponent(args.siteId)}/builds?per_page=${maxEntries}&page=1`;

      const deploysPayload = await args.netlifyProvider.request(
        deploysEndpoint,
        "GET",
      );
      const buildsPayload = await args.netlifyProvider.request(
        buildsEndpoint,
        "GET",
      );

      const lines: string[] = [];

      const deploys = Array.isArray(deploysPayload) ? deploysPayload : [];
      for (const deploy of deploys) {
        const record = asRecord(deploy);
        const createdAt = readString(record, "created_at") ?? "unknown";
        const state = readString(record, "state") ?? "unknown";
        const context = readString(record, "context") ?? "unknown";
        const branch = readString(record, "branch") ?? "unknown";
        const errorMessage = readString(record, "error_message");
        lines.push(
          `${createdAt} deploy state=${state} context=${context} branch=${branch}` +
            (errorMessage ? ` error=${errorMessage}` : ""),
        );
      }

      const builds = Array.isArray(buildsPayload) ? buildsPayload : [];
      for (const build of builds) {
        const record = asRecord(build);
        const createdAt = readString(record, "created_at") ?? "unknown";
        const done = record["done"] === true;
        const error = readString(record, "error") ?? "";
        lines.push(
          `${createdAt} build done=${done}` + (error ? ` error=${error}` : ""),
        );
      }

      return {
        summary: `Netlify deploy/build activity for site ${args.siteId}`,
        endpoint: `${deploysEndpoint} + ${buildsEndpoint}`,
        raw: lines.join("\n") || "No deploy/build activity entries returned.",
        logLineCount: lines.length,
      };
    }
    case "railway":
      throw new Error("Railway hosting logs read is not implemented yet.");
    default:
      args satisfies never;
      throw new Error("Unsupported hosting provider.");
  }
}

type ReadNetlifyInventoryArgs = {
  provider: "netlify";
  netlifyProvider: NetlifyManagementProvider;
  teamSlug: string;
  limit: number;
};

type ReadRailwayInventoryArgs = {
  provider: "railway";
};

type ReadHostingInventoryArgs =
  | ReadNetlifyInventoryArgs
  | ReadRailwayInventoryArgs;

export async function readHostingInventory(
  args: ReadHostingInventoryArgs,
): Promise<HostingInventoryReadResult> {
  switch (args.provider) {
    case "netlify": {
      const max = clamp(args.limit, 1, 100);
      const endpoint = `/${encodeURIComponent(args.teamSlug)}/sites?per_page=${max}&page=1`;
      const payload = await args.netlifyProvider.request(endpoint, "GET");
      const sites = Array.isArray(payload) ? payload : [];
      const rows = sites.slice(0, max);
      return {
        summary: `Netlify site inventory for team ${args.teamSlug}`,
        endpoint,
        raw: JSON.stringify(rows, null, 2),
        rowCount: rows.length,
      };
    }
    case "railway":
      throw new Error("Railway hosting inventory read is not implemented yet.");
    default:
      args satisfies never;
      throw new Error("Unsupported hosting provider.");
  }
}

type DeleteNetlifyResourcesArgs = {
  provider: "netlify";
  netlifyProvider: NetlifyManagementProvider;
  siteId: string;
};

type DeleteRailwayResourcesArgs = {
  provider: "railway";
};

type DeleteHostingResourcesArgs =
  | DeleteNetlifyResourcesArgs
  | DeleteRailwayResourcesArgs;

export async function deleteHostingResources(
  args: DeleteHostingResourcesArgs,
): Promise<void> {
  switch (args.provider) {
    case "netlify":
      await args.netlifyProvider.request(
        `/sites/${encodeURIComponent(args.siteId)}`,
        "DELETE",
      );
      return;
    case "railway":
      throw new Error("Railway hosting deletion is not implemented yet.");
    default:
      args satisfies never;
      throw new Error("Unsupported hosting provider.");
  }
}
