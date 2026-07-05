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
    cloudUrl: string;
    deployKey: string;
  };
  preview: {
    cloudUrl: string;
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
const PROD_CONVEX_DEPLOY_KEY = "PROD_CONVEX_DEPLOY_KEY";
const PREVIEW_CONVEX_DEPLOY_KEY = "PREVIEW_CONVEX_DEPLOY_KEY";

type CloudflareConvexDeployKeyName =
  | typeof PROD_CONVEX_DEPLOY_KEY
  | typeof PREVIEW_CONVEX_DEPLOY_KEY;

export function isCloudflareWorkerNotFoundError(error: unknown): boolean {
  if (error instanceof CloudflareApiError) {
    return error.details.some((detail) => {
      const message = detail.message?.toLowerCase();
      return (
        detail.code === "10007" ||
        message === "worker not found" ||
        message === "trigger not found" ||
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
  expectedRepoId: string;
  expectedRootDirectory: string;
  repositoryFullName: string;
  workerTag: string;
}): CloudflareBuildTrigger | undefined {
  const existingTrigger = args.triggers.find(
    (trigger) =>
      !trigger.deleted_on &&
      matchesTriggerKind({
        trigger,
        kind: args.kind,
        defaultBranch: args.defaultBranch,
      }),
  );
  if (!existingTrigger) {
    return undefined;
  }

  const triggerName = args.kind === "production" ? "production" : "preview";
  const expectedRootDirectory = requireNormalizedCloudflareBuildRoot(
    args.expectedRootDirectory,
    "Expected app root",
  );
  assertBuildTriggerMatchesRepositoryAndRoot({
    trigger: existingTrigger,
    triggerName,
    expectedRepoId: args.expectedRepoId,
    expectedRootDirectory,
    repositoryFullName: args.repositoryFullName,
    workerTag: args.workerTag,
  });

  return existingTrigger;
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

async function upsertBuildTrigger(
  args: {
    token: string;
    accountId: string;
    workerTag: string;
    repoConnectionUuid: string;
    expectedRepoId: string;
    repositoryFullName: string;
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
    expectedRepoId: args.expectedRepoId,
    expectedRootDirectory: args.buildConfig.rootDir,
    repositoryFullName: args.repositoryFullName,
    workerTag: args.workerTag,
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

  const existingTriggerUuid = existingTrigger?.trigger_uuid;
  if (existingTrigger) {
    if (!existingTriggerUuid) {
      throw new Error(
        `Cannot update ${triggerName} trigger for Cloudflare Worker ${args.workerTag}: Cloudflare did not return a trigger id.`,
      );
    }
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
  }

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
  return requireCloudflareString(raw?.trigger_uuid, `${triggerName} trigger did not return an id.`);
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

async function configureCloudflareWorkerBuilds(
  args: ConfigureCloudflareWorkerBuildsArgs,
): Promise<CloudflareWorkersBuilds> {
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

  const productionTriggerUuid = await upsertBuildTrigger({
    token: args.cloudflareToken,
    accountId: args.accountId,
    workerTag: args.workerTag,
    repoConnectionUuid,
    expectedRepoId: args.ghRepoId,
    repositoryFullName: `${args.owner}/${args.repo}`,
    buildTokenUuid,
    buildConfig: args.buildConfig,
    defaultBranch: args.defaultBranch,
    existingTriggers,
    kind: "production",
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });
  const previewTriggerUuid = await upsertBuildTrigger({
    token: args.cloudflareToken,
    accountId: args.accountId,
    workerTag: args.workerTag,
    repoConnectionUuid,
    expectedRepoId: args.ghRepoId,
    repositoryFullName: `${args.owner}/${args.repo}`,
    buildTokenUuid,
    buildConfig: args.buildConfig,
    defaultBranch: args.defaultBranch,
    existingTriggers,
    kind: "preview",
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });

  return {
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
): Promise<CloudflareWorkersBuilds> {
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
    await Promise.all([
      setTriggerEnvironmentVariables({
        token: args.cloudflareToken,
        accountId: args.accountId,
        triggerUuid: args.build.production.triggerUuid,
        envVars: buildCloudflareWorkersEnvVars({
          deployKeyName: PROD_CONVEX_DEPLOY_KEY,
          convexDeployKey: args.convex.production.deployKey,
          convexUrl: args.convex.production.cloudUrl,
        }),
        transport,
        recordApiCall: args.recordApiCall,
      }),
      setTriggerEnvironmentVariables({
        token: args.cloudflareToken,
        accountId: args.accountId,
        triggerUuid: args.build.preview.triggerUuid,
        envVars: buildCloudflareWorkersEnvVars({
          deployKeyName: PREVIEW_CONVEX_DEPLOY_KEY,
          convexDeployKey: args.convex.preview.deployKey,
          convexUrl: args.convex.preview.cloudUrl,
        }),
        transport,
        recordApiCall: args.recordApiCall,
      }),
    ]);

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
