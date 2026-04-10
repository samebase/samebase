#!/usr/bin/env node
// @ts-check
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { WORKTREE_ENV_ALLOWLIST } from "./worktree-env-allowlist.js";
import {
  buildCloudDeploymentUrl,
  extractMatchingDeploymentDeployKey,
  normalizeEnvQueryResult,
} from "../runtime/convexSyncDevEnv.js";

/**
 * @typedef {'dev' | 'prod' | 'preview'} DeploymentType
 *
 * @typedef {{
 *   sourceEnv: string | null
 *   targetEnv: string | null
 *   checkPrereqs: boolean
 *   allowMissingSourceEnv: boolean
 *   dryRun: boolean
 *   showHelp: boolean
 * }} SyncOptions
 *
 * @typedef {{
 *   path: string
 *   vars: Record<string, string>
 * }} EnvFile
 *
 * @typedef {{
 *   type: DeploymentType
 *   name: string
 *   raw: string
 * }} Deployment
 *
 * @typedef {{
 *   name: string
 *   value: string
 * }} EnvEntry
 *
 * @typedef {{
 *   worktree: string
 *   branch: string | null
 * }} WorktreeInfo
 *
 * @typedef {{
 *   new (
 *     address: string,
 *     options?: { logger?: boolean },
 *   ): {
 *     setAdminAuth(token: string): void
 *     query(
 *       functionReference: unknown,
 *       args: Record<string, never>,
 *     ): Promise<unknown>
 *   }
 * }} ConvexHttpClientConstructor
 *
 * @typedef {{
 *   ConvexHttpClient: ConvexHttpClientConstructor
 * }} ConvexBrowserModule
 *
 * @typedef {{
 *   makeFunctionReference(functionName: string): unknown
 * }} ConvexServerModule
 */

const HELP_TEXT = `Usage: scripts/convex-sync-dev-env.js [options]

Build a local seed env file by pulling allowlisted values from the cloud dev deployment.

Options:
  --source-env <path>     Path to a dev env file (contains CONVEX_DEPLOYMENT=dev:*).
                          If omitted, the script scans git worktrees and picks main.
  --target-env <path>     Output env file path.
                          Default: apps/noter/.env.anon-seed.local
  --check-prereqs         Validate the source env and deploy key without generating a seed file.
  --allow-missing-source-env
                          Allow local-only seed generation when no cloud dev source env is discoverable.
  --dry-run               Show what would be written.
  -h, --help              Show this help message.
`;

const options = parseArgs(process.argv.slice(2));
if (options.showHelp) {
  console.log(HELP_TEXT);
  process.exit(0);
}

const repoRoot = resolveRepoRoot();
const appDir = path.join(repoRoot, "apps", "noter");
const targetEnvPath = path.resolve(
  options.targetEnv ?? path.join(appDir, ".env.anon-seed.local"),
);
const localAnonEnvPath = path.join(appDir, ".env.local");

await main();

async function main() {
  const validatedSource = validateSourceEnvPrereqs();
  if (options.checkPrereqs) {
    if (validatedSource === null) {
      console.log(
        "No cloud dev source env found; allowing local-only seed env.",
      );
      process.exit(0);
    }
    console.log(`Validated worktree seed source env: ${validatedSource.path}`);
    process.exit(0);
  }

  const localAnonEnv = readEnvFile(localAnonEnvPath);
  if (!localAnonEnv) {
    exitWithError(
      `Local env file not found: ${localAnonEnvPath}\n` +
        "Run anonymous Convex dev once before generating the seed env.",
    );
  }

  const localAnonDeployment = parseDeploymentFromEnv(localAnonEnv.vars);
  if (!localAnonDeployment) {
    exitWithError(
      `Local env file does not contain a usable CONVEX_DEPLOYMENT: ${localAnonEnvPath}`,
    );
  }
  if (!isAnonymousLikeDeploymentName(localAnonDeployment.name)) {
    exitWithError(
      `Local deployment must be anonymous/local (got ${localAnonDeployment.raw}).`,
    );
  }

  if (validatedSource === null) {
    if (options.dryRun) {
      console.log(`Would write 1 seed var to ${targetEnvPath}`);
      console.log("- CONVEX_DEPLOYMENT");
      process.exit(0);
    }

    writeEnvFile(targetEnvPath, [
      { name: "CONVEX_DEPLOYMENT", value: localAnonDeployment.raw },
    ]);
    console.log(
      "No cloud dev source env found. Wrote seed env file with local CONVEX_DEPLOYMENT only.",
    );
    process.exit(0);
  }

  const entries = (
    await listDeploymentEnvVars({
      appDir,
      envFile: validatedSource.path,
      sourceDeployment: validatedSource.deployment,
    })
  ).filter(({ name }) => WORKTREE_ENV_ALLOWLIST.has(name));

  const sorted = entries.slice().sort((a, b) => a.name.localeCompare(b.name));

  if (options.dryRun) {
    console.log(
      `Would write ${sorted.length + 1} seed var${sorted.length + 1 === 1 ? "" : "s"} ` +
        `from ${validatedSource.deployment.raw} to ${targetEnvPath}`,
    );
    console.log("- CONVEX_DEPLOYMENT");
    for (const { name } of sorted) {
      console.log(`- ${name}`);
    }
    process.exit(0);
  }

  writeEnvFile(targetEnvPath, [
    { name: "CONVEX_DEPLOYMENT", value: localAnonDeployment.raw },
    ...sorted,
  ]);
  console.log(
    `Wrote ${sorted.length + 1} seed var${sorted.length + 1 === 1 ? "" : "s"} ` +
      `to ${targetEnvPath}`,
  );
}

/**
 * @param {string[]} args
 * @returns {SyncOptions}
 */
function parseArgs(args) {
  /** @type {SyncOptions} */
  const result = {
    sourceEnv: null,
    targetEnv: null,
    checkPrereqs: false,
    allowMissingSourceEnv: false,
    dryRun: false,
    showHelp: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--source-env") {
      const value = args[i + 1];
      if (!value || value.startsWith("-")) {
        exitWithError(`Missing value for ${arg}\n\n${HELP_TEXT}`);
      }
      result.sourceEnv = value;
      i += 1;
      continue;
    }
    if (arg === "--target-env") {
      const value = args[i + 1];
      if (!value || value.startsWith("-")) {
        exitWithError(`Missing value for ${arg}\n\n${HELP_TEXT}`);
      }
      result.targetEnv = value;
      i += 1;
      continue;
    }
    if (arg === "--check-prereqs") {
      result.checkPrereqs = true;
      continue;
    }
    if (arg === "--allow-missing-source-env") {
      result.allowMissingSourceEnv = true;
      continue;
    }
    if (arg === "--dry-run") {
      result.dryRun = true;
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

/** @returns {string} */
function resolveRepoRoot() {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (result.status === 0) {
    return (result.stdout || "").trim() || process.cwd();
  }
  return process.cwd();
}

/**
 * @param {string} filePath
 * @returns {EnvFile | null}
 */
function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const contents = fs.readFileSync(filePath, "utf8");
  /** @type {Record<string, string>} */
  const vars = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    const value = stripQuotes(trimmed.slice(eqIndex + 1).trim());
    vars[key] = value;
  }
  return { path: filePath, vars };
}

/**
 * @param {string} value
 * @returns {string}
 */
function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * @param {Record<string, string>} vars
 * @returns {Deployment | null}
 */
function parseDeploymentFromEnv(vars) {
  const raw = vars.CONVEX_DEPLOYMENT;
  if (!raw) {
    return null;
  }
  const value = stripTrailingInlineComment(raw.trim());
  if (!value) {
    return null;
  }

  if (isAnonymousLikeDeploymentName(value)) {
    return { type: "dev", name: value, raw: value };
  }

  const index = value.indexOf(":");
  if (index <= 0) {
    return null;
  }
  const prefix = value.slice(0, index).trim();
  const name = value.slice(index + 1).trim();
  if (!name) {
    return null;
  }
  if (isDeploymentType(prefix)) {
    return { type: prefix, name, raw: value };
  }
  const isAnonymousPrefix = prefix === "anonymous" || prefix === "local";
  if (isAnonymousPrefix && isAnonymousLikeDeploymentName(name)) {
    return { type: "dev", name, raw: value };
  }
  return null;
}

/**
 * @param {string} value
 * @returns {string}
 */
function stripTrailingInlineComment(value) {
  return value.replace(/\s+#.*$/, "").trim();
}

/**
 * @param {string} value
 * @returns {value is DeploymentType}
 */
function isDeploymentType(value) {
  return value === "dev" || value === "prod" || value === "preview";
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isAnonymousLikeDeploymentName(name) {
  return name.startsWith("anonymous-") || name.startsWith("local-");
}

/**
 * @returns {{ path: string, envFile: EnvFile, deployment: Deployment } | null}
 */
function validateSourceEnvPrereqs() {
  const sourceEnvPath = options.sourceEnv
    ? path.resolve(options.sourceEnv)
    : findSourceEnvFile(repoRoot);

  if (!sourceEnvPath) {
    if (options.allowMissingSourceEnv) {
      return null;
    }
    exitWithMissingSourceEnvError();
  }

  const sourceEnv = readEnvFile(sourceEnvPath);
  if (!sourceEnv) {
    exitWithError(`Source env file not found: ${sourceEnvPath}`);
  }

  const sourceDeployment = parseDeploymentFromEnv(sourceEnv.vars);
  if (!sourceDeployment) {
    exitWithError(
      `Source env does not contain a usable CONVEX_DEPLOYMENT: ${sourceEnvPath}`,
    );
  }
  if (sourceDeployment.type !== "dev") {
    exitWithError(
      `Source deployment must be dev (got ${sourceDeployment.raw}).`,
    );
  }
  if (isAnonymousLikeDeploymentName(sourceDeployment.name)) {
    exitWithError(
      `Source deployment is anonymous (${sourceDeployment.raw}). ` +
        "Use a cloud dev deployment as source.",
    );
  }

  if (findMatchingSourceDeployKey(sourceEnv, sourceDeployment) === null) {
    exitWithMissingSourceDeployKeyError({
      envFile: sourceEnv.path,
      deployment: sourceDeployment.raw,
    });
  }

  return {
    path: sourceEnv.path,
    envFile: sourceEnv,
    deployment: sourceDeployment,
  };
}

/**
 * @param {EnvFile} sourceEnv
 * @param {Deployment} sourceDeployment
 * @returns {string | null}
 */
function findMatchingSourceDeployKey(sourceEnv, sourceDeployment) {
  const envDeployKey = extractMatchingDeploymentDeployKey({
    rawDeployKey: process.env.CONVEX_DEPLOY_KEY,
    sourceDeployment,
  });
  if (envDeployKey !== null) {
    return envDeployKey;
  }

  return extractMatchingDeploymentDeployKey({
    rawDeployKey: sourceEnv.vars.CONVEX_DEPLOY_KEY,
    sourceDeployment,
  });
}

/**
 * @param {{
 *   appDir: string
 *   envFile: string
 *   sourceDeployment: Deployment
 * }} args
 * @returns {Promise<EnvEntry[]>}
 */
async function listDeploymentEnvVars({ appDir, envFile, sourceDeployment }) {
  const matchingDeployKey = extractMatchingDeploymentDeployKey({
    rawDeployKey: process.env.CONVEX_DEPLOY_KEY,
    sourceDeployment,
  });

  if (matchingDeployKey !== null) {
    return await listDeploymentEnvVarsWithDeployKey({
      appDir,
      deploymentName: sourceDeployment.name,
      deployKey: matchingDeployKey,
    });
  }

  const result = spawnSync(
    "npx",
    ["convex", "env", "list", "--env-file", envFile],
    { cwd: appDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  if (result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    if (output.includes("MissingAccessToken")) {
      exitWithMissingSourceDeployKeyError({
        envFile,
        deployment: sourceDeployment.raw,
      });
    }
    const message = output || "convex env list failed";
    exitWithError(message);
  }

  const output = (result.stdout || "").trim();
  if (!output || output === "No environment variables set.") {
    return [];
  }

  /** @type {EnvEntry[]} */
  const entries = [];
  for (const line of output.split(/\r?\n/)) {
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }
    const name = line.slice(0, eqIndex);
    const value = line.slice(eqIndex + 1);
    entries.push({ name, value });
  }
  return entries;
}

/**
 * @param {{
 *   appDir: string
 *   deploymentName: string
 *   deployKey: string
 * }} args
 * @returns {Promise<EnvEntry[]>}
 */
async function listDeploymentEnvVarsWithDeployKey({
  appDir,
  deploymentName,
  deployKey,
}) {
  const requireFromApp = createRequire(path.join(appDir, "package.json"));
  /** @type {unknown} */
  const convexBrowserModule = requireFromApp("convex/browser");
  /** @type {unknown} */
  const convexServerModule = requireFromApp("convex/server");
  if (!isConvexBrowserModule(convexBrowserModule)) {
    exitWithError("Failed to load Convex browser client from apps/noter.");
  }
  if (!isConvexServerModule(convexServerModule)) {
    exitWithError("Failed to load Convex server helpers from apps/noter.");
  }

  const ConvexHttpClient = convexBrowserModule.ConvexHttpClient;
  const client = new ConvexHttpClient(buildCloudDeploymentUrl(deploymentName), {
    logger: false,
  });
  client.setAdminAuth(deployKey);

  try {
    const result = await client.query(
      convexServerModule.makeFunctionReference(
        "_system/cli/queryEnvironmentVariables",
      ),
      {},
    );
    return normalizeEnvQueryResult(result);
  } catch (error) {
    exitWithError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * @param {string} filePath
 * @param {EnvEntry[]} entries
 */
function writeEnvFile(filePath, entries) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const lines = entries.map(
    (entry) => `${entry.name}=${formatEnvValue(entry.value)}`,
  );
  const contents = lines.join("\n") + (lines.length > 0 ? "\n" : "");
  fs.writeFileSync(filePath, contents, "utf8");
}

/**
 * @param {string} value
 * @returns {string}
 */
function formatEnvValue(value) {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

/**
 * @param {string} repoRoot
 * @returns {string | null}
 */
function findSourceEnvFile(repoRoot) {
  const worktrees = getWorktrees(repoRoot);
  /** @type {Array<{ envPath: string; branch: string | null }>} */
  const candidates = [];

  for (const worktree of worktrees) {
    const envPath = path.join(worktree.worktree, "apps", "noter", ".env.local");
    const envFile = readEnvFile(envPath);
    if (!envFile) {
      continue;
    }
    const deployment = parseDeploymentFromEnv(envFile.vars);
    if (!deployment || deployment.type !== "dev") {
      continue;
    }
    if (isAnonymousLikeDeploymentName(deployment.name)) {
      continue;
    }
    candidates.push({ envPath, branch: worktree.branch });
  }

  if (candidates.length === 0) {
    return null;
  }

  const mainCandidate = candidates.find(
    (candidate) => candidate.branch === "refs/heads/main",
  );
  if (mainCandidate) {
    return mainCandidate.envPath;
  }

  return candidates[0]?.envPath ?? null;
}

/**
 * @param {string} repoRoot
 * @returns {WorktreeInfo[]}
 */
function getWorktrees(repoRoot) {
  const result = spawnSync("git", ["worktree", "list", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return [];
  }
  const output = (result.stdout || "").trim();
  if (!output) {
    return [];
  }
  const blocks = output.split(/\n\n+/);
  return blocks.map(parseWorktreeBlock);
}

/**
 * @param {string} block
 * @returns {WorktreeInfo}
 */
function parseWorktreeBlock(block) {
  const lines = block.split(/\r?\n/);
  /** @type {WorktreeInfo} */
  const data = {
    worktree: "",
    branch: null,
  };
  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      data.worktree = line.slice("worktree ".length).trim();
      continue;
    }
    if (line.startsWith("branch ")) {
      data.branch = line.slice("branch ".length).trim();
    }
  }
  return data;
}

/**
 * @param {string} message
 * @returns {never}
 */
function exitWithError(message) {
  console.error(message);
  process.exit(1);
}

/**
 * @returns {never}
 */
function exitWithMissingSourceEnvError() {
  exitWithError(
    "Missing source env file for worktree bootstrap.\n" +
      "Copy apps/noter/.env.local from a working checkout, including CONVEX_DEPLOY_KEY, or pass --source-env <path>.",
  );
}

/**
 * @param {{ envFile: string, deployment: string }} args
 * @returns {never}
 */
function exitWithMissingSourceDeployKeyError({ envFile, deployment }) {
  const seedCommand = formatSeedEnvCommand(envFile);
  exitWithError(
    `Missing CONVEX_DEPLOY_KEY in source env file: ${envFile}\n` +
      `The worktree seed generator needs a deployment-scoped key for ${deployment} in that file.\n` +
      `Add \`CONVEX_DEPLOY_KEY=${deployment}|<deployment-key>\` to ${envFile}, then run \`${seedCommand}\`.`,
  );
}

/**
 * @param {string | null} sourceEnvPath
 * @returns {string}
 */
function formatSeedEnvCommand(sourceEnvPath) {
  const explicitSourceEnvPath = sourceEnvPath ?? options.sourceEnv;
  const sourceArg = explicitSourceEnvPath
    ? ` --source-env ${JSON.stringify(path.resolve(explicitSourceEnvPath))}`
    : "";
  return `node ./scripts/convex-sync-dev-env.js${sourceArg}`;
}

/**
 * @param {unknown} value
 * @returns {value is ConvexBrowserModule}
 */
function isConvexBrowserModule(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = /** @type {Record<string, unknown>} */ (value);
  return typeof candidate.ConvexHttpClient === "function";
}

/**
 * @param {unknown} value
 * @returns {value is ConvexServerModule}
 */
function isConvexServerModule(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = /** @type {Record<string, unknown>} */ (value);
  return typeof candidate.makeFunctionReference === "function";
}
