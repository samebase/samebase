#!/usr/bin/env node
import path from "node:path";
import { Command, InvalidArgumentError } from "commander";

import { collectDaytonaRuntimeManifest } from "../runtime/daytonaRuntimeManifest.ts";
import { isMainModule, runMain } from "./lib/scriptRuntime.ts";

type DaytonaRuntimeManifestOptions = {
  repoDir?: string;
  appRoot?: string;
  previewPort?: number;
  pretty: boolean;
};

function parsePreviewPort(value: string): number {
  const previewPort = Number(value);
  if (!Number.isInteger(previewPort) || previewPort <= 0) {
    throw new InvalidArgumentError("must be a positive integer");
  }

  return previewPort;
}

export function createCommand(): Command {
  return new Command()
    .name("daytona-runtime-manifest")
    .description(
      "Collect a normalized, redacted Daytona runtime manifest for a bootstrapped repo.",
    )
    .showHelpAfterError()
    .option("--repo-dir <path>", "Repo root to inspect.")
    .option("--app-root <path>", "App root relative to the repo root.")
    .option(
      "--preview-port <n>",
      "Frontend preview port to check.",
      parsePreviewPort,
    )
    .option("--pretty", "Pretty-print JSON output.", false);
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
  const options = createCommand().parse().opts<DaytonaRuntimeManifestOptions>();
  await runMain(async () => {
    await main(options);
  });
}
