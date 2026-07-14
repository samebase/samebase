#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

type BootstrapOptions = {
  anonMode: boolean;
  enableBranch: boolean;
};

type InstallOptions = {
  anonMode: boolean;
  currentHash: string;
  workspaceDir: string;
};

const HELP_TEXT = `Usage: scripts/bootstrap-worktree.ts [--anon] [--no-branch]

Options:
  --anon       Run dependency install with CONVEX_AGENT_MODE=anonymous.
  --no-branch  Disable detached-HEAD auto-branch creation.
  -h, --help   Show this help message.`;

const FIRST_WORDS = [
  "amber",
  "brisk",
  "calm",
  "daring",
  "ember",
  "frozen",
  "gentle",
  "hidden",
  "iron",
  "jade",
  "keen",
  "lucid",
  "mellow",
  "nimble",
  "open",
  "polar",
  "quick",
  "royal",
  "solar",
  "tidal",
  "urban",
  "vivid",
  "wild",
  "young",
];

const SECOND_WORDS = [
  "anchor",
  "beacon",
  "canyon",
  "delta",
  "ember",
  "forest",
  "harbor",
  "island",
  "jungle",
  "lagoon",
  "meadow",
  "nectar",
  "oak",
  "pebble",
  "quartz",
  "river",
  "summit",
  "thicket",
  "valley",
  "willow",
  "zenith",
];

const THIRD_WORDS = [
  "arc",
  "bloom",
  "crest",
  "drift",
  "echo",
  "flare",
  "glint",
  "harbor",
  "jetline",
  "knot",
  "line",
  "mist",
  "nova",
  "orbit",
  "pulse",
  "ridge",
  "spark",
  "trail",
  "union",
  "veil",
  "wave",
  "yarn",
  "zone",
];

const options = parseArgs(process.argv.slice(2));
const workspaceDir = process.env.WORKSPACE_DIR ?? process.cwd();

process.chdir(workspaceDir);

if (options.enableBranch) {
  createBranchIfDetached();
}

configureCacheRoot();
const currentHash = computeInstallHash(workspaceDir);
installDependenciesIfNeeded({
  anonMode: options.anonMode,
  currentHash,
  workspaceDir,
});

function parseArgs(args: string[]): BootstrapOptions {
  const result: BootstrapOptions = {
    anonMode: false,
    enableBranch: true,
  };

  for (const arg of args) {
    if (arg === "--anon") {
      result.anonMode = true;
      continue;
    }
    if (arg === "--no-branch") {
      result.enableBranch = false;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(HELP_TEXT);
      process.exit(0);
    }

    console.error(`Unknown argument: ${arg}`);
    console.error(HELP_TEXT);
    process.exit(1);
  }

  return result;
}

function createBranchIfDetached(): void {
  if (!isGitRepo()) {
    return;
  }

  const currentBranch = getCurrentBranch();
  if (currentBranch.length > 0) {
    return;
  }

  const reusableBranch = switchToExistingDetachedHeadBranch();
  if (reusableBranch.length > 0) {
    console.log(`Switched to existing branch: ${reusableBranch}`);
    return;
  }

  const candidate = pickAvailableBranchName();
  const createResult = spawnSync("git", ["switch", "-c", candidate], {
    stdio: "ignore",
  });

  if (createResult.status === 0) {
    console.log(`Created branch: ${candidate}`);
  } else {
    console.log("Could not create branch (leaving HEAD detached).");
  }
}

function isGitRepo(): boolean {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function getCurrentBranch(): string {
  const result = spawnSync("git", ["symbolic-ref", "-q", "--short", "HEAD"], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return "";
  }

  return result.stdout.trim();
}

function switchToExistingDetachedHeadBranch(): string {
  const localCandidates = preferredBranchOrder(listLocalBranchesPointingAtHead());

  for (const branchName of localCandidates) {
    const switchResult = spawnSync("git", ["switch", branchName], {
      stdio: "ignore",
    });
    if (switchResult.status === 0) {
      return branchName;
    }
  }

  const remoteCandidates = listRemoteCodexBranchesPointingAtHead();
  for (const remoteBranch of remoteCandidates) {
    const localBranch = remoteBranch.replace(/^origin\//, "");
    if (localBranch.length === 0 || branchExists(localBranch)) {
      continue;
    }

    const switchResult = spawnSync("git", ["switch", "--track", "-c", localBranch, remoteBranch], {
      stdio: "ignore",
    });

    if (switchResult.status === 0) {
      return localBranch;
    }
  }

  return "";
}

function listLocalBranchesPointingAtHead(): string[] {
  return readBranchLines([
    "for-each-ref",
    "--points-at",
    "HEAD",
    "--format=%(refname:short)",
    "refs/heads",
  ]);
}

function listRemoteCodexBranchesPointingAtHead(): string[] {
  return readBranchLines([
    "for-each-ref",
    "--points-at",
    "HEAD",
    "--format=%(refname:short)",
    "refs/remotes/origin/codex",
  ]);
}

function preferredBranchOrder(branchNames: string[]): string[] {
  return [...branchNames].sort((left, right) => {
    const leftPriority = branchPriority(left);
    const rightPriority = branchPriority(right);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return left.localeCompare(right);
  });
}

function branchPriority(branchName: string): number {
  if (branchName.startsWith("codex/")) {
    return 0;
  }
  if (branchName === "main") {
    return 2;
  }
  return 1;
}

function readBranchLines(args: string[]): string[] {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function pickAvailableBranchName(): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateThreeWordBranch();
    if (!branchExists(candidate)) {
      return candidate;
    }
  }

  const fallbackBase = `codex/auto-${timestampForBranch()}`;
  if (!branchExists(fallbackBase)) {
    return fallbackBase;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = Math.floor(Math.random() * 90_000) + 10_000;
    const candidate = `${fallbackBase}-${suffix}`;
    if (!branchExists(candidate)) {
      return candidate;
    }
  }

  return `${fallbackBase}-${Date.now()}`;
}

function generateThreeWordBranch(): string {
  return `codex/${pickRandom(FIRST_WORDS)}-${pickRandom(SECOND_WORDS)}-${pickRandom(THIRD_WORDS)}`;
}

function pickRandom(words: readonly string[]): string {
  if (words.length === 0) {
    throw new Error("Cannot pick from an empty list.");
  }
  const index = Math.floor(Math.random() * words.length);
  return words[index];
}

function branchExists(branchName: string): boolean {
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function timestampForBranch(): string {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function configureCacheRoot(): void {
  const vscodeDir = "/vscode";
  if (!existsSync(vscodeDir)) {
    return;
  }

  try {
    accessSync(vscodeDir, constants.W_OK);
  } catch {
    return;
  }

  const cacheRoot = "/vscode/samebase-cache";
  mkdirSync(cacheRoot, { recursive: true });

  process.env.PNPM_HOME = process.env.PNPM_HOME ?? path.join(cacheRoot, "pnpm-home");
  process.env.PNPM_STORE_DIR = process.env.PNPM_STORE_DIR ?? path.join(cacheRoot, "pnpm-store");
  process.env.PATH = `${process.env.PNPM_HOME}:${process.env.PATH ?? ""}`;
}

function computeInstallHash(workspace: string): string {
  const hashInputs: string[] = [];
  // Bootstrap must use only Node built-ins because it installs workspace dependencies.
  const rootFiles = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"];

  for (const file of rootFiles) {
    if (existsSync(path.join(workspace, file))) {
      hashInputs.push(file);
    }
  }

  for (const workspacePackageDir of ["apps", "packages"]) {
    if (existsSync(path.join(workspace, workspacePackageDir))) {
      collectPackageJsonFiles(workspacePackageDir, 0, hashInputs);
    }
  }

  hashInputs.sort((left, right) => left.localeCompare(right));
  if (hashInputs.length === 0) {
    return "";
  }

  const hash = createHash("sha256");
  for (const relativeFile of hashInputs) {
    const absoluteFile = path.join(workspace, relativeFile);
    hash.update(`${relativeFile}\n`);
    hash.update(readFileSync(absoluteFile));
  }
  return hash.digest("hex");
}

function collectPackageJsonFiles(relativeDir: string, depth: number, output: string[]): void {
  if (depth > 3) {
    return;
  }

  const absoluteDir = path.resolve(relativeDir);
  const entries = readdirSync(absoluteDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryRelativePath = path.join(relativeDir, entry.name);
    if (entry.isFile() && entry.name === "package.json") {
      output.push(entryRelativePath.split(path.sep).join("/"));
      continue;
    }

    if (entry.isDirectory()) {
      collectPackageJsonFiles(entryRelativePath, depth + 1, output);
    }
  }
}

function installDependenciesIfNeeded({
  anonMode,
  currentHash,
  workspaceDir: workspace,
}: InstallOptions): void {
  const nodeModulesDir = path.join(workspace, "node_modules");
  const hashFile = path.join(nodeModulesDir, ".samebase-pnpm-install.hash");
  const previousHash = existsSync(hashFile) ? readFileSync(hashFile, "utf8").trim() : "";
  const pnpmModulesFile = path.join(nodeModulesDir, ".modules.yaml");
  const shouldInstall =
    !existsSync(pnpmModulesFile) || currentHash.length === 0 || currentHash !== previousHash;

  if (!shouldInstall) {
    console.log("Dependencies unchanged; skipping pnpm install.");
    return;
  }

  console.log("Installing dependencies with pnpm...");
  const env = {
    ...process.env,
    ...(anonMode ? { CONVEX_AGENT_MODE: "anonymous" } : {}),
  };

  const installResult = spawnSync("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], {
    stdio: "inherit",
    env,
  });

  if (installResult.status !== 0) {
    process.exit(installResult.status ?? 1);
  }

  if (currentHash.length > 0) {
    mkdirSync(path.dirname(hashFile), { recursive: true });
    writeFileSync(hashFile, `${currentHash}\n`, "utf8");
  }
}
