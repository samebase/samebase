#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { isObject } from "@samebase/sure";

import { isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { assertRepositoryExport, repositoryExports } from "./publish-repository-exports.ts";

const installedDependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
] as const;

type FileSnapshot = {
  contents: string | null;
  path: string;
};

function readPackageManifest(filePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  if (!isObject(parsed)) {
    throw new Error(`Package manifest must contain a JSON object: ${filePath}`);
  }
  return parsed;
}

function readDependencyVersions(
  manifest: Record<string, unknown>,
  manifestPath: string,
): Map<string, string> {
  const versions = new Map<string, string>();

  for (const field of installedDependencyFields) {
    const dependencies = manifest[field];
    if (dependencies === undefined) {
      continue;
    }
    if (!isObject(dependencies)) {
      throw new Error(`${manifestPath}#${field} must contain a JSON object.`);
    }

    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof version !== "string") {
        throw new Error(`${manifestPath}#${field}.${name} must be a string.`);
      }
      const existingVersion = versions.get(name);
      if (existingVersion !== undefined && existingVersion !== version) {
        throw new Error(
          `${manifestPath} declares ${name} with conflicting versions: ${existingVersion} and ${version}.`,
        );
      }
      versions.set(name, version);
    }
  }

  return versions;
}

function assertStandaloneDependencyVersion(name: string, version: string): void {
  if (
    version.startsWith("workspace:") ||
    version.startsWith("file:") ||
    version.startsWith("link:")
  ) {
    throw new Error(`Exported dependency ${name} cannot use the monorepo-only version ${version}.`);
  }
}

export function synchronizeExportManifest(
  rootManifest: Record<string, unknown>,
  exportManifest: Record<string, unknown>,
): Record<string, unknown> {
  const packageManager = rootManifest.packageManager;
  if (typeof packageManager !== "string") {
    throw new Error("The root packageManager must be a string.");
  }

  const sharedVersions = readDependencyVersions(rootManifest, "package.json");
  const nextManifest: Record<string, unknown> = {
    ...exportManifest,
    packageManager,
  };

  for (const field of installedDependencyFields) {
    const dependencies = exportManifest[field];
    if (dependencies === undefined) {
      continue;
    }
    if (!isObject(dependencies)) {
      throw new Error(`Exported package.json#${field} must contain a JSON object.`);
    }

    const nextDependencies = { ...dependencies };
    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof version !== "string") {
        throw new Error(`Exported package.json#${field}.${name} must be a string.`);
      }
      const sharedVersion = sharedVersions.get(name);
      if (sharedVersion === undefined) {
        continue;
      }
      assertStandaloneDependencyVersion(name, sharedVersion);
      nextDependencies[name] = sharedVersion;
    }
    nextManifest[field] = nextDependencies;
  }

  return nextManifest;
}

function runPnpm(repoRoot: string, args: readonly string[]): void {
  const pnpmCliPath = process.env.npm_execpath;
  if (!pnpmCliPath) {
    throw new Error("Run repository export package synchronization through a root pnpm script.");
  }

  const result = spawnSync(process.execPath, [pnpmCliPath, ...args], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(" ")} failed with exit code ${result.status}.`);
  }
}

function readSnapshot(filePath: string): FileSnapshot {
  return {
    contents: existsSync(filePath) ? readFileSync(filePath, "utf8") : null,
    path: filePath,
  };
}

function changedSnapshot(snapshot: FileSnapshot): boolean {
  const currentContents = existsSync(snapshot.path) ? readFileSync(snapshot.path, "utf8") : null;
  return currentContents !== snapshot.contents;
}

function synchronizeExportPackage(repoRoot: string, sourceRoot: string): void {
  const rootManifestPath = path.join(repoRoot, "package.json");
  const exportRoot = path.join(repoRoot, sourceRoot);
  const exportManifestPath = path.join(exportRoot, "package.json");
  const rootManifest = readPackageManifest(rootManifestPath);
  const exportManifest = readPackageManifest(exportManifestPath);
  const nextManifest = synchronizeExportManifest(rootManifest, exportManifest);
  const nextManifestContents = `${JSON.stringify(nextManifest, null, 2)}\n`;

  if (readFileSync(exportManifestPath, "utf8") !== nextManifestContents) {
    writeFileSync(exportManifestPath, nextManifestContents, "utf8");
  }

  runPnpm(repoRoot, ["--dir", exportRoot, "install", "--ignore-workspace", "--lockfile-only"]);
}

function synchronizeConfiguredExportPackages(check: boolean): void {
  const repoRoot = resolveRepoRoot();
  const snapshots = repositoryExports.flatMap((definition) => {
    assertRepositoryExport(definition);
    return [
      readSnapshot(path.join(repoRoot, definition.sourceRoot, "package.json")),
      readSnapshot(path.join(repoRoot, definition.sourceRoot, "pnpm-lock.yaml")),
    ];
  });

  for (const definition of repositoryExports) {
    synchronizeExportPackage(repoRoot, definition.sourceRoot);
  }

  if (!check) {
    console.log(`Synchronized ${repositoryExports.length} repository export package(s).`);
    return;
  }

  for (const definition of repositoryExports) {
    const exportRoot = path.join(repoRoot, definition.sourceRoot);
    runPnpm(repoRoot, [
      "--dir",
      exportRoot,
      "install",
      "--ignore-workspace",
      "--frozen-lockfile",
      "--ignore-scripts",
    ]);
    runPnpm(repoRoot, ["--dir", exportRoot, "run", "check"]);
  }

  const changedFiles = snapshots
    .filter(changedSnapshot)
    .map((snapshot) => path.relative(repoRoot, snapshot.path));
  if (changedFiles.length > 0) {
    throw new Error(
      `Repository export package files were stale and are now updated: ${changedFiles.join(", ")}. Commit the updates.`,
    );
  }
}

if (isMainModule(import.meta.url)) {
  await runMain(() => {
    const arguments_ = process.argv.slice(2);
    if (arguments_.length === 0) {
      synchronizeConfiguredExportPackages(false);
      return;
    }
    if (arguments_.length === 1 && arguments_[0] === "--check") {
      synchronizeConfiguredExportPackages(true);
      return;
    }
    throw new Error(`Unexpected repository export package arguments: ${arguments_.join(" ")}`);
  });
}
