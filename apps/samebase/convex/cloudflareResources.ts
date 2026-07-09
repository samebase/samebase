import { notEmpty } from "@samebase/dependent/main";

import {
  requestCloudflareApi,
  CloudflareApiError,
  resolveCloudflareApiTransport,
  type CloudflareApiTransport,
} from "./cloudflareApi/client";
import type { components, Readable, Writable } from "./cloudflareApi/types.generated";
import { clamp, toErrorMessage } from "./jsonUtils";
import type { ProviderApiCallRecorder } from "./providerApiLog";

export {
  CloudflareApiError,
  isCloudflareMcpInvalidAccessTokenError,
  isWorkersBuildsInvalidTokenMessage,
} from "./cloudflareApi/client";

type CloudflareProvisionConvexState = {
  production: {
    deployKey: string;
  };
  preview: {
    deployKey: string;
  };
};

export type CloudflareBuildConfig = {
  rootDir: string;
  buildCommand: string;
  deployCommand: string;
  previewDeployCommand: string;
  pathIncludes: string[];
  pathExcludes: string[];
};

type CloudflareWorker = Readable<components["schemas"]["workers_Worker"]>;
type CloudflareWorkerCreateBody = Writable<components["schemas"]["workers_Worker"]>;
type CloudflareWorkerTagSource = {
  id?: string;
  external_script_id?: string;
  tag?: string;
  name?: string;
};
type CloudflareBuildTokenRecord = Readable<components["schemas"]["builds_ListTokensResponse"]>;
export type CloudflareBuildTrigger = Readable<components["schemas"]["builds_TriggerResponse"]>;
type CloudflareBuildEnvVars = components["schemas"]["builds_EnvironmentVariablesRequest"];
type CloudflareBuildEnvVarsResponse = components["schemas"]["builds_EnvironmentVariablesResponse"];
type CloudflareApiCallOptions = {
  transport: CloudflareApiTransport;
  recordApiCall?: ProviderApiCallRecorder;
};

export type CloudflareBuildToken = {
  name: string;
  uuid: string;
  cloudflareTokenId: string;
};

const SAMEBASE_WORKERS_BUILD_TOKEN_NAME = "samebase build token";
const WORKERS_BUILDS_TOKEN_REQUIRED_MESSAGE = `Cloudflare Workers Builds has no build API token. In Cloudflare, create a Workers Builds API token named "${SAMEBASE_WORKERS_BUILD_TOKEN_NAME}", then retry.`;
const CLOUDFLARE_GITHUB_APP_NOT_AUTHORIZED_CODE = "8000008";
const CLOUDFLARE_GITHUB_APP_RECOVERY_URL =
  "https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#reinstall-the-cloudflare-github-app";
const BUILD_TOKEN_PAGE_SIZE = 100;
const CONVEX_DEPLOY_KEY = "CONVEX_DEPLOY_KEY";
const PREVIEW_CONVEX_DEPLOY_KEY = "PREVIEW_CONVEX_DEPLOY_KEY";

export function isCloudflareWorkerNotFoundError(error: unknown): boolean {
  if (error instanceof CloudflareApiError && !error.path.includes("/builds/triggers/")) {
    return error.details.some((detail) => {
      const message = detail.message?.toLowerCase();
      return (
        (!error.path.includes("/builds/triggers/") && detail.code === "10007") ||
        message === "worker not found" ||
        message === "script not found" ||
        message === "not found" ||
        message === "workers.api.error.not_found"
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

export function isCloudflareBuildTriggerNotFoundError(error: unknown): boolean {
  if (!(error instanceof CloudflareApiError) || !error.path.includes("/builds/triggers/")) {
    return false;
  }

  return error.details.some((detail) => {
    const message = detail.message?.toLowerCase();
    return (
      detail.code === "10007" ||
      message === "trigger not found" ||
      message === "not found" ||
      message === "workers.api.error.not_found"
    );
  });
}

export function isCloudflareGitHubAppRepositoryAuthorizationError(error: unknown): boolean {
  if (
    error instanceof CloudflareApiError &&
    error.details.some((detail) => detail.code === CLOUDFLARE_GITHUB_APP_NOT_AUTHORIZED_CODE)
  ) {
    return true;
  }

  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes(`cloudflare api error: ${CLOUDFLARE_GITHUB_APP_NOT_AUTHORIZED_CODE}`) &&
    message.includes("disconnected from your git account")
  );
}

export function formatCloudflareGitHubAppRepositoryAuthorizationMessage(
  repositoryFullName: string,
): string {
  return `Cloudflare Workers and Pages GitHub App is not authorized for ${repositoryFullName}. Follow Cloudflare's recovery steps at ${CLOUDFLARE_GITHUB_APP_RECOVERY_URL}: uninstall the GitHub App first, then reinstall/connect GitHub from Workers & Pages and include ${repositoryFullName}, then retry.`;
}

function requireCloudflareResult<T>(value: T | undefined, message: string): T {
  if (value !== undefined) {
    return value;
  }
  throw new Error(message);
}

function requireCloudflareString(value: string | null | undefined, message: string): string {
  if (value) {
    return value;
  }
  throw new Error(message);
}

export function buildCloudflareWorkersEnvVars(vars: {
  productionConvexDeployKey: string;
  previewConvexDeployKey: string;
}): CloudflareBuildEnvVars {
  return {
    [CONVEX_DEPLOY_KEY]: {
      value: vars.productionConvexDeployKey,
      is_secret: true,
    },
    [PREVIEW_CONVEX_DEPLOY_KEY]: {
      value: vars.previewConvexDeployKey,
      is_secret: true,
    },
  };
}

type CloudflareWorkerIdentity = {
  workerName: string;
  workerTag: string;
  workersDevUrl?: string;
};

export type CloudflareWorkerInventoryItem = {
  workerName: string;
  workerTag: string;
};

export type CloudflareWorkerRepositoryEvidence =
  | { state: "none" }
  | {
      state: "matching_repo";
      repoId: string;
      repoName: string | null;
      triggerName: string | null;
      rootDirectory: string;
    }
  | {
      state: "same_repo_different_root";
      repoId: string;
      repoName: string | null;
      triggerName: string | null;
      rootDirectory: string;
      expectedRootDirectory: string;
    }
  | {
      state: "different_repo";
      repoId: string;
      repoName: string | null;
      triggerName: string | null;
    }
  | {
      state: "deleted_repo_connection";
      repoId: string | null;
      repoName: string | null;
      triggerName: string | null;
    }
  | {
      state: "missing_repo_id";
      repoName: string | null;
      triggerName: string | null;
    }
  | {
      state: "missing_root_directory";
      repoId: string;
      repoName: string | null;
      triggerName: string | null;
      expectedRootDirectory: string;
    }
  | {
      state: "trigger_read_failed";
      message: string;
    };

export type CloudflareWorkerRepositoryDiscovery = {
  classification: "recommended" | "available" | "blocked" | "unknown";
  evidence: CloudflareWorkerRepositoryEvidence;
};

export type CloudflareWorkerDiscoveryItem = CloudflareWorkerInventoryItem & {
  discovery: CloudflareWorkerRepositoryDiscovery;
};

export type ExistingCloudflareWorkerIdentity =
  | { state: "planned" }
  | { state: "created"; workerTag: string };

export function buildCloudflareWorkerCreateBody(workerName: string): CloudflareWorkerCreateBody {
  return {
    name: workerName,
    logpush: false,
    subdomain: {
      enabled: true,
      previews_enabled: true,
    },
    // Cloudflare rejects propagation_policy unless trace propagation is enabled,
    // even when traces are disabled, so leave that optional default out.
    observability: {
      enabled: false,
      head_sampling_rate: 1,
      logs: {
        destinations: [],
        enabled: true,
        head_sampling_rate: 1,
        persist: true,
        invocation_logs: true,
      },
    },
    tags: [],
    tail_consumers: [],
  };
}

function readCloudflareWorkerInventoryItem(worker: {
  id?: string;
  tag?: string;
}): CloudflareWorkerInventoryItem | null {
  const workerName = worker.id?.trim();
  const workerTag = worker.tag?.trim();
  if (!workerName || !workerTag) {
    return null;
  }
  return {
    workerName,
    workerTag,
  };
}

function readTrimmedCloudflareString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalizeCloudflareBuildRoot(value: string | null | undefined): string | null {
  let root = value?.trim();
  if (!root) {
    return null;
  }
  if (root === "." || root === "/") {
    return "/";
  }
  while (root.startsWith("./")) {
    root = root.slice(2);
  }
  while (root.startsWith("/")) {
    root = root.slice(1);
  }
  while (root.endsWith("/")) {
    root = root.slice(0, -1);
  }
  if (!root || root === ".") {
    return "/";
  }
  if (root.includes("\\")) {
    return null;
  }
  const segments = root.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }
  return segments.join("/");
}

function requireNormalizedCloudflareBuildRoot(value: string, label: string): string {
  const normalized = normalizeCloudflareBuildRoot(value);
  if (normalized) {
    return normalized;
  }
  throw new Error(`${label} is not a valid Cloudflare Workers Builds root directory.`);
}

function formatCloudflareBuildRoot(rootDirectory: string): string {
  return rootDirectory === "/" ? "/" : rootDirectory;
}

async function readAccountSubdomain(
  args: { token: string; accountId: string } & CloudflareApiCallOptions,
): Promise<string> {
  const raw = await requestCloudflareApi({
    token: args.token,
    method: "GET",
    path: "/accounts/{account_id}/workers/subdomain",
    transport: args.transport,
    params: {
      path: {
        account_id: args.accountId,
      },
    },
    recordApiCall: args.recordApiCall,
  });
  const subdomain = raw?.subdomain.trim();
  if (!subdomain) {
    throw new Error(
      "Cloudflare Workers needs a configured workers.dev subdomain before Samebase can create a production URL.",
    );
  }
  return subdomain;
}

async function readWorkerSubdomainEnabled(
  args: {
    token: string;
    accountId: string;
    workerName: string;
  } & CloudflareApiCallOptions,
): Promise<boolean> {
  // A workers.dev URL is usable only when this script-level subdomain is enabled,
  // even when the account-level workers.dev subdomain exists.
  const raw = await requestCloudflareApi({
    token: args.token,
    method: "GET",
    path: "/accounts/{account_id}/workers/scripts/{script_name}/subdomain",
    transport: args.transport,
    params: {
      path: {
        account_id: args.accountId,
        script_name: args.workerName,
      },
    },
    recordApiCall: args.recordApiCall,
  });
  return raw?.enabled === true;
}

async function readWorker(
  args: {
    token: string;
    accountId: string;
    workerName: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorker | null> {
  try {
    const raw = await requestCloudflareApi({
      token: args.token,
      method: "GET",
      path: "/accounts/{account_id}/workers/workers/{worker_id}",
      transport: args.transport,
      params: {
        path: {
          account_id: args.accountId,
          worker_id: args.workerName,
        },
      },
      recordApiCall: args.recordApiCall,
    });
    return requireCloudflareResult(
      raw,
      `Cloudflare Worker ${args.workerName} response did not include a Worker.`,
    );
  } catch (error) {
    if (isCloudflareWorkerNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function readOptionalWorkersDevUrl(
  args: {
    token: string;
    accountId: string;
    workerName: string;
  } & CloudflareApiCallOptions,
): Promise<string | undefined> {
  try {
    if (!(await readWorkerSubdomainEnabled(args))) {
      return undefined;
    }
    const accountSubdomain = await readAccountSubdomain(args);
    return `https://${args.workerName}.${accountSubdomain}.workers.dev`;
  } catch {
    return undefined;
  }
}

export async function isCloudflareWorkerNameAvailable(args: {
  token: string;
  accountId: string;
  workerName: string;
  transport: CloudflareApiTransport;
}): Promise<boolean> {
  const worker = await readWorker(args);
  return !worker;
}

export function readCloudflareWorkerTag(
  worker: CloudflareWorkerTagSource,
  workerName: string,
): string {
  // New Workers services do not appear in /workers/scripts until they have a
  // script version, but the Workers service id is the same external_script_id
  // that Workers Builds calls the worker tag.
  const workerTag = worker.id ?? worker.external_script_id ?? worker.tag;
  if (workerTag) {
    return workerTag;
  }
  throw new Error(
    `Cloudflare Worker ${workerName} did not include id, external_script_id, or tag.`,
  );
}

export async function listCloudflareWorkers(
  args: {
    token: string;
    accountId: string;
    limit: number;
    transport: CloudflareApiTransport;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerInventoryItem[]> {
  const workers = await requestCloudflareApi({
    token: args.token,
    transport: args.transport,
    method: "GET",
    path: "/accounts/{account_id}/workers/scripts",
    params: {
      path: {
        account_id: args.accountId,
      },
    },
    recordApiCall: args.recordApiCall,
  });
  if (!workers) {
    throw new Error(
      `Cloudflare Workers inventory for account ${args.accountId} response did not include Workers.`,
    );
  }

  return workers
    .map(readCloudflareWorkerInventoryItem)
    .filter(notEmpty)
    .sort(
      (left, right) =>
        left.workerName.localeCompare(right.workerName) ||
        left.workerTag.localeCompare(right.workerTag),
    )
    .slice(0, args.limit);
}

function readCloudflareWorkerTriggerRepositoryEvidence(args: {
  trigger: CloudflareBuildTrigger;
  expectedRepoId: string;
  expectedRootDirectory: string;
}): CloudflareWorkerRepositoryEvidence {
  const triggerName = readTrimmedCloudflareString(args.trigger.trigger_name);
  const repoConnection = args.trigger.repo_connection;
  if (!repoConnection) {
    return {
      state: "missing_repo_id",
      repoName: null,
      triggerName,
    };
  }

  const repoName = readTrimmedCloudflareString(repoConnection.repo_name);
  const repoId = readTrimmedCloudflareString(repoConnection.repo_id);
  if (repoConnection.deleted_on) {
    return {
      state: "deleted_repo_connection",
      repoId,
      repoName,
      triggerName,
    };
  }
  if (!repoId) {
    return {
      state: "missing_repo_id",
      repoName,
      triggerName,
    };
  }
  if (repoId === args.expectedRepoId) {
    const rootDirectory = normalizeCloudflareBuildRoot(args.trigger.root_directory);
    if (!rootDirectory) {
      return {
        state: "missing_root_directory",
        repoId,
        repoName,
        triggerName,
        expectedRootDirectory: args.expectedRootDirectory,
      };
    }
    if (rootDirectory !== args.expectedRootDirectory) {
      return {
        state: "same_repo_different_root",
        repoId,
        repoName,
        triggerName,
        rootDirectory,
        expectedRootDirectory: args.expectedRootDirectory,
      };
    }
    return {
      state: "matching_repo",
      repoId,
      repoName,
      triggerName,
      rootDirectory,
    };
  }
  return {
    state: "different_repo",
    repoId,
    repoName,
    triggerName,
  };
}

export function classifyCloudflareWorkerRepositoryDiscovery(args: {
  triggers: readonly CloudflareBuildTrigger[];
  expectedRepoId: string;
  expectedRootDirectory: string;
}): CloudflareWorkerRepositoryDiscovery {
  const expectedRootDirectory = requireNormalizedCloudflareBuildRoot(
    args.expectedRootDirectory,
    "Expected app root",
  );
  const evidence = args.triggers
    .filter((trigger) => !trigger.deleted_on)
    .map((trigger) =>
      readCloudflareWorkerTriggerRepositoryEvidence({
        trigger,
        expectedRepoId: args.expectedRepoId,
        expectedRootDirectory,
      }),
    );
  const sameRepoDifferentRoot = evidence.find((item) => item.state === "same_repo_different_root");
  if (sameRepoDifferentRoot) {
    return {
      classification: "blocked",
      evidence: sameRepoDifferentRoot,
    };
  }

  const differentRepo = evidence.find((item) => item.state === "different_repo");
  if (differentRepo) {
    return {
      classification: "blocked",
      evidence: differentRepo,
    };
  }

  const unknown = evidence.find(
    (item) =>
      item.state === "deleted_repo_connection" ||
      item.state === "missing_repo_id" ||
      item.state === "missing_root_directory",
  );
  if (unknown) {
    return {
      classification: "unknown",
      evidence: unknown,
    };
  }

  const matchingRepo = evidence.find((item) => item.state === "matching_repo");
  if (matchingRepo) {
    return {
      classification: "recommended",
      evidence: matchingRepo,
    };
  }

  return {
    classification: "available",
    evidence: { state: "none" },
  };
}

async function readCloudflareWorkerDiscoveryForInventoryItem(
  args: {
    token: string;
    accountId: string;
    worker: CloudflareWorkerInventoryItem;
    expectedRepoId: string;
    expectedRootDirectory: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerDiscoveryItem> {
  try {
    const triggers = await listBuildTriggers({
      token: args.token,
      transport: args.transport,
      accountId: args.accountId,
      workerTag: args.worker.workerTag,
      recordApiCall: args.recordApiCall,
    });
    return {
      ...args.worker,
      discovery: classifyCloudflareWorkerRepositoryDiscovery({
        triggers,
        expectedRepoId: args.expectedRepoId,
        expectedRootDirectory: args.expectedRootDirectory,
      }),
    };
  } catch (error) {
    return {
      ...args.worker,
      discovery: {
        classification: "unknown",
        evidence: {
          state: "trigger_read_failed",
          message: toErrorMessage(error),
        },
      },
    };
  }
}

export async function listCloudflareWorkersWithRepositoryDiscovery(
  args: {
    token: string;
    accountId: string;
    limit: number;
    expectedRepoId: string;
    expectedRootDirectory: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerDiscoveryItem[]> {
  const workers = await listCloudflareWorkers({
    token: args.token,
    transport: args.transport,
    accountId: args.accountId,
    limit: args.limit,
    recordApiCall: args.recordApiCall,
  });
  const discoveredWorkers: CloudflareWorkerDiscoveryItem[] = [];
  const chunkSize = 10;
  for (let start = 0; start < workers.length; start += chunkSize) {
    const chunk = workers.slice(start, start + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map((worker) =>
        readCloudflareWorkerDiscoveryForInventoryItem({
          token: args.token,
          transport: args.transport,
          accountId: args.accountId,
          worker,
          expectedRepoId: args.expectedRepoId,
          expectedRootDirectory: args.expectedRootDirectory,
          recordApiCall: args.recordApiCall,
        }),
      ),
    );
    discoveredWorkers.push(...chunkResults);
  }
  return discoveredWorkers;
}

export async function readCloudflareWorkerRepositoryDiscovery(
  args: {
    token: string;
    accountId: string;
    workerName: string;
    expectedRepoId: string;
    expectedRootDirectory: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerDiscoveryItem> {
  const workers = await listCloudflareWorkers({
    token: args.token,
    transport: args.transport,
    accountId: args.accountId,
    limit: 100,
    recordApiCall: args.recordApiCall,
  });
  const worker = workers.find((candidate) => candidate.workerName === args.workerName);
  if (!worker) {
    throw new Error(`Cloudflare Worker ${args.workerName} was not found.`);
  }

  return await readCloudflareWorkerDiscoveryForInventoryItem({
    token: args.token,
    transport: args.transport,
    accountId: args.accountId,
    worker,
    expectedRepoId: args.expectedRepoId,
    expectedRootDirectory: args.expectedRootDirectory,
    recordApiCall: args.recordApiCall,
  });
}

export async function createCloudflareWorker(args: {
  token: string;
  accountId: string;
  workerName: string;
  transport: CloudflareApiTransport;
}): Promise<CloudflareWorkerIdentity> {
  return await ensureWorker({
    token: args.token,
    accountId: args.accountId,
    workerName: args.workerName,
    transport: args.transport,
    existingWorker: {
      state: "created",
      workerTag: "",
    },
  });
}

async function ensureWorker(
  args: {
    token: string;
    accountId: string;
    workerName: string;
    existingWorker: ExistingCloudflareWorkerIdentity;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerIdentity> {
  const existing = await readWorker({
    token: args.token,
    accountId: args.accountId,
    workerName: args.workerName,
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });
  if (existing) {
    const workerTag = readCloudflareWorkerTag(existing, args.workerName);
    if (args.existingWorker.state === "created" && args.existingWorker.workerTag !== workerTag) {
      throw new Error(
        `Cloudflare Worker name ${args.workerName} already exists. Choose another Worker name and try again.`,
      );
    }
    // The planned target owns the Worker name before provider writes. If the
    // previous run created the Worker but failed before recording its tag, retry
    // uses Cloudflare's identity as the missing checkpoint.
    return {
      workerName: args.workerName,
      workerTag,
      workersDevUrl: await readOptionalWorkersDevUrl(args),
    };
  }

  const createdRaw = await requestCloudflareApi({
    token: args.token,
    transport: args.transport,
    method: "POST",
    path: "/accounts/{account_id}/workers/workers",
    params: {
      path: {
        account_id: args.accountId,
      },
    },
    recordApiCall: args.recordApiCall,
    body: buildCloudflareWorkerCreateBody(args.workerName),
  });
  const created = requireCloudflareResult(
    createdRaw,
    `Cloudflare Worker ${args.workerName} response did not include the created Worker.`,
  );
  const workerTag = readCloudflareWorkerTag(created, args.workerName);
  return {
    workerName: args.workerName,
    workerTag,
    workersDevUrl: await readOptionalWorkersDevUrl(args),
  };
}

async function ensureRepositoryConnection(
  args: {
    token: string;
    accountId: string;
    ghRepoId: string;
    ghRepoOwnerId: string;
    owner: string;
    repo: string;
  } & CloudflareApiCallOptions,
): Promise<string> {
  const repositoryFullName = `${args.owner}/${args.repo}`;
  try {
    const raw = await requestCloudflareApi({
      token: args.token,
      method: "PUT",
      path: "/accounts/{account_id}/builds/repos/connections",
      transport: args.transport,
      params: {
        path: {
          account_id: args.accountId,
        },
      },
      recordApiCall: args.recordApiCall,
      body: {
        provider_type: "github",
        provider_account_id: args.ghRepoOwnerId,
        provider_account_name: args.owner,
        repo_id: args.ghRepoId,
        repo_name: args.repo,
      },
    });

    return requireCloudflareString(
      raw?.repo_connection_uuid,
      "Cloudflare Workers Builds repository connection did not return an id.",
    );
  } catch (error) {
    if (isCloudflareGitHubAppRepositoryAuthorizationError(error)) {
      throw new Error(formatCloudflareGitHubAppRepositoryAuthorizationMessage(repositoryFullName));
    }
    throw error;
  }
}

async function resolveBuildTokenUuid(
  args: {
    token: string;
    accountId: string;
    existingTriggers: readonly CloudflareBuildTrigger[];
    authMethod: CloudflareAuthMethod;
  } & CloudflareApiCallOptions,
): Promise<string> {
  if (args.authMethod !== "api_key") {
    // Cloudflare OAuth tokens can manage Builds resources, but they are not API
    // tokens, so /user/tokens/verify rejects them. Reuse an existing build
    // token instead of trying to prove the OAuth token's token id.
    return await resolveOAuthBuildTokenUuid({
      token: args.token,
      accountId: args.accountId,
      existingTriggers: args.existingTriggers,
      transport: args.transport,
      recordApiCall: args.recordApiCall,
    });
  }

  const currentTokenId = await resolveCurrentCloudflareTokenId({
    token: args.token,
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });
  const existingBuildTokenUuid = await findCurrentBuildTokenUuid({
    token: args.token,
    accountId: args.accountId,
    cloudflareTokenId: currentTokenId,
    preferredBuildTokenUuids: readTriggerBuildTokenUuids(args.existingTriggers),
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });
  if (existingBuildTokenUuid) {
    return existingBuildTokenUuid;
  }
  return await createBuildToken({
    token: args.token,
    accountId: args.accountId,
    cloudflareTokenId: currentTokenId,
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });
}

async function resolveOAuthBuildTokenUuid(
  args: {
    token: string;
    accountId: string;
    existingTriggers: readonly CloudflareBuildTrigger[];
  } & CloudflareApiCallOptions,
): Promise<string> {
  const existingBuildTokenUuid = await findReusableBuildTokenUuid({
    token: args.token,
    accountId: args.accountId,
    preferredBuildTokenUuids: readTriggerBuildTokenUuids(args.existingTriggers),
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });
  if (existingBuildTokenUuid) {
    return existingBuildTokenUuid;
  }

  throw new Error(WORKERS_BUILDS_TOKEN_REQUIRED_MESSAGE);
}

async function findCurrentBuildTokenUuid(
  args: {
    token: string;
    accountId: string;
    cloudflareTokenId: string;
    preferredBuildTokenUuids: readonly string[];
  } & CloudflareApiCallOptions,
): Promise<string | undefined> {
  const tokens: CloudflareBuildToken[] = [];
  for (let page = 1; ; page += 1) {
    const rawTokens = await requestCloudflareApi({
      token: args.token,
      method: "GET",
      path: "/accounts/{account_id}/builds/tokens",
      transport: args.transport,
      params: {
        path: {
          account_id: args.accountId,
        },
        query: {
          page,
          per_page: BUILD_TOKEN_PAGE_SIZE,
        },
      },
      recordApiCall: args.recordApiCall,
    });
    const tokensPage = requireCloudflareResult(
      rawTokens,
      `Cloudflare Workers Builds token list for account ${args.accountId} response did not include tokens.`,
    );
    tokens.push(...parseBuildTokens(tokensPage));
    if (tokensPage.length < BUILD_TOKEN_PAGE_SIZE) {
      return selectCurrentBuildTokenUuid({
        tokens,
        cloudflareTokenId: args.cloudflareTokenId,
        preferredBuildTokenUuids: args.preferredBuildTokenUuids,
      });
    }
  }
}

async function findReusableBuildTokenUuid(
  args: {
    token: string;
    accountId: string;
    preferredBuildTokenUuids: readonly string[];
  } & CloudflareApiCallOptions,
): Promise<string | undefined> {
  const tokens: CloudflareBuildToken[] = [];
  for (let page = 1; ; page += 1) {
    const rawTokens = await requestCloudflareApi({
      token: args.token,
      method: "GET",
      path: "/accounts/{account_id}/builds/tokens",
      transport: args.transport,
      params: {
        path: {
          account_id: args.accountId,
        },
        query: {
          page,
          per_page: BUILD_TOKEN_PAGE_SIZE,
        },
      },
      recordApiCall: args.recordApiCall,
    });
    const tokensPage = requireCloudflareResult(
      rawTokens,
      `Cloudflare Workers Builds token list for account ${args.accountId} response did not include tokens.`,
    );
    tokens.push(...parseBuildTokens(tokensPage));
    if (tokensPage.length < BUILD_TOKEN_PAGE_SIZE) {
      return selectReusableBuildTokenUuid({
        tokens,
        preferredBuildTokenUuids: args.preferredBuildTokenUuids,
      });
    }
  }
}

function parseBuildTokens(
  tokenRecords: readonly CloudflareBuildTokenRecord[],
): CloudflareBuildToken[] {
  return tokenRecords.map(readCloudflareBuildToken).filter(notEmpty).sort(compareBuildTokens);
}

function readCloudflareBuildToken(
  tokenRecord: CloudflareBuildTokenRecord,
): CloudflareBuildToken | null {
  const uuid = tokenRecord.build_token_uuid;
  const cloudflareTokenId = tokenRecord.cloudflare_token_id;
  if (!uuid || !cloudflareTokenId) {
    return null;
  }
  return {
    name: tokenRecord.build_token_name ?? "",
    uuid,
    cloudflareTokenId,
  };
}

function compareBuildTokens(left: CloudflareBuildToken, right: CloudflareBuildToken): number {
  return left.name.localeCompare(right.name) || left.uuid.localeCompare(right.uuid);
}

function selectStableBuildTokenUuid(tokens: readonly CloudflareBuildToken[]): string | undefined {
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
  const preferredTokens = args.tokens.filter((token) => preferredBuildTokenUuids.has(token.uuid));
  const preferredTokenUuid = selectStableBuildTokenUuid(preferredTokens);
  if (preferredTokenUuid) {
    return preferredTokenUuid;
  }

  const namedTokens = args.tokens.filter(
    (token) => token.name === SAMEBASE_WORKERS_BUILD_TOKEN_NAME,
  );
  const namedTokenUuid = selectStableBuildTokenUuid(namedTokens);
  if (namedTokenUuid) {
    // Failed retries can leave duplicate Samebase-named tokens. Cloudflare's list
    // response has no creation time, so choose by stable UUID order and let the
    // trigger upserts bind both triggers to the same token.
    return namedTokenUuid;
  }

  if (args.tokens.length === 1) {
    return selectStableBuildTokenUuid(args.tokens);
  }

  throw new Error(
    `Cloudflare has multiple Workers build tokens. Keep one token named "${SAMEBASE_WORKERS_BUILD_TOKEN_NAME}" and retry.`,
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
    (token) => token.name === SAMEBASE_WORKERS_BUILD_TOKEN_NAME,
  );
  const namedTokenUuid = selectStableBuildTokenUuid(namedTokens);
  if (namedTokenUuid) {
    return namedTokenUuid;
  }

  return selectStableBuildTokenUuid(matchingTokens);
}

function readTriggerBuildTokenUuids(
  triggers: readonly CloudflareBuildTrigger[],
): readonly string[] {
  const uuids: string[] = [];
  for (const trigger of triggers) {
    if (!trigger.deleted_on && trigger.build_token_uuid) {
      uuids.push(trigger.build_token_uuid);
    }
  }
  return uuids;
}

async function resolveCurrentCloudflareTokenId(
  args: { token: string } & CloudflareApiCallOptions,
): Promise<string> {
  const raw = await requestCloudflareApi({
    token: args.token,
    method: "GET",
    path: "/user/tokens/verify",
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });
  return requireCloudflareString(
    raw?.id,
    "Cloudflare did not return an id for the current token, so Workers Builds cannot create a build token.",
  );
}

async function createBuildToken(
  args: {
    token: string;
    accountId: string;
    cloudflareTokenId: string;
  } & CloudflareApiCallOptions,
): Promise<string> {
  const raw = await requestCloudflareApi({
    token: args.token,
    method: "POST",
    path: "/accounts/{account_id}/builds/tokens",
    transport: args.transport,
    params: {
      path: {
        account_id: args.accountId,
      },
    },
    recordApiCall: args.recordApiCall,
    body: {
      build_token_name: SAMEBASE_WORKERS_BUILD_TOKEN_NAME,
      build_token_secret: args.token,
      cloudflare_token_id: args.cloudflareTokenId,
    },
  });
  return requireCloudflareString(
    raw?.build_token_uuid,
    "Cloudflare Workers Builds did not return an id for the created build token.",
  );
}

type CloudflareBuildTriggerKind = "production" | "preview";

function matchesTriggerKind(args: {
  trigger: CloudflareBuildTrigger;
  kind: CloudflareBuildTriggerKind;
  defaultBranch: string;
}): boolean {
  const branchIncludes = args.trigger.branch_includes ?? [];
  const branchExcludes = args.trigger.branch_excludes ?? [];
  if (args.kind === "production") {
    return (
      branchIncludes.length === 1 &&
      branchIncludes[0] === args.defaultBranch &&
      branchExcludes.length === 0
    );
  }

  return branchIncludes.includes("*") && branchExcludes.includes(args.defaultBranch);
}

function readTriggerRepositoryId(trigger: CloudflareBuildTrigger): string | undefined {
  const repoConnection = trigger.repo_connection;
  if (!repoConnection || repoConnection.deleted_on) {
    return undefined;
  }
  return repoConnection.repo_id;
}

function formatExistingTriggerRepository(trigger: CloudflareBuildTrigger, repoId: string): string {
  const repoName = trigger.repo_connection?.repo_name;
  if (repoName) {
    return `${repoName} (${repoId})`;
  }
  return repoId;
}

function assertBuildTriggerMatchesRepositoryAndRoot(args: {
  trigger: CloudflareBuildTrigger;
  triggerName: string;
  expectedRepoId: string;
  expectedRootDirectory: string;
  repositoryFullName: string;
  workerTag: string;
}): void {
  if (args.trigger.repo_connection?.deleted_on) {
    throw new Error(
      `Cannot connect Cloudflare Worker ${args.workerTag} to ${args.repositoryFullName}: its existing ${args.triggerName} Workers Builds trigger references a deleted Cloudflare GitHub repository connection. Disconnect Builds in Cloudflare or choose another Worker.`,
    );
  }
  const triggerRepoId = readTriggerRepositoryId(args.trigger);
  if (!triggerRepoId) {
    throw new Error(
      `Cannot connect Cloudflare Worker ${args.workerTag} to ${args.repositoryFullName}: Cloudflare did not return a GitHub repository id for the existing ${args.triggerName} Workers Builds trigger. Disconnect Builds in Cloudflare or choose another Worker.`,
    );
  }
  if (triggerRepoId !== args.expectedRepoId) {
    throw new Error(
      `Cannot connect Cloudflare Worker ${args.workerTag} to ${args.repositoryFullName}: its existing ${args.triggerName} Workers Builds trigger is connected to GitHub repository ${formatExistingTriggerRepository(args.trigger, triggerRepoId)}. Disconnect Builds in Cloudflare or choose another Worker.`,
    );
  }

  const triggerRootDirectory = normalizeCloudflareBuildRoot(args.trigger.root_directory);
  if (!triggerRootDirectory) {
    throw new Error(
      `Cannot connect Cloudflare Worker ${args.workerTag} to ${args.repositoryFullName}: Cloudflare did not return a root directory for the existing ${args.triggerName} Workers Builds trigger. Disconnect Builds in Cloudflare or choose another Worker.`,
    );
  }
  if (triggerRootDirectory !== args.expectedRootDirectory) {
    throw new Error(
      `Cannot connect Cloudflare Worker ${args.workerTag} to ${args.repositoryFullName}: its existing ${args.triggerName} Workers Builds trigger is connected to root directory ${formatCloudflareBuildRoot(triggerRootDirectory)}. Expected ${formatCloudflareBuildRoot(args.expectedRootDirectory)}. Disconnect Builds in Cloudflare or choose another Worker.`,
    );
  }
}

function selectPatchableBuildTrigger(args: {
  triggers: readonly CloudflareBuildTrigger[];
  kind: CloudflareBuildTriggerKind;
  defaultBranch: string;
}): CloudflareBuildTrigger | undefined {
  return args.triggers.find(
    (trigger) =>
      !trigger.deleted_on &&
      matchesTriggerKind({
        trigger,
        kind: args.kind,
        defaultBranch: args.defaultBranch,
      }),
  );
}

async function listBuildTriggers(
  args: {
    token: string;
    accountId: string;
    workerTag: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareBuildTrigger[]> {
  const raw = await requestCloudflareApi({
    token: args.token,
    method: "GET",
    path: "/accounts/{account_id}/builds/workers/{external_script_id}/triggers",
    transport: args.transport,
    params: {
      path: {
        account_id: args.accountId,
        external_script_id: args.workerTag,
      },
    },
    recordApiCall: args.recordApiCall,
  });
  return requireCloudflareResult(
    raw,
    `Cloudflare Workers Builds trigger list for account ${args.accountId} Worker ${args.workerTag} response did not include triggers.`,
  );
}

async function deleteBuildTrigger(
  args: {
    token: string;
    accountId: string;
    triggerUuid: string;
  } & CloudflareApiCallOptions,
): Promise<void> {
  await requestCloudflareApi({
    token: args.token,
    method: "DELETE",
    path: "/accounts/{account_id}/builds/triggers/{trigger_uuid}",
    transport: args.transport,
    params: {
      path: {
        account_id: args.accountId,
        trigger_uuid: args.triggerUuid,
      },
    },
    recordApiCall: args.recordApiCall,
  });
}

function isBuildTriggerPatchableForTarget(args: {
  trigger: CloudflareBuildTrigger;
  expectedRepoId: string;
  expectedRootDirectory: string;
}): boolean {
  const expectedRootDirectory = requireNormalizedCloudflareBuildRoot(
    args.expectedRootDirectory,
    "Expected app root",
  );
  return (
    readTriggerRepositoryId(args.trigger) === args.expectedRepoId &&
    normalizeCloudflareBuildRoot(args.trigger.root_directory) === expectedRootDirectory
  );
}

type RestorableCloudflareBuildTriggerConfig = {
  build_token_uuid: string;
  trigger_name: string;
  build_command: string;
  deploy_command: string;
  root_directory: string;
  branch_includes: string[];
  branch_excludes: string[];
  path_includes: string[];
  path_excludes: string[];
  repo_connection_uuid: string;
};

function readRestorableCloudflareBuildTriggerConfig(
  trigger: CloudflareBuildTrigger,
): RestorableCloudflareBuildTriggerConfig | null {
  const repoConnectionUuid = trigger.repo_connection?.repo_connection_uuid;
  if (
    trigger.build_token_uuid === undefined ||
    trigger.trigger_name === undefined ||
    trigger.build_command === undefined ||
    trigger.deploy_command === undefined ||
    trigger.root_directory === undefined ||
    trigger.branch_includes === undefined ||
    trigger.branch_excludes === undefined ||
    trigger.path_includes === undefined ||
    trigger.path_excludes === undefined ||
    repoConnectionUuid === undefined
  ) {
    return null;
  }

  return {
    build_token_uuid: trigger.build_token_uuid,
    trigger_name: trigger.trigger_name,
    build_command: trigger.build_command,
    deploy_command: trigger.deploy_command,
    root_directory: trigger.root_directory,
    branch_includes: trigger.branch_includes,
    branch_excludes: trigger.branch_excludes,
    path_includes: trigger.path_includes,
    path_excludes: trigger.path_excludes,
    repo_connection_uuid: repoConnectionUuid,
  };
}

async function upsertBuildTrigger(
  args: {
    token: string;
    accountId: string;
    workerTag: string;
    repoConnectionUuid: string;
    expectedRepoId: string;
    buildTokenUuid: string;
    buildConfig: CloudflareBuildConfig;
    defaultBranch: string;
    existingTriggers: readonly CloudflareBuildTrigger[];
    kind: CloudflareBuildTriggerKind;
  } & CloudflareApiCallOptions,
): Promise<string> {
  const existingTrigger = selectPatchableBuildTrigger({
    triggers: args.existingTriggers,
    kind: args.kind,
    defaultBranch: args.defaultBranch,
  });
  const triggerName = args.kind === "production" ? "Production Deploy" : "Preview Deploy";
  const triggerConfig = {
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
    path_includes: args.buildConfig.pathIncludes,
    path_excludes: args.buildConfig.pathExcludes,
  };

  const previousTriggerConfig = existingTrigger
    ? readRestorableCloudflareBuildTriggerConfig(existingTrigger)
    : null;
  const existingTriggerUuid = existingTrigger?.trigger_uuid;
  if (existingTrigger) {
    if (!existingTriggerUuid) {
      throw new Error(
        `Cannot update ${triggerName} trigger for Cloudflare Worker ${args.workerTag}: Cloudflare did not return a trigger id.`,
      );
    }
    if (
      !isBuildTriggerPatchableForTarget({
        trigger: existingTrigger,
        expectedRepoId: args.expectedRepoId,
        expectedRootDirectory: args.buildConfig.rootDir,
      })
    ) {
      await deleteBuildTrigger({
        token: args.token,
        accountId: args.accountId,
        triggerUuid: existingTriggerUuid,
        transport: args.transport,
        recordApiCall: args.recordApiCall,
      });
    } else {
      try {
        const raw = await requestCloudflareApi({
          token: args.token,
          method: "PATCH",
          path: "/accounts/{account_id}/builds/triggers/{trigger_uuid}",
          transport: args.transport,
          params: {
            path: {
              account_id: args.accountId,
              trigger_uuid: existingTriggerUuid,
            },
          },
          recordApiCall: args.recordApiCall,
          body: triggerConfig,
        });
        return requireCloudflareString(
          raw?.trigger_uuid,
          `${triggerName} trigger did not return an id.`,
        );
      } catch (error) {
        if (previousTriggerConfig) {
          try {
            await restoreBuildTriggerAfterPairFailure({
              token: args.token,
              accountId: args.accountId,
              workerTag: args.workerTag,
              replacementTriggerUuid: existingTriggerUuid,
              existingTrigger,
              transport: args.transport,
              recordApiCall: args.recordApiCall,
            });
          } catch (rollbackError) {
            console.error("infra:cloudflare:builds:trigger:rollback_failed", {
              accountId: args.accountId,
              workerTag: args.workerTag,
              triggerUuid: existingTriggerUuid,
              message: toErrorMessage(rollbackError),
            });
          }
        }
        throw error;
      }
    }
  }

  try {
    const raw = await requestCloudflareApi({
      token: args.token,
      method: "POST",
      path: "/accounts/{account_id}/builds/triggers",
      transport: args.transport,
      params: {
        path: {
          account_id: args.accountId,
        },
      },
      recordApiCall: args.recordApiCall,
      body: {
        external_script_id: args.workerTag,
        repo_connection_uuid: args.repoConnectionUuid,
        ...triggerConfig,
      },
    });
    return requireCloudflareString(
      raw?.trigger_uuid,
      `${triggerName} trigger did not return an id.`,
    );
  } catch (error) {
    if (previousTriggerConfig) {
      try {
        await requestCloudflareApi({
          token: args.token,
          method: "POST",
          path: "/accounts/{account_id}/builds/triggers",
          transport: args.transport,
          params: {
            path: {
              account_id: args.accountId,
            },
          },
          recordApiCall: args.recordApiCall,
          body: {
            external_script_id: args.workerTag,
            ...previousTriggerConfig,
          },
        });
      } catch (rollbackError) {
        console.error("infra:cloudflare:builds:trigger:rollback_failed", {
          accountId: args.accountId,
          workerTag: args.workerTag,
          triggerUuid: existingTriggerUuid,
          message: toErrorMessage(rollbackError),
        });
      }
    }
    throw error;
  }
}

async function restoreBuildTriggerAfterPairFailure(
  args: {
    token: string;
    accountId: string;
    workerTag: string;
    replacementTriggerUuid: string;
    existingTrigger?: CloudflareBuildTrigger;
  } & CloudflareApiCallOptions,
): Promise<void> {
  const existingTriggerUuid = args.existingTrigger?.trigger_uuid;
  const previousTriggerConfig = args.existingTrigger
    ? readRestorableCloudflareBuildTriggerConfig(args.existingTrigger)
    : null;
  if (!existingTriggerUuid || !previousTriggerConfig) {
    if (existingTriggerUuid === args.replacementTriggerUuid) {
      return;
    }
    await deleteBuildTrigger({
      token: args.token,
      accountId: args.accountId,
      triggerUuid: args.replacementTriggerUuid,
      transport: args.transport,
      recordApiCall: args.recordApiCall,
    });
    return;
  }

  if (existingTriggerUuid === args.replacementTriggerUuid) {
    await requestCloudflareApi({
      token: args.token,
      method: "PATCH",
      path: "/accounts/{account_id}/builds/triggers/{trigger_uuid}",
      transport: args.transport,
      params: {
        path: {
          account_id: args.accountId,
          trigger_uuid: existingTriggerUuid,
        },
      },
      recordApiCall: args.recordApiCall,
      body: {
        build_token_uuid: previousTriggerConfig.build_token_uuid,
        trigger_name: previousTriggerConfig.trigger_name,
        build_command: previousTriggerConfig.build_command,
        deploy_command: previousTriggerConfig.deploy_command,
        root_directory: previousTriggerConfig.root_directory,
        branch_includes: previousTriggerConfig.branch_includes,
        branch_excludes: previousTriggerConfig.branch_excludes,
        path_includes: previousTriggerConfig.path_includes,
        path_excludes: previousTriggerConfig.path_excludes,
      },
    });
    return;
  }

  await deleteBuildTrigger({
    token: args.token,
    accountId: args.accountId,
    triggerUuid: args.replacementTriggerUuid,
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });
  await requestCloudflareApi({
    token: args.token,
    method: "POST",
    path: "/accounts/{account_id}/builds/triggers",
    transport: args.transport,
    params: {
      path: {
        account_id: args.accountId,
      },
    },
    recordApiCall: args.recordApiCall,
    body: {
      external_script_id: args.workerTag,
      ...previousTriggerConfig,
    },
  });
}

async function setTriggerEnvironmentVariables(
  args: {
    token: string;
    accountId: string;
    triggerUuid: string;
    envVars: CloudflareBuildEnvVars;
  } & CloudflareApiCallOptions,
): Promise<void> {
  await requestCloudflareApi({
    token: args.token,
    method: "PATCH",
    path: "/accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables",
    transport: args.transport,
    params: {
      path: {
        account_id: args.accountId,
        trigger_uuid: args.triggerUuid,
      },
    },
    recordApiCall: args.recordApiCall,
    body: args.envVars,
  });
}

async function listTriggerEnvironmentVariables(
  args: {
    token: string;
    accountId: string;
    triggerUuid: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareBuildEnvVarsResponse> {
  const raw = await requestCloudflareApi({
    token: args.token,
    method: "GET",
    path: "/accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables",
    transport: args.transport,
    params: {
      path: {
        account_id: args.accountId,
        trigger_uuid: args.triggerUuid,
      },
    },
    recordApiCall: args.recordApiCall,
  });
  return raw ?? {};
}

function assertTriggerEnvironmentVariables(args: {
  triggerKind: "production" | "preview";
  triggerUuid: string;
  envVars: CloudflareBuildEnvVarsResponse;
  expected: CloudflareBuildEnvVars;
}): void {
  const missingKeys = Object.keys(args.expected).filter(
    (key) => !Object.prototype.hasOwnProperty.call(args.envVars, key),
  );
  if (missingKeys.length > 0) {
    throw new Error(
      `Cloudflare ${args.triggerKind} Workers Builds trigger ${args.triggerUuid} is missing build environment variable ${missingKeys.join(", ")} after wiring.`,
    );
  }

  for (const [key, expected] of Object.entries(args.expected)) {
    if (!Object.prototype.hasOwnProperty.call(args.envVars, key)) {
      continue;
    }
    const actual = args.envVars[key];
    if (actual.is_secret !== expected.is_secret) {
      throw new Error(
        `Cloudflare ${args.triggerKind} Workers Builds trigger ${args.triggerUuid} has build environment variable ${key} with is_secret=${String(actual.is_secret)}. Expected ${String(expected.is_secret)}.`,
      );
    }
    if (!expected.is_secret && actual.value !== expected.value) {
      throw new Error(
        `Cloudflare ${args.triggerKind} Workers Builds trigger ${args.triggerUuid} has an unexpected value for build environment variable ${key}.`,
      );
    }
  }
}

async function triggerInitialBuild(
  args: {
    token: string;
    accountId: string;
    triggerUuid: string;
    branch: string;
  } & CloudflareApiCallOptions,
): Promise<void> {
  await requestCloudflareApi({
    token: args.token,
    method: "POST",
    path: "/accounts/{account_id}/builds/triggers/{trigger_uuid}/builds",
    transport: args.transport,
    params: {
      path: {
        account_id: args.accountId,
        trigger_uuid: args.triggerUuid,
      },
    },
    recordApiCall: args.recordApiCall,
    body: {
      branch: args.branch,
    },
  });
}

export type CloudflareWorkersBuilds = {
  rootDirectory: string;
  buildCommand: string;
  deployCommand: string;
  previewDeployCommand: string;
  pathIncludes: string[];
  pathExcludes: string[];
  production: {
    triggerUuid: string;
    buildTokenUuid: string;
  };
  preview: {
    triggerUuid: string;
    buildTokenUuid: string;
  };
};
export type CloudflareConnectedWorkersBuilds = CloudflareWorkersBuilds & {
  state: "connected";
};
type CloudflareInfrastructureVerificationConvexBuildAccessResult =
  | "confirmed"
  | "contradicted"
  | "not_checked";
type CloudflareConnectedBuildsVerificationResult =
  | {
      builds: "adopted";
      connectedBuilds: CloudflareConnectedWorkersBuilds;
    }
  | {
      builds: "confirmed";
      build: CloudflareConnectedWorkersBuilds;
    }
  | {
      builds: "contradicted" | "not_checked";
    };

type CloudflareAuthMethod = "api_key" | "oauth" | "mcp_oauth";

type ConfigureCloudflareWorkerBuildsArgs = {
  owner: string;
  repo: string;
  ghRepoId: string;
  ghRepoOwnerId: string;
  defaultBranch: string;
  cloudflareToken: string;
  cloudflareAuthMethod: CloudflareAuthMethod;
  accountId: string;
  workerTag: string;
  buildConfig: CloudflareBuildConfig;
  transport: CloudflareApiTransport;
  recordApiCall?: ProviderApiCallRecorder;
};

type WireCloudflareWorkerBuildsArgs = {
  owner: string;
  repo: string;
  ghRepoId: string;
  ghRepoOwnerId: string;
  defaultBranch: string;
  triggerInitialBuild: boolean;
  vaultId: string;
  workerName: string;
  workerTag: string;
  cloudflareToken: string;
  cloudflareAuthMethod: CloudflareAuthMethod;
  accountId: string;
  buildConfig: CloudflareBuildConfig;
  recordApiCall?: ProviderApiCallRecorder;
};

type WireCloudflareWorkerConvexBuildAccessArgs = {
  defaultBranch: string;
  expectedRepoId: string;
  repositoryFullName: string;
  rootDirectory: string;
  vaultId: string;
  workerName: string;
  workerTag: string;
  cloudflareToken: string;
  cloudflareAuthMethod: CloudflareAuthMethod;
  accountId: string;
  build: Pick<CloudflareWorkersBuilds, "production" | "preview">;
  convex: CloudflareProvisionConvexState;
  recordApiCall?: ProviderApiCallRecorder;
};

type DurableAxisBlockId =
  | "source_setup"
  | "attach_worker"
  | "attach_convex"
  | "wire_builds"
  | "wire_convex_build_access";
type BlockVerificationNotVerifiableCategory = "no_remedy" | "state_shape_not_ready";
type BlockVerification =
  | {
      verify:
        | typeof verifyAttachedCloudflareWorker
        | typeof verifyAttachedConvexDeployment
        | typeof verifyConnectedBuilds
        | typeof verifyConvexBuildAccess;
    }
  | {
      notVerifiable: {
        category: BlockVerificationNotVerifiableCategory;
        detail: string;
      };
    };

export type CloudflareWorkerInfrastructureVerificationResult =
  | {
      worker: "confirmed";
      builds: "adopted";
      connectedBuilds: CloudflareConnectedWorkersBuilds;
      convexBuildAccess: CloudflareInfrastructureVerificationConvexBuildAccessResult;
    }
  | {
      worker: "confirmed" | "missing_upstream";
      builds: "confirmed" | "contradicted" | "not_checked";
      convexBuildAccess: CloudflareInfrastructureVerificationConvexBuildAccessResult;
    };

type VerifyCloudflareWorkerInfrastructureArgs = {
  vaultId: string;
  workerName: string;
  workerTag: string;
  cloudflareToken: string;
  cloudflareAuthMethod: CloudflareAuthMethod;
  accountId: string;
  defaultBranch: string;
  expectedRepoId: string;
  build: CloudflareConnectedWorkersBuilds | { state: "not_connected" };
  buildConfig: CloudflareBuildConfig;
  verifyConvexBuildAccess: boolean;
  recordApiCall?: ProviderApiCallRecorder;
};

function assertExpectedBuildTriggerStillExists(args: {
  triggers: readonly CloudflareBuildTrigger[];
  kind: CloudflareBuildTriggerKind;
  defaultBranch: string;
  triggerUuid: string;
  expectedRepoId: string;
  expectedRootDirectory: string;
  repositoryFullName: string;
  workerTag: string;
}): void {
  const triggerName = args.kind === "production" ? "production" : "preview";
  const trigger = args.triggers.find(
    (candidate) => !candidate.deleted_on && candidate.trigger_uuid === args.triggerUuid,
  );
  if (!trigger) {
    throw new Error(
      `Cannot connect Cloudflare Worker ${args.workerTag} to ${args.repositoryFullName}: Cloudflare did not return the existing ${triggerName} Workers Builds trigger. Retry Workers Builds wiring or choose another Worker.`,
    );
  }
  if (
    !matchesTriggerKind({
      trigger,
      kind: args.kind,
      defaultBranch: args.defaultBranch,
    })
  ) {
    throw new Error(
      `Cannot connect Cloudflare Worker ${args.workerTag} to ${args.repositoryFullName}: its existing ${triggerName} Workers Builds trigger no longer matches the expected branch filters. Retry Workers Builds wiring or choose another Worker.`,
    );
  }

  assertBuildTriggerMatchesRepositoryAndRoot({
    trigger,
    triggerName,
    expectedRepoId: args.expectedRepoId,
    expectedRootDirectory: args.expectedRootDirectory,
    repositoryFullName: args.repositoryFullName,
    workerTag: args.workerTag,
  });
}

function hasConfirmedRecordedBuildTrigger(args: {
  triggers: readonly CloudflareBuildTrigger[];
  kind: CloudflareBuildTriggerKind;
  defaultBranch: string;
  triggerUuid: string;
  expectedRepoId: string;
  expectedRootDirectory: string;
}): boolean {
  const expectedRootDirectory = requireNormalizedCloudflareBuildRoot(
    args.expectedRootDirectory,
    "Expected app root",
  );
  const trigger = args.triggers.find(
    (candidate) => !candidate.deleted_on && candidate.trigger_uuid === args.triggerUuid,
  );
  if (!trigger) {
    return false;
  }
  return (
    matchesAdoptableTriggerKind({
      trigger,
      kind: args.kind,
      defaultBranch: args.defaultBranch,
    }) &&
    readTriggerRepositoryId(trigger) === args.expectedRepoId &&
    normalizeCloudflareBuildRoot(trigger.root_directory) === expectedRootDirectory
  );
}

function hasCloudflareBuildEnvironmentVariable(args: {
  envVars: CloudflareBuildEnvVarsResponse;
  key: string;
}): boolean {
  // Build variable values are write-only in Cloudflare, so the verifier uses
  // variable names as the authoritative repair signal.
  return Object.prototype.hasOwnProperty.call(args.envVars, args.key);
}

function matchesAdoptableTriggerKind(args: {
  trigger: CloudflareBuildTrigger;
  kind: CloudflareBuildTriggerKind;
  defaultBranch: string;
}): boolean {
  const branchIncludes = args.trigger.branch_includes ?? [];
  const branchExcludes = args.trigger.branch_excludes ?? [];
  switch (args.kind) {
    case "production":
      return (
        branchIncludes.length === 1 &&
        branchIncludes[0] === args.defaultBranch &&
        branchExcludes.length === 0
      );
    case "preview":
      return (
        branchIncludes.length === 1 &&
        branchIncludes[0] === "*" &&
        branchExcludes.length === 1 &&
        branchExcludes[0] === args.defaultBranch
      );
    default:
      args.kind satisfies never;
      return args.kind;
  }
}

function readMatchingBuildTrigger(args: {
  triggers: readonly CloudflareBuildTrigger[];
  kind: CloudflareBuildTriggerKind;
  defaultBranch: string;
  expectedRepoId: string;
  expectedRootDirectory: string;
}): { triggerUuid: string; buildTokenUuid: string; trigger: CloudflareBuildTrigger } | null {
  const expectedRootDirectory = requireNormalizedCloudflareBuildRoot(
    args.expectedRootDirectory,
    "Expected app root",
  );
  for (const trigger of args.triggers) {
    if (trigger.deleted_on) {
      continue;
    }
    if (
      !matchesAdoptableTriggerKind({
        trigger,
        kind: args.kind,
        defaultBranch: args.defaultBranch,
      })
    ) {
      continue;
    }
    if (readTriggerRepositoryId(trigger) !== args.expectedRepoId) {
      continue;
    }
    if (normalizeCloudflareBuildRoot(trigger.root_directory) !== expectedRootDirectory) {
      continue;
    }
    const triggerUuid = trigger.trigger_uuid;
    const buildTokenUuid = trigger.build_token_uuid;
    if (triggerUuid && buildTokenUuid) {
      return { triggerUuid, buildTokenUuid, trigger };
    }
  }

  return null;
}

function readMatchingCloudflareWorkerBuilds(args: {
  triggers: readonly CloudflareBuildTrigger[];
  defaultBranch: string;
  expectedRepoId: string;
  buildConfig: CloudflareBuildConfig;
}): CloudflareConnectedWorkersBuilds | null {
  const production = readMatchingBuildTrigger({
    triggers: args.triggers,
    kind: "production",
    defaultBranch: args.defaultBranch,
    expectedRepoId: args.expectedRepoId,
    expectedRootDirectory: args.buildConfig.rootDir,
  });
  const preview = readMatchingBuildTrigger({
    triggers: args.triggers,
    kind: "preview",
    defaultBranch: args.defaultBranch,
    expectedRepoId: args.expectedRepoId,
    expectedRootDirectory: args.buildConfig.rootDir,
  });
  if (!production || !preview) {
    return null;
  }

  return {
    state: "connected",
    rootDirectory: args.buildConfig.rootDir,
    buildCommand: production.trigger.build_command ?? args.buildConfig.buildCommand,
    deployCommand: production.trigger.deploy_command ?? args.buildConfig.deployCommand,
    previewDeployCommand: preview.trigger.deploy_command ?? args.buildConfig.previewDeployCommand,
    pathIncludes: production.trigger.path_includes ?? args.buildConfig.pathIncludes,
    pathExcludes: production.trigger.path_excludes ?? args.buildConfig.pathExcludes,
    production: {
      triggerUuid: production.triggerUuid,
      buildTokenUuid: production.buildTokenUuid,
    },
    preview: {
      triggerUuid: preview.triggerUuid,
      buildTokenUuid: preview.buildTokenUuid,
    },
  };
}

function verifyConnectedBuilds(args: {
  triggers: readonly CloudflareBuildTrigger[];
  defaultBranch: string;
  expectedRepoId: string;
  build: CloudflareConnectedWorkersBuilds | { state: "not_connected" };
  buildConfig: CloudflareBuildConfig;
}): CloudflareConnectedBuildsVerificationResult {
  if (args.build.state === "not_connected") {
    const connectedBuilds = readMatchingCloudflareWorkerBuilds({
      triggers: args.triggers,
      defaultBranch: args.defaultBranch,
      expectedRepoId: args.expectedRepoId,
      buildConfig: args.buildConfig,
    });
    return connectedBuilds
      ? {
          builds: "adopted",
          connectedBuilds,
        }
      : {
          builds: "not_checked",
        };
  }

  const productionTriggerConfirmed = hasConfirmedRecordedBuildTrigger({
    triggers: args.triggers,
    kind: "production",
    defaultBranch: args.defaultBranch,
    triggerUuid: args.build.production.triggerUuid,
    expectedRepoId: args.expectedRepoId,
    expectedRootDirectory: args.buildConfig.rootDir,
  });
  const previewTriggerConfirmed = hasConfirmedRecordedBuildTrigger({
    triggers: args.triggers,
    kind: "preview",
    defaultBranch: args.defaultBranch,
    triggerUuid: args.build.preview.triggerUuid,
    expectedRepoId: args.expectedRepoId,
    expectedRootDirectory: args.buildConfig.rootDir,
  });
  return productionTriggerConfirmed && previewTriggerConfirmed
    ? {
        builds: "confirmed",
        build: args.build,
      }
    : {
        builds: "contradicted",
      };
}

function verifyConvexBuildAccess(args: {
  productionEnvVars: CloudflareBuildEnvVarsResponse;
  previewEnvVars: CloudflareBuildEnvVarsResponse;
}): "confirmed" | "contradicted" {
  const productionDeployKeysPresent =
    hasCloudflareBuildEnvironmentVariable({
      envVars: args.productionEnvVars,
      key: CONVEX_DEPLOY_KEY,
    }) &&
    hasCloudflareBuildEnvironmentVariable({
      envVars: args.productionEnvVars,
      key: PREVIEW_CONVEX_DEPLOY_KEY,
    });
  const previewDeployKeysPresent =
    hasCloudflareBuildEnvironmentVariable({
      envVars: args.previewEnvVars,
      key: CONVEX_DEPLOY_KEY,
    }) &&
    hasCloudflareBuildEnvironmentVariable({
      envVars: args.previewEnvVars,
      key: PREVIEW_CONVEX_DEPLOY_KEY,
    });
  return productionDeployKeysPresent && previewDeployKeysPresent ? "confirmed" : "contradicted";
}

function verifyAttachedCloudflareWorker(args: {
  workerExists: boolean;
}): "confirmed" | "missing_upstream" {
  return args.workerExists ? "confirmed" : "missing_upstream";
}

function verifyAttachedConvexDeployment(args: {
  deploymentExists: boolean;
}): "confirmed" | "missing_upstream" {
  return args.deploymentExists ? "confirmed" : "missing_upstream";
}

// Catalog every durable verification axis, including axes whose repair path calls
// the verifier directly instead of dispatching through this object.
export const blockVerification = {
  wire_builds: { verify: verifyConnectedBuilds },
  wire_convex_build_access: { verify: verifyConvexBuildAccess },
  attach_worker: { verify: verifyAttachedCloudflareWorker },
  attach_convex: { verify: verifyAttachedConvexDeployment },
  source_setup: {
    notVerifiable: {
      category: "no_remedy",
      detail: "a deleted or renamed source repo has no re-create/re-link verb in the catalog",
    },
  },
} satisfies Record<DurableAxisBlockId, BlockVerification>;

async function configureCloudflareWorkerBuilds(
  args: ConfigureCloudflareWorkerBuildsArgs,
): Promise<CloudflareConnectedWorkersBuilds> {
  const repoConnectionUuid = await ensureRepositoryConnection({
    token: args.cloudflareToken,
    accountId: args.accountId,
    ghRepoId: args.ghRepoId,
    ghRepoOwnerId: args.ghRepoOwnerId,
    owner: args.owner,
    repo: args.repo,
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });

  const existingTriggers = await listBuildTriggers({
    token: args.cloudflareToken,
    accountId: args.accountId,
    workerTag: args.workerTag,
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });

  const buildTokenUuid = await resolveBuildTokenUuid({
    token: args.cloudflareToken,
    accountId: args.accountId,
    existingTriggers,
    authMethod: args.cloudflareAuthMethod,
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });

  const existingProductionTrigger = selectPatchableBuildTrigger({
    triggers: existingTriggers,
    kind: "production",
    defaultBranch: args.defaultBranch,
  });
  const productionTriggerUuid = await upsertBuildTrigger({
    token: args.cloudflareToken,
    accountId: args.accountId,
    workerTag: args.workerTag,
    repoConnectionUuid,
    expectedRepoId: args.ghRepoId,
    buildTokenUuid,
    buildConfig: args.buildConfig,
    defaultBranch: args.defaultBranch,
    existingTriggers,
    kind: "production",
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });
  let previewTriggerUuid: string;
  try {
    previewTriggerUuid = await upsertBuildTrigger({
      token: args.cloudflareToken,
      accountId: args.accountId,
      workerTag: args.workerTag,
      repoConnectionUuid,
      expectedRepoId: args.ghRepoId,
      buildTokenUuid,
      buildConfig: args.buildConfig,
      defaultBranch: args.defaultBranch,
      existingTriggers,
      kind: "preview",
      transport: args.transport,
      recordApiCall: args.recordApiCall,
    });
  } catch (error) {
    try {
      await restoreBuildTriggerAfterPairFailure({
        token: args.cloudflareToken,
        accountId: args.accountId,
        workerTag: args.workerTag,
        replacementTriggerUuid: productionTriggerUuid,
        existingTrigger: existingProductionTrigger,
        transport: args.transport,
        recordApiCall: args.recordApiCall,
      });
    } catch (rollbackError) {
      console.error("infra:cloudflare:builds:pair_rollback_failed", {
        accountId: args.accountId,
        workerTag: args.workerTag,
        productionTriggerUuid,
        message: toErrorMessage(rollbackError),
      });
    }
    throw error;
  }

  return {
    state: "connected",
    rootDirectory: args.buildConfig.rootDir,
    buildCommand: args.buildConfig.buildCommand,
    deployCommand: args.buildConfig.deployCommand,
    previewDeployCommand: args.buildConfig.previewDeployCommand,
    pathIncludes: args.buildConfig.pathIncludes,
    pathExcludes: args.buildConfig.pathExcludes,
    production: {
      triggerUuid: productionTriggerUuid,
      buildTokenUuid,
    },
    preview: {
      triggerUuid: previewTriggerUuid,
      buildTokenUuid,
    },
  };
}

export async function wireCloudflareWorkerBuilds(
  args: WireCloudflareWorkerBuildsArgs,
): Promise<CloudflareConnectedWorkersBuilds> {
  console.log("infra:cloudflare:builds:wire:start", {
    vaultId: args.vaultId,
    accountId: args.accountId,
    workerName: args.workerName,
    workerTag: args.workerTag,
    repo: `${args.owner}/${args.repo}`,
    defaultBranch: args.defaultBranch,
  });

  const transport = resolveCloudflareApiTransport(args.cloudflareAuthMethod);
  let step = "configure_builds";
  try {
    const build = await configureCloudflareWorkerBuilds({
      owner: args.owner,
      repo: args.repo,
      ghRepoId: args.ghRepoId,
      ghRepoOwnerId: args.ghRepoOwnerId,
      defaultBranch: args.defaultBranch,
      cloudflareToken: args.cloudflareToken,
      cloudflareAuthMethod: args.cloudflareAuthMethod,
      accountId: args.accountId,
      workerTag: args.workerTag,
      buildConfig: args.buildConfig,
      transport,
      recordApiCall: args.recordApiCall,
    });

    if (args.triggerInitialBuild) {
      step = "trigger_initial_build";
      await triggerInitialBuild({
        token: args.cloudflareToken,
        accountId: args.accountId,
        triggerUuid: build.production.triggerUuid,
        branch: args.defaultBranch,
        transport,
        recordApiCall: args.recordApiCall,
      });
    }

    console.log("infra:cloudflare:builds:wire:success", {
      vaultId: args.vaultId,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      initialBuildTriggered: args.triggerInitialBuild,
    });

    return build;
  } catch (error) {
    console.error("infra:cloudflare:builds:wire:failed", {
      vaultId: args.vaultId,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      repo: `${args.owner}/${args.repo}`,
      step,
      message: toErrorMessage(error),
    });
    throw error;
  }
}

export async function verifyCloudflareWorkerInfrastructure(
  args: VerifyCloudflareWorkerInfrastructureArgs,
): Promise<CloudflareWorkerInfrastructureVerificationResult> {
  console.log("infra:cloudflare:verify:start", {
    vaultId: args.vaultId,
    accountId: args.accountId,
    workerName: args.workerName,
    workerTag: args.workerTag,
  });

  const transport = resolveCloudflareApiTransport(args.cloudflareAuthMethod);
  let step = "read_build_triggers";
  try {
    const triggers = await listBuildTriggers({
      token: args.cloudflareToken,
      accountId: args.accountId,
      workerTag: args.workerTag,
      transport,
      recordApiCall: args.recordApiCall,
    });
    const buildsResult = verifyConnectedBuilds({
      triggers,
      defaultBranch: args.defaultBranch,
      expectedRepoId: args.expectedRepoId,
      build: args.build,
      buildConfig: args.buildConfig,
    });
    switch (buildsResult.builds) {
      case "adopted":
        console.log("infra:cloudflare:verify:builds_adopted", {
          vaultId: args.vaultId,
          accountId: args.accountId,
          workerName: args.workerName,
          workerTag: args.workerTag,
        });
        return {
          worker: "confirmed",
          builds: "adopted",
          connectedBuilds: buildsResult.connectedBuilds,
          convexBuildAccess: "not_checked",
        };
      case "not_checked":
        console.log("infra:cloudflare:verify:builds_not_connected", {
          vaultId: args.vaultId,
          accountId: args.accountId,
          workerName: args.workerName,
          workerTag: args.workerTag,
        });
        return {
          worker: "confirmed",
          builds: "not_checked",
          convexBuildAccess: "not_checked",
        };
      case "contradicted":
        console.log("infra:cloudflare:verify:builds_contradicted", {
          vaultId: args.vaultId,
          accountId: args.accountId,
          workerName: args.workerName,
          workerTag: args.workerTag,
        });
        return {
          worker: "confirmed",
          builds: "contradicted",
          convexBuildAccess: "not_checked",
        };
      case "confirmed":
        break;
      default:
        buildsResult satisfies never;
    }
    if (!args.verifyConvexBuildAccess) {
      console.log("infra:cloudflare:verify:builds_confirmed", {
        vaultId: args.vaultId,
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
      });
      return {
        worker: "confirmed",
        builds: "confirmed",
        convexBuildAccess: "not_checked",
      };
    }

    step = "read_build_environment_variables";
    const [productionEnvVars, previewEnvVars] = await Promise.all([
      listTriggerEnvironmentVariables({
        token: args.cloudflareToken,
        accountId: args.accountId,
        triggerUuid: buildsResult.build.production.triggerUuid,
        transport,
        recordApiCall: args.recordApiCall,
      }),
      listTriggerEnvironmentVariables({
        token: args.cloudflareToken,
        accountId: args.accountId,
        triggerUuid: buildsResult.build.preview.triggerUuid,
        transport,
        recordApiCall: args.recordApiCall,
      }),
    ]);
    const convexBuildAccess = verifyConvexBuildAccess({
      productionEnvVars,
      previewEnvVars,
    });

    console.log("infra:cloudflare:verify:success", {
      vaultId: args.vaultId,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      convexBuildAccess,
    });
    return {
      worker: "confirmed",
      builds: "confirmed",
      convexBuildAccess,
    };
  } catch (error) {
    if (
      step === "read_build_environment_variables" &&
      isCloudflareBuildTriggerNotFoundError(error)
    ) {
      console.log("infra:cloudflare:verify:build_trigger_missing_upstream", {
        vaultId: args.vaultId,
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
      });
      return {
        worker: "confirmed",
        builds: "contradicted",
        convexBuildAccess: "not_checked",
      };
    }
    if (isCloudflareWorkerNotFoundError(error)) {
      console.log("infra:cloudflare:verify:worker_missing_upstream", {
        vaultId: args.vaultId,
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
      });
      return {
        worker: verifyAttachedCloudflareWorker({ workerExists: false }),
        builds: "not_checked",
        convexBuildAccess: "not_checked",
      };
    }
    console.error("infra:cloudflare:verify:failed", {
      vaultId: args.vaultId,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      step,
      message: toErrorMessage(error),
    });
    throw error;
  }
}

export async function wireCloudflareWorkerConvexBuildAccess(
  args: WireCloudflareWorkerConvexBuildAccessArgs,
): Promise<void> {
  console.log("infra:cloudflare:convex_build_access:wire:start", {
    vaultId: args.vaultId,
    accountId: args.accountId,
    workerName: args.workerName,
    workerTag: args.workerTag,
    defaultBranch: args.defaultBranch,
  });

  const transport = resolveCloudflareApiTransport(args.cloudflareAuthMethod);
  let step = "verify_build_triggers";
  try {
    const expectedRootDirectory = requireNormalizedCloudflareBuildRoot(
      args.rootDirectory,
      "Expected app root",
    );
    const triggers = await listBuildTriggers({
      token: args.cloudflareToken,
      accountId: args.accountId,
      workerTag: args.workerTag,
      transport,
      recordApiCall: args.recordApiCall,
    });
    assertExpectedBuildTriggerStillExists({
      triggers,
      kind: "production",
      defaultBranch: args.defaultBranch,
      triggerUuid: args.build.production.triggerUuid,
      expectedRepoId: args.expectedRepoId,
      expectedRootDirectory,
      repositoryFullName: args.repositoryFullName,
      workerTag: args.workerTag,
    });
    assertExpectedBuildTriggerStillExists({
      triggers,
      kind: "preview",
      defaultBranch: args.defaultBranch,
      triggerUuid: args.build.preview.triggerUuid,
      expectedRepoId: args.expectedRepoId,
      expectedRootDirectory,
      repositoryFullName: args.repositoryFullName,
      workerTag: args.workerTag,
    });

    step = "set_environment_variables";
    const convexEnvVars = buildCloudflareWorkersEnvVars({
      productionConvexDeployKey: args.convex.production.deployKey,
      previewConvexDeployKey: args.convex.preview.deployKey,
    });
    await Promise.all([
      setTriggerEnvironmentVariables({
        token: args.cloudflareToken,
        accountId: args.accountId,
        triggerUuid: args.build.production.triggerUuid,
        envVars: convexEnvVars,
        transport,
        recordApiCall: args.recordApiCall,
      }),
      setTriggerEnvironmentVariables({
        token: args.cloudflareToken,
        accountId: args.accountId,
        triggerUuid: args.build.preview.triggerUuid,
        envVars: convexEnvVars,
        transport,
        recordApiCall: args.recordApiCall,
      }),
    ]);

    step = "verify_environment_variables";
    const [productionVerifiedEnvVars, previewVerifiedEnvVars] = await Promise.all([
      listTriggerEnvironmentVariables({
        token: args.cloudflareToken,
        accountId: args.accountId,
        triggerUuid: args.build.production.triggerUuid,
        transport,
        recordApiCall: args.recordApiCall,
      }),
      listTriggerEnvironmentVariables({
        token: args.cloudflareToken,
        accountId: args.accountId,
        triggerUuid: args.build.preview.triggerUuid,
        transport,
        recordApiCall: args.recordApiCall,
      }),
    ]);
    assertTriggerEnvironmentVariables({
      triggerKind: "production",
      triggerUuid: args.build.production.triggerUuid,
      envVars: productionVerifiedEnvVars,
      expected: convexEnvVars,
    });
    assertTriggerEnvironmentVariables({
      triggerKind: "preview",
      triggerUuid: args.build.preview.triggerUuid,
      envVars: previewVerifiedEnvVars,
      expected: convexEnvVars,
    });

    step = "trigger_initial_build";
    await triggerInitialBuild({
      token: args.cloudflareToken,
      accountId: args.accountId,
      triggerUuid: args.build.production.triggerUuid,
      branch: args.defaultBranch,
      transport,
      recordApiCall: args.recordApiCall,
    });

    console.log("infra:cloudflare:convex_build_access:wire:success", {
      vaultId: args.vaultId,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
    });
  } catch (error) {
    console.error("infra:cloudflare:convex_build_access:wire:failed", {
      vaultId: args.vaultId,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
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
  transport: CloudflareApiTransport;
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
    transport: args.transport,
    method: "GET",
    path: "/accounts/{account_id}/workers/workers/{worker_id}",
    params: {
      path: {
        account_id: args.accountId,
        worker_id: args.workerName,
      },
    },
  });
  const workerRecord = requireCloudflareResult(
    worker,
    `Cloudflare Worker ${args.workerName} response did not include a Worker.`,
  );
  const workerTag = args.workerTag ?? readCloudflareWorkerTag(workerRecord, args.workerName);
  const triggers = await listBuildTriggers({
    token: args.cloudflareToken,
    accountId: args.accountId,
    workerTag,
    transport: args.transport,
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
  transport: CloudflareApiTransport;
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
    transport: args.transport,
    method: "GET",
    path: "/accounts/{account_id}/builds/workers/{external_script_id}/builds",
    params: {
      path: {
        account_id: args.accountId,
        external_script_id: args.workerTag,
      },
      query: {
        page: 1,
        per_page: maxEntries,
      },
    },
  });
  const builds = requireCloudflareResult(
    buildsPayload,
    `Cloudflare Workers Builds build list for account ${args.accountId} Worker ${args.workerTag} response did not include builds.`,
  );
  const selectedBuilds = builds.slice(0, maxEntries);

  const logsByBuild = await Promise.all(
    selectedBuilds.map(async (build) => {
      const buildUuid = build.build_uuid;
      if (!buildUuid) {
        return {
          build,
          logs: { error: "Build UUID missing from Cloudflare response" },
        };
      }

      const logsEndpoint = `/accounts/${encodeURIComponent(args.accountId)}/builds/builds/${encodeURIComponent(buildUuid)}/logs`;
      const logsPayload = await requestCloudflareApi({
        token: args.cloudflareToken,
        transport: args.transport,
        method: "GET",
        path: "/accounts/{account_id}/builds/builds/{build_uuid}/logs",
        params: {
          path: {
            account_id: args.accountId,
            build_uuid: buildUuid,
          },
        },
      });

      return {
        endpoint: logsEndpoint,
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
      logsByBuild.length > 0 ? JSON.stringify(logsByBuild, null, 2) : "No build entries returned.",
    logLineCount: logsByBuild.length,
  };
}

type DeleteCloudflareResourcesArgs = {
  accountId: string;
  workerName: string;
  workerTag: string;
  cloudflareToken: string;
  transport: CloudflareApiTransport;
};

async function deleteCloudflareBuildTrigger(args: {
  accountId: string;
  triggerUuid: string;
  cloudflareToken: string;
  transport: CloudflareApiTransport;
}): Promise<void> {
  try {
    await requestCloudflareApi({
      token: args.cloudflareToken,
      transport: args.transport,
      method: "DELETE",
      path: "/accounts/{account_id}/builds/triggers/{trigger_uuid}",
      params: {
        path: {
          account_id: args.accountId,
          trigger_uuid: args.triggerUuid,
        },
      },
    });
  } catch (error) {
    if (!isCloudflareBuildTriggerNotFoundError(error)) {
      throw error;
    }
  }
}

export async function deleteCloudflareResources(
  args: DeleteCloudflareResourcesArgs,
): Promise<void> {
  const triggers = await listBuildTriggers({
    token: args.cloudflareToken,
    accountId: args.accountId,
    workerTag: args.workerTag,
    transport: args.transport,
  }).catch((error: unknown) => {
    if (isCloudflareWorkerNotFoundError(error)) {
      return [];
    }
    throw error;
  });
  await Promise.all(
    triggers.map(async (trigger) => {
      const triggerUuid = trigger.trigger_uuid;
      if (!triggerUuid) {
        return;
      }
      await deleteCloudflareBuildTrigger({
        accountId: args.accountId,
        triggerUuid,
        cloudflareToken: args.cloudflareToken,
        transport: args.transport,
      });
    }),
  );
  await requestCloudflareApi({
    token: args.cloudflareToken,
    transport: args.transport,
    method: "DELETE",
    path: "/accounts/{account_id}/workers/workers/{worker_id}",
    params: {
      path: {
        account_id: args.accountId,
        worker_id: args.workerName,
      },
    },
  });
}
