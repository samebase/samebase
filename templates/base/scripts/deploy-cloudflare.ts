// Samebase source build: v2002
/// <reference types="node" />
import { spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

function isWorkerTargetFlag(value: string) {
  return value === "--worker-name" || value.startsWith("--worker-name=");
}

function isProductionWorkerNameFlag(value: string) {
  return value === "--name" || value.startsWith("--name=") || value === "-n";
}

function isDryRunFlag(value: string) {
  return value === "--dry-run" || value === "--dry-run=true";
}

function readWorkerName(env: NodeJS.ProcessEnv) {
  const workerName = env["WRANGLER_CI_OVERRIDE_NAME"] ?? env["CLOUDFLARE_WORKER_NAME"];

  if (!workerName) {
    throw new Error(
      [
        "Missing Cloudflare Worker name.",
        "Workers Builds provides WRANGLER_CI_OVERRIDE_NAME automatically.",
        "For local deploy checks, set CLOUDFLARE_WORKER_NAME.",
      ].join("\n"),
    );
  }

  if (!/^[a-zA-Z0-9-]+$/.test(workerName)) {
    throw new Error("Cloudflare Worker names can only contain letters, numbers, and dashes.");
  }

  return workerName;
}

function run(command: string, args: readonly string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(" ")} exited with signal ${signal}`));
        return;
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? 1}`));
    });
  });
}

type CloudflareDeployPlan = {
  buildArgs: readonly string[] | null;
  wranglerArgs: readonly string[];
};

export function selectCloudflareDeployPlan(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): CloudflareDeployPlan {
  const [modeArg, ...extraArgs] = args;

  if (modeArg !== "deploy" && modeArg !== "preview" && modeArg !== "worker-preview") {
    throw new Error(
      "Usage: node ./scripts/deploy-cloudflare.ts <deploy|preview|worker-preview> [wrangler flags]",
    );
  }

  if (
    extraArgs.some(isWorkerTargetFlag) ||
    (modeArg !== "worker-preview" && extraArgs.some(isProductionWorkerNameFlag))
  ) {
    throw new Error(
      "Do not pass the Wrangler Worker target manually. Set CLOUDFLARE_WORKER_NAME or let Workers Builds provide WRANGLER_CI_OVERRIDE_NAME.",
    );
  }

  if (extraArgs.includes("--")) {
    throw new Error(
      "Do not pass a standalone -- to Wrangler. Pass Wrangler flags directly after the deploy command.",
    );
  }

  if (modeArg === "worker-preview" && extraArgs.some(isDryRunFlag)) {
    throw new Error(
      "Wrangler Preview does not support --dry-run. Use the production deploy dry-run to validate the Worker package without publishing.",
    );
  }

  const workerName = readWorkerName(env);
  const isWorkersBuild = env["WORKERS_CI"] === "1" || env["WORKERS_CI"] === "true";
  const isDryRun = extraArgs.some(isDryRunFlag);

  return {
    buildArgs: isWorkersBuild ? null : ["run", isDryRun ? "build:app" : "build:cloudflare"],
    wranglerArgs:
      modeArg === "deploy"
        ? ["deploy", "--name", workerName, ...extraArgs]
        : modeArg === "preview"
          ? ["versions", "upload", "--name", workerName, ...extraArgs]
          : ["preview", "--worker-name", workerName, ...extraArgs],
  };
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
) {
  const plan = selectCloudflareDeployPlan(args, env);

  if (plan.buildArgs) {
    await run("vp", plan.buildArgs);
  }

  await run("wrangler", plan.wranglerArgs);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await main();
}
