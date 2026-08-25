/// <reference types="node" />
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const vitePlusEntrypoint = fileURLToPath(import.meta.resolve("vite-plus/bin"));

export function resolveWorktreeKind(cwd = process.cwd()) {
  const result = spawnSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"],
    {
      cwd,
      encoding: "utf8",
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error("Run the development command from inside a Git checkout.");
  }

  const [gitDir, gitCommonDir] = result.stdout.trim().split(/\r?\n/);
  if (!gitDir || !gitCommonDir) {
    throw new Error("Git did not return enough metadata to select a development mode.");
  }

  return gitDir === gitCommonDir ? "main" : "linked";
}

export function runDev() {
  if (resolveWorktreeKind() === "linked") {
    process.env["CONVEX_AGENT_MODE"] = "anonymous";
  }

  const child = spawn(
    process.execPath,
    [
      vitePlusEntrypoint,
      "exec",
      "convex",
      "dev",
      ...process.argv.slice(2),
      "--start",
      "node ./scripts/ensure-convex-auth.ts && vp run dev:frontend",
    ],
    {
      stdio: "inherit",
    },
  );

  child.on("error", (error) => {
    console.error(`Failed to start dev mode: ${error.message}`);
    process.exit(1);
  });

  child.on("close", (code) => {
    process.exit(code ?? 1);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDev();
}
