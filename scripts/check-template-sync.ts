#!/usr/bin/env node
import { collectTemplateFiles, type CollectedTemplateFile } from "./export-starter-manifest.ts";
import { isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { actionsTemplateSourceRoot, baseTemplateSourceRoot } from "./publish-repository-exports.ts";

/**
templates/base and templates/base-actions are the same app with two deploy paths: Workers Builds in
base; an Alchemy setup stack and `cf` from GitHub Actions in base-actions. These paths may differ
between the two templates or exist in only one of them. Every other path must exist in both with
the same bytes and mode.
*/
export const templateDeployPaths = [
  // base-actions only: the Alchemy setup stack (Worker shell and Convex side).
  "alchemy.run.ts",
  // base-actions only: the Worker that `cf` uploads, and the build settings of the Wrangler bundler.
  "cloudflare.config.ts",
  "wrangler.config.ts",
  // base-actions only: the GitHub Actions workflow that runs the deploy and the destroy.
  ".github/workflows/alchemy.yml",
  // base-actions only: the names of the stack, the Worker, the Convex project, and the Previews.
  "scripts/deploy-names.ts",
  "scripts/deploy-names.test.ts",
  // base-actions only: the workflow steps around `alchemy` and `cf`: the stage outputs, the Worker
  // Build Output, the Worker Preview upload and delete, and the pull request comment.
  "scripts/read-stack-output.ts",
  // base-actions only: the confirmed destroy of the whole app.
  "scripts/destroy-app.ts",
  "scripts/build-worker.ts",
  "scripts/deploy-worker-preview.ts",
  "scripts/delete-worker-preview.ts",
  "scripts/delete-worker-preview.test.ts",
  "scripts/comment-preview.ts",
  "scripts/comment-preview.test.ts",
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
  // Effect, cf, Wrangler, and the @samebase Alchemy providers in base-actions.
  "package.json",
  // The lockfile of those different dependencies.
  "pnpm-lock.yaml",
  // base-actions also type-checks alchemy.run.ts and the two config files as Node code.
  "tsconfig.node.json",
  // base-actions also ignores the local Alchemy state and the Build Output.
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
