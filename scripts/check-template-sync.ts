#!/usr/bin/env node
import { collectTemplateFiles, type CollectedTemplateFile } from "./export-starter-manifest.ts";
import { isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { actionsTemplateSourceRoot, baseTemplateSourceRoot } from "./publish-repository-exports.ts";

/**
templates/base and templates/base-actions are the same app on Workers Builds with two setups: the
dashboard and Samebase set up base; an Alchemy setup stack in GitHub Actions sets up base-actions,
whose Worker Workers Builds deploys with `cf`. These paths may differ between the two templates or
exist in only one of them. Every other path, including the Workers Builds build scripts, must exist
in both with the same bytes and mode.
*/
export const templateDeployPaths = [
  // base-actions only: the Alchemy setup stack (the Worker shell, the Workers Builds link, and the
  // Convex project and keys).
  "alchemy.run.ts",
  // base-actions only: the Worker that `cf` uploads, and the build settings of the Wrangler bundler.
  "cloudflare.config.ts",
  "wrangler.config.ts",
  // base-actions only: the GitHub Actions workflow that plans, deploys, and destroys the stack.
  ".github/workflows/alchemy.yml",
  // base-actions only: the names of the stack, the Worker, and the Convex project.
  "scripts/deploy-names.ts",
  "scripts/deploy-names.test.ts",
  // base-actions only: the confirmed destroy of the whole app.
  "scripts/destroy-app.ts",
  // base-actions only: the Worker Build Output that `cf` uploads, and the Worker Preview upload
  // with the preview URL for the Workers Builds pull request comment. base deploys with Wrangler.
  "scripts/build-worker.ts",
  "scripts/deploy-preview.ts",
  // Deploy scripts and dependencies: Wrangler in base; Alchemy, Effect, cf, Wrangler, and the
  // @samebase Alchemy providers in base-actions.
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
