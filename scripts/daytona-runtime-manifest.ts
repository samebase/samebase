#!/usr/bin/env node
import path from "node:path";

import { collectDaytonaRuntimeManifest } from "../runtime/daytonaRuntimeManifest.ts";
import {
  failUnexpectedArgument,
  isHelpArg,
  parsePositiveIntegerOption,
  requireOptionValue,
} from "./lib/cliArgs.ts";
import { isMainModule, runMain } from "./lib/scriptRuntime.ts";

const HELP_TEXT = `Usage: scripts/daytona-runtime-manifest.ts [options]

Collect a normalized, redacted Daytona runtime manifest for a bootstrapped repo.

Options:
  --repo-dir <path>     Repo root to inspect.
  --app-root <path>     App root relative to the repo root.
  --preview-port <n>    Frontend preview port to check.
  --pretty              Pretty-print JSON output.
  -h, --help            Show this help message.
`;

type DaytonaRuntimeManifestOptions = {
  repoDir?: string;
  appRoot?: string;
  previewPort?: number;
  pretty: boolean;
  showHelp: boolean;
};

export function parseArgs(args: string[]): DaytonaRuntimeManifestOptions {
  const options: DaytonaRuntimeManifestOptions = {
    pretty: false,
    showHelp: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--repo-dir") {
      options.repoDir = requireOptionValue(args, index, arg, HELP_TEXT);
      index += 1;
      continue;
    }
    if (arg === "--app-root") {
      options.appRoot = requireOptionValue(args, index, arg, HELP_TEXT);
      index += 1;
      continue;
    }
    if (arg === "--preview-port") {
      options.previewPort = parsePositiveIntegerOption(
        requireOptionValue(args, index, arg, HELP_TEXT),
        arg,
        HELP_TEXT,
      );
      index += 1;
      continue;
    }
    if (arg === "--pretty") {
      options.pretty = true;
      continue;
    }
    if (isHelpArg(arg)) {
      options.showHelp = true;
      continue;
    }

    failUnexpectedArgument(arg, HELP_TEXT);
  }

  return options;
}

export async function main(
  options: DaytonaRuntimeManifestOptions,
): Promise<void> {
  const manifest = await collectDaytonaRuntimeManifest({
    repoDir: options.repoDir ?? process.cwd(),
    appRootRelativePath: options.appRoot ?? path.join("apps", "noter"),
    previewPort: options.previewPort,
  });

  console.log(JSON.stringify(manifest, null, options.pretty ? 2 : undefined));
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
