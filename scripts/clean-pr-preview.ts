#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

import { fail, isMainModule, runMain } from "./lib/scriptRuntime.ts";
import { buildPrPreviewMetadata } from "../apps/noter/scripts/pr-preview-metadata.ts";

type JsonRecord = Record<string, unknown>;

type ParsedArgs = {
  apply: boolean;
  allowUnmerged: boolean;
  branch: string | null;
  help: boolean;
  skipCloudflare: boolean;
  skipConvex: boolean;
};

type CommandResult = {
  status: number;
  stdout: string;
  stderr: string;
};

type GithubPr = {
  number: number;
  state: string;
  mergedAt: string | null;
  headRefName: string;
  url: string;
};

type ProviderConfig = {
  token: string;
};

type CloudflareConfig = ProviderConfig & {
  accountId: string;
  workerName: string;
};

type ConvexConfig = ProviderConfig & {
  teamId: string;
};

type CloudflareVersion = {
  id: string;
  number: string;
  createdOn: string | null;
  tag: string | null;
  message: string | null;
};

type ConvexDeployment = {
  name: string;
  deploymentType: string | null;
  kind: string | null;
  fields: readonly string[];
};

class ProviderApiError extends Error {
  readonly provider: string;
  readonly status: number;
  readonly path: string;
  readonly payload: unknown;

  constructor(args: {
    provider: string;
    status: number;
    path: string;
    payload: unknown;
  }) {
    super(
      `${args.provider} API request failed (${args.status}) for ${args.path}: ${payloadToString(args.payload)}`,
    );
    this.name = "ProviderApiError";
    this.provider = args.provider;
    this.status = args.status;
    this.path = args.path;
    this.payload = args.payload;
  }
}

function printHelp(): void {
  console.log(`Usage: pnpm clean:pr-preview [options]

Dry-run by default. Cleans noter.md PR preview resources for a merged branch.

Options:
  --branch <name>       branch whose PR preview resources should be cleaned
  --apply               delete matching remote resources
  --allow-unmerged      bypass the merged-PR guard for explicit operator cleanup
  --skip-cloudflare     skip Cloudflare Worker version cleanup
  --skip-convex         skip Convex preview deployment cleanup
  -h, --help            show this help

Required environment for Cloudflare cleanup:
  DEV_SEED_CLOUDFLARE_API_KEY
  DEV_SEED_CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_WORKER_NAME

Required environment for Convex cleanup:
  DEV_SEED_CONVEX_MANAGEMENT_API_KEY
  DEV_SEED_CONVEX_TEAM_ID`);
}

export function parseArgs(args: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    apply: false,
    allowUnmerged: false,
    branch: null,
    help: false,
    skipCloudflare: false,
    skipConvex: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--":
        break;
      case "--apply":
        parsed.apply = true;
        break;
      case "--allow-unmerged":
        parsed.allowUnmerged = true;
        break;
      case "--branch": {
        const branch = args[index + 1];
        if (!branch) {
          fail("--branch requires a value.");
        }
        parsed.branch = branch;
        index += 1;
        break;
      }
      case "--skip-cloudflare":
        parsed.skipCloudflare = true;
        break;
      case "--skip-convex":
        parsed.skipConvex = true;
        break;
      case "-h":
      case "--help":
        parsed.help = true;
        break;
      default:
        fail(`Unknown option: ${arg}`);
    }
  }

  return parsed;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(record: JsonRecord, key: string): JsonRecord | null {
  const value = record[key];
  return isRecord(value) ? value : null;
}

function readString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readStringOrNumber(record: JsonRecord, key: string): string | null {
  const value = record[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function extractArray(value: unknown, keys: readonly string[] = []): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  const result = value.result;
  if (Array.isArray(result)) {
    return result;
  }
  if (isRecord(result)) {
    const nested = extractArray(result, keys);
    if (nested.length > 0) {
      return nested;
    }
  }

  for (const key of keys) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      return nested;
    }
    if (isRecord(nested)) {
      const nestedResult = extractArray(nested, keys);
      if (nestedResult.length > 0) {
        return nestedResult;
      }
    }
  }

  return [];
}

function payloadToString(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

async function requestProviderApi(args: {
  provider: string;
  baseUrl: string;
  token: string;
  path: string;
  method: "GET" | "POST" | "DELETE";
  body?: unknown;
}): Promise<unknown> {
  const response = await fetch(`${args.baseUrl}${args.path}`, {
    method: args.method,
    headers: {
      Authorization: `Bearer ${args.token}`,
      "Content-Type": "application/json",
    },
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new ProviderApiError({
      provider: args.provider,
      status: response.status,
      path: args.path,
      payload,
    });
  }

  return payload;
}

function runCommand(command: string, args: readonly string[]): CommandResult {
  const result = spawnSync(command, [...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function normalizeBranchName(branch: string): string {
  return branch.replace(/^refs\/heads\//, "").trim();
}

function resolveBranch(parsedBranch: string | null): string {
  if (parsedBranch) {
    return normalizeBranchName(parsedBranch);
  }

  const currentBranch = runCommand("git", [
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]);
  if (currentBranch.status !== 0) {
    fail("Could not resolve current git branch. Pass --branch explicitly.");
  }

  const branch = normalizeBranchName(currentBranch.stdout);
  if (!branch || branch === "HEAD") {
    fail("Current checkout is detached. Pass --branch explicitly.");
  }

  return branch;
}

export function parseGithubPrPayload(value: unknown): GithubPr | null {
  if (!isRecord(value)) {
    return null;
  }

  const number = value.number;
  const state = readString(value, "state");
  const headRefName = readString(value, "headRefName");
  const url = readString(value, "url");
  const mergedAtValue = value.mergedAt;
  const mergedAt =
    typeof mergedAtValue === "string" && mergedAtValue.trim().length > 0
      ? mergedAtValue
      : null;

  if (
    typeof number !== "number" ||
    !Number.isInteger(number) ||
    !state ||
    !headRefName ||
    !url
  ) {
    return null;
  }

  return { number, state, mergedAt, headRefName, url };
}

function readGithubPr(branch: string): GithubPr | null {
  const result = runCommand("gh", [
    "pr",
    "view",
    "--head",
    branch,
    "--json",
    "number,state,mergedAt,headRefName,url",
  ]);
  if (result.status !== 0) {
    return null;
  }

  try {
    return parseGithubPrPayload(JSON.parse(result.stdout));
  } catch {
    return null;
  }
}

function assertMergedPr(args: {
  branch: string;
  pr: GithubPr | null;
  allowUnmerged: boolean;
}): void {
  if (args.allowUnmerged) {
    console.log("merged PR guard: bypassed by --allow-unmerged");
    return;
  }

  if (!args.pr) {
    fail(
      `No GitHub PR found for ${args.branch}. Refusing preview cleanup without --allow-unmerged.`,
    );
  }

  if (args.pr.state !== "MERGED" && !args.pr.mergedAt) {
    fail(
      `PR #${args.pr.number} is ${args.pr.state}, not merged. Refusing preview cleanup without --allow-unmerged.`,
    );
  }
}

function readEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  missing: string[],
): string | null {
  const value = env[name];
  if (value && value.trim().length > 0) {
    return value;
  }
  missing.push(name);
  return null;
}

function readCloudflareConfig(env: NodeJS.ProcessEnv): {
  config: CloudflareConfig | null;
  missing: readonly string[];
} {
  const missing: string[] = [];
  const token = readEnv(env, "DEV_SEED_CLOUDFLARE_API_KEY", missing);
  const accountId = readEnv(env, "DEV_SEED_CLOUDFLARE_ACCOUNT_ID", missing);
  const workerName = readEnv(env, "CLOUDFLARE_WORKER_NAME", missing);

  if (!token || !accountId || !workerName) {
    return { config: null, missing };
  }

  return { config: { token, accountId, workerName }, missing };
}

function readConvexConfig(env: NodeJS.ProcessEnv): {
  config: ConvexConfig | null;
  missing: readonly string[];
} {
  const missing: string[] = [];
  const token = readEnv(env, "DEV_SEED_CONVEX_MANAGEMENT_API_KEY", missing);
  const teamId = readEnv(env, "DEV_SEED_CONVEX_TEAM_ID", missing);

  if (!token || !teamId) {
    return { config: null, missing };
  }

  return { config: { token, teamId }, missing };
}

function parseCloudflareVersion(value: unknown): CloudflareVersion | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value, "id");
  if (!id) {
    return null;
  }

  const number = readStringOrNumber(value, "number") ?? "?";
  const createdOn = readString(value, "created_on");
  const annotations =
    readRecord(value, "annotations") ?? readRecord(value, "metadata");
  const tag = annotations
    ? (readString(annotations, "workers/tag") ?? readString(annotations, "tag"))
    : null;
  const message = annotations
    ? (readString(annotations, "workers/message") ??
      readString(annotations, "message"))
    : null;

  return { id, number, createdOn, tag, message };
}

function readActiveWorkerVersionIds(value: unknown): Set<string> {
  const activeVersionIds = new Set<string>();
  for (const deployment of extractArray(value, ["deployments"])) {
    if (!isRecord(deployment)) {
      continue;
    }
    for (const version of extractArray(deployment.versions)) {
      if (!isRecord(version)) {
        continue;
      }
      const versionId =
        readString(version, "version_id") ?? readString(version, "id");
      if (versionId) {
        activeVersionIds.add(versionId);
      }
    }
  }
  return activeVersionIds;
}

async function listCloudflarePreviewCandidates(args: {
  config: CloudflareConfig;
  branch: string;
}): Promise<readonly CloudflareVersion[]> {
  const metadata = buildPrPreviewMetadata({
    branch: args.branch,
    workerName: args.config.workerName,
  });
  const versionsPayload = await requestProviderApi({
    provider: "Cloudflare",
    baseUrl: "https://api.cloudflare.com/client/v4",
    token: args.config.token,
    method: "GET",
    path: `/accounts/${encodeURIComponent(args.config.accountId)}/workers/workers/${encodeURIComponent(args.config.workerName)}/versions?page=1&per_page=100`,
  });
  const deploymentsPayload = await requestProviderApi({
    provider: "Cloudflare",
    baseUrl: "https://api.cloudflare.com/client/v4",
    token: args.config.token,
    method: "GET",
    path: `/accounts/${encodeURIComponent(args.config.accountId)}/workers/scripts/${encodeURIComponent(args.config.workerName)}/deployments`,
  });
  const activeVersionIds = readActiveWorkerVersionIds(deploymentsPayload);
  const candidates: CloudflareVersion[] = [];

  for (const value of extractArray(versionsPayload, ["versions"])) {
    const version = parseCloudflareVersion(value);
    if (!version || version.tag !== metadata.tag) {
      continue;
    }
    if (activeVersionIds.has(version.id)) {
      console.log(
        `Cloudflare: refusing active version ${version.id} (#${version.number}) even though it has the PR preview tag.`,
      );
      continue;
    }
    candidates.push(version);
  }

  return candidates;
}

async function deleteCloudflareVersion(args: {
  config: CloudflareConfig;
  version: CloudflareVersion;
}): Promise<void> {
  try {
    await requestProviderApi({
      provider: "Cloudflare",
      baseUrl: "https://api.cloudflare.com/client/v4",
      token: args.config.token,
      method: "DELETE",
      path: `/accounts/${encodeURIComponent(args.config.accountId)}/workers/workers/${encodeURIComponent(args.config.workerName)}/versions/${encodeURIComponent(args.version.id)}`,
    });
  } catch (error) {
    if (error instanceof ProviderApiError && error.status === 404) {
      return;
    }
    throw error;
  }
}

async function resolveConvexProjectId(config: ConvexConfig): Promise<string> {
  const payload = await requestProviderApi({
    provider: "Convex",
    baseUrl: "https://api.convex.dev/v1",
    token: config.token,
    method: "GET",
    path: `/teams/${encodeURIComponent(config.teamId)}/projects/noter`,
  });
  if (!isRecord(payload)) {
    throw new Error("Convex project lookup returned an invalid payload.");
  }

  const projectId = readStringOrNumber(payload, "id");
  if (!projectId) {
    throw new Error("Convex project lookup did not return a project id.");
  }

  return projectId;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function matchesPreviewBranch(value: string, branch: string): boolean {
  const decoded = safeDecode(value);
  return (
    decoded === branch ||
    decoded === `preview/${branch}` ||
    decoded.endsWith(`/preview/${branch}`) ||
    decoded.includes(`/preview/${branch}/`)
  );
}

function collectDeploymentFields(record: JsonRecord): string[] {
  const keys = [
    "name",
    "deploymentName",
    "previewName",
    "previewIdentifier",
    "identifier",
    "ref",
    "reference",
    "deploymentUrl",
    "url",
  ];
  const fields: string[] = [];
  for (const key of keys) {
    const value = readString(record, key);
    if (value) {
      fields.push(value);
    }
  }

  const preview = readRecord(record, "preview");
  if (preview) {
    fields.push(...collectDeploymentFields(preview));
  }

  return fields;
}

function parseConvexDeployment(value: unknown): ConvexDeployment | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = readString(value, "name") ?? readString(value, "deploymentName");
  if (!name) {
    return null;
  }

  return {
    name,
    deploymentType:
      readString(value, "deploymentType") ?? readString(value, "type"),
    kind: readString(value, "kind"),
    fields: collectDeploymentFields(value),
  };
}

async function listConvexPreviewCandidates(args: {
  config: ConvexConfig;
  branch: string;
}): Promise<readonly ConvexDeployment[]> {
  const projectId = await resolveConvexProjectId(args.config);
  const payload = await requestProviderApi({
    provider: "Convex",
    baseUrl: "https://api.convex.dev/v1",
    token: args.config.token,
    method: "GET",
    path: `/projects/${encodeURIComponent(projectId)}/list_deployments`,
  });
  const candidates: ConvexDeployment[] = [];

  for (const value of extractArray(payload, ["deployments"])) {
    const deployment = parseConvexDeployment(value);
    if (!deployment) {
      continue;
    }
    if (
      deployment.deploymentType === "preview" &&
      deployment.kind !== "local" &&
      deployment.fields.some((field) =>
        matchesPreviewBranch(field, args.branch),
      )
    ) {
      candidates.push(deployment);
    }
  }

  return candidates;
}

async function deleteConvexDeployment(args: {
  config: ConvexConfig;
  deployment: ConvexDeployment;
}): Promise<void> {
  try {
    await requestProviderApi({
      provider: "Convex",
      baseUrl: "https://api.convex.dev/v1",
      token: args.config.token,
      method: "POST",
      path: `/deployments/${encodeURIComponent(args.deployment.name)}/delete`,
    });
  } catch (error) {
    if (error instanceof ProviderApiError && error.status === 404) {
      return;
    }
    throw error;
  }
}

function printMissingConfig(
  provider: string,
  missing: readonly string[],
): void {
  console.log(`${provider}: skipped; missing ${missing.join(", ")}`);
}

async function cleanCloudflare(args: {
  apply: boolean;
  branch: string;
  env: NodeJS.ProcessEnv;
}): Promise<void> {
  const { config, missing } = readCloudflareConfig(args.env);
  if (!config) {
    if (args.apply) {
      fail(`Cloudflare cleanup requires ${missing.join(", ")}.`);
    }
    printMissingConfig("Cloudflare", missing);
    return;
  }

  const candidates = await listCloudflarePreviewCandidates({
    config,
    branch: args.branch,
  });
  if (candidates.length === 0) {
    console.log("Cloudflare: no tagged Worker preview versions found.");
    return;
  }

  console.log(`Cloudflare: ${candidates.length} Worker preview version(s):`);
  for (const candidate of candidates) {
    const created = candidate.createdOn
      ? ` created ${candidate.createdOn}`
      : "";
    console.log(`- ${candidate.id} (#${candidate.number})${created}`);
  }

  if (!args.apply) {
    return;
  }

  for (const candidate of candidates) {
    await deleteCloudflareVersion({ config, version: candidate });
    console.log(`Cloudflare: deleted Worker version ${candidate.id}`);
  }
}

async function cleanConvex(args: {
  apply: boolean;
  branch: string;
  env: NodeJS.ProcessEnv;
}): Promise<void> {
  const { config, missing } = readConvexConfig(args.env);
  if (!config) {
    if (args.apply) {
      fail(`Convex cleanup requires ${missing.join(", ")}.`);
    }
    printMissingConfig("Convex", missing);
    return;
  }

  const candidates = await listConvexPreviewCandidates({
    config,
    branch: args.branch,
  });
  if (candidates.length === 0) {
    console.log("Convex: no matching preview deployments found.");
    return;
  }

  console.log(`Convex: ${candidates.length} preview deployment(s):`);
  for (const candidate of candidates) {
    console.log(`- ${candidate.name}`);
  }

  if (!args.apply) {
    return;
  }

  for (const candidate of candidates) {
    await deleteConvexDeployment({ config, deployment: candidate });
    console.log(`Convex: deleted preview deployment ${candidate.name}`);
  }
}

export async function runCleanPrPreview(args: {
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
}): Promise<void> {
  const parsed = parseArgs(args.argv);
  if (parsed.help) {
    printHelp();
    return;
  }

  const branch = resolveBranch(parsed.branch);
  const pr = readGithubPr(branch);
  assertMergedPr({ branch, pr, allowUnmerged: parsed.allowUnmerged });

  console.log(`branch: ${branch}`);
  if (pr) {
    console.log(`pr: #${pr.number} ${pr.url}`);
  }
  console.log(
    parsed.apply
      ? "mode: apply (will delete matching preview resources)"
      : "mode: dry-run (no deletions)",
  );

  if (!parsed.skipCloudflare) {
    await cleanCloudflare({
      apply: parsed.apply,
      branch,
      env: args.env,
    });
  }

  if (!parsed.skipConvex) {
    await cleanConvex({
      apply: parsed.apply,
      branch,
      env: args.env,
    });
  }

  if (!parsed.apply) {
    console.log(
      "next: rerun with --apply after checking the preview candidates.",
    );
  }
}

if (isMainModule(import.meta.url)) {
  await runMain(() =>
    runCleanPrPreview({
      argv: process.argv.slice(2),
      env: process.env,
    }),
  );
}
