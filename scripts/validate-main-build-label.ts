#!/usr/bin/env node
import { execSync } from "node:child_process";
import process from "node:process";

import { resolveAppCommitNumber } from "../apps/samebase/dev/appBuildMetadata.ts";

function readGitOutput(command: string): string | null {
  try {
    return execSync(command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function runGitCommand(command: string): boolean {
  try {
    execSync(command, {
      stdio: "inherit",
    });
    return true;
  } catch {
    return false;
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const commitNumber = resolveAppCommitNumber({
  envCommitNumber: undefined,
  readGitOutput,
  runGitCommand,
});
if (commitNumber === null) {
  fail("Unable to resolve the app build number from Git history.");
}

const subject = readGitOutput("git show -s --format=%s HEAD");
if (!subject) {
  fail("Unable to read the HEAD commit subject.");
}

const expectedPrefix = `v${commitNumber}:`;
if (!subject.startsWith(expectedPrefix)) {
  fail(`Expected the HEAD commit subject to start with ${expectedPrefix} but got: ${subject}`);
}
