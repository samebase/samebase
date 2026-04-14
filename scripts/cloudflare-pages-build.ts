#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const NPX_COMMAND = process.platform === "win32" ? "npx.cmd" : "npx";
const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const INNER_BUILD_FLAG = "--inner-build";
const PREVIEW_SEED_FUNCTION = "devAuth:seedPasswordAccount";
const CONVEX_DEPLOY_URL_ENV_NAME = "VITE_CONVEX_URL";
const BUILD_SITE_URL_ENV_NAME = "VITE_CONVEX_SITE_URL";
const DEPLOYMENT_SITE_URL_ENV_NAMES = ["SITE_URL", "CONVEX_SITE_URL"] as const;

type CommandSpec = {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
};

type CloudflarePagesSiteUrlArgs = {
  cloudflarePagesUrl?: string;
  convexSiteUrl?: string;
};

type SyncConvexDeploymentEnvVarArgs = {
  deploymentName: string;
  envName: string;
  value: string;
};

/**
 * Cloudflare Pages preview deployments have a deployment-local URL available at
 * build time. Prefer an explicit production URL when one is configured, but
 * otherwise fall back to the current Pages deployment URL so preview backends
 * get a live callback origin automatically.
 */
export function resolveCloudflarePagesSiteUrl(
  args: CloudflarePagesSiteUrlArgs,
): string | null {
  const candidates = [args.convexSiteUrl, args.cloudflarePagesUrl];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const trimmed = candidate.trim();
    if (trimmed.length === 0) {
      continue;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        continue;
      }
      return parsed.toString();
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * `npx convex deploy --cmd` exposes the selected deployment URL to the wrapped
 * build command. Deriving the deployment name from that URL keeps the later
 * `convex env set --deployment ...` calls pointed at the exact production or
 * preview deployment that the current Pages build is about to publish.
 */
export function inferConvexDeploymentName(convexUrl: string): string | null {
  try {
    const parsed = new URL(convexUrl);
    const [deploymentName] = parsed.hostname.split(".");
    return deploymentName && deploymentName.length > 0 ? deploymentName : null;
  } catch {
    return null;
  }
}

export function buildCloudflarePagesBuildEnvironment(
  env: NodeJS.ProcessEnv,
  envVarName: string,
  value: string,
): NodeJS.ProcessEnv {
  return {
    ...env,
    [envVarName]: value,
  };
}

/**
 * Convex runs the command from `--cmd` in a shell. Quote the node executable
 * and this script path so the same wrapper can recurse into its "inner" build
 * phase without depending on the current working directory.
 */
export function buildInnerBuildCommand(
  scriptPath: string,
  nodePath = process.execPath,
): string {
  return `${JSON.stringify(nodePath)} ${JSON.stringify(scriptPath)} ${INNER_BUILD_FLAG}`;
}

/**
 * A single Cloudflare Pages build should:
 * 1. deploy Convex with the production or preview key already in the env,
 * 2. seed preview deployments when Convex creates a fresh preview database,
 * 3. re-enter this script with VITE_CONVEX_URL set for the actual frontend build.
 */
export function buildConvexDeployArgs(scriptPath: string): string[] {
  return [
    "convex",
    "deploy",
    "--preview-run",
    PREVIEW_SEED_FUNCTION,
    "--cmd-url-env-var-name",
    CONVEX_DEPLOY_URL_ENV_NAME,
    "--cmd",
    buildInnerBuildCommand(scriptPath),
  ];
}

function runCommand(spec: CommandSpec): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      env: spec.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

async function syncConvexDeploymentEnvVar(
  args: SyncConvexDeploymentEnvVarArgs,
): Promise<void> {
  await runCommand({
    command: NPX_COMMAND,
    args: [
      "convex",
      "env",
      "set",
      "--deployment",
      args.deploymentName,
      args.envName,
      args.value,
    ],
    env: process.env,
  });
}

function isMainModule(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

async function runInnerBuild(): Promise<void> {
  const siteUrl = resolveCloudflarePagesSiteUrl({
    cloudflarePagesUrl: process.env.CF_PAGES_URL,
    convexSiteUrl: process.env.CONVEX_SITE_URL,
  });
  if (!siteUrl) {
    throw new Error(
      "Missing a valid Cloudflare Pages site URL. Set CONVEX_SITE_URL for production or rely on CF_PAGES_URL for previews.",
    );
  }

  const convexUrl =
    process.env[CONVEX_DEPLOY_URL_ENV_NAME] ?? process.env.CONVEX_URL ?? null;
  if (!convexUrl) {
    throw new Error(
      "Missing VITE_CONVEX_URL/CONVEX_URL from the Convex deploy wrapper.",
    );
  }

  const deploymentName = inferConvexDeploymentName(convexUrl);
  if (!deploymentName) {
    throw new Error(
      `Could not infer the Convex deployment name from ${JSON.stringify(
        convexUrl,
      )}.`,
    );
  }

  for (const envName of DEPLOYMENT_SITE_URL_ENV_NAMES) {
    await syncConvexDeploymentEnvVar({
      deploymentName,
      envName,
      value: siteUrl,
    });
  }

  const buildEnv = buildCloudflarePagesBuildEnvironment(
    process.env,
    BUILD_SITE_URL_ENV_NAME,
    siteUrl,
  );
  await runCommand({
    command: PNPM_COMMAND,
    args: ["run", "build:ci"],
    env: buildEnv,
  });
}

async function runOuterBuild(scriptPath: string): Promise<void> {
  await runCommand({
    command: NPX_COMMAND,
    args: buildConvexDeployArgs(scriptPath),
    env: process.env,
  });
}

async function main(): Promise<void> {
  const scriptPath = fileURLToPath(import.meta.url);
  if (process.argv.includes(INNER_BUILD_FLAG)) {
    await runInnerBuild();
    return;
  }
  await runOuterBuild(scriptPath);
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Cloudflare Pages build failed.",
    );
    process.exit(1);
  });
}
