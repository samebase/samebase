#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { trackedFilePath } from "./lib/trackedFilePath.ts";

const packageManifestPath = trackedFilePath("packages/agent-plugins/package.json");
const packageRoot = path.dirname(packageManifestPath);
const releaseVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

type ReleaseVersion = {
  major: number;
  minor: number;
  patch: number;
};

function readPackageVersion(contents: string, label: string): string {
  const parsed: unknown = JSON.parse(contents);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    typeof parsed.version !== "string"
  ) {
    throw new Error(`${label} has no string version.`);
  }
  return parsed.version;
}

function parseReleaseVersion(version: string, label: string): ReleaseVersion {
  const match = releaseVersionPattern.exec(version);
  if (!match) {
    throw new Error(`${label} must use a numeric major.minor.patch version, received ${version}.`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function isReleaseVersionGreater(version: string, baseVersion: string): boolean {
  const current = parseReleaseVersion(version, "Current agent plugin version");
  const base = parseReleaseVersion(baseVersion, "Base agent plugin version");

  return (
    current.major > base.major ||
    (current.major === base.major && current.minor > base.minor) ||
    (current.major === base.major && current.minor === base.minor && current.patch > base.patch)
  );
}

function packageChanged(repoRoot: string, baseCommit: string): boolean {
  const result = spawnSync("git", ["diff", "--quiet", baseCommit, "HEAD", "--", packageRoot], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status === 0) {
    return false;
  }
  if (result.status === 1) {
    return true;
  }

  throw new Error(result.stderr.trim() || `Unable to compare agent plugins with ${baseCommit}.`);
}

export function checkAgentPluginVersion(repoRoot: string, baseCommit: string): string {
  if (!baseCommit) {
    throw new Error("A base commit is required.");
  }

  const version = readPackageVersion(
    readFileSync(path.join(repoRoot, packageManifestPath), "utf8"),
    "Current agent plugin package",
  );
  if (!packageChanged(repoRoot, baseCommit)) {
    return `Agent plugins are unchanged at version ${version}.`;
  }

  const baseVersion = readPackageVersion(
    execFileSync("git", ["show", `${baseCommit}:${packageManifestPath}`], {
      cwd: repoRoot,
      encoding: "utf8",
    }),
    "Base agent plugin package",
  );
  if (!isReleaseVersionGreater(version, baseVersion)) {
    throw new Error(
      `Agent plugins changed, but version ${version} is not greater than ${baseVersion}. Increase the agent plugin version.`,
    );
  }

  return `Agent plugin version increased from ${baseVersion} to ${version}.`;
}

if (isMainModule(import.meta.url)) {
  await runMain(() => {
    const baseCommit = process.argv[2] ?? "";
    console.log(checkAgentPluginVersion(resolveRepoRoot(), baseCommit));
  });
}
