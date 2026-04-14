#!/usr/bin/env node
import fs from "node:fs";

import { diffDaytonaRuntimeManifests } from "../runtime/daytonaRuntimeManifest.ts";
import {
  failMissingRequiredOptions,
  failUnexpectedArgument,
  isHelpArg,
  requireOptionValue,
} from "./lib/cliArgs.ts";
import { fail, isMainModule, runMain } from "./lib/scriptRuntime.ts";

const HELP_TEXT = `Usage: scripts/daytona-compare-runtime.ts --left <path> --right <path>

Compare two normalized Daytona runtime manifests and exit non-zero on mismatch.

Options:
  --left <path>   Left manifest JSON file.
  --right <path>  Right manifest JSON file.
  -h, --help      Show this help message.
`;

type DaytonaRuntimeCompareOptions = {
  left: string | null;
  right: string | null;
  showHelp: boolean;
};

export function parseArgs(args: string[]): DaytonaRuntimeCompareOptions {
  const options: DaytonaRuntimeCompareOptions = {
    left: null,
    right: null,
    showHelp: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--left") {
      options.left = requireOptionValue(args, index, arg, HELP_TEXT);
      index += 1;
      continue;
    }
    if (arg === "--right") {
      options.right = requireOptionValue(args, index, arg, HELP_TEXT);
      index += 1;
      continue;
    }
    if (isHelpArg(arg)) {
      options.showHelp = true;
      continue;
    }

    failUnexpectedArgument(arg, HELP_TEXT);
  }

  if (!options.showHelp && (!options.left || !options.right)) {
    failMissingRequiredOptions(
      "Both --left and --right are required.",
      HELP_TEXT,
    );
  }

  return options;
}

export async function main(
  options: DaytonaRuntimeCompareOptions,
): Promise<void> {
  if (!options.left || !options.right) {
    failMissingRequiredOptions(
      "Both --left and --right are required.",
      HELP_TEXT,
    );
  }

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
  const options = parseArgs(process.argv.slice(2));
  await runMain(async () => {
    if (options.showHelp) {
      console.log(HELP_TEXT);
      return;
    }

    await main(options);
  });
}
