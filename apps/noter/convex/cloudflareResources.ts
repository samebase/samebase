import { notEmpty } from "@noter-md/dependent/main";
import {
  callCloudflareMcpTool,
  CLOUDFLARE_MCP_SERVER_URL,
} from "./cloudflareMcp";
import {
  asRecord,
  clamp,
  readBoolean,
  readString,
  readStringOrNumber,
  toErrorMessage,
  type JsonRecord,
} from "./jsonUtils";

type CloudflareProvisionConvexState = {
  production: {
    cloudUrl: string;
    deployKey: string;
  };
  preview: {
    cloudUrl: string;
    deployKey: string;
  };
};

type CloudflareBuildConfig = {
  rootDir: string;
  buildCommand: string;
  deployCommand: string;
  previewDeployCommand: string;
};

export type CloudflareBuildToken = {
  name: string;
  uuid: string;
  cloudflareTokenId: string;
};

type CloudflareRequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type CloudflareApiErrorDetail = {
  code?: string;
  message?: string;
};

const WORKERS_BUILDS_OAUTH_SCOPE_MESSAGE =
  "Cloudflare connection is missing Workers Builds write access. Reconnect Cloudflare and grant Workers Builds, Workers, and Workers Scripts access, then retry.";
const NOTER_WORKERS_BUILD_TOKEN_NAME = "noter build token";
const WORKERS_BUILDS_TOKEN_REQUIRED_MESSAGE = `Cloudflare Workers Builds has no build API token. In Cloudflare, create a Workers Builds API token named "${NOTER_WORKERS_BUILD_TOKEN_NAME}", then retry.`;
const BUILD_TOKEN_PAGE_SIZE = 100;
const PROD_CONVEX_DEPLOY_KEY = "PROD_CONVEX_DEPLOY_KEY";
const PREVIEW_CONVEX_DEPLOY_KEY = "PREVIEW_CONVEX_DEPLOY_KEY";

type CloudflareConvexDeployKeyName =
  | typeof PROD_CONVEX_DEPLOY_KEY
  | typeof PREVIEW_CONVEX_DEPLOY_KEY;

export class CloudflareApiError extends Error {
  readonly method: CloudflareRequestMethod;

  readonly path: string;

  readonly details: readonly CloudflareApiErrorDetail[];

  constructor(args: {
    method: CloudflareRequestMethod;
    path: string;
    details: readonly CloudflareApiErrorDetail[];
  }) {
    super(
      `Cloudflare API request failed for ${args.method} ${args.path}: ${formatCloudflareApiErrorDetails(args.details)}`,
    );
    this.name = "CloudflareApiError";
    this.method = args.method;
    this.path = args.path;
    this.details = args.details;
  }
}

function formatCloudflareApiErrorDetails(
  details: readonly CloudflareApiErrorDetail[],
): string {
  if (details.length === 0) {
    return "unknown Cloudflare API error";
  }

  return details
    .map((detail) => {
      const code = detail.code ? `code ${detail.code}` : "unknown code";
      return detail.message ? `${code}: ${detail.message}` : code;
    })
    .join("; ");
}

function readCloudflareApiErrorDetail(
  value: unknown,
): CloudflareApiErrorDetail | null {
  const record = asRecord(value);
  const code = readStringOrNumber(record, "code");
  const message = readString(record, "message");
  if (!code && !message) {
    return null;
  }
  const detail: CloudflareApiErrorDetail = {};
  if (code) {
    detail.code = code;
  }
  if (message) {
    detail.message = message;
  }
  return detail;
}

function readCloudflareApiErrorDetails(
  value: unknown,
): readonly CloudflareApiErrorDetail[] {
  if (Array.isArray(value)) {
    return value.map(readCloudflareApiErrorDetail).filter(notEmpty);
  }

  const detail = readCloudflareApiErrorDetail(value);
  return detail ? [detail] : [];
}

function isWorkersBuildsApiPath(path: string): boolean {
  return path.includes("/builds/");
}

export function isWorkersBuildsInvalidTokenMessage(args: {
  path: string;
  message: string;
}): boolean {
  const message = args.message.toLowerCase();
  return (
    isWorkersBuildsApiPath(args.path) &&
    message.includes("12006") &&
    message.includes("invalid token")
  );
}

function isWorkersBuildsInvalidTokenDetails(args: {
  path: string;
  details: readonly CloudflareApiErrorDetail[];
}): boolean {
  return (
    isWorkersBuildsApiPath(args.path) &&
    args.details.some((detail) => detail.code === "12006")
  );
}

export function isCloudflareWorkerNotFoundError(error: unknown): boolean {
  if (error instanceof CloudflareApiError) {
    return error.details.some((detail) => {
      const message = detail.message?.toLowerCase();
      return (
        message === "worker not found" ||
        message === "trigger not found" ||
        message === "script not found" ||
        message === "not found" ||
        message === "workers.api.error.not_found" ||
        (detail.code === "10007" &&
          message?.includes("worker") === true &&
          message.includes("does not exist"))
      );
    });
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("10007") &&
      (message.includes("worker") || message.includes("script")) &&
      (message.includes("does not exist") || message.includes("not found"))
    );
  }

  return false;
}

function parseJsonText(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    const excerpt = value.length > 240 ? `${value.slice(0, 240)}...` : value;
    throw new Error(
      `Cloudflare MCP returned non-JSON response: ${toErrorMessage(error)} (payload excerpt: ${excerpt})`,
    );
  }
}

function readStringArray(record: JsonRecord, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }

  const strings: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      strings.push(item);
    }
  }
  return strings;
}

function requireString(args: {
  record: JsonRecord;
  key: string;
  message: string;
}): string {
  const value = readString(args.record, args.key);
  if (value) {
    return value;
  }
  throw new Error(args.message);
}

async function requestCloudflareApi(args: {
  token: string;
  serverUrl?: string;
  method: CloudflareRequestMethod;
  path: string;
  body?: unknown;
}): Promise<unknown> {
  const bodyPart =
    args.body === undefined ? "" : `, body: ${JSON.stringify(args.body)}`;
  const code = `async () => {
  return await cloudflare.request({
    method: ${JSON.stringify(args.method)},
    path: ${JSON.stringify(args.path)}${bodyPart}
  });
}`;
  const text = await callCloudflareMcpTool({
    token: args.token,
    toolName: "execute",
    toolArgs: { code },
    serverUrl: args.serverUrl ?? CLOUDFLARE_MCP_SERVER_URL,
  }).catch((error: unknown) => {
    const message = toErrorMessage(error);
    if (
      isWorkersBuildsInvalidTokenMessage({
        path: args.path,
        message,
      })
    ) {
      throw new Error(WORKERS_BUILDS_OAUTH_SCOPE_MESSAGE);
    }
    throw error;
  });
  const response = asRecord(parseJsonText(text));
  if (readBoolean(response, "success") !== true) {
    const details = readCloudflareApiErrorDetails(response["errors"]);
    if (isWorkersBuildsInvalidTokenDetails({ path: args.path, details })) {
      throw new Error(WORKERS_BUILDS_OAUTH_SCOPE_MESSAGE);
    }
    throw new CloudflareApiError({
      method: args.method,
      path: args.path,
      details,
    });
  }
  return response["result"];
}

type CloudflareBuildEnvVars = Record<
  string,
  { value: string; is_secret: boolean }
>;

export function buildCloudflareWorkersEnvVars(vars: {
  deployKeyName: CloudflareConvexDeployKeyName;
  convexDeployKey: string;
  convexUrl: string;
}): CloudflareBuildEnvVars {
  return {
    [vars.deployKeyName]: {
      value: vars.convexDeployKey,
      is_secret: true,
    },
    VITE_CONVEX_URL: {
      value: vars.convexUrl,
      is_secret: false,
    },
  };
}

type CloudflareWorkerIdentity = {
  workerName: string;
  workerTag: string;
  productionUrl: string;
};

async function readAccountSubdomain(args: {
  token: string;
  serverUrl?: string;
  accountId: string;
}): Promise<string> {
  const raw = await requestCloudflareApi({
    token: args.token,
    serverUrl: args.serverUrl,
    method: "GET",
    path: `/accounts/${encodeURIComponent(args.accountId)}/workers/subdomain`,
  });
  const record = asRecord(raw);
  const subdomain = readString(record, "subdomain")?.trim();
  if (!subdomain) {
    throw new Error(
      "Cloudflare Workers needs a configured workers.dev subdomain before Noter can create a production URL.",
    );
  }
  return subdomain;
}

async function readWorker(args: {
  token: string;
  serverUrl?: string;
  accountId: string;
  workerName: string;
}): Promise<JsonRecord | null> {
  try {
    const raw = await requestCloudflareApi({
      token: args.token,
      serverUrl: args.serverUrl,
      method: "GET",
      path: `/accounts/${encodeURIComponent(args.accountId)}/workers/workers/${encodeURIComponent(args.workerName)}`,
    });
    return asRecord(raw);
  } catch (error) {
    if (isCloudflareWorkerNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function isCloudflareWorkerNameAvailable(args: {
  token: string;
  serverUrl?: string;
  accountId: string;
  workerName: string;
}): Promise<boolean> {
  const worker = await readWorker(args);
  return !worker;
}

export function readCloudflareWorkerTag(
  worker: JsonRecord,
  workerName: string,
): string {
  // New Workers services do not appear in /workers/scripts until they have a
  // script version, but the Workers service id is the same external_script_id
  // that Workers Builds calls the worker tag.
  const workerTag =
    readString(worker, "id") ??
    readString(worker, "external_script_id") ??
    readString(worker, "tag");
  if (workerTag) {
    return workerTag;
  }
  throw new Error(
    `Cloudflare Worker ${workerName} did not include id, external_script_id, or tag.`,
  );
}

async function ensureWorker(args: {
  token: string;
  serverUrl?: string;
  accountId: string;
  fallbackWorkerName: string;
  existingWorkerTag?: string;
}): Promise<CloudflareWorkerIdentity> {
  const accountSubdomain = await readAccountSubdomain(args);
  const existing = await readWorker({
    token: args.token,
    serverUrl: args.serverUrl,
    accountId: args.accountId,
    workerName: args.fallbackWorkerName,
  });
  if (existing) {
    const workerName = readString(existing, "name") ?? args.fallbackWorkerName;
    const workerTag = readCloudflareWorkerTag(existing, workerName);
    if (args.existingWorkerTag !== workerTag) {
      throw new Error(
        `Cloudflare Worker name ${args.fallbackWorkerName} already exists. Choose another Worker name and try again.`,
      );
    }
    return {
      workerName,
      workerTag,
      productionUrl: `https://${workerName}.${accountSubdomain}.workers.dev`,
    };
  }

  const createdRaw = await requestCloudflareApi({
    token: args.token,
    serverUrl: args.serverUrl,
    method: "POST",
    path: `/accounts/${encodeURIComponent(args.accountId)}/workers/workers`,
    body: {
      name: args.fallbackWorkerName,
      subdomain: {
        enabled: true,
        previews_enabled: true,
      },
      observability: {
        enabled: true,
      },
    },
  });
  const created = asRecord(createdRaw);
  const workerName = readString(created, "name") ?? args.fallbackWorkerName;
  const workerTag = readCloudflareWorkerTag(created, workerName);
  return {
    workerName,
    workerTag,
    productionUrl: `https://${workerName}.${accountSubdomain}.workers.dev`,
  };
}

async function ensureRepositoryConnection(args: {
  token: string;
  serverUrl?: string;
  accountId: string;
  ghRepoId: string;
  ghRepoOwnerId?: string;
  owner: string;
  repo: string;
}): Promise<string> {
  if (!args.ghRepoOwnerId) {
    throw new Error(
      "GitHub owner id is required before Cloudflare Workers Builds can connect the repository.",
    );
  }

  const raw = await requestCloudflareApi({
    token: args.token,
    serverUrl: args.serverUrl,
    method: "PUT",
    path: `/accounts/${encodeURIComponent(args.accountId)}/builds/repos/connections`,
    body: {
      provider_type: "github",
      provider_account_id: args.ghRepoOwnerId,
      provider_account_name: args.owner,
      repo_id: args.ghRepoId,
      repo_name: args.repo,
    },
  });
  const record = asRecord(raw);
  return requireString({
    record,
    key: "repo_connection_uuid",
    message:
      "Cloudflare Workers Builds repository connection did not return an id.",
  });
}

async function resolveBuildTokenUuid(args: {
  token: string;
  serverUrl?: string;
  accountId: string;
  existingTriggers: readonly JsonRecord[];
  authMethod: CloudflareAuthMethod;
}): Promise<string> {
  if (args.authMethod === "mcp_oauth") {
    // Cloudflare MCP OAuth tokens can manage Builds resources, but they are not
    // API tokens, so /user/tokens/verify rejects them. Reuse an existing build
    // token instead of trying to prove the OAuth token's token id.
    return await resolveOAuthBuildTokenUuid({
      token: args.token,
      serverUrl: args.serverUrl,
      accountId: args.accountId,
      existingTriggers: args.existingTriggers,
    });
  }

  const currentTokenId = await resolveCurrentCloudflareTokenId({
    token: args.token,
    serverUrl: args.serverUrl,
  });
  const existingBuildTokenUuid = await findCurrentBuildTokenUuid({
    token: args.token,
    serverUrl: args.serverUrl,
    accountId: args.accountId,
    cloudflareTokenId: currentTokenId,
    preferredBuildTokenUuids: readTriggerBuildTokenUuids(args.existingTriggers),
  });
  if (existingBuildTokenUuid) {
    return existingBuildTokenUuid;
  }
  return await createBuildToken({
    token: args.token,
    serverUrl: args.serverUrl,
    accountId: args.accountId,
    cloudflareTokenId: currentTokenId,
  });
}

async function resolveOAuthBuildTokenUuid(args: {
  token: string;
  serverUrl?: string;
  accountId: string;
  existingTriggers: readonly JsonRecord[];
}): Promise<string> {
  const existingBuildTokenUuid = await findReusableBuildTokenUuid({
    token: args.token,
    serverUrl: args.serverUrl,
    accountId: args.accountId,
    preferredBuildTokenUuids: readTriggerBuildTokenUuids(args.existingTriggers),
  });
  if (existingBuildTokenUuid) {
    return existingBuildTokenUuid;
  }

  throw new Error(WORKERS_BUILDS_TOKEN_REQUIRED_MESSAGE);
}

async function findCurrentBuildTokenUuid(args: {
  token: string;
  serverUrl?: string;
  accountId: string;
  cloudflareTokenId: string;
  preferredBuildTokenUuids: readonly string[];
}): Promise<string | undefined> {
  const tokens: CloudflareBuildToken[] = [];
  for (let page = 1; ; page += 1) {
    const rawTokens = await requestCloudflareApi({
      token: args.token,
      serverUrl: args.serverUrl,
      method: "GET",
      path: `/accounts/${encodeURIComponent(args.accountId)}/builds/tokens?page=${page}&per_page=${BUILD_TOKEN_PAGE_SIZE}`,
    });
    tokens.push(...parseBuildTokens(rawTokens));
    if (!Array.isArray(rawTokens) || rawTokens.length < BUILD_TOKEN_PAGE_SIZE) {
      return selectCurrentBuildTokenUuid({
        tokens,
        cloudflareTokenId: args.cloudflareTokenId,
        preferredBuildTokenUuids: args.preferredBuildTokenUuids,
      });
    }
  }
}

async function findReusableBuildTokenUuid(args: {
  token: string;
  serverUrl?: string;
  accountId: string;
  preferredBuildTokenUuids: readonly string[];
}): Promise<string | undefined> {
  const tokens: CloudflareBuildToken[] = [];
  for (let page = 1; ; page += 1) {
    const rawTokens = await requestCloudflareApi({
      token: args.token,
      serverUrl: args.serverUrl,
      method: "GET",
      path: `/accounts/${encodeURIComponent(args.accountId)}/builds/tokens?page=${page}&per_page=${BUILD_TOKEN_PAGE_SIZE}`,
    });
    tokens.push(...parseBuildTokens(rawTokens));
    if (!Array.isArray(rawTokens) || rawTokens.length < BUILD_TOKEN_PAGE_SIZE) {
      return selectReusableBuildTokenUuid({
        tokens,
        preferredBuildTokenUuids: args.preferredBuildTokenUuids,
      });
    }
  }
}

function parseBuildTokens(raw: unknown): CloudflareBuildToken[] {
  const tokens = Array.isArray(raw) ? raw.map(asRecord) : [];
  return tokens
    .map((tokenRecord) => {
      const uuid = readString(tokenRecord, "build_token_uuid");
      const cloudflareTokenId = readString(tokenRecord, "cloudflare_token_id");
      if (!uuid || !cloudflareTokenId) {
        return null;
      }
      return {
        name: readString(tokenRecord, "build_token_name") ?? "",
        uuid,
        cloudflareTokenId,
      };
    })
    .filter(notEmpty)
    .sort(compareBuildTokens);
}

function compareBuildTokens(
  left: CloudflareBuildToken,
  right: CloudflareBuildToken,
): number {
  return (
    left.name.localeCompare(right.name) || left.uuid.localeCompare(right.uuid)
  );
}

function selectStableBuildTokenUuid(
  tokens: readonly CloudflareBuildToken[],
): string | undefined {
  if (tokens.length === 0) {
    return undefined;
  }
  return [...tokens].sort(compareBuildTokens)[0].uuid;
}

export function selectReusableBuildTokenUuid(args: {
  tokens: readonly CloudflareBuildToken[];
  preferredBuildTokenUuids?: readonly string[];
}): string | undefined {
  if (args.tokens.length === 0) {
    return undefined;
  }

  const preferredBuildTokenUuids = new Set(args.preferredBuildTokenUuids);
  const preferredTokens = args.tokens.filter((token) =>
    preferredBuildTokenUuids.has(token.uuid),
  );
  const preferredTokenUuid = selectStableBuildTokenUuid(preferredTokens);
  if (preferredTokenUuid) {
    return preferredTokenUuid;
  }

  const namedTokens = args.tokens.filter(
    (token) => token.name === NOTER_WORKERS_BUILD_TOKEN_NAME,
  );
  const namedTokenUuid = selectStableBuildTokenUuid(namedTokens);
  if (namedTokenUuid) {
    // Failed retries can leave duplicate Noter-named tokens. Cloudflare's list
    // response has no creation time, so choose by stable UUID order and let the
    // trigger upserts bind both triggers to the same token.
    return namedTokenUuid;
  }

  if (args.tokens.length === 1) {
    return selectStableBuildTokenUuid(args.tokens);
  }

  throw new Error(
    `Cloudflare has multiple Workers build tokens. Keep one token named "${NOTER_WORKERS_BUILD_TOKEN_NAME}" and retry.`,
  );
}

export function selectCurrentBuildTokenUuid(args: {
  tokens: readonly CloudflareBuildToken[];
  cloudflareTokenId: string;
  preferredBuildTokenUuids?: readonly string[];
}): string | undefined {
  const matchingTokens = args.tokens.filter(
    (token) => token.cloudflareTokenId === args.cloudflareTokenId,
  );
  if (matchingTokens.length === 0) {
    return undefined;
  }

  const preferredBuildTokenUuids = new Set(args.preferredBuildTokenUuids);
  const preferredTokens = matchingTokens.filter((token) =>
    preferredBuildTokenUuids.has(token.uuid),
  );
  const preferredTokenUuid = selectStableBuildTokenUuid(preferredTokens);
  if (preferredTokenUuid) {
    return preferredTokenUuid;
  }

  const namedTokens = matchingTokens.filter(
    (token) => token.name === NOTER_WORKERS_BUILD_TOKEN_NAME,
  );
  const namedTokenUuid = selectStableBuildTokenUuid(namedTokens);
  if (namedTokenUuid) {
    return namedTokenUuid;
  }

  return selectStableBuildTokenUuid(matchingTokens);
}

function readTriggerBuildTokenUuids(
  triggers: readonly JsonRecord[],
): readonly string[] {
  return triggers
    .map((trigger) => readString(trigger, "build_token_uuid"))
    .filter(notEmpty);
}

async function resolveCurrentCloudflareTokenId(args: {
  token: string;
  serverUrl?: string;
}): Promise<string> {
  const raw = await requestCloudflareApi({
    token: args.token,
    serverUrl: args.serverUrl,
    method: "GET",
    path: "/user/tokens/verify",
  });
  return requireString({
    record: asRecord(raw),
    key: "id",
    message:
      "Cloudflare did not return an id for the current token, so Workers Builds cannot create a build token.",
  });
}

async function createBuildToken(args: {
  token: string;
  serverUrl?: string;
  accountId: string;
  cloudflareTokenId: string;
}): Promise<string> {
  const raw = await requestCloudflareApi({
    token: args.token,
    serverUrl: args.serverUrl,
    method: "POST",
    path: `/accounts/${encodeURIComponent(args.accountId)}/builds/tokens`,
    body: {
      build_token_name: NOTER_WORKERS_BUILD_TOKEN_NAME,
      build_token_secret: args.token,
      cloudflare_token_id: args.cloudflareTokenId,
    },
  });
  return requireString({
    record: asRecord(raw),
    key: "build_token_uuid",
    message:
      "Cloudflare Workers Builds did not return an id for the created build token.",
  });
}

type CloudflareBuildTriggerKind = "production" | "preview";

function matchesTriggerKind(args: {
  trigger: JsonRecord;
  kind: CloudflareBuildTriggerKind;
  defaultBranch: string;
}): boolean {
  const branchIncludes = readStringArray(args.trigger, "branch_includes");
  const branchExcludes = readStringArray(args.trigger, "branch_excludes");
  if (args.kind === "production") {
    return (
      branchIncludes.length === 1 &&
      branchIncludes[0] === args.defaultBranch &&
      branchExcludes.length === 0
    );
  }

  return (
    branchIncludes.includes("*") && branchExcludes.includes(args.defaultBranch)
  );
}

async function listBuildTriggers(args: {
  token: string;
  serverUrl?: string;
  accountId: string;
  workerTag: string;
}): Promise<JsonRecord[]> {
  const raw = await requestCloudflareApi({
    token: args.token,
    serverUrl: args.serverUrl,
    method: "GET",
    path: `/accounts/${encodeURIComponent(args.accountId)}/builds/workers/${encodeURIComponent(args.workerTag)}/triggers`,
  });
  return Array.isArray(raw) ? raw.map(asRecord) : [];
}

async function upsertBuildTrigger(args: {
  token: string;
  serverUrl?: string;
  accountId: string;
  workerTag: string;
  repoConnectionUuid: string;
  buildTokenUuid: string;
  buildConfig: CloudflareBuildConfig;
  defaultBranch: string;
  existingTriggers: readonly JsonRecord[];
  kind: CloudflareBuildTriggerKind;
}): Promise<string> {
  const existingTrigger = args.existingTriggers.find((trigger) =>
    matchesTriggerKind({
      trigger,
      kind: args.kind,
      defaultBranch: args.defaultBranch,
    }),
  );
  const triggerName =
    args.kind === "production" ? "Production Deploy" : "Preview Deploy";
  const body = {
    external_script_id: args.workerTag,
    repo_connection_uuid: args.repoConnectionUuid,
    build_token_uuid: args.buildTokenUuid,
    trigger_name: triggerName,
    build_command: args.buildConfig.buildCommand,
    deploy_command:
      args.kind === "production"
        ? args.buildConfig.deployCommand
        : args.buildConfig.previewDeployCommand,
    root_directory: args.buildConfig.rootDir,
    branch_includes: args.kind === "production" ? [args.defaultBranch] : ["*"],
    branch_excludes: args.kind === "production" ? [] : [args.defaultBranch],
    path_includes: ["*"],
    path_excludes: [],
  };

  const existingTriggerUuid = existingTrigger
    ? readString(existingTrigger, "trigger_uuid")
    : undefined;
  const raw = await requestCloudflareApi({
    token: args.token,
    serverUrl: args.serverUrl,
    method: existingTriggerUuid ? "PATCH" : "POST",
    path: existingTriggerUuid
      ? `/accounts/${encodeURIComponent(args.accountId)}/builds/triggers/${encodeURIComponent(existingTriggerUuid)}`
      : `/accounts/${encodeURIComponent(args.accountId)}/builds/triggers`,
    body,
  });
  const record = asRecord(raw);
  return requireString({
    record,
    key: "trigger_uuid",
    message: `${triggerName} trigger did not return an id.`,
  });
}

async function setTriggerEnvironmentVariables(args: {
  token: string;
  serverUrl?: string;
  accountId: string;
  triggerUuid: string;
  envVars: CloudflareBuildEnvVars;
}): Promise<void> {
  await requestCloudflareApi({
    token: args.token,
    serverUrl: args.serverUrl,
    method: "PATCH",
    path: `/accounts/${encodeURIComponent(args.accountId)}/builds/triggers/${encodeURIComponent(args.triggerUuid)}/environment_variables`,
    body: args.envVars,
  });
}

async function triggerInitialBuild(args: {
  token: string;
  serverUrl?: string;
  accountId: string;
  triggerUuid: string;
  branch: string;
}): Promise<void> {
  await requestCloudflareApi({
    token: args.token,
    serverUrl: args.serverUrl,
    method: "POST",
    path: `/accounts/${encodeURIComponent(args.accountId)}/builds/triggers/${encodeURIComponent(args.triggerUuid)}/builds`,
    body: {
      branch: args.branch,
    },
  });
}

export type ProvisionedCloudflareResources = {
  accountId: string;
  workerName: string;
  workerTag: string;
  productionUrl: string;
};

type EnsureCloudflareResourcesArgs = {
  owner: string;
  repo: string;
  ghRepoId: string;
  ghRepoOwnerId?: string;
  defaultBranch: string;
  vaultId: string;
  workerName: string;
  cloudflareToken: string;
  cloudflareServerUrl?: string;
  cloudflareAuthMethod: CloudflareAuthMethod;
  accountId: string;
  buildConfig: CloudflareBuildConfig;
  existingWorkerTag?: string;
  convex: CloudflareProvisionConvexState;
  onWorkerResolved?: (worker: CloudflareWorkerIdentity) => Promise<void>;
};

type CloudflareAuthMethod = "api_key" | "mcp_oauth";

export async function ensureCloudflareResources(
  args: EnsureCloudflareResourcesArgs,
): Promise<ProvisionedCloudflareResources> {
  const fallbackWorkerName = args.workerName;
  let workerName = args.workerName;

  console.log("infra:cloudflare:provision:start", {
    vaultId: args.vaultId,
    accountId: args.accountId,
    workerName,
    repo: `${args.owner}/${args.repo}`,
    defaultBranch: args.defaultBranch,
  });

  let step = "resolve_worker";
  try {
    const worker = await ensureWorker({
      token: args.cloudflareToken,
      serverUrl: args.cloudflareServerUrl,
      accountId: args.accountId,
      fallbackWorkerName,
      existingWorkerTag: args.existingWorkerTag,
    });
    workerName = worker.workerName;

    step = "record_worker_identity";
    await args.onWorkerResolved?.(worker);

    step = "connect_repository";
    const repoConnectionUuid = await ensureRepositoryConnection({
      token: args.cloudflareToken,
      serverUrl: args.cloudflareServerUrl,
      accountId: args.accountId,
      ghRepoId: args.ghRepoId,
      ghRepoOwnerId: args.ghRepoOwnerId,
      owner: args.owner,
      repo: args.repo,
    });

    step = "list_triggers";
    const existingTriggers = await listBuildTriggers({
      token: args.cloudflareToken,
      serverUrl: args.cloudflareServerUrl,
      accountId: args.accountId,
      workerTag: worker.workerTag,
    });

    step = "resolve_build_token";
    const buildTokenUuid = await resolveBuildTokenUuid({
      token: args.cloudflareToken,
      serverUrl: args.cloudflareServerUrl,
      accountId: args.accountId,
      existingTriggers,
      authMethod: args.cloudflareAuthMethod,
    });

    step = "upsert_triggers";
    const productionTriggerUuid = await upsertBuildTrigger({
      token: args.cloudflareToken,
      serverUrl: args.cloudflareServerUrl,
      accountId: args.accountId,
      workerTag: worker.workerTag,
      repoConnectionUuid,
      buildTokenUuid,
      buildConfig: args.buildConfig,
      defaultBranch: args.defaultBranch,
      existingTriggers,
      kind: "production",
    });
    const previewTriggerUuid = await upsertBuildTrigger({
      token: args.cloudflareToken,
      serverUrl: args.cloudflareServerUrl,
      accountId: args.accountId,
      workerTag: worker.workerTag,
      repoConnectionUuid,
      buildTokenUuid,
      buildConfig: args.buildConfig,
      defaultBranch: args.defaultBranch,
      existingTriggers,
      kind: "preview",
    });

    step = "set_environment_variables";
    await Promise.all([
      setTriggerEnvironmentVariables({
        token: args.cloudflareToken,
        serverUrl: args.cloudflareServerUrl,
        accountId: args.accountId,
        triggerUuid: productionTriggerUuid,
        envVars: buildCloudflareWorkersEnvVars({
          deployKeyName: PROD_CONVEX_DEPLOY_KEY,
          convexDeployKey: args.convex.production.deployKey,
          convexUrl: args.convex.production.cloudUrl,
        }),
      }),
      setTriggerEnvironmentVariables({
        token: args.cloudflareToken,
        serverUrl: args.cloudflareServerUrl,
        accountId: args.accountId,
        triggerUuid: previewTriggerUuid,
        envVars: buildCloudflareWorkersEnvVars({
          deployKeyName: PREVIEW_CONVEX_DEPLOY_KEY,
          convexDeployKey: args.convex.preview.deployKey,
          convexUrl: args.convex.preview.cloudUrl,
        }),
      }),
    ]);

    step = "trigger_initial_build";
    await triggerInitialBuild({
      token: args.cloudflareToken,
      serverUrl: args.cloudflareServerUrl,
      accountId: args.accountId,
      triggerUuid: productionTriggerUuid,
      branch: args.defaultBranch,
    });

    const result: ProvisionedCloudflareResources = {
      accountId: args.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
      productionUrl: worker.productionUrl,
    };

    console.log("infra:cloudflare:provision:success", {
      vaultId: args.vaultId,
      accountId: result.accountId,
      workerName: result.workerName,
      workerTag: result.workerTag,
      productionUrl: result.productionUrl,
    });

    return result;
  } catch (error) {
    console.error("infra:cloudflare:provision:failed", {
      vaultId: args.vaultId,
      accountId: args.accountId,
      workerName,
      repo: `${args.owner}/${args.repo}`,
      step,
      message: toErrorMessage(error),
    });
    throw error;
  }
}

export type CloudflareStatusReadResult = {
  summary: string;
  endpoint: string;
  raw: string;
  rowCount: number;
};

export type CloudflareLogsReadResult = {
  summary: string;
  endpoint: string;
  raw: string;
  logLineCount: number;
};

type ReadCloudflareWorkerStatusArgs = {
  cloudflareToken: string;
  cloudflareServerUrl?: string;
  accountId: string;
  workerName: string;
  workerTag?: string;
};

export async function readCloudflareWorkerStatus(
  args: ReadCloudflareWorkerStatusArgs,
): Promise<CloudflareStatusReadResult> {
  const workerEndpoint = `/accounts/${encodeURIComponent(args.accountId)}/workers/workers/${encodeURIComponent(args.workerName)}`;
  const worker = await requestCloudflareApi({
    token: args.cloudflareToken,
    serverUrl: args.cloudflareServerUrl,
    method: "GET",
    path: workerEndpoint,
  });
  const workerRecord = asRecord(worker);
  const workerTag =
    args.workerTag ?? readCloudflareWorkerTag(workerRecord, args.workerName);
  const triggers = await listBuildTriggers({
    token: args.cloudflareToken,
    serverUrl: args.cloudflareServerUrl,
    accountId: args.accountId,
    workerTag,
  });

  return {
    summary: `Cloudflare Worker status for ${args.workerName}`,
    endpoint: `${workerEndpoint} + Workers Builds triggers`,
    raw: JSON.stringify({ worker: workerRecord, triggers }, null, 2),
    rowCount: 1,
  };
}

type ReadCloudflareLogsArgs = {
  cloudflareToken: string;
  cloudflareServerUrl?: string;
  accountId: string;
  workerName: string;
  workerTag: string;
  maxEntries: number;
};

export async function readCloudflareBuildLogs(
  args: ReadCloudflareLogsArgs,
): Promise<CloudflareLogsReadResult> {
  const maxEntries = clamp(args.maxEntries, 1, 50);
  const buildsEndpoint = `/accounts/${encodeURIComponent(args.accountId)}/builds/workers/${encodeURIComponent(args.workerTag)}/builds`;
  const buildsPayload = await requestCloudflareApi({
    token: args.cloudflareToken,
    serverUrl: args.cloudflareServerUrl,
    method: "GET",
    path: buildsEndpoint,
  });
  const builds = Array.isArray(buildsPayload) ? buildsPayload : [];
  const selectedBuilds = builds.slice(0, maxEntries);

  const logsByBuild = await Promise.all(
    selectedBuilds.map(async (build) => {
      const record = asRecord(build);
      const buildUuid = readString(record, "build_uuid");
      if (!buildUuid) {
        return {
          build,
          logs: { error: "Build UUID missing from Cloudflare response" },
        };
      }

      const logsEndpoint = `/accounts/${encodeURIComponent(args.accountId)}/builds/builds/${encodeURIComponent(buildUuid)}/logs`;
      const logsPayload = await requestCloudflareApi({
        token: args.cloudflareToken,
        serverUrl: args.cloudflareServerUrl,
        method: "GET",
        path: logsEndpoint,
      });

      return {
        buildUuid,
        build,
        logs: logsPayload,
      };
    }),
  );

  return {
    summary: `Cloudflare build logs for Worker ${args.workerName}`,
    endpoint: `${buildsEndpoint} + build logs`,
    raw:
      logsByBuild.length > 0
        ? JSON.stringify(logsByBuild, null, 2)
        : "No build entries returned.",
    logLineCount: logsByBuild.length,
  };
}

type DeleteCloudflareResourcesArgs = {
  accountId: string;
  workerName: string;
  workerTag: string;
  cloudflareToken: string;
  cloudflareServerUrl?: string;
};

async function deleteCloudflareBuildTrigger(args: {
  accountId: string;
  triggerUuid: string;
  cloudflareToken: string;
  cloudflareServerUrl?: string;
}): Promise<void> {
  try {
    await requestCloudflareApi({
      token: args.cloudflareToken,
      serverUrl: args.cloudflareServerUrl,
      method: "DELETE",
      path: `/accounts/${encodeURIComponent(args.accountId)}/builds/triggers/${encodeURIComponent(args.triggerUuid)}`,
    });
  } catch (error) {
    if (!isCloudflareWorkerNotFoundError(error)) {
      throw error;
    }
  }
}

export async function deleteCloudflareResources(
  args: DeleteCloudflareResourcesArgs,
): Promise<void> {
  const triggers = await listBuildTriggers({
    token: args.cloudflareToken,
    serverUrl: args.cloudflareServerUrl,
    accountId: args.accountId,
    workerTag: args.workerTag,
  }).catch((error: unknown) => {
    if (isCloudflareWorkerNotFoundError(error)) {
      return [];
    }
    throw error;
  });
  await Promise.all(
    triggers.map(async (trigger) => {
      const triggerUuid = readString(trigger, "trigger_uuid");
      if (!triggerUuid) {
        return;
      }
      await deleteCloudflareBuildTrigger({
        accountId: args.accountId,
        triggerUuid,
        cloudflareToken: args.cloudflareToken,
        cloudflareServerUrl: args.cloudflareServerUrl,
      });
    }),
  );
  await requestCloudflareApi({
    token: args.cloudflareToken,
    serverUrl: args.cloudflareServerUrl,
    method: "DELETE",
    path: `/accounts/${encodeURIComponent(args.accountId)}/workers/workers/${encodeURIComponent(args.workerName)}`,
  });
}
