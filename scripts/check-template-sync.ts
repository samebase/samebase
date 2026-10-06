#!/usr/bin/env node
import { collectTemplateFiles, type CollectedTemplateFile } from "./export-starter-manifest.ts";
import { isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { actionsTemplateSourceRoot, baseTemplateSourceRoot } from "./publish-repository-exports.ts";

/**
templates/base-actions is templates/base with two layers on top: `cf` deploys the Worker from
Workers Builds, and an Alchemy setup stack in GitHub Actions sets up the providers. These paths may
differ between the two templates or exist in only one of them, each for one of the two layers. Every
other path must exist in both with the same bytes and mode. When templates/base moves to `cf`, the
`cf` paths become shared and leave this list.
*/
export const templateDeployPaths = [
  // Alchemy: the setup stack (the Worker shell, the Workers Builds link, the Convex project and keys).
  "alchemy.run.ts",
  // Alchemy: the workflow that plans, deploys, and destroys the stack.
  ".github/workflows/alchemy.yml",
  // Alchemy: the stack, Worker, and Convex project names from GITHUB_REPOSITORY.
  "scripts/deploy-names.ts",
  "scripts/deploy-names.test.ts",
  // Alchemy: the confirmed destroy of what the stack owns.
  "scripts/destroy-app.ts",
  // cf: the Worker configuration, and the settings of the Wrangler bundler that cf runs.
  "cloudflare.config.ts",
  "wrangler.config.ts",
  // cf: the Build Output that cf uploads, and the Preview upload with the URL for the Workers
  // Builds pull request comment.
  "scripts/build-worker.ts",
  "scripts/deploy-preview.ts",
  // cf deploy scripts and Build Output in build:app; Alchemy, Effect, cf, and the @samebase Alchemy
  // providers as dependencies.
  "package.json",
  // The lockfile of those dependencies.
  "pnpm-lock.yaml",
  // Type-checks alchemy.run.ts, cloudflare.config.ts, and wrangler.config.ts as Node code.
  "tsconfig.node.json",
  // Ignores the Alchemy CLI files and the Build Output.
  ".gitignore",
  // Documents the cf deploy scripts and the setup stack.
  "README.md",
  // base only: the Wrangler configuration, until templates/base moves to cf.
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
