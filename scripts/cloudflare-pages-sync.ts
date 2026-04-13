#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  buildCloudflarePagesAppBuildCommand,
  cloudflarePagesApps,
  getCloudflarePagesApp,
  type CloudflarePagesAppConfig,
} from "./cloudflare-pages-apps.ts";

type GitHubRepoSlug = {
  owner: string;
  repo: string;
};

type GitHubRepoIdentity = GitHubRepoSlug & {
  id: string;
  ownerId: string;
};

type CloudflarePagesSyncArgs = {
  dryRun: boolean;
  appIds: string[] | null;
};

type CloudflarePagesEnvVar = {
  type: "secret_text" | "plain_text";
  value: string;
};

type CloudflarePagesEnvVars = Record<string, CloudflarePagesEnvVar>;

type CloudflarePagesSourceConfig = {
  owner: string;
  owner_id: string;
  repo_name: string;
  repo_id: string;
  production_branch: string;
  production_deployments_enabled: boolean;
  preview_deployment_setting: CloudflarePagesAppConfig["previewDeploymentSetting"];
  pr_comments_enabled: boolean;
  path_includes: string[];
  path_excludes?: string[];
  preview_branch_includes?: string[];
  preview_branch_excludes?: string[];
};

type CloudflarePagesProjectPayload = {
  name: string;
  production_branch: string;
  build_config: {
    build_command: string;
    root_dir: string;
    destination_dir: string;
  };
  deployment_configs: {
    production: {
      env_vars: CloudflarePagesEnvVars;
    };
    preview: {
      env_vars: CloudflarePagesEnvVars;
    };
  };
  source: {
    type: "github";
    config: CloudflarePagesSourceConfig;
  };
};

type CloudflarePagesApiRequestArgs = {
  token: string;
  accountId: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: unknown;
};

type CloudflarePagesApiResponse = {
  status: number;
  result: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

export function parseCloudflarePagesSyncArgs(
  argv: string[],
): CloudflarePagesSyncArgs {
  const appIds: string[] = [];
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--app") {
      const appId = argv[index + 1];
      if (typeof appId !== "string" || appId.trim().length === 0) {
        throw new Error("Expected an app id after --app.");
      }
      appIds.push(appId.trim());
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument ${JSON.stringify(argument)}.`);
  }

  return {
    dryRun,
    appIds: appIds.length > 0 ? appIds : null,
  };
}

export function parseGitHubRepoSlugFromRemoteUrl(
  remoteUrl: string,
): GitHubRepoSlug | null {
  const trimmed = remoteUrl.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const normalized = trimmed.endsWith(".git")
    ? trimmed.slice(0, -".git".length)
    : trimmed;

  const sshMatch = normalized.match(/^git@github\.com:([^/]+)\/(.+)$/);
  if (sshMatch) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2],
    };
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.hostname !== "github.com") {
      return null;
    }
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 2) {
      return null;
    }
    return {
      owner: pathParts[0],
      repo: pathParts[1],
    };
  } catch {
    return null;
  }
}

export function buildManagedPagesEnvVars(args: {
  deployKey: string;
  siteUrl?: string;
}): CloudflarePagesEnvVars {
  const envVars: CloudflarePagesEnvVars = {
    CONVEX_DEPLOY_KEY: {
      type: "secret_text",
      value: args.deployKey,
    },
  };

  if (typeof args.siteUrl === "string" && args.siteUrl.trim().length > 0) {
    envVars.CONVEX_SITE_URL = {
      type: "plain_text",
      value: args.siteUrl.trim(),
    };
  }

  return envVars;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

async function callCloudflarePagesApi(
  args: CloudflarePagesApiRequestArgs,
): Promise<CloudflarePagesApiResponse> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
      args.accountId,
    )}/pages/projects${args.path}`,
    {
      method: args.method,
      headers: {
        Authorization: `Bearer ${args.token}`,
        "Content-Type": "application/json",
      },
      body: args.body === undefined ? undefined : JSON.stringify(args.body),
    },
  );

  if (response.status === 404) {
    return {
      status: 404,
      result: null,
    };
  }

  const payload: unknown = await response.json();
  if (response.ok && isRecord(payload) && payload.success === true) {
    return {
      status: response.status,
      result: payload.result ?? null,
    };
  }

  const errorPayload =
    isRecord(payload) && Object.hasOwn(payload, "errors")
      ? payload.errors
      : payload;
  throw new Error(
    `Cloudflare Pages API request failed (${response.status}): ${JSON.stringify(
      errorPayload,
    )}`,
  );
}

function resolveGitHubRepoIdentity(
  repoSlug: GitHubRepoSlug,
): GitHubRepoIdentity {
  const payload = execFileSync(
    "gh",
    ["api", `repos/${repoSlug.owner}/${repoSlug.repo}`],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  const parsed: unknown = JSON.parse(payload);
  if (!isRecord(parsed) || !isRecord(parsed.owner)) {
    throw new Error(
      `Could not resolve GitHub repository ids for ${repoSlug.owner}/${repoSlug.repo}.`,
    );
  }

  const repoId = readNumber(parsed, "id");
  const ownerId = readNumber(parsed.owner, "id");
  if (repoId === null || ownerId === null) {
    throw new Error(
      `Could not resolve GitHub repository ids for ${repoSlug.owner}/${repoSlug.repo}.`,
    );
  }

  return {
    id: String(repoId),
    ownerId: String(ownerId),
    owner: repoSlug.owner,
    repo: repoSlug.repo,
  };
}

export function buildCloudflarePagesProjectPayload(
  repoIdentity: GitHubRepoIdentity,
  app: CloudflarePagesAppConfig,
): CloudflarePagesProjectPayload {
  const sourceConfig: CloudflarePagesSourceConfig = {
    owner: repoIdentity.owner,
    owner_id: repoIdentity.ownerId,
    repo_name: repoIdentity.repo,
    repo_id: repoIdentity.id,
    production_branch: app.productionBranch,
    production_deployments_enabled: true,
    preview_deployment_setting: app.previewDeploymentSetting,
    pr_comments_enabled: app.prCommentsEnabled,
    path_includes: app.pathIncludes,
  };

  if (Array.isArray(app.pathExcludes) && app.pathExcludes.length > 0) {
    sourceConfig.path_excludes = app.pathExcludes;
  }
  if (
    app.previewDeploymentSetting === "custom" &&
    Array.isArray(app.previewBranchIncludes) &&
    app.previewBranchIncludes.length > 0
  ) {
    sourceConfig.preview_branch_includes = app.previewBranchIncludes;
  }
  if (
    app.previewDeploymentSetting === "custom" &&
    Array.isArray(app.previewBranchExcludes) &&
    app.previewBranchExcludes.length > 0
  ) {
    sourceConfig.preview_branch_excludes = app.previewBranchExcludes;
  }

  return {
    name: app.projectName,
    production_branch: app.productionBranch,
    build_config: {
      build_command: buildCloudflarePagesAppBuildCommand(app),
      root_dir: app.rootDir,
      destination_dir: app.destinationDir,
    },
    deployment_configs: {
      production: {
        env_vars: buildManagedPagesEnvVars({
          deployKey: readRequiredEnv(app.productionDeployKeyEnvVar),
          siteUrl: app.productionSiteUrlEnvVar
            ? process.env[app.productionSiteUrlEnvVar]
            : undefined,
        }),
      },
      preview: {
        env_vars: buildManagedPagesEnvVars({
          deployKey: readRequiredEnv(app.previewDeployKeyEnvVar),
        }),
      },
    },
    source: {
      type: "github",
      config: sourceConfig,
    },
  };
}

function redactManagedPagesEnvVars(
  envVars: CloudflarePagesEnvVars,
): CloudflarePagesEnvVars {
  const redacted: CloudflarePagesEnvVars = {};
  for (const [name, envVar] of Object.entries(envVars)) {
    redacted[name] =
      envVar.type === "secret_text"
        ? { ...envVar, value: "<redacted>" }
        : { ...envVar };
  }
  return redacted;
}

export function redactCloudflarePagesProjectPayload(
  payload: CloudflarePagesProjectPayload,
): CloudflarePagesProjectPayload {
  return {
    ...payload,
    build_config: { ...payload.build_config },
    deployment_configs: {
      production: {
        env_vars: redactManagedPagesEnvVars(
          payload.deployment_configs.production.env_vars,
        ),
      },
      preview: {
        env_vars: redactManagedPagesEnvVars(
          payload.deployment_configs.preview.env_vars,
        ),
      },
    },
    source: {
      ...payload.source,
      config: { ...payload.source.config },
    },
  };
}

function isMainModule(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

async function main(): Promise<void> {
  const args = parseCloudflarePagesSyncArgs(process.argv.slice(2));
  const remoteUrl = execFileSync("git", ["remote", "get-url", "origin"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const repoSlug = parseGitHubRepoSlugFromRemoteUrl(remoteUrl);
  if (!repoSlug) {
    throw new Error(
      `Could not parse a GitHub owner/repo from ${JSON.stringify(remoteUrl.trim())}.`,
    );
  }

  const repoIdentity = resolveGitHubRepoIdentity(repoSlug);
  const targetApps =
    args.appIds === null
      ? cloudflarePagesApps
      : args.appIds.map((appId) => getCloudflarePagesApp(appId));
  const accountId = args.dryRun
    ? null
    : readRequiredEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = args.dryRun ? null : readRequiredEnv("CLOUDFLARE_API_TOKEN");

  for (const app of targetApps) {
    const payload = buildCloudflarePagesProjectPayload(repoIdentity, app);
    if (args.dryRun) {
      console.log(
        JSON.stringify(
          {
            projectName: app.projectName,
            operation: "sync",
            payload: redactCloudflarePagesProjectPayload(payload),
          },
          null,
          2,
        ),
      );
      continue;
    }
    if (accountId === null || apiToken === null) {
      throw new Error("Missing Cloudflare credentials for apply mode.");
    }

    const existing = await callCloudflarePagesApi({
      token: apiToken,
      accountId,
      method: "GET",
      path: `/${encodeURIComponent(app.projectName)}`,
    });

    if (existing.status === 404) {
      await callCloudflarePagesApi({
        token: apiToken,
        accountId,
        method: "POST",
        path: "",
        body: payload,
      });
      console.log(`Created Cloudflare Pages project ${app.projectName}.`);
      continue;
    }

    await callCloudflarePagesApi({
      token: apiToken,
      accountId,
      method: "PATCH",
      path: `/${encodeURIComponent(app.projectName)}`,
      body: payload,
    });
    console.log(`Updated Cloudflare Pages project ${app.projectName}.`);
  }
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Cloudflare Pages sync failed.",
    );
    process.exit(1);
  });
}
