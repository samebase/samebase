import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { trackedFilePath } from "./lib/trackedFilePath.ts";

const templateRoot = path.dirname(trackedFilePath("templates/app/package.json"));
const templateScriptsRoot = `${templateRoot}/scripts`;
const templateMetadataPath = `${templateRoot}/.samebase/template.json`;
const templateChangelogPath = `${templateRoot}/.samebase/CHANGELOG.md`;
const sourceRepository = "https://github.com/samebase/samebase";
const buildLabelPattern = /^v[1-9]\d*$/;
const sourceBuildHeaderPattern = /^\/\/ Samebase source build: (v[1-9]\d*)$/;

type TemplateMetadata = {
  schemaVersion: 1;
  sourceRepository: string;
  baseline: string;
};

function runGit(repoRoot: string, args: readonly string[]): string {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `Git command failed: git ${args.join(" ")}`);
  }
  return result.stdout;
}

function splitNullTerminated(output: string): string[] {
  return output.split("\0").filter((entry) => entry.length > 0);
}

function collectTemplateScriptPaths(repoRoot: string): string[] {
  const scriptsRoot = path.join(repoRoot, templateScriptsRoot);
  const scriptPaths: string[] = [];

  function visit(directory: string, relativeDirectory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        visit(path.join(directory, entry.name), relativePath);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        scriptPaths.push(`${templateScriptsRoot}/${relativePath}`);
      }
    }
  }

  visit(scriptsRoot, "");
  scriptPaths.sort();
  if (scriptPaths.length === 0) {
    throw new Error(`No TypeScript template scripts found under ${templateScriptsRoot}.`);
  }
  return scriptPaths;
}

function parseBuildLabel(value: string, label: string): bigint {
  if (!buildLabelPattern.test(value)) {
    throw new Error(`${label} must use the v<N> format, received ${value}.`);
  }
  return BigInt(value.slice(1));
}

function readTemplateMetadata(repoRoot: string): TemplateMetadata {
  const raw = readFileSync(path.join(repoRoot, templateMetadataPath), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("schemaVersion" in parsed) ||
    parsed.schemaVersion !== 1 ||
    !("sourceRepository" in parsed) ||
    typeof parsed.sourceRepository !== "string" ||
    !("baseline" in parsed) ||
    typeof parsed.baseline !== "string"
  ) {
    throw new Error(`${templateMetadataPath} must match schema version 1.`);
  }
  if (parsed.sourceRepository !== sourceRepository) {
    throw new Error(`${templateMetadataPath} must use ${sourceRepository} as sourceRepository.`);
  }
  parseBuildLabel(parsed.baseline, `${templateMetadataPath} baseline`);
  return {
    schemaVersion: 1,
    sourceRepository: parsed.sourceRepository,
    baseline: parsed.baseline,
  };
}

function changelogHasBuild(changelog: string, buildLabel: string): boolean {
  return changelog.split(/\r?\n/).some((line) => line === `## ${buildLabel}`);
}

function readScriptBuildLabel(repoRoot: string, scriptPath: string): string {
  const firstLine = readFileSync(path.join(repoRoot, scriptPath), "utf8").split(/\r?\n/, 1)[0];
  const match = sourceBuildHeaderPattern.exec(firstLine);
  if (!match) {
    throw new Error(`${scriptPath} line 1 must use // Samebase source build: v<N>.`);
  }
  return match[1];
}

function collectChangedTemplatePaths(repoRoot: string, baseCommit: string): Set<string> {
  const changed = splitNullTerminated(
    runGit(repoRoot, [
      "diff",
      "--name-only",
      "--diff-filter=ACDMRTUXB",
      "-z",
      baseCommit,
      "--",
      templateRoot,
    ]),
  );
  const untracked = splitNullTerminated(
    runGit(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z", "--", templateRoot]),
  );
  return new Set([...changed, ...untracked]);
}

export function computeProjectedTemplateBuildLabel(repoRoot: string, baseCommit: string): string {
  const count = runGit(repoRoot, ["rev-list", "--count", baseCommit]).trim();
  if (!/^[1-9]\d*$/.test(count)) {
    throw new Error(`Unable to compute a positive commit count for ${baseCommit}.`);
  }
  return `v${BigInt(count) + 1n}`;
}

export function checkTemplateReleaseContract(repoRoot: string, baseCommit: string): string {
  const metadata = readTemplateMetadata(repoRoot);
  const baselineNumber = parseBuildLabel(metadata.baseline, `${templateMetadataPath} baseline`);
  const changelog = readFileSync(path.join(repoRoot, templateChangelogPath), "utf8");
  if (!changelogHasBuild(changelog, metadata.baseline)) {
    throw new Error(`${templateChangelogPath} must contain a ## ${metadata.baseline} entry.`);
  }

  const scriptPaths = collectTemplateScriptPaths(repoRoot);
  const scriptBuilds = new Map(
    scriptPaths.map((scriptPath) => [scriptPath, readScriptBuildLabel(repoRoot, scriptPath)]),
  );
  for (const [scriptPath, buildLabel] of scriptBuilds) {
    if (parseBuildLabel(buildLabel, `${scriptPath} source build`) > baselineNumber) {
      throw new Error(
        `${scriptPath} source build ${buildLabel} is newer than baseline ${metadata.baseline}.`,
      );
    }
  }

  const changedPaths = collectChangedTemplatePaths(repoRoot, baseCommit);
  if (changedPaths.size === 0) {
    return `The template release contract is unchanged at ${metadata.baseline}.`;
  }

  const projectedBuild = computeProjectedTemplateBuildLabel(repoRoot, baseCommit);
  if (metadata.baseline !== projectedBuild) {
    throw new Error(
      `${templateMetadataPath} baseline must be ${projectedBuild} when ${templateRoot} changes.`,
    );
  }
  if (!changelogHasBuild(changelog, projectedBuild)) {
    throw new Error(`${templateChangelogPath} must contain a ## ${projectedBuild} entry.`);
  }

  for (const scriptPath of scriptPaths) {
    if (changedPaths.has(scriptPath) && scriptBuilds.get(scriptPath) !== projectedBuild) {
      throw new Error(
        `${scriptPath} changed and must use // Samebase source build: ${projectedBuild}.`,
      );
    }
  }

  return `The template release contract is current at ${projectedBuild}.`;
}

if (isMainModule(import.meta.url)) {
  await runMain(() => {
    const repoRoot = resolveRepoRoot();
    console.log(checkTemplateReleaseContract(repoRoot, "origin/main"));
  });
}
