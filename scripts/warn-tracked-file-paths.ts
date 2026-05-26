#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

import { trackedFilePathsOutputPath } from "./generate-tracked-file-paths.ts";
import { fail, isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";

export type TrackedFilePathsFreshness = "fresh" | "stale";

export function readTrackedFilePathsFreshness(repoRoot: string): TrackedFilePathsFreshness {
  const result = spawnSync("git", ["diff", "--quiet", "--", trackedFilePathsOutputPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status === 0) {
    return "fresh";
  }
  if (result.status === 1) {
    return "stale";
  }

  const detail = result.stderr.trim() || result.error?.message || "unknown error";
  fail(`Could not inspect tracked file path type freshness: ${detail}`);
}

export function formatTrackedFilePathsFreshnessWarning(): string {
  return [
    "Tracked file path types are stale.",
    "This is warning-only: script typechecking already regenerated them, so",
    "trackedFilePath(...) literals still fail if their referenced files disappear.",
    "Run `pnpm run generate:tracked-file-paths` when you want to refresh the committed snapshot.",
  ].join(" ");
}

function escapeGitHubActionsMessage(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

export function writeTrackedFilePathsFreshnessWarning(message: string): void {
  if (process.env.GITHUB_ACTIONS) {
    console.warn(
      `::warning file=${trackedFilePathsOutputPath}::${escapeGitHubActionsMessage(message)}`,
    );
    return;
  }

  console.warn(`Warning: ${message}`);
}

export function warnIfTrackedFilePathsAreStale(repoRoot: string): void {
  if (readTrackedFilePathsFreshness(repoRoot) === "fresh") {
    return;
  }

  writeTrackedFilePathsFreshnessWarning(formatTrackedFilePathsFreshnessWarning());
}

if (isMainModule(import.meta.url)) {
  await runMain(() => warnIfTrackedFilePathsAreStale(resolveRepoRoot()));
}
