#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { baseTemplateSourceRoot, workersTemplateSourceRoot } from "./publish-repository-exports.ts";

/**
templates/base and templates/base-workers are one app on two hosts: the Convex deployment through
convex-hosting, and a Cloudflare Worker. This patch is their difference, the host files. Each
README.md is written for its host, and each pnpm-lock.yaml follows its package.json, which the patch
includes and CI installs with a frozen lockfile.
*/
const templateWorkersPatchPath = "templates/base-workers.patch";
const unpatchedPaths = ["README.md", "pnpm-lock.yaml"];

function renderTemplateWorkersPatch(repoRoot: string): string {
  const git = (args: readonly string[]) =>
    execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  // write-tree reads the index, so the patch follows staged changes, as template:export does.
  const stagedTree = (sourceRoot: string) => git(["write-tree", `--prefix=${sourceRoot}/`]).trim();
  // diff-tree is plumbing, so user diff settings such as diff.algorithm never change the patch.
  return git([
    "diff-tree",
    "-p",
    "--full-index",
    stagedTree(baseTemplateSourceRoot),
    stagedTree(workersTemplateSourceRoot),
    "--",
    ".",
    ...unpatchedPaths.map((unpatchedPath) => `:!${unpatchedPath}`),
  ]);
}

if (isMainModule(import.meta.url)) {
  await runMain(() => {
    const repoRoot = resolveRepoRoot();
    writeFileSync(
      path.join(repoRoot, templateWorkersPatchPath),
      renderTemplateWorkersPatch(repoRoot),
    );
  });
}
