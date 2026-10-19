#!/usr/bin/env node
import { collectTemplateFiles, type CollectedTemplateFile } from "./export-starter-manifest.ts";
import { isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import {
  actionsTemplateSourceRoot,
  workersTemplateSourceRoot,
} from "./publish-repository-exports.ts";

/**
templates/base-actions is templates/base-workers plus an Alchemy setup stack that GitHub Actions runs to set
up the providers; Workers Builds deploys both templates the same way. These paths belong to the
stack and may differ between the two templates or exist only in base-actions. Every other path must
exist in both with the same bytes and mode.
*/
export const templateDeployPaths = [
  // The setup stack: the Worker shell, the Workers Builds link, the Convex project and keys.
  "alchemy.run.ts",
  // The workflow that plans and deploys the stack.
  ".github/workflows/alchemy.yml",
  // The workflow that destroys the app after the typed confirmation.
  ".github/workflows/destroy.yml",
  // The stack, Worker, and Convex project names from GITHUB_REPOSITORY.
  "scripts/deploy-names.ts",
  "scripts/deploy-names.test.ts",
  // The confirmed destroy of what the stack owns.
  "scripts/destroy-app.ts",
  // The setup output for Samebase: its contract, and its publish after a deploy.
  "scripts/setup-output.ts",
  "scripts/publish-setup-output.ts",
  "scripts/publish-setup-output.test.ts",
  // Alchemy, Effect, and the @samebase Alchemy providers as development dependencies.
  "package.json",
  // The lockfile of those dependencies.
  "pnpm-lock.yaml",
  // Type-checks alchemy.run.ts as Node code with the scripts.
  "tsconfig.node.json",
  // Ignores the files of the Alchemy CLI.
  ".gitignore",
  // Documents the setup stack.
  "README.md",
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
      problems.push(`${baseFile.relativePath} (only in ${workersTemplateSourceRoot})`);
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
    baseFiles: await collectTemplateFiles(repoRoot, workersTemplateSourceRoot),
    actionsFiles: await collectTemplateFiles(repoRoot, actionsTemplateSourceRoot),
    deployPaths: templateDeployPaths,
  });
  if (problems.length > 0) {
    throw new Error(`${workersTemplateSourceRoot} and ${actionsTemplateSourceRoot} must share these files:
${problems.map((problem) => `  ${problem}`).join("\n")}
Apply the change to the other template too.`);
  }
  console.log(
    `${workersTemplateSourceRoot} and ${actionsTemplateSourceRoot} share every file outside the deploy paths.`,
  );
}

if (isMainModule(import.meta.url)) {
  await runMain(() => checkTemplateSync(resolveRepoRoot()));
}
