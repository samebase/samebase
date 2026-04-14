#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {
  failUnexpectedArgument,
  isHelpArg,
  requireOptionValue,
} from "./lib/cliArgs.ts";
import {
  fail,
  isMainModule,
  resolveRepoRoot,
  runMain,
} from "./lib/scriptRuntime.ts";

const HELP_TEXT = `Usage: scripts/daytona-write-source-env.ts [options]

Write a Daytona-specific cloud dev source env file for anonymous local bootstrap.

Options:
  --output <path>   Output env file path.
                    Default: apps/noter/.env.daytona-source.local
  --optional        Exit successfully when no usable Daytona cloud dev source is available.
                    Any stale output file will be removed.
  -h, --help        Show this help message.
`;

type Options = {
  output?: string;
  optional: boolean;
  showHelp: boolean;
};

type SourceDeploymentArgs = {
  daytonaDeployKey: string | undefined;
  convexDeployment: string | undefined;
};

type EnvEntry = {
  name: string;
  value: string;
};

export function parseArgs(args: string[]): Options {
  const options: Options = {
    optional: false,
    showHelp: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--output") {
      options.output = requireOptionValue(args, index, arg, HELP_TEXT);
      index += 1;
      continue;
    }
    if (arg === "--optional") {
      options.optional = true;
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

export async function main(options: Options): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const outputPath = path.resolve(
    options.output ??
      path.join(repoRoot, "apps", "noter", ".env.daytona-source.local"),
  );

  const resolved = resolveSourceDeployment({
    daytonaDeployKey: process.env.DAYTONA_CONVEX_DEPLOY_KEY,
    convexDeployment: process.env.CONVEX_DEPLOYMENT,
  });

  if (resolved.status === "missing") {
    removeFileIfExists(outputPath);
    if (options.optional) {
      console.log(
        "No Daytona cloud dev deployment available; skipped source env generation.",
      );
      return;
    }

    fail(
      "Could not infer a Daytona cloud dev deployment. " +
        "Set DAYTONA_CONVEX_DEPLOY_KEY to a dev deployment before generating the source env.",
    );
  }

  if (resolved.status === "invalid") {
    removeFileIfExists(outputPath);
    fail(resolved.message);
  }

  writeEnvFile(outputPath, [
    { name: "CONVEX_DEPLOYMENT", value: resolved.deployment },
  ]);
  console.log(`Wrote ${outputPath}`);
}

export function resolveSourceDeployment(args: SourceDeploymentArgs):
  | {
      status: "ok";
      deployment: string;
    }
  | {
      status: "missing";
    }
  | {
      status: "invalid";
      message: string;
    } {
  const daytonaSpecifier = extractDaytonaDeploymentSpecifier(
    args.daytonaDeployKey,
  );
  if (daytonaSpecifier !== null) {
    return parseSourceDeployment(daytonaSpecifier, "DAYTONA_CONVEX_DEPLOY_KEY");
  }

  const convexDeployment = args.convexDeployment?.trim() ?? "";
  if (convexDeployment.length === 0) {
    return { status: "missing" };
  }

  return parseSourceDeployment(convexDeployment, "CONVEX_DEPLOYMENT");
}

export function extractDaytonaDeploymentSpecifier(
  rawDeployKey: string | undefined,
): string | null {
  const trimmed = rawDeployKey?.trim() ?? "";
  if (trimmed.length === 0) {
    return null;
  }

  const [deploymentSpecifier] = trimmed.split("|", 1);
  const normalized = deploymentSpecifier.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseSourceDeployment(
  rawDeployment: string,
  sourceName: string,
):
  | {
      status: "ok";
      deployment: string;
    }
  | {
      status: "missing";
    }
  | {
      status: "invalid";
      message: string;
    } {
  const normalized = rawDeployment.trim();
  if (normalized.length === 0) {
    return { status: "missing" };
  }

  if (isAnonymousLikeDeploymentName(normalized)) {
    return { status: "missing" };
  }

  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex <= 0) {
    return {
      status: "invalid",
      message:
        `${sourceName} must start with "dev:" for Daytona local seed copying ` +
        `(received "${normalized}").`,
    };
  }

  const deploymentType = normalized.slice(0, separatorIndex).trim();
  const deploymentName = normalized.slice(separatorIndex + 1).trim();
  if (deploymentName.length === 0) {
    return {
      status: "invalid",
      message: `${sourceName} does not contain a deployment name.`,
    };
  }

  if (isAnonymousLikeDeploymentName(deploymentName)) {
    return { status: "missing" };
  }

  if (deploymentType === "dev") {
    return { status: "ok", deployment: `dev:${deploymentName}` };
  }

  if (deploymentType === "preview" || deploymentType === "prod") {
    return {
      status: "invalid",
      message:
        `${sourceName} must reference a cloud dev deployment for Daytona local mode ` +
        `(received "${normalized}").`,
    };
  }

  return {
    status: "invalid",
    message: `${sourceName} has an unsupported deployment type: "${deploymentType}".`,
  };
}

function isAnonymousLikeDeploymentName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    normalized.startsWith("anonymous-") ||
    normalized.startsWith("local-") ||
    normalized.startsWith("anonymous:") ||
    normalized.startsWith("local:")
  );
}

function writeEnvFile(filePath: string, entries: EnvEntry[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const contents =
    entries.map((entry) => `${entry.name}=${entry.value}`).join("\n") + "\n";
  fs.writeFileSync(filePath, contents, "utf8");
}

function removeFileIfExists(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  fs.rmSync(filePath);
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
