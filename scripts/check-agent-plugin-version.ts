#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { trackedFilePath } from "./lib/trackedFilePath.ts";

const pluginManifestPath = trackedFilePath(
  "packages/plugin/plugins/samebase/.codex-plugin/plugin.json",
);
const pluginRoot = path.dirname(trackedFilePath("packages/plugin/README.md"));
const releaseVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

type ReleaseVersion = {
  major: bigint;
  minor: bigint;
  patch: bigint;
};

function readPluginVersion(contents: string, label: string): string {
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

function readBasePluginVersion(repoRoot: string, baseCommit: string): string {
  const result = spawnSync("git", ["show", `${baseCommit}:${pluginManifestPath}`], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Unable to read the base Samebase plugin manifest at ${baseCommit}.`);
  }
  return readPluginVersion(result.stdout, "Base Samebase plugin manifest");
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

function pluginChanged(repoRoot: string, baseCommit: string): boolean {
  const result = spawnSync("git", ["diff", "--quiet", baseCommit, "HEAD", "--", pluginRoot], {
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

export function findLatestPluginChangeBase(repoRoot: string): string {
  const latestPluginChange = execFileSync(
    "git",
    ["log", "--first-parent", "-1", "--format=%H", "HEAD", "--", pluginRoot],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  ).trim();
  if (!latestPluginChange) {
    throw new Error("Unable to find a Samebase plugin change in Git history.");
  }

  return `${latestPluginChange}^`;
}

export function checkAgentPluginVersion(repoRoot: string, baseCommit: string): string {
  if (!baseCommit) {
    throw new Error("A base commit is required.");
  }

  const version = readPluginVersion(
    readFileSync(path.join(repoRoot, pluginManifestPath), "utf8"),
    "Current Samebase plugin manifest",
  );
  if (!pluginChanged(repoRoot, baseCommit)) {
    return `The Samebase plugin is unchanged at version ${version}.`;
  }

  const baseVersion = readBasePluginVersion(repoRoot, baseCommit);
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
      argument === "--latest-plugin-change" ? findLatestPluginChangeBase(repoRoot) : argument;
    console.log(checkAgentPluginVersion(repoRoot, baseCommit));
  });
}
