#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
const HOME_DIR = process.env.HOME ?? "";
const HELP_HINT = "(run with --help for usage)";

type WorktreeEntry = {
  worktree: string;
  HEAD: string;
  branch?: string;
  detached: boolean;
  prunable: boolean;
  branchName?: string;
  shortBranch?: string;
};

type CleanOptions = {
  apply: boolean;
  base?: string;
};

type ListOptions = {
  status: boolean;
  base?: string;
};

type ParsedOptions<TOptions> = {
  help: boolean;
  options: TOptions;
};

type BaseArgument = {
  value: string;
  nextIndex: number;
};

type ColorTone = "green" | "yellow" | "red" | "cyan" | "dim" | "bold";

type WorktreeSummary = {
  staged: number;
  unstaged: number;
  untracked: number;
  conflicts: number;
};

type WorktreeDivergence = {
  ahead: number;
  behind: number;
};

type WorktreeRemovalCandidate = {
  worktree: string;
  reason: string;
};

type BranchRemovalCandidate = {
  branch: string;
  reason: string;
};

type GitStatusResult = {
  status: number;
  stdout: string;
  stderr: string;
};

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printMainHelp();
    return;
  }

  const [first, ...rest] = args;
  if (first === "--help" || first === "-h") {
    printMainHelp();
    return;
  }

  if (first === "clean") {
    const parsed = parseCleanOptions(rest);
    if (parsed.help) {
      printCleanHelp();
      return;
    }
    runClean(parsed.options);
    return;
  }

  if (first === "br-clean") {
    const parsed = parseCleanOptions(rest);
    if (parsed.help) {
      printBranchCleanHelp();
      return;
    }
    runBranchClean(parsed.options);
    return;
  }

  if (first === "list" || first === "ls") {
    const parsed = parseListOptions(rest);
    if (parsed.help) {
      printListHelp();
      return;
    }
    printWorktreeList(parsed.options);
    return;
  }

  if (first === "status") {
    const parsed = parseStatusOptions(rest);
    if (parsed.help) {
      printStatusHelp();
      return;
    }
    printWorktreeList({ status: true, base: parsed.options.base });
    return;
  }

  resolveTarget(first, rest);
}

function printMainHelp(): void {
  console.log(`Usage: wt.ts [branch] | list | ls | status | clean [options] | br-clean [options]

worktree helper

Examples:
  wt.ts --help
  wt.ts list
  wt.ts list --status
  wt.ts list --base origin/main
  wt.ts ls
  wt.ts status
  wt.ts main
  wt.ts codex/my-branch
  wt.ts clean
  wt.ts clean --base main
  wt.ts clean --apply
  wt.ts br-clean
  wt.ts br-clean --base main
  wt.ts br-clean --apply`);
}

function printCleanHelp(): void {
  console.log(`Usage: wt.ts clean [options]

dry-run by default; remove only safe merged/reachable worktrees with --apply

Options:
  --apply         actually remove candidates (default is dry-run)
  --base <branch> override base branch used for merged/reachable checks
  -h, --help      display help

What gets auto-removed:
  - Branch worktree: branch is merged into base and worktree has no local changes.
  - Detached worktree: HEAD commit is reachable from base and worktree has no local changes.

What is never auto-removed:
  - Any worktree with local changes.
  - Detached worktree with commits not reachable from base.

Base source:
  - If --base is set, that value is used.
  - Otherwise it matches your fish 'main' alias behavior (resolved from 'origin/HEAD').

Examples:
  wt.ts clean
  wt.ts clean --base main
  wt.ts clean --apply`);
}

function printBranchCleanHelp(): void {
  console.log(`Usage: wt.ts br-clean [options]

dry-run by default; remove only safe merged local branches with --apply

Options:
  --apply         actually remove candidates (default is dry-run)
  --base <branch> override base branch used for merged checks
  -h, --help      display help

What gets auto-removed:
  - Local branches merged into base and not checked out in any worktree.

What is never auto-removed:
  - Branches checked out in any worktree.
  - Branches not merged into base.

Base source:
  - If --base is set, that value is used.
  - Otherwise it matches your fish 'main' alias behavior (resolved from 'origin/HEAD').

Examples:
  wt.ts br-clean
  wt.ts br-clean --base main
  wt.ts br-clean --apply`);
}

function printListHelp(): void {
  console.log(`Usage: wt.ts list|ls [options]

list worktrees with local-change and divergence summary

Options:
  --status     include full git status output per worktree
  --base <ref> compare ahead/behind against this ref (default: origin/<default>)
  -h, --help   display help

List output legend:
  S/U/? = staged / unstaged / untracked file counts
  + / - = commits ahead / behind the comparison base`);
}

function printStatusHelp(): void {
  console.log(`Usage: wt.ts status [options]

list worktrees with full git status output and divergence summary

Options:
  --base <ref> compare ahead/behind against this ref (default: origin/<default>)
  -h, --help   display help`);
}

function failWithUsage(message: string): never {
  console.error(message);
  console.error(HELP_HINT);
  process.exit(1);
}

function parseCleanOptions(args: string[]): ParsedOptions<CleanOptions> {
  const options: CleanOptions = { apply: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      return { help: true, options };
    }
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }

    const baseParsed = parseBaseArgument(args, index);
    if (baseParsed) {
      options.base = baseParsed.value;
      index = baseParsed.nextIndex;
      continue;
    }

    if (arg.startsWith("-")) {
      failWithUsage(`unknown option: ${arg}`);
    }
    failWithUsage(`unexpected argument: ${arg}`);
  }

  return { help: false, options };
}

function parseListOptions(args: string[]): ParsedOptions<ListOptions> {
  const options: ListOptions = { status: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      return { help: true, options };
    }
    if (arg === "--status") {
      options.status = true;
      continue;
    }

    const baseParsed = parseBaseArgument(args, index);
    if (baseParsed) {
      options.base = baseParsed.value;
      index = baseParsed.nextIndex;
      continue;
    }

    if (arg.startsWith("-")) {
      failWithUsage(`unknown option: ${arg}`);
    }
    failWithUsage(`unexpected argument: ${arg}`);
  }

  return { help: false, options };
}

function parseStatusOptions(args: string[]): ParsedOptions<ListOptions> {
  const options: ListOptions = { status: true };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      return { help: true, options };
    }

    const baseParsed = parseBaseArgument(args, index);
    if (baseParsed) {
      options.base = baseParsed.value;
      index = baseParsed.nextIndex;
      continue;
    }

    if (arg.startsWith("-")) {
      failWithUsage(`unknown option: ${arg}`);
    }
    failWithUsage(`unexpected argument: ${arg}`);
  }

  return { help: false, options };
}

function parseBaseArgument(args: string[], index: number): BaseArgument | null {
  const arg = args[index];
  if (arg === "--base") {
    const value = args[index + 1];
    if (!value || value.startsWith("-")) {
      failWithUsage("option '--base' requires a value");
    }
    return {
      value,
      nextIndex: index + 1,
    };
  }

  if (arg.startsWith("--base=")) {
    const value = arg.slice("--base=".length);
    if (value.length === 0) {
      failWithUsage("option '--base' requires a value");
    }
    return {
      value,
      nextIndex: index,
    };
  }

  return null;
}

function resolveTarget(target: string, rest: string[]): void {
  if (rest.length > 0) {
    if (rest.length === 1 && (rest[0] === "--help" || rest[0] === "-h")) {
      printMainHelp();
      return;
    }
    failWithUsage(`unexpected argument: ${rest[0]}`);
  }
  if (target.startsWith("-")) {
    failWithUsage(`unknown option: ${target}`);
  }

  const worktrees = getAvailableWorktrees();
  const wt = worktrees.find(
    (worktree) => worktree.shortBranch === target || worktree.branchName === target,
  );

  log(wt);

  if (!wt) {
    console.error(`worktree ${target} not found`);
    process.exit(1);
  }

  console.log(wt.worktree);
}

// MARK: - Helpers

function getRegisteredWorktrees(): WorktreeEntry[] {
  const output = execFileSync("git", ["worktree", "list", "--porcelain"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return [];
  }

  return trimmed.split("\n\n").filter(Boolean).map(parseWorktreeBlock);
}

function getAvailableWorktrees(): WorktreeEntry[] {
  return getRegisteredWorktrees().filter((wt) => !wt.prunable && existsSync(wt.worktree));
}

function parseWorktreeBlock(block: string): WorktreeEntry {
  const raw: Partial<Record<string, string | true>> = {};
  for (const line of block.split("\n")) {
    if (!line) {
      continue;
    }
    const spaceIndex = line.indexOf(" ");
    if (spaceIndex === -1) {
      raw[line] = true;
      continue;
    }
    const key = line.slice(0, spaceIndex);
    const value = line.slice(spaceIndex + 1);
    raw[key] = value;
  }

  const worktree = raw.worktree;
  const HEAD = raw.HEAD;
  const branch = raw.branch;

  if (typeof worktree !== "string" || typeof HEAD !== "string") {
    throw new Error("failed to parse git worktree output");
  }
  if (branch !== undefined && typeof branch !== "string") {
    throw new Error("failed to parse git worktree output");
  }

  const branchName = branch?.replace("refs/heads/", "");
  return {
    worktree,
    HEAD,
    branch,
    detached: Boolean(raw.detached),
    prunable: Boolean(raw.prunable),
    branchName,
    shortBranch: branchName?.split("/").pop(),
  };
}

function getLocalBranches(repoRoot: string): string[] {
  const output = git(["for-each-ref", "refs/heads", "--format=%(refname:short)"], {
    cwd: repoRoot,
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function printWorktreeList(options: ListOptions = { status: false }): void {
  const repoRoot = git(["rev-parse", "--show-toplevel"]).trim();
  const worktrees = getAvailableWorktrees();
  const baseRef = resolveListBaseRef(repoRoot, options.base);
  const requestedBase = options.base?.trim();
  if (requestedBase && requestedBase.length > 0 && !baseRef) {
    console.error(`base ref not found: ${requestedBase}`);
    process.exit(1);
  }
  const labels = worktrees.map((wt) =>
    wt.branchName ? wt.branchName : `detached@${wt.HEAD.slice(0, 8)}`,
  );
  const labelWidth = Math.max(8, ...labels.map((label) => label.length));

  for (let index = 0; index < worktrees.length; index += 1) {
    const wt = worktrees[index];
    const summary = getWorktreeSummary(wt.worktree);
    const label = wt.branchName ? wt.branchName : `detached@${wt.HEAD.slice(0, 8)}`;
    const marker = wt.worktree === repoRoot ? colorize("*", "cyan") : " ";
    const stateLabel = getStateLabel(summary);
    const state = colorize(pad(stateLabel, 8), getStateTone(summary));
    const counts = [
      formatCountToken("S", summary.staged),
      formatCountToken("U", summary.unstaged),
      formatCountToken("?", summary.untracked),
    ].join(" ");
    const divergence = getWorktreeDivergence(wt.worktree, baseRef);
    const commits = formatDivergence(divergence);
    const line = `${marker} ${pad(label, labelWidth)} ${state} ${counts} ${commits} ${dim(formatPath(wt.worktree))}`;
    console.log(line);

    if (options.status) {
      const statusOutput = git(["status"], { cwd: wt.worktree }).trimEnd();
      if (statusOutput.length > 0) {
        const indented = statusOutput
          .split("\n")
          .map((part) => `    ${part}`)
          .join("\n");
        console.log(indented);
      }
      if (index < worktrees.length - 1) {
        console.log("");
      }
    }
  }
}

function log(...args: unknown[]): void {
  if (process.env.WT_DEBUG === "1") {
    console.log(...args);
  }
}

function shouldUseColor(): boolean {
  if (process.env.NO_COLOR) {
    return false;
  }
  if (process.env.FORCE_COLOR === "0") {
    return false;
  }
  if (process.env.FORCE_COLOR) {
    return true;
  }
  return Boolean(process.stdout.isTTY);
}

const COLOR_ENABLED = shouldUseColor();

function colorize(text: string, tone: ColorTone): string {
  if (!COLOR_ENABLED) {
    return text;
  }
  const codes: Record<ColorTone, string> = {
    green: "\u001B[32m",
    yellow: "\u001B[33m",
    red: "\u001B[31m",
    cyan: "\u001B[36m",
    dim: "\u001B[2m",
    bold: "\u001B[1m",
  };
  const reset = "\u001B[0m";
  return `${codes[tone]}${text}${reset}`;
}

function dim(text: string): string {
  return colorize(text, "dim");
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : `${text}${" ".repeat(width - text.length)}`;
}

function formatPath(inputPath: string): string {
  if (HOME_DIR.length > 0 && inputPath.startsWith(`${HOME_DIR}/`)) {
    return `~/${inputPath.slice(HOME_DIR.length + 1)}`;
  }
  if (inputPath === HOME_DIR) {
    return "~";
  }
  return inputPath;
}

function formatCountToken(label: string, value: number): string {
  const token = `${label}${value}`;
  if (value === 0) {
    return dim(token);
  }
  return colorize(token, "bold");
}

function isDirty(summary: WorktreeSummary): boolean {
  return summary.staged > 0 || summary.unstaged > 0 || summary.untracked > 0;
}

function getStateLabel(summary: WorktreeSummary): "clean" | "dirty" | "conflict" {
  if (summary.conflicts > 0) {
    return "conflict";
  }
  return isDirty(summary) ? "dirty" : "clean";
}

function getStateTone(summary: WorktreeSummary): "green" | "yellow" | "red" {
  if (summary.conflicts > 0) {
    return "red";
  }
  return isDirty(summary) ? "yellow" : "green";
}

function getWorktreeSummary(worktreePath: string): WorktreeSummary {
  const status = git(["status", "--porcelain"], { cwd: worktreePath });
  const lines = status.split("\n").filter(Boolean);

  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  let conflicts = 0;

  for (const line of lines) {
    const x = line.charAt(0) || " ";
    const y = line.charAt(1) || " ";

    if (x === "?" && y === "?") {
      untracked += 1;
      continue;
    }

    if (x !== " " && x !== "?") {
      staged += 1;
    }
    if (y !== " " && y !== "?") {
      unstaged += 1;
    }
    if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) {
      conflicts += 1;
    }
  }

  return {
    staged,
    unstaged,
    untracked,
    conflicts,
  };
}

function getWorktreeDivergence(
  worktreePath: string,
  baseRef: string | null,
): WorktreeDivergence | null {
  if (!baseRef) {
    return null;
  }

  const result = gitStatus(["rev-list", "--left-right", "--count", `${baseRef}...HEAD`], {
    cwd: worktreePath,
  });
  if (result.status !== 0) {
    return null;
  }

  const parts = result.stdout.trim().split(/\s+/);
  if (parts.length < 2) {
    return null;
  }

  const behind = Number.parseInt(parts[0], 10);
  const ahead = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
    return null;
  }

  return {
    ahead,
    behind,
  };
}

function formatDivergence(divergence: WorktreeDivergence | null): string {
  if (!divergence) {
    return `${dim("+?")} ${dim("-?")}`;
  }

  return [formatCountToken("+", divergence.ahead), formatCountToken("-", divergence.behind)].join(
    " ",
  );
}

function git(gitArgs: string[], options: { cwd?: string } = {}): string {
  return execFileSync("git", gitArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitStatus(gitArgs: string[], options: { cwd?: string } = {}): GitStatusResult {
  const result = spawnSync("git", gitArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function hasLocalChanges(worktreePath: string): boolean {
  const status = git(["status", "--porcelain"], { cwd: worktreePath });
  return status.trim().length > 0;
}

function isAncestor(ancestor: string, descendant: string, cwd: string): boolean {
  const result = gitStatus(["merge-base", "--is-ancestor", ancestor, descendant], {
    cwd,
  });
  return result.status === 0;
}

function resolveVerifiedCleanupBase(repoRoot: string, baseOption: string | undefined) {
  const requestedBase = baseOption?.trim();
  const base =
    requestedBase && requestedBase.length > 0
      ? normalizeBaseName(requestedBase)
      : resolveDefaultBranchName(repoRoot);
  const baseRef = resolveBaseRef(
    repoRoot,
    requestedBase && requestedBase.length > 0 ? requestedBase : base,
  );

  const baseCheck = gitStatus(["rev-parse", "--verify", baseRef], {
    cwd: repoRoot,
  });
  if (baseCheck.status !== 0) {
    console.error(`base ref not found: ${baseRef}`);
    process.exit(1);
  }

  return { base, baseRef };
}

function runClean(options: CleanOptions): void {
  const { apply, base: baseOption } = options;

  const repoRoot = git(["rev-parse", "--show-toplevel"]).trim();
  const { base, baseRef } = resolveVerifiedCleanupBase(repoRoot, baseOption);

  const worktrees = getAvailableWorktrees();
  const toRemove: WorktreeRemovalCandidate[] = [];
  const manualCheck: WorktreeRemovalCandidate[] = [];

  for (const wt of worktrees) {
    if (wt.worktree === repoRoot) {
      continue;
    }

    const dirty = hasLocalChanges(wt.worktree);
    if (wt.branchName) {
      if (wt.branchName === base) {
        continue;
      }
      const merged = isAncestor(wt.branchName, baseRef, repoRoot);
      if (merged) {
        if (dirty) {
          manualCheck.push({
            worktree: wt.worktree,
            reason: `branch '${wt.branchName}' is merged into '${base}' but has local changes`,
          });
        } else {
          toRemove.push({
            worktree: wt.worktree,
            reason: `branch '${wt.branchName}' is merged into '${base}'`,
          });
        }
      }
      continue;
    }

    const detachedMerged = isAncestor(wt.HEAD, baseRef, repoRoot);
    if (dirty) {
      manualCheck.push({
        worktree: wt.worktree,
        reason: "detached HEAD with local changes",
      });
      continue;
    }
    if (detachedMerged) {
      toRemove.push({
        worktree: wt.worktree,
        reason: `detached HEAD ${wt.HEAD.slice(0, 12)} is reachable from '${base}'`,
      });
      continue;
    }
    manualCheck.push({
      worktree: wt.worktree,
      reason: `detached HEAD ${wt.HEAD.slice(0, 12)} is not reachable from '${base}'`,
    });
  }

  const baseLabel = baseRef === base ? base : `${base} (${baseRef})`;
  console.log(`base: ${baseLabel}`);
  console.log(apply ? "mode: apply (will remove candidates)" : "mode: dry-run (no removals)");
  if (toRemove.length === 0) {
    console.log("remove candidates: none");
  } else {
    console.log(`remove candidates (${toRemove.length}):`);
    for (const item of toRemove) {
      console.log(`- ${formatPath(item.worktree)} (${item.reason})`);
    }
  }

  if (manualCheck.length > 0) {
    console.log(`manual checks (${manualCheck.length}):`);
    for (const item of manualCheck) {
      console.log(`- ${formatPath(item.worktree)} (${item.reason})`);
    }
  }

  if (!apply) {
    console.log("no worktrees removed (dry-run).");
    console.log(
      "next: run 'wt.ts list --status' to inspect, then 'wt.ts clean --apply' to remove candidates.",
    );
    return;
  }

  let removed = 0;
  let failed = 0;
  for (const item of toRemove) {
    const removeResult = gitStatus(["worktree", "remove", item.worktree], {
      cwd: repoRoot,
    });
    if (removeResult.status === 0) {
      console.log(`removed: ${formatPath(item.worktree)}`);
      removed += 1;
    } else {
      failed += 1;
      console.log(`failed: ${formatPath(item.worktree)}`);
      if (removeResult.stderr.trim().length > 0) {
        console.log(removeResult.stderr.trim());
      }
    }
  }

  console.log(`done. removed ${removed}, failed ${failed}, manual checks ${manualCheck.length}.`);
}

function runBranchClean(options: CleanOptions): void {
  const { apply, base: baseOption } = options;

  const repoRoot = git(["rev-parse", "--show-toplevel"]).trim();
  const { base, baseRef } = resolveVerifiedCleanupBase(repoRoot, baseOption);

  const worktrees = getRegisteredWorktrees();
  const activeBranches = new Map<string, string[]>();
  for (const wt of worktrees) {
    if (!wt.branchName) {
      continue;
    }
    const entries = activeBranches.get(wt.branchName);
    if (entries) {
      entries.push(wt.worktree);
    } else {
      activeBranches.set(wt.branchName, [wt.worktree]);
    }
  }

  const branches = getLocalBranches(repoRoot);
  const toRemove: BranchRemovalCandidate[] = [];
  const manualCheck: BranchRemovalCandidate[] = [];

  for (const branch of branches) {
    if (branch === base) {
      continue;
    }

    const activePaths = activeBranches.get(branch);
    if (activePaths) {
      const locations = activePaths.map((path) => formatPath(path)).join(", ");
      manualCheck.push({
        branch,
        reason: `checked out in ${locations}`,
      });
      continue;
    }

    const merged = isAncestor(branch, baseRef, repoRoot);
    if (merged) {
      toRemove.push({
        branch,
        reason: `merged into '${base}'`,
      });
    } else {
      manualCheck.push({
        branch,
        reason: `not merged into '${base}'`,
      });
    }
  }

  const baseLabel = baseRef === base ? base : `${base} (${baseRef})`;
  console.log(`base: ${baseLabel}`);
  console.log(apply ? "mode: apply (will remove candidates)" : "mode: dry-run (no removals)");
  if (toRemove.length === 0) {
    console.log("remove candidates: none");
  } else {
    console.log(`remove candidates (${toRemove.length}):`);
    for (const item of toRemove) {
      console.log(`- ${item.branch} (${item.reason})`);
    }
  }

  if (manualCheck.length > 0) {
    console.log(`manual checks (${manualCheck.length}):`);
    for (const item of manualCheck) {
      console.log(`- ${item.branch} (${item.reason})`);
    }
  }

  if (!apply) {
    console.log("no branches removed (dry-run).");
    console.log("next: run 'wt.ts br-clean --apply' to remove candidates.");
    return;
  }

  let removed = 0;
  let failed = 0;
  for (const item of toRemove) {
    const removeResult = gitStatus(["branch", "-d", "--", item.branch], {
      cwd: repoRoot,
    });
    if (removeResult.status === 0) {
      console.log(`removed: ${item.branch}`);
      removed += 1;
    } else {
      failed += 1;
      console.log(`failed: ${item.branch}`);
      if (removeResult.stderr.trim().length > 0) {
        console.log(removeResult.stderr.trim());
      }
    }
  }

  console.log(`done. removed ${removed}, failed ${failed}, manual checks ${manualCheck.length}.`);
}

/**
 * Mirrors fish alias: main -> bb -> `git rev-parse --abbrev-ref origin/HEAD`
 * then strip `origin/`.
 */
function resolveDefaultBranchName(repoRoot: string): string {
  const remoteHead = gitStatus(["rev-parse", "--abbrev-ref", "origin/HEAD"], {
    cwd: repoRoot,
  });
  if (remoteHead.status === 0) {
    const value = remoteHead.stdout.trim();
    if (value.startsWith("origin/")) {
      return value.slice("origin/".length);
    }
    if (value.length > 0 && value !== "origin/HEAD") {
      return value;
    }
  }

  const fallback = ["main", "master"];
  for (const candidate of fallback) {
    const exists = gitStatus(["rev-parse", "--verify", candidate], {
      cwd: repoRoot,
    });
    if (exists.status === 0) {
      return candidate;
    }
  }

  console.error(
    "could not resolve default branch from origin/HEAD and no 'main'/'master' fallback found",
  );
  process.exit(1);
}

function resolveListBaseRef(repoRoot: string, requestedBase: string | undefined): string | null {
  const trimmed = requestedBase?.trim();
  if (trimmed && trimmed.length > 0) {
    const explicit = resolveBaseRef(repoRoot, trimmed);
    const explicitExists = gitStatus(["rev-parse", "--verify", explicit], {
      cwd: repoRoot,
    });
    if (explicitExists.status === 0) {
      return explicit;
    }
    return null;
  }

  const defaultName = resolveDefaultBranchName(repoRoot);
  const remoteRef = `origin/${defaultName}`;
  const remoteExists = gitStatus(["rev-parse", "--verify", remoteRef], {
    cwd: repoRoot,
  });
  if (remoteExists.status === 0) {
    return remoteRef;
  }

  const fallbackRef = resolveBaseRef(repoRoot, defaultName);
  const fallbackExists = gitStatus(["rev-parse", "--verify", fallbackRef], {
    cwd: repoRoot,
  });
  if (fallbackExists.status === 0) {
    return fallbackRef;
  }

  return null;
}

function resolveBaseRef(repoRoot: string, baseInput: string): string {
  const directExists = gitStatus(["rev-parse", "--verify", baseInput], {
    cwd: repoRoot,
  });
  if (directExists.status === 0) {
    return baseInput;
  }

  const normalized = normalizeBaseName(baseInput);
  const localExists = gitStatus(["rev-parse", "--verify", normalized], {
    cwd: repoRoot,
  });
  if (localExists.status === 0) {
    return normalized;
  }

  const remoteRef = `origin/${normalized}`;
  const remoteExists = gitStatus(["rev-parse", "--verify", remoteRef], {
    cwd: repoRoot,
  });
  if (remoteExists.status === 0) {
    return remoteRef;
  }

  return baseInput;
}

function normalizeBaseName(value: string): string {
  if (value.startsWith("origin/")) {
    return value.slice("origin/".length);
  }
  if (value.startsWith("refs/heads/")) {
    return value.slice("refs/heads/".length);
  }
  return value;
}

main();
