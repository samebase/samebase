#!/usr/bin/env node
import fs from "node:fs";
import { Command } from "commander";

import { diffDaytonaRuntimeManifests } from "../runtime/daytonaRuntimeManifest.ts";
import { fail, isMainModule, runMain } from "./lib/scriptRuntime.ts";

type DaytonaRuntimeCompareOptions = {
  left: string;
  right: string;
};

export function createCommand(): Command {
  return new Command()
    .name("daytona-compare-runtime")
    .description(
      "Compare two normalized Daytona runtime manifests and exit non-zero on mismatch.",
    )
    .showHelpAfterError()
    .requiredOption("--left <path>", "Left manifest JSON file.")
    .requiredOption("--right <path>", "Right manifest JSON file.");
}

export async function main(
  options: DaytonaRuntimeCompareOptions,
): Promise<void> {
  const left = readJsonFile(options.left);
  const right = readJsonFile(options.right);
  const diffs = diffDaytonaRuntimeManifests(left, right);

  if (diffs.length === 0) {
    console.log("Runtime manifests match.");
    return;
  }

  console.error("Runtime manifests differ:");
  for (const diff of diffs) {
    console.error(`- ${diff}`);
  }

  process.exitCode = 1;
}

function readJsonFile(filePath: string): unknown {
  try {
    const raw = fs.readFileSync(filePath, "utf8");

    const parsed: unknown = JSON.parse(raw);
    return validateManifest(filePath, parsed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    fail(`Failed to read ${filePath}: ${reason}`);
  }
}

function validateManifest(
  filePath: string,
  value: unknown,
): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(`${filePath} must contain a JSON object.`);
  }
  if (Reflect.get(value, "version") !== 1) {
    fail(`${filePath} must contain a Daytona runtime manifest with version 1.`);
  }

  const repo = Reflect.get(value, "repo");
  if (!isRecord(repo) || typeof Reflect.get(repo, "headSha") !== "string") {
    fail(`${filePath} is missing repo.headSha.`);
  }
  if (typeof Reflect.get(value, "appRoot") !== "string") {
    fail(`${filePath} is missing appRoot.`);
  }

  const envFiles = Reflect.get(value, "envFiles");
  if (!isRecord(envFiles)) {
    fail(`${filePath} is missing envFiles.`);
  }

  const services = Reflect.get(value, "services");
  if (
    !isRecord(services) ||
    typeof Reflect.get(services, "previewPort") !== "number" ||
    typeof Reflect.get(services, "previewPortListening") !== "boolean"
  ) {
    fail(
      `${filePath} is missing services.previewPort or services.previewPortListening.`,
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (isMainModule(import.meta.url)) {
  const options = createCommand().parse().opts<DaytonaRuntimeCompareOptions>();
  await runMain(async () => {
    await main(options);
  });
}
