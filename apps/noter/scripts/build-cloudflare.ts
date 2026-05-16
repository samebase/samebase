import { spawn } from "node:child_process";
import process from "node:process";

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

const branch = process.env.WORKERS_CI_BRANCH;

if (!process.env.CONVEX_DEPLOY_KEY) {
  if (process.env.WORKERS_CI) {
    throw new Error(
      "Set CONVEX_DEPLOY_KEY in Cloudflare Workers build variables.",
    );
  }

  console.warn(
    "CONVEX_DEPLOY_KEY is not set; building static assets without deploying Convex.",
  );
  await run("pnpm", ["run", "build:app"]);
} else if (branch && branch !== "main") {
  await run("pnpm", [
    "exec",
    "convex",
    "deploy",
    "--preview-create",
    branch,
    "--preview-run",
    "devAuth:seedPasswordAccount",
    "--cmd",
    "pnpm run build:ci",
  ]);
} else {
  await run("pnpm", ["exec", "convex", "deploy", "--cmd", "pnpm run build:ci"]);
}
