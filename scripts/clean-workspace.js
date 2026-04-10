#!/usr/bin/env node
// @ts-check
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const generatedPaths = [
  ".turbo",
  ".vite",
  "coverage",
  "test-results",
  "apps/noter/dist",
  "apps/noter/dev-dist",
  "apps/noter/e2e/test-results",
  "apps/noter/e2e/live-test-results",
  "apps/noter-starter-template/dist",
];

/**
 * Only remove known generated outputs so `pnpm clean` remains a safe repo-root
 * reset after moving off the old task-runner-specific clean command.
 */
for (const relativePath of generatedPaths) {
  const absolutePath = path.join(workspaceRoot, relativePath);
  if (!existsSync(absolutePath)) {
    continue;
  }

  rmSync(absolutePath, { force: true, recursive: true });
  console.log(`removed ${relativePath}`);
}
