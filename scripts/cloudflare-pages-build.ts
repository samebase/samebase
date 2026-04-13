#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { getCloudflarePagesApp } from "./cloudflare-pages-apps.ts";

const NPX_COMMAND = process.platform === "win32" ? "npx.cmd" : "npx";

type CloudflarePagesSiteUrlArgs = {
  cloudflarePagesUrl?: string;
  convexSiteUrl?: string;
  viteConvexSiteUrl?: string;
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
  const candidates = [
    args.convexSiteUrl,
    args.viteConvexSiteUrl,
    args.cloudflarePagesUrl,
  ];

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

function runShellCommand(
  command: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      env,
      shell: true,
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
  await runShellCommand(
    `${NPX_COMMAND} convex env set --deployment ${JSON.stringify(
      args.deploymentName,
    )} ${JSON.stringify(args.envName)} ${JSON.stringify(args.value)}`,
    process.env,
  );
}

function isMainModule(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

async function main(): Promise<void> {
  const appId = process.argv[2];
  if (typeof appId !== "string" || appId.trim().length === 0) {
    throw new Error(
      "Expected a Cloudflare Pages app id as the first argument.",
    );
  }

  const app = getCloudflarePagesApp(appId.trim());
  let buildEnv = process.env;

  if (
    Array.isArray(app.syncSiteUrlToDeploymentEnvNames) &&
    app.syncSiteUrlToDeploymentEnvNames.length > 0
  ) {
    const siteUrl = resolveCloudflarePagesSiteUrl({
      cloudflarePagesUrl: process.env.CF_PAGES_URL,
      convexSiteUrl: process.env.CONVEX_SITE_URL,
      viteConvexSiteUrl: process.env.VITE_CONVEX_SITE_URL,
    });
    if (!siteUrl) {
      throw new Error(
        `Missing a valid Cloudflare Pages site URL for ${app.id}. Set CONVEX_SITE_URL for production or rely on CF_PAGES_URL for previews.`,
      );
    }

    const convexUrl =
      process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL ?? null;
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

    for (const envName of app.syncSiteUrlToDeploymentEnvNames) {
      await syncConvexDeploymentEnvVar({
        deploymentName,
        envName,
        value: siteUrl,
      });
    }

    if (typeof app.buildSiteUrlEnvVarName === "string") {
      buildEnv = buildCloudflarePagesBuildEnvironment(
        buildEnv,
        app.buildSiteUrlEnvVarName,
        siteUrl,
      );
    }
  }

  await runShellCommand(app.frontendBuildCommand, buildEnv);
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Cloudflare Pages build failed.",
    );
    process.exit(1);
  });
}
