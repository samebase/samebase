import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import process from "node:process";
import { pathToFileURL } from "node:url";

const modes = {
  deploy: ["deploy"],
  preview: ["versions", "upload"],
} as const;

type Mode = keyof typeof modes;

const PR_PREVIEW_TAG_PREFIX = "noter-pr-preview";
const PR_PREVIEW_HASH_LENGTH = 12;
const MAX_DNS_LABEL_LENGTH = 63;

function isMode(value: string | undefined): value is Mode {
  return value === "deploy" || value === "preview";
}

function isReservedWranglerFlag(value: string) {
  return value === "--name" || value.startsWith("--name=") || value === "-n";
}

function hasWranglerFlag(args: readonly string[], flag: string) {
  return args.some((value) => value === flag || value.startsWith(`${flag}=`));
}

function hashBranch(branch: string): string {
  return createHash("sha256")
    .update(branch)
    .digest("hex")
    .slice(0, PR_PREVIEW_HASH_LENGTH);
}

function sanitizeBranchForAlias(branch: string): string {
  const sanitized = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!sanitized) {
    return "pr";
  }

  return /^[a-z]/.test(sanitized) ? sanitized : `pr-${sanitized}`;
}

function trimAliasPrefix(prefix: string, maxLength: number): string {
  const trimmed = prefix.slice(0, maxLength).replace(/-+$/g, "");
  if (!trimmed) {
    return "pr";
  }

  return /^[a-z]/.test(trimmed) ? trimmed : `pr-${trimmed}`;
}

function buildPrPreviewAlias(args: {
  branch: string;
  hash: string;
  workerName: string;
}): string | null {
  const maxAliasLength = MAX_DNS_LABEL_LENGTH - args.workerName.length - 1;
  if (maxAliasLength < PR_PREVIEW_HASH_LENGTH + 3) {
    return null;
  }

  const suffix = `-${args.hash}`;
  const rawAlias = `${sanitizeBranchForAlias(args.branch)}${suffix}`;
  if (rawAlias.length <= maxAliasLength) {
    return rawAlias;
  }

  const prefixLength = maxAliasLength - suffix.length;
  return `${trimAliasPrefix(rawAlias, prefixLength)}${suffix}`;
}

function readWorkerName(env: NodeJS.ProcessEnv) {
  const workerName =
    env.WRANGLER_CI_OVERRIDE_NAME ?? env.CLOUDFLARE_WORKER_NAME;

  if (!workerName) {
    throw new Error(`Set CLOUDFLARE_WORKER_NAME for local deploys.
Workers Builds can pass the connected Worker name through WRANGLER_CI_OVERRIDE_NAME.`);
  }

  if (!/^[a-zA-Z0-9-]+$/.test(workerName)) {
    throw new Error(
      "Cloudflare Worker names can only contain letters, numbers, and dashes.",
    );
  }

  return workerName;
}

function run(command: string, args: readonly string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(" ")} exited with ${signal}`));
        return;
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

export function buildWranglerArgs(args: {
  mode: Mode;
  workerName: string;
  extraArgs: readonly string[];
  env: NodeJS.ProcessEnv;
}): readonly string[] {
  const wranglerArgs = [...modes[args.mode], "--name", args.workerName];
  if (args.mode !== "preview") {
    return [...wranglerArgs, ...args.extraArgs];
  }

  const branch = args.env.WORKERS_CI_BRANCH;
  if (!branch) {
    return [...wranglerArgs, ...args.extraArgs];
  }

  const cleanBranch = branch.trim();
  if (!cleanBranch) {
    return [...wranglerArgs, ...args.extraArgs];
  }

  const hash = hashBranch(cleanBranch);
  const tag = `${PR_PREVIEW_TAG_PREFIX}:${hash}`;
  const message = `noter.md PR preview for ${cleanBranch}`;
  const previewAlias = buildPrPreviewAlias({
    branch: cleanBranch,
    hash,
    workerName: args.workerName,
  });

  if (!hasWranglerFlag(args.extraArgs, "--tag")) {
    wranglerArgs.push("--tag", tag);
  }
  if (!hasWranglerFlag(args.extraArgs, "--message")) {
    wranglerArgs.push("--message", message);
  }
  if (previewAlias && !hasWranglerFlag(args.extraArgs, "--preview-alias")) {
    wranglerArgs.push("--preview-alias", previewAlias);
  }

  return [...wranglerArgs, ...args.extraArgs];
}

export async function main(env: NodeJS.ProcessEnv = process.env) {
  const [modeArg, ...extraArgs] = process.argv.slice(2);
  if (!isMode(modeArg)) {
    throw new Error(
      "Usage: pnpm run deploy[:preview][:dry-run] -- [wrangler flags]",
    );
  }

  if (extraArgs.some(isReservedWranglerFlag)) {
    throw new Error(
      "Do not pass Wrangler --name/-n manually; set CLOUDFLARE_WORKER_NAME or let Workers Builds provide WRANGLER_CI_OVERRIDE_NAME.",
    );
  }

  const workerName = readWorkerName(env);
  const isWorkersBuild = env.WORKERS_CI === "1" || env.WORKERS_CI === "true";
  const isDryRun = extraArgs.includes("--dry-run");

  if (!isWorkersBuild) {
    await run("pnpm", ["run", isDryRun ? "build:app" : "build:cloudflare"]);
  }

  await run(
    "wrangler",
    buildWranglerArgs({
      mode: modeArg,
      workerName,
      extraArgs,
      env,
    }),
  );
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await main();
}
