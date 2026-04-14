#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { normalizeEnvValue } from "../apps/noter/scripts/normalizeEnvValue.ts";

const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const PRODUCTION_BRANCH = "main";

type CloudflarePagesBuildMode = "production" | "preview";

function readCloudflarePagesBranch(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return normalizeEnvValue(env.CF_PAGES_BRANCH);
}

/**
 * Cloudflare Pages only gives us one build command for every environment, so
 * the repo-owned entrypoint needs to choose the correct Convex deploy mode.
 */
export function resolveCloudflarePagesBuildMode(
  env: NodeJS.ProcessEnv = process.env,
): {
  branch: string | undefined;
  mode: CloudflarePagesBuildMode;
} {
  const branch = readCloudflarePagesBranch(env);
  if (branch !== undefined && branch !== PRODUCTION_BRANCH) {
    return {
      branch,
      mode: "preview",
    };
  }
  return {
    branch,
    mode: "production",
  };
}

export function buildCloudflarePagesArgs(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const { branch, mode } = resolveCloudflarePagesBuildMode(env);
  const args = ["--dir", "apps/noter", "exec", "convex", "deploy"];
  if (mode === "preview") {
    args.push(
      "--preview-create",
      branch ?? PRODUCTION_BRANCH,
      "--preview-run",
      "devAuth:seedPasswordAccount",
    );
  }
  args.push("--cmd", "pnpm run build:ci");
  return args;
}

function isMainModule(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const { branch, mode } = resolveCloudflarePagesBuildMode(process.env);
  if (mode === "preview") {
    console.log(
      `Cloudflare Pages preview build for branch ${branch ?? PRODUCTION_BRANCH}`,
    );
  } else {
    console.log(
      `Cloudflare Pages production build${branch ? ` for branch ${branch}` : ""}`,
    );
  }

  const child = spawn(PNPM_COMMAND, buildCloudflarePagesArgs(process.env), {
    env: process.env,
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error(error.message);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}
