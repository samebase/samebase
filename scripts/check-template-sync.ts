#!/usr/bin/env node
import { collectTemplateFiles, type CollectedTemplateFile } from "./export-starter-manifest.ts";
import { isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { actionsTemplateSourceRoot, baseTemplateSourceRoot } from "./publish-repository-exports.ts";

/**
templates/base and templates/base-actions are the same app with two deploy paths: Workers Builds in
base, Alchemy from GitHub Actions in base-actions. These paths may differ between the two templates
or exist in only one of them. Every other path must exist in both with the same bytes and mode.
*/
export const templateDeployPaths = [
  // base-actions only: the Alchemy stack, the only deploy path of base-actions.
  "alchemy.run.ts",
  // base-actions only: the GitHub Actions workflow that runs the Alchemy deploy and destroy.
  ".github/workflows/alchemy.yml",
  // base-actions only: the Alchemy stage of a branch, which the workflow computes before the deploy
  // and the destroy.
  "scripts/alchemy-stage.ts",
  "scripts/alchemy-stage.test.ts",
  // base-actions only: skips the deploy of a workflow run whose commit is no longer the branch head,
  // and the destroy of a deleted branch that exists again. It asks the GitHub API and ends the run
  // without a deploy or destroy; the base head check reads Workers Builds variables and git, and
  // fails the build.
  "scripts/check-branch-head.ts",
  "scripts/check-branch-head.test.ts",
  // Deploy scripts and dependencies: Wrangler and the Workers Builds scripts in base; Alchemy,
  // Effect, and @samebase/alchemy-convex in base-actions.
  "package.json",
  // The lockfile of those different dependencies.
  "pnpm-lock.yaml",
  // base-actions also type-checks alchemy.run.ts as Node code.
  "tsconfig.node.json",
  // base-actions also ignores the local Alchemy state directory.
  ".gitignore",
  // Each README documents its own deploy contract.
  "README.md",
  // base only: the Worker configuration that Wrangler deploys from Workers Builds.
  "wrangler.jsonc",
  // base only: the Workers Builds build command, which deploys Convex inside Workers Builds.
  "scripts/build-cloudflare.ts",
  "scripts/build-cloudflare.test.ts",
  // base only: stops an older Workers Builds run from deploying after a newer commit.
  "scripts/verify-current-branch-head.ts",
  "scripts/verify-current-branch-head.test.ts",
];

export function findUnsyncedTemplatePaths(args: {
  baseFiles: readonly CollectedTemplateFile[];
  actionsFiles: readonly CollectedTemplateFile[];
  deployPaths: readonly string[];
}): string[] {
  const deployPaths = new Set(args.deployPaths);
  const actionsFiles = new Map(args.actionsFiles.map((file) => [file.relativePath, file]));
  const problems: string[] = [];

  for (const baseFile of args.baseFiles) {
    if (deployPaths.has(baseFile.relativePath)) {
      continue;
    }
    const actionsFile = actionsFiles.get(baseFile.relativePath);
    if (actionsFile === undefined) {
      problems.push(`${baseFile.relativePath} (only in ${baseTemplateSourceRoot})`);
    } else if (!actionsFile.rawContent.equals(baseFile.rawContent)) {
      problems.push(`${baseFile.relativePath} (content differs)`);
    } else if (actionsFile.mode !== baseFile.mode) {
      problems.push(`${baseFile.relativePath} (mode differs)`);
    }
  }

  const basePaths = new Set(args.baseFiles.map((file) => file.relativePath));
  for (const actionsFile of args.actionsFiles) {
    if (!deployPaths.has(actionsFile.relativePath) && !basePaths.has(actionsFile.relativePath)) {
      problems.push(`${actionsFile.relativePath} (only in ${actionsTemplateSourceRoot})`);
    }
  }

  return problems.sort();
}

async function checkTemplateSync(repoRoot: string): Promise<void> {
  const problems = findUnsyncedTemplatePaths({
    baseFiles: await collectTemplateFiles(repoRoot, baseTemplateSourceRoot),
    actionsFiles: await collectTemplateFiles(repoRoot, actionsTemplateSourceRoot),
    deployPaths: templateDeployPaths,
  });
  if (problems.length > 0) {
    throw new Error(`${baseTemplateSourceRoot} and ${actionsTemplateSourceRoot} must share these files:
${problems.map((problem) => `  ${problem}`).join("\n")}
Apply the change to the other template too.`);
  }
  console.log(
    `${baseTemplateSourceRoot} and ${actionsTemplateSourceRoot} share every file outside the deploy paths.`,
  );
}

if (isMainModule(import.meta.url)) {
  await runMain(() => checkTemplateSync(resolveRepoRoot()));
}
