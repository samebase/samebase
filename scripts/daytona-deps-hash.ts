#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE_IMAGE =
  "mcr.microsoft.com/devcontainers/javascript-node:24-bookworm";
const DEFAULT_PNPM_VERSION = "9.15.0";
const LOCKFILE_PATH = "pnpm-lock.yaml";

const INPUT_FILES: readonly string[] = [
  "Dockerfile.daytona-deps",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "eslint-rules/package.json",
  "apps/noter/package.json",
  "apps/noter-starter-template/package.json",
];

function sha256(contents: import("node:crypto").BinaryLike): string {
  return createHash("sha256").update(contents).digest("hex");
}

function readFileContents(rootDir: string, relativePath: string): Buffer {
  const absolutePath = path.join(rootDir, relativePath);
  return fs.readFileSync(absolutePath);
}

function computeLockHash(rootDir: string): string {
  const lockfile = readFileContents(rootDir, LOCKFILE_PATH);
  return sha256(lockfile);
}

function computeInputHash(
  rootDir: string,
  baseImage: string,
  pnpmVersion: string,
): string {
  const hash = createHash("sha256");
  hash.update(`baseImage=${baseImage}\n`);
  hash.update(`pnpmVersion=${pnpmVersion}\n`);

  for (const relativePath of INPUT_FILES) {
    const fileContents = readFileContents(rootDir, relativePath);
    const fileHash = sha256(fileContents);
    hash.update(`${relativePath}:${fileHash}\n`);
  }

  return hash.digest("hex");
}

function main(): void {
  const rootDir = process.cwd();
  const baseImage = DEFAULT_BASE_IMAGE;
  const pnpmVersion = DEFAULT_PNPM_VERSION;

  const lockHash = computeLockHash(rootDir);
  const inputHash = computeInputHash(rootDir, baseImage, pnpmVersion);

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput && githubOutput.length > 0) {
    fs.appendFileSync(githubOutput, `lock_hash=${lockHash}\n`);
    fs.appendFileSync(githubOutput, `input_hash=${inputHash}\n`);
  } else {
    process.stdout.write(`lock_hash=${lockHash}\n`);
    process.stdout.write(`input_hash=${inputHash}\n`);
  }
}

main();
