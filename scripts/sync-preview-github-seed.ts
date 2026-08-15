#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

import {
  PREVIEW_SEED_GITHUB_USER_AUTHORIZATION_ENV_NAME,
  parsePreviewSeedGitHubUserAuthorization,
} from "../apps/samebase/shared/previewSeedGitHubAuthorization.ts";
import { readEnvFile } from "./lib/envFile.ts";
import { fail, isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";

const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

type SyncPreviewGitHubSeedOptions = {
  ownerLogins: string[];
  previewName: string | null;
};

type ConvexEnvSetSpec = {
  args: string[];
  input: string;
};

function readOptionValue(args: readonly string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value !== value.trim()) {
    fail(`${option} requires a value.`);
  }
  return value;
}

export function parseSyncPreviewGitHubSeedOptions(
  args: readonly string[],
): SyncPreviewGitHubSeedOptions {
  const ownerLogins: string[] = [];
  let previewName: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    switch (option) {
      case "--owner": {
        const ownerLogin = readOptionValue(args, index, option).toLowerCase();
        if (!/^[a-z0-9](?:[a-z0-9-]{0,38})$/.test(ownerLogin)) {
          fail(`Invalid GitHub owner login: ${ownerLogin}`);
        }
        if (ownerLogins.includes(ownerLogin)) {
          fail(`Duplicate GitHub owner login: ${ownerLogin}`);
        }
        ownerLogins.push(ownerLogin);
        index += 1;
        break;
      }
      case "--preview-name":
        if (previewName !== null) {
          fail("--preview-name can only be set once.");
        }
        previewName = readOptionValue(args, index, option);
        index += 1;
        break;
      default:
        fail(`Unknown option: ${option}`);
    }
  }

  if (ownerLogins.length === 0) {
    fail("Set at least one --owner GitHub login.");
  }
  return { ownerLogins, previewName };
}

export function buildConvexEnvSetSpec(args: {
  serializedAuthorization: string;
  previewName: string | null;
}): ConvexEnvSetSpec {
  return {
    args:
      args.previewName === null
        ? [
            "exec",
            "convex",
            "env",
            "default",
            "set",
            PREVIEW_SEED_GITHUB_USER_AUTHORIZATION_ENV_NAME,
            "--type",
            "preview",
          ]
        : [
            "exec",
            "convex",
            "env",
            "set",
            PREVIEW_SEED_GITHUB_USER_AUTHORIZATION_ENV_NAME,
            "--preview-name",
            args.previewName,
          ],
    input: args.serializedAuthorization,
  };
}

function buildDevelopmentAuthorizationQuery(ownerLogins: readonly string[]): string {
  return `const authorizations = await ctx.db.query("githubUserAuthorizations").take(2);
if (authorizations.length !== 1) {
  throw new Error("Expected one development GitHub user authorization.");
}
const authorization = authorizations[0];
const githubAccounts = await ctx.db
  .query("authAccounts")
  .withIndex("userIdAndProvider", (query) =>
    query.eq("userId", authorization.userId).eq("provider", "github"),
  )
  .take(2);
if (githubAccounts.length !== 1 || githubAccounts[0].providerAccountId !== authorization.githubUserId) {
  throw new Error("Expected one matching development GitHub sign-in identity.");
}
const ownerLogins = ${JSON.stringify(ownerLogins)};
const connectedGithubOwnerIds = [];
for (const ownerLogin of ownerLogins) {
  const organization = await ctx.db
    .query("organizations")
    .withIndex("by_github_owner_login_normalized", (query) =>
      query.eq("githubOwnerLoginNormalized", ownerLogin),
    )
    .unique();
  if (organization === null) {
    throw new Error(\`Development organization \${ownerLogin} is not connected.\`);
  }
  const membership = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization_and_user", (query) =>
      query.eq("organizationId", organization._id).eq("userId", authorization.userId),
    )
    .unique();
  if (membership === null) {
    throw new Error(\`The development GitHub user cannot access \${ownerLogin}.\`);
  }
  connectedGithubOwnerIds.push(organization.githubOwnerId);
}
return {
  version: 1,
  githubUserId: authorization.githubUserId,
  githubUserLogin: authorization.githubUserLogin,
  githubUserEmail: githubAccounts[0].emailVerified,
  accessToken: authorization.accessToken,
  accessTokenExpiresAt: authorization.accessTokenExpiresAt,
  refreshToken: authorization.refreshToken,
  refreshTokenExpiresAt: authorization.refreshTokenExpiresAt,
  connectedGithubOwnerIds,
};`;
}

function runConvexCommand(args: {
  appDir: string;
  commandArgs: readonly string[];
  env?: NodeJS.ProcessEnv;
  input?: string;
  label: string;
}): string {
  const result = spawnSync(PNPM_COMMAND, args.commandArgs, {
    cwd: args.appDir,
    env: args.env,
    input: args.input,
    encoding: "utf8",
    stdio: [args.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${args.label} failed.`);
  }
  return result.stdout;
}

export function syncPreviewGitHubSeed(args: readonly string[] = process.argv.slice(2)): void {
  const options = parseSyncPreviewGitHubSeedOptions(args);
  const repoRoot = resolveRepoRoot();
  const appDir = path.join(repoRoot, "apps", "samebase");
  const appEnv = readEnvFile(path.join(appDir, ".env.local"));
  if (!appEnv?.vars.CONVEX_DEPLOYMENT?.startsWith("dev:")) {
    fail("The Samebase .env.local file must select a Convex development deployment.");
  }
  const projectEnvironment = {
    ...process.env,
    CONVEX_DEPLOY_KEY: "",
  };

  const rawAuthorization = runConvexCommand({
    appDir,
    commandArgs: [
      "exec",
      "convex",
      "run",
      "--deployment",
      "dev",
      "--inline-query",
      buildDevelopmentAuthorizationQuery(options.ownerLogins),
      "--codegen",
      "disable",
      "--typecheck",
      "disable",
    ],
    env: projectEnvironment,
    label: "Reading the development GitHub authorization",
  });
  const authorization = parsePreviewSeedGitHubUserAuthorization(rawAuthorization.trim());
  const serializedAuthorization = JSON.stringify(authorization);

  const defaultSetSpec = buildConvexEnvSetSpec({
    serializedAuthorization,
    previewName: null,
  });
  runConvexCommand({
    appDir,
    commandArgs: defaultSetSpec.args,
    env: projectEnvironment,
    input: defaultSetSpec.input,
    label: "Updating the Convex preview defaults",
  });
  console.log(`Updated the Convex preview GitHub seed for ${options.ownerLogins.join(", ")}.`);

  if (options.previewName === null) {
    return;
  }
  const previewSetSpec = buildConvexEnvSetSpec({
    serializedAuthorization,
    previewName: options.previewName,
  });
  try {
    runConvexCommand({
      appDir,
      commandArgs: previewSetSpec.args,
      env: projectEnvironment,
      input: previewSetSpec.input,
      label: `Updating preview ${options.previewName}`,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("PreviewNotFound:")) {
      console.log(
        `Preview ${options.previewName} does not exist yet. It will use the updated default.`,
      );
      return;
    }
    throw error;
  }
  runConvexCommand({
    appDir,
    commandArgs: [
      "exec",
      "convex",
      "run",
      "devAuth:seedPasswordAccount",
      "--preview-name",
      options.previewName,
      "--codegen",
      "disable",
      "--typecheck",
      "disable",
    ],
    env: projectEnvironment,
    label: `Reseeding preview ${options.previewName}`,
  });
  console.log(`Updated and reseeded preview ${options.previewName}.`);
}

if (isMainModule(import.meta.url)) {
  await runMain(() => syncPreviewGitHubSeed());
}
