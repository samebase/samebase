#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { trackedFilePath } from "./lib/trackedFilePath.ts";

const packageManifestPath = trackedFilePath("packages/plugin/package.json");
// The first packages/plugin release compares with the package at its previous Git path.
const previousPackageManifestPath = "packages/agent-plugins/package.json";
const packageRoot = path.dirname(packageManifestPath);
const releaseVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

type ReleaseVersion = {
  major: bigint;
  minor: bigint;
  patch: bigint;
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

function readBasePackageVersion(repoRoot: string, baseCommit: string): string {
  for (const manifestPath of [packageManifestPath, previousPackageManifestPath]) {
    const result = spawnSync("git", ["show", `${baseCommit}:${manifestPath}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status === 0) {
      return readPackageVersion(result.stdout, "Base Samebase plugin package");
    }
  }

  throw new Error(`Unable to read the base Samebase plugin package at ${baseCommit}.`);
}

function parseReleaseVersion(version: string, label: string): ReleaseVersion {
  const match = releaseVersionPattern.exec(version);
  if (!match) {
    throw new Error(`${label} must use a numeric major.minor.patch version, received ${version}.`);
  }

  return {
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
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

  throw new Error(
    result.stderr.trim() || `Unable to compare the Samebase plugin with ${baseCommit}.`,
  );
}

export function findLatestPackageChangeBase(repoRoot: string): string {
  const latestPackageChange = execFileSync(
    "git",
    ["log", "--first-parent", "-1", "--format=%H", "HEAD", "--", packageRoot],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  ).trim();
  if (!latestPackageChange) {
    throw new Error("Unable to find a Samebase plugin change in Git history.");
  }

  return `${latestPackageChange}^`;
}

export function checkAgentPluginVersion(repoRoot: string, baseCommit: string): string {
  if (!baseCommit) {
    throw new Error("A base commit is required.");
  }

  const version = readPackageVersion(
    readFileSync(path.join(repoRoot, packageManifestPath), "utf8"),
    "Current Samebase plugin package",
  );
  if (!packageChanged(repoRoot, baseCommit)) {
    return `The Samebase plugin is unchanged at version ${version}.`;
  }

  const baseVersion = readBasePackageVersion(repoRoot, baseCommit);
  if (!isReleaseVersionGreater(version, baseVersion)) {
    throw new Error(
      `The Samebase plugin changed, but version ${version} is not greater than ${baseVersion}. Increase the plugin version.`,
    );
  }

  return `Samebase plugin version increased from ${baseVersion} to ${version}.`;
}

if (isMainModule(import.meta.url)) {
  await runMain(() => {
    const argument = process.argv[2] ?? "";
    const repoRoot = resolveRepoRoot();
    const baseCommit =
      argument === "--latest-package-change" ? findLatestPackageChangeBase(repoRoot) : argument;
    console.log(checkAgentPluginVersion(repoRoot, baseCommit));
  });
}
