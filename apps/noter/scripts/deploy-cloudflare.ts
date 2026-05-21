import { spawn } from "node:child_process";
import process from "node:process";

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

function readWorkerName() {
  const workerName = process.env.WRANGLER_CI_OVERRIDE_NAME ?? process.env.CLOUDFLARE_WORKER_NAME;

  if (!workerName) {
    throw new Error(`Set CLOUDFLARE_WORKER_NAME for local deploys.
Workers Builds can pass the connected Worker name through WRANGLER_CI_OVERRIDE_NAME.`);
  }

  if (!/^[a-zA-Z0-9-]+$/.test(workerName)) {
    throw new Error("Cloudflare Worker names can only contain letters, numbers, and dashes.");
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

const [modeArg, ...extraArgs] = process.argv.slice(2);
if (!isMode(modeArg)) {
  throw new Error("Usage: pnpm run deploy[:preview][:dry-run] -- [wrangler flags]");
}

if (extraArgs.some(isReservedWranglerFlag)) {
  throw new Error(
    "Do not pass Wrangler --name/-n manually; set CLOUDFLARE_WORKER_NAME or let Workers Builds provide WRANGLER_CI_OVERRIDE_NAME.",
  );
}

const workerName = readWorkerName();
const isWorkersBuild = process.env.WORKERS_CI === "1" || process.env.WORKERS_CI === "true";
const isDryRun = extraArgs.includes("--dry-run");

if (!isWorkersBuild) {
  await run("pnpm", ["run", isDryRun ? "build:app" : "build:cloudflare"]);
}

await run("wrangler", [...modes[modeArg], "--name", workerName, ...extraArgs]);
