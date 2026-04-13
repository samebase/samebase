#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";
const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const workspaceDir = process.env.WORKSPACE_DIR ?? process.cwd();

await main();

async function main(): Promise<void> {
  process.chdir(workspaceDir);

  const cacheRoot = await resolveCacheRoot();
  if (cacheRoot) {
    const pnpmHome = process.env.PNPM_HOME ?? path.join(cacheRoot, "pnpm-home");
    const pnpmStoreDir =
      process.env.PNPM_STORE_DIR ?? path.join(cacheRoot, "pnpm-store");
    process.env.PNPM_HOME = pnpmHome;
    process.env.PNPM_STORE_DIR = pnpmStoreDir;
    process.env.PATH = `${pnpmHome}${path.delimiter}${process.env.PATH ?? ""}`;
  }

  const hashInputs = await collectHashInputs(workspaceDir);
  const currentHash = await computeHash(hashInputs);
  const hashFile = path.join(
    cacheRoot ?? path.join(workspaceDir, ".devcontainer"),
    "pnpm-install.hash",
  );
  const previousHash = await readOptionalFile(hashFile);

  const nodeModulesDir = path.join(workspaceDir, "node_modules");
  if (
    !(await pathExists(nodeModulesDir)) ||
    currentHash === null ||
    currentHash !== previousHash
  ) {
    // The template cache only stays valid when the workspace dependency graph matches.
    console.log("Installing dependencies with pnpm...");
    run(PNPM_COMMAND, ["install", "--frozen-lockfile", "--prefer-offline"]);
    if (currentHash !== null) {
      await mkdir(path.dirname(hashFile), { recursive: true });
      await writeFile(hashFile, currentHash, "utf8");
    }
  } else {
    console.log("Dependencies unchanged; skipping pnpm install.");
  }

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

async function resolveCacheRoot(): Promise<string | null> {
  const vscodeDir = "/vscode";
  if (!(await pathExists(vscodeDir, constants.W_OK))) {
    return null;
  }

  const cacheRoot = path.join(vscodeDir, "noter-cache");
  await mkdir(cacheRoot, { recursive: true });
  return cacheRoot;
}

async function collectHashInputs(rootDir: string): Promise<string[]> {
  const inputs: string[] = [];
  for (const fileName of [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ]) {
    const candidate = path.join(rootDir, fileName);
    if (await pathExists(candidate)) {
      inputs.push(candidate);
    }
  }

  const appsDir = path.join(rootDir, "apps");
  if (await pathExists(appsDir)) {
    inputs.push(...(await collectPackageJsonFiles(appsDir, 0)));
  }

  inputs.sort((left, right) => left.localeCompare(right));
  return inputs;
}

async function collectPackageJsonFiles(
  currentDir: string,
  depth: number,
): Promise<string[]> {
  if (depth > 2) {
    return [];
  }

  const entries = await readdir(currentDir, { withFileTypes: true });
  const packageJsonFiles: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      packageJsonFiles.push(
        ...(await collectPackageJsonFiles(entryPath, depth + 1)),
      );
      continue;
    }

    if (entry.isFile() && entry.name === "package.json") {
      packageJsonFiles.push(entryPath);
    }
  }

  return packageJsonFiles;
}

async function computeHash(filePaths: string[]): Promise<string | null> {
  if (filePaths.length === 0) {
    return null;
  }

  const hash = createHash("sha256");
  for (const filePath of filePaths) {
    hash.update(`${path.relative(workspaceDir, filePath)}\n`);
    hash.update(await readFile(filePath, "utf8"));
  }
  return hash.digest("hex");
}

function commandExists(command: string): boolean {
  const result = runStatus(command, ["--version"]);
  return result === 0;
}

function run(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): void {
  const status = runStatus(command, args, options);
  if (status !== 0) {
    process.exit(status ?? 1);
  }
}

function runStatus(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): number | null {
  const child = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: "inherit",
  });
  return child.status;
}

async function pathExists(
  targetPath: string,
  mode: number = constants.F_OK,
): Promise<boolean> {
  try {
    await access(targetPath, mode);
    return true;
  } catch {
    return false;
  }
}

async function readOptionalFile(filePath: string): Promise<string | null> {
  if (!(await pathExists(filePath))) {
    return null;
  }
  return (await readFile(filePath, "utf8")).trim();
}
