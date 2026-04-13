#!/usr/bin/env node
// @ts-check
import path from "node:path";
import { collectDaytonaRuntimeManifest } from "../runtime/daytonaRuntimeManifest.ts";

const HELP_TEXT = `Usage: scripts/daytona-runtime-manifest.ts [options]

Collect a normalized, redacted Daytona runtime manifest for a bootstrapped repo.

Options:
  --repo-dir <path>     Repo root to inspect.
                        Default: current working directory
  --app-root <path>     App root relative to the repo root.
                        Default: apps/noter
  --preview-port <n>    Frontend preview port to check.
                        Default: 5173
  --pretty              Pretty-print JSON output.
  -h, --help            Show this help message.
`;

const options = parseArgs(process.argv.slice(2));
if (options.showHelp) {
  console.log(HELP_TEXT);
  process.exit(0);
}

const manifest = await collectDaytonaRuntimeManifest({
  repoDir: options.repoDir ?? process.cwd(),
  appRootRelativePath: options.appRoot ?? path.join("apps", "noter"),
  previewPort: options.previewPort,
});

console.log(JSON.stringify(manifest, null, options.pretty ? 2 : undefined));

/**
 * @param {string[]} args
 * @returns {{
 *   repoDir: string | null
 *   appRoot: string | null
 *   previewPort: number | undefined
 *   pretty: boolean
 *   showHelp: boolean
 * }}
 */
function parseArgs(args: string[]): {
  repoDir: string | null;
  appRoot: string | null;
  previewPort: number | undefined;
  pretty: boolean;
  showHelp: boolean;
} {
  const result: {
    repoDir: string | null;
    appRoot: string | null;
    previewPort: number | undefined;
    pretty: boolean;
    showHelp: boolean;
  } = {
    repoDir: null,
    appRoot: null,
    previewPort: undefined,
    pretty: false,
    showHelp: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--repo-dir") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        exitWithError(`Missing value for ${arg}\n\n${HELP_TEXT}`);
      }
      result.repoDir = value;
      index += 1;
      continue;
    }
    if (arg === "--app-root") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        exitWithError(`Missing value for ${arg}\n\n${HELP_TEXT}`);
      }
      result.appRoot = value;
      index += 1;
      continue;
    }
    if (arg === "--preview-port") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        exitWithError(`Invalid value for ${arg}\n\n${HELP_TEXT}`);
      }
      result.previewPort = value;
      index += 1;
      continue;
    }
    if (arg === "--pretty") {
      result.pretty = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      result.showHelp = true;
      continue;
    }
    exitWithError(`Unknown argument: ${arg}\n\n${HELP_TEXT}`);
  }

  return result;
}

/**
 * @param {string} message
 * @returns {never}
 */
function exitWithError(message: string): never {
  console.error(message);
  process.exit(1);
  throw new Error(message);
}
