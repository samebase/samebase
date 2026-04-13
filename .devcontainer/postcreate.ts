#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";
const workspaceDir = process.env.WORKSPACE_DIR ?? process.cwd();

await main();

async function main(): Promise<void> {
  process.chdir(workspaceDir);

  // Keep the devcontainer bootstrap aligned with normal worktree setup rules.
  run(process.execPath, [
    path.join(workspaceDir, "scripts/bootstrap-worktree.ts"),
  ]);

  if (!commandExists("codex")) {
    console.log("Installing @openai/codex...");
    run(NPM_COMMAND, ["install", "-g", "@openai/codex"]);
  }

  const agentDir = path.join(workspaceDir, ".codespace-agent");
  const agentNodeModulesDir = path.join(agentDir, "node_modules");
  if (
    (await pathExists(agentDir)) &&
    !(await pathExists(agentNodeModulesDir))
  ) {
    console.log("Installing .codespace-agent dependencies...");
    run(NPM_COMMAND, ["install", "--no-package-lock"], { cwd: agentDir });
  }
}

function commandExists(command: string): boolean {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

function run(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): void {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
