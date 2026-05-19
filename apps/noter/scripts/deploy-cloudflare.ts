import { spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { buildPrPreviewMetadata } from "./pr-preview-metadata.ts";

const modes = {
  deploy: ["deploy"],
  preview: ["versions", "upload"],
} as const;

type Mode = keyof typeof modes;

function isMode(value: string | undefined): value is Mode {
  return value === "deploy" || value === "preview";
}

function isReservedWranglerFlag(value: string) {
  return value === "--name" || value.startsWith("--name=") || value === "-n";
}

function hasWranglerFlag(args: readonly string[], flag: string) {
  return args.some((value) => value === flag || value.startsWith(`${flag}=`));
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

  const metadata = buildPrPreviewMetadata({
    branch,
    workerName: args.workerName,
  });

  if (!hasWranglerFlag(args.extraArgs, "--tag")) {
    wranglerArgs.push("--tag", metadata.tag);
  }
  if (!hasWranglerFlag(args.extraArgs, "--message")) {
    wranglerArgs.push("--message", metadata.message);
  }
  if (
    metadata.previewAlias &&
    !hasWranglerFlag(args.extraArgs, "--preview-alias")
  ) {
    wranglerArgs.push("--preview-alias", metadata.previewAlias);
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
