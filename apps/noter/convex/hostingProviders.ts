import type { HostingState } from "./hostingState";
import {
  callCloudflareMcpTool,
  CLOUDFLARE_MCP_SERVER_URL,
} from "./cloudflareMcp";
import {
  asRecord,
  clamp,
  readString,
  readStringOrNumber,
  toErrorMessage,
  type JsonRecord,
} from "./jsonUtils";
import { sanitizeSlug, vaultSuffix } from "./slugUtils";

type CloudflareProvisionExistingState = {
  accountId?: string;
  projectName?: string;
  subdomain?: string;
  productionUrl?: string;
};

type CloudflareProvisionConvexState = {
  production: {
    cloudUrl: string;
    deployKey: string;
  };
  preview: {
    cloudUrl: string;
    deployKey: string;
  };
};

type CloudflareBuildConfig = {
  rootDir: string;
  buildCommand: string;
  destinationDir: string;
};

type CloudflarePagesRequestMethod = "GET" | "POST" | "PATCH" | "DELETE";

function parseJsonText(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    const excerpt = value.length > 240 ? `${value.slice(0, 240)}...` : value;
    throw new Error(
      `Cloudflare MCP returned non-JSON response: ${toErrorMessage(error)} (payload excerpt: ${excerpt})`,
    );
  }
}

function normalizeCloudflarePagesHost(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  return withoutProtocol.replace(/\/+$/, "");
}

function buildCloudflarePagesEnvVars(vars: {
  convexDeployKey: string;
  convexUrl: string;
}): Record<
  string,
  { type: "plain_text"; value: string } | { type: "secret_text"; value: string }
> {
  return {
    CONVEX_DEPLOY_KEY: {
      type: "secret_text",
      value: vars.convexDeployKey,
    },
    VITE_CONVEX_URL: {
      type: "plain_text",
      value: vars.convexUrl,
    },
  };
}

async function requestCloudflarePagesApi(args: {
  token: string;
  serverUrl?: string;
  method: CloudflarePagesRequestMethod;
  path: string;
  body?: unknown;
}): Promise<unknown> {
  const bodyPart =
    args.body === undefined ? "" : `, body: ${JSON.stringify(args.body)}`;
  const code = `async () => {
  const response = await cloudflare.request({
    method: ${JSON.stringify(args.method)},
    path: ${JSON.stringify(args.path)}${bodyPart}
  });
  if (!response || response.success !== true) {
    const errors = response && Array.isArray(response.errors)
      ? response.errors
      : response;
    throw new Error("Cloudflare API error: " + JSON.stringify(errors));
  }
  return response.result;
}`;
  const text = await callCloudflareMcpTool({
    token: args.token,
    toolName: "execute",
    toolArgs: { code },
    serverUrl: args.serverUrl ?? CLOUDFLARE_MCP_SERVER_URL,
  });
  return parseJsonText(text);
}

export type ProvisionedByProvider = HostingState;
export type { HostingProvider } from "./hostingState";

type EnsureCloudflareResourcesArgs = {
  provider: "cloudflare";
  owner: string;
  repo: string;
  ghRepoId: string;
  ghRepoOwnerId?: string;
  defaultBranch: string;
  vaultId: string;
  cloudflareToken: string;
  cloudflareServerUrl?: string;
  accountId: string;
  buildConfig: CloudflareBuildConfig;
  existing: CloudflareProvisionExistingState;
  convex: CloudflareProvisionConvexState;
};

async function ensureCloudflareResources(
  args: EnsureCloudflareResourcesArgs,
): Promise<Extract<ProvisionedByProvider, { provider: "cloudflare" }>> {
  const suffix = vaultSuffix(args.vaultId);
  const fallbackProjectName = sanitizeSlug(
    `${args.owner}-${args.repo}-${suffix}`,
    58,
  );
  const projectBasePath = `/accounts/${encodeURIComponent(args.accountId)}/pages/projects`;
  let projectName = args.existing.projectName ?? fallbackProjectName;

  console.log("infra:cloudflare:provision:start", {
    vaultId: args.vaultId,
    accountId: args.accountId,
    projectName,
    repo: `${args.owner}/${args.repo}`,
    defaultBranch: args.defaultBranch,
  });

  let step = "resolve_project";
  try {
    let existingProject: JsonRecord | null = null;
    const projectCandidates = [
      args.existing.projectName,
      fallbackProjectName,
    ].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );

    for (const candidate of projectCandidates) {
      try {
        step = "read_existing_project";
        const existingRaw = await requestCloudflarePagesApi({
          token: args.cloudflareToken,
          serverUrl: args.cloudflareServerUrl,
          method: "GET",
          path: `${projectBasePath}/${encodeURIComponent(candidate)}`,
        });
        const existingRecord = asRecord(existingRaw);
        const resolvedName = readString(existingRecord, "name");
        if (!resolvedName) {
          continue;
        }
        existingProject = existingRecord;
        projectName = resolvedName;
        break;
      } catch (error) {
        console.warn("infra:cloudflare:project:read_existing_failed", {
          vaultId: args.vaultId,
          accountId: args.accountId,
          projectName: candidate,
          message: toErrorMessage(error),
        });
      }
    }

    const sourceConfig: Record<string, unknown> = {
      owner: args.owner,
      repo_name: args.repo,
      repo_id: args.ghRepoId,
      production_branch: args.defaultBranch,
      production_deployments_enabled: true,
      preview_deployment_setting: "all",
    };
    if (args.ghRepoOwnerId) {
      sourceConfig["owner_id"] = args.ghRepoOwnerId;
    }

    const payload = {
      name: projectName,
      production_branch: args.defaultBranch,
      build_config: {
        build_command: args.buildConfig.buildCommand,
        root_dir: args.buildConfig.rootDir,
        destination_dir: args.buildConfig.destinationDir,
      },
      deployment_configs: {
        production: {
          env_vars: buildCloudflarePagesEnvVars({
            convexDeployKey: args.convex.production.deployKey,
            convexUrl: args.convex.production.cloudUrl,
          }),
        },
        preview: {
          env_vars: buildCloudflarePagesEnvVars({
            convexDeployKey: args.convex.preview.deployKey,
            convexUrl: args.convex.preview.cloudUrl,
          }),
        },
      },
      source: {
        type: "github",
        config: sourceConfig,
      },
    };

    if (existingProject) {
      step = "update_project";
      await requestCloudflarePagesApi({
        token: args.cloudflareToken,
        serverUrl: args.cloudflareServerUrl,
        method: "PATCH",
        path: `${projectBasePath}/${encodeURIComponent(projectName)}`,
        body: payload,
      });
    } else {
      step = "create_project";
      const createdRaw = await requestCloudflarePagesApi({
        token: args.cloudflareToken,
        serverUrl: args.cloudflareServerUrl,
        method: "POST",
        path: projectBasePath,
        body: payload,
      });
      const createdRecord = asRecord(createdRaw);
      const createdName = readString(createdRecord, "name");
      if (createdName) {
        projectName = createdName;
      }
    }

    const shouldTriggerDeployment =
      existingProject === null || args.existing.productionUrl === undefined;
    if (shouldTriggerDeployment) {
      step = "trigger_deployment";
      await requestCloudflarePagesApi({
        token: args.cloudflareToken,
        serverUrl: args.cloudflareServerUrl,
        method: "POST",
        path: `${projectBasePath}/${encodeURIComponent(projectName)}/deployments`,
      });
    }

    step = "refresh_project";
    const refreshedRaw = await requestCloudflarePagesApi({
      token: args.cloudflareToken,
      serverUrl: args.cloudflareServerUrl,
      method: "GET",
      path: `${projectBasePath}/${encodeURIComponent(projectName)}`,
    });
    const refreshed = asRecord(refreshedRaw);
    const refreshedSubdomain = normalizeCloudflarePagesHost(
      readString(refreshed, "subdomain") ?? "",
    );
    const existingSubdomain = normalizeCloudflarePagesHost(
      args.existing.subdomain ?? "",
    );
    const fallbackSubdomain = `${projectName}.pages.dev`;
    const subdomain =
      refreshedSubdomain || existingSubdomain || fallbackSubdomain;
    const productionUrl = `https://${subdomain}`;

    const result: Extract<ProvisionedByProvider, { provider: "cloudflare" }> = {
      provider: "cloudflare",
      accountId: args.accountId,
      projectName,
      subdomain,
      productionUrl,
    };

    console.log("infra:cloudflare:provision:success", {
      vaultId: args.vaultId,
      accountId: result.accountId,
      projectName: result.projectName,
      subdomain: result.subdomain,
      productionUrl: result.productionUrl,
    });

    return result;
  } catch (error) {
    console.error("infra:cloudflare:provision:failed", {
      vaultId: args.vaultId,
      accountId: args.accountId,
      projectName,
      repo: `${args.owner}/${args.repo}`,
      step,
      message: toErrorMessage(error),
    });
    throw error;
  }
}

export async function ensureHostingResources(
  args: EnsureCloudflareResourcesArgs,
): Promise<ProvisionedByProvider> {
  return await ensureCloudflareResources(args);
}

export function getProvisionedMainUrl(
  args: ProvisionedByProvider,
): string | undefined {
  if (args.productionUrl) {
    return args.productionUrl;
  }
  if (args.subdomain) {
    return `https://${args.subdomain}`;
  }
  return undefined;
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

type ReadCloudflareProjectStatusArgs = {
  provider: "cloudflare";
  cloudflareToken: string;
  cloudflareServerUrl?: string;
  accountId: string;
  projectName: string;
};

export async function readHostingSiteStatus(
  args: ReadCloudflareProjectStatusArgs,
): Promise<HostingStatusReadResult> {
  const endpoint = `/accounts/${encodeURIComponent(args.accountId)}/pages/projects/${encodeURIComponent(args.projectName)}`;
  const payload = await requestCloudflarePagesApi({
    token: args.cloudflareToken,
    serverUrl: args.cloudflareServerUrl,
    method: "GET",
    path: endpoint,
  });

  return {
    summary: `Cloudflare Pages project status for ${args.projectName}`,
    endpoint,
    raw: JSON.stringify(payload, null, 2),
    rowCount: 1,
  };
}

type ReadCloudflareLogsArgs = {
  provider: "cloudflare";
  cloudflareToken: string;
  cloudflareServerUrl?: string;
  accountId: string;
  projectName: string;
  maxEntries: number;
};

export async function readHostingLogs(
  args: ReadCloudflareLogsArgs,
): Promise<HostingLogsReadResult> {
  const maxEntries = clamp(args.maxEntries, 1, 50);
  const deploymentsEndpoint = `/accounts/${encodeURIComponent(args.accountId)}/pages/projects/${encodeURIComponent(args.projectName)}/deployments`;
  const deploymentsPayload = await requestCloudflarePagesApi({
    token: args.cloudflareToken,
    serverUrl: args.cloudflareServerUrl,
    method: "GET",
    path: deploymentsEndpoint,
  });
  const deployments = Array.isArray(deploymentsPayload)
    ? deploymentsPayload
    : [];
  const selectedDeployments = deployments.slice(0, maxEntries);

  const logsByDeployment = await Promise.all(
    selectedDeployments.map(async (deployment) => {
      const record = asRecord(deployment);
      const deploymentId = readStringOrNumber(record, "id");
      if (!deploymentId) {
        return {
          deployment,
          logs: { error: "Deployment ID missing from Cloudflare response" },
        };
      }

      const logsEndpoint = `${deploymentsEndpoint}/${encodeURIComponent(deploymentId)}/history/logs`;
      const logsPayload = await requestCloudflarePagesApi({
        token: args.cloudflareToken,
        serverUrl: args.cloudflareServerUrl,
        method: "GET",
        path: logsEndpoint,
      });

      return {
        deploymentId,
        deployment,
        logs: logsPayload,
      };
    }),
  );

  return {
    summary: `Cloudflare deployment logs for Pages project ${args.projectName}`,
    endpoint: `${deploymentsEndpoint} + deployment history logs`,
    raw:
      logsByDeployment.length > 0
        ? JSON.stringify(logsByDeployment, null, 2)
        : "No deployment entries returned.",
    logLineCount: logsByDeployment.length,
  };
}

type DeleteCloudflareResourcesArgs = {
  provider: "cloudflare";
  accountId: string;
  projectName: string;
  cloudflareToken: string;
  cloudflareServerUrl?: string;
};

export async function deleteHostingResources(
  args: DeleteCloudflareResourcesArgs,
): Promise<void> {
  await requestCloudflarePagesApi({
    token: args.cloudflareToken,
    serverUrl: args.cloudflareServerUrl,
    method: "DELETE",
    path: `/accounts/${encodeURIComponent(args.accountId)}/pages/projects/${encodeURIComponent(args.projectName)}`,
  });
}
