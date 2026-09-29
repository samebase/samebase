import { notEmpty } from "@samebase/dependent/main";
import { bad, good } from "@samebase/sure";
import { ConvexError } from "convex/values";
import { z } from "zod";

import { createUrlSearchParams, readUrlSearchParamsRecord } from "../shared/urlSearchParams";
import { AppResourceNameConflictError } from "../shared/appResourceNames";
import {
  requestCloudflareApi,
  requestCloudflareApiOrThrow,
  CloudflareApiError,
  resolveCloudflareApiTransport,
  type CloudflareApiRequestResult,
  type CloudflareApiTransport,
} from "./cloudflareApi/client";
import type { components, Readable, Writable } from "./cloudflareApi/types.generated";
import { toErrorMessage } from "./jsonUtils";
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
type CloudflareWorkerBuildConfiguration = Readable<components["schemas"]["builds_WorkerResponse"]>;
export type CloudflareWorkerBuild = Readable<components["schemas"]["builds_BuildResponse"]>;
type CloudflareBuildEnvVars = components["schemas"]["builds_EnvironmentVariablesRequest"];
type CloudflareBuildEnvVarsResponse = components["schemas"]["builds_EnvironmentVariablesResponse"];
type CloudflareApiCallOptions = {
  transport: CloudflareApiTransport;
  recordApiCall?: ProviderApiCallRecorder;
  beforeProviderWrite?: () => void | Promise<void>;
};

export type CloudflareBuildToken = {
  name: string;
  uuid: string;
};

const CLOUDFLARE_GITHUB_APP_NOT_AUTHORIZED_CODE = "8000008";
const CLOUDFLARE_GITHUB_APP_RECOVERY_URL =
  "https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#reinstall-the-cloudflare-github-app";
const BUILD_TOKEN_PAGE_SIZE = 100;
const CONVEX_DEPLOY_KEY = "CONVEX_DEPLOY_KEY";
const SAMEBASE_CONVEX_PROJECT = "SAMEBASE_CONVEX_PROJECT";
const SAMEBASE_CONVEX_PROJECT_MARKER_VERSION = "1";

export function isCloudflareWorkerNotFoundError(error: unknown): boolean {
  if (error instanceof CloudflareApiError && !error.path.includes("/builds/triggers/")) {
    return error.details.some((detail) => {
      const message = detail.message?.toLowerCase();
      return (
        detail.code === "10007" ||
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

function isCloudflareWorkerCreateConflictError(error: unknown): boolean {
  return (
    error instanceof CloudflareApiError &&
    error.method === "POST" &&
    error.path.endsWith("/workers/workers") &&
    error.details.some((detail) => detail.code === "10040")
  );
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
  githubRepositoryFullName: string,
): string {
  return `Cloudflare Workers and Pages GitHub App is not authorized for ${githubRepositoryFullName}. Follow Cloudflare's recovery steps at ${CLOUDFLARE_GITHUB_APP_RECOVERY_URL}: uninstall the GitHub App first, then reinstall/connect GitHub from Workers & Pages. GitHub gives this access to the Cloudflare Workers and Pages GitHub App, not to Samebase. Select All repositories so Cloudflare can connect repositories that Samebase creates later to Workers Builds, then retry.`;
}

function requireCloudflareResult<T>(value: T | undefined, message: string): T {
  if (value !== undefined) {
    return value;
  }
  throw new Error(message);
}

export function buildCloudflareWorkerEnvVars(
  vars:
    | {
        triggerKind: "production";
        convexDeployKey: string;
        convexProject: SamebaseConvexProjectReference;
      }
    | { triggerKind: "preview"; convexDeployKey: string },
): CloudflareBuildEnvVars {
  const deployKey = {
    [CONVEX_DEPLOY_KEY]: {
      value: vars.convexDeployKey,
      is_secret: true,
    },
  };
  return vars.triggerKind === "production"
    ? {
        ...deployKey,
        [SAMEBASE_CONVEX_PROJECT]: {
          value: buildSamebaseConvexProjectMarker(vars.convexProject),
          is_secret: false,
        },
      }
    : deployKey;
}

const samebaseConvexProjectMarkerSchema = z.strictObject({
  version: z.literal(SAMEBASE_CONVEX_PROJECT_MARKER_VERSION),
  teamId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
});

export type SamebaseConvexProjectReference = Omit<
  z.infer<typeof samebaseConvexProjectMarkerSchema>,
  "version"
>;

export function buildSamebaseConvexProjectMarker(project: SamebaseConvexProjectReference): string {
  const marker = samebaseConvexProjectMarkerSchema.safeParse({
    version: SAMEBASE_CONVEX_PROJECT_MARKER_VERSION,
    ...project,
  });
  if (!marker.success) {
    throw new Error("Convex project identity cannot be encoded for Cloudflare Builds.");
  }

  return createUrlSearchParams(marker.data).toString();
}

function parseSamebaseConvexProjectMarker(value: string): SamebaseConvexProjectReference | null {
  const marker = samebaseConvexProjectMarkerSchema.safeParse(readUrlSearchParamsRecord(value));
  if (!marker.success) {
    return null;
  }

  const { teamId, projectId } = marker.data;
  return { teamId, projectId };
}

type CloudflareWorkerIdentity = {
  workerName: string;
  workerTag: string;
};

type CloudflareWorkerDetails = {
  customDomains: string[];
  workersDev:
    | { state: "enabled"; url: string }
    | { state: "disabled" }
    | { state: "failed"; reason: "response_validation_failed" };
  workerName: string;
  workerTag: string;
};

export type CloudflareWorkerInventoryItem = {
  workerName: string;
  workerTag: string;
};

export type CloudflareWorkerInventory = {
  state: "complete" | "partial";
  workers: CloudflareWorkerInventoryItem[];
};

export type CloudflareWorkerProductionBuild =
  | { state: "available"; productionTriggerUuid: string }
  | { state: "not_available" }
  | { state: "ambiguous" };

export type CloudflareWorkerRepositoryDiscovery =
  | {
      state: "ready";
      rootDirectory: string;
      builds: CloudflareWorkerProductionBuild;
    }
  | { state: "not_connected" }
  | { state: "connected_elsewhere" }
  | {
      state: "ambiguous";
      reason:
        | "deleted_repository_connection"
        | "missing_provider_type"
        | "missing_repo_id"
        | "missing_root_directory"
        | "multiple_root_directories";
    };

export type CloudflareWorkerDiscoveryItem = CloudflareWorkerInventoryItem & {
  repository: CloudflareWorkerRepositoryDiscovery | { state: "failed"; message: string };
};

export type CloudflareWorkerProviderDiscoveryItem = CloudflareWorkerDiscoveryItem & {
  convexBuildAccess: CloudflareConvexBuildAccessObservation | { state: "unavailable" };
};

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
      redact_query_string: false,
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

function readLegacyCloudflareWorkerInventoryItem(worker: {
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

function readCloudflareWorkerServiceInventoryItem(
  worker: CloudflareWorker,
): CloudflareWorkerInventoryItem {
  const workerName = worker.name.trim();
  const workerTag = worker.id.trim();
  if (!workerName || !workerTag) {
    throw new Error("Cloudflare Worker inventory returned an incomplete Worker identity.");
  }
  return { workerName, workerTag };
}

function compareCloudflareWorkerInventoryItem(
  left: CloudflareWorkerInventoryItem,
  right: CloudflareWorkerInventoryItem,
): number {
  return (
    left.workerName.localeCompare(right.workerName) || left.workerTag.localeCompare(right.workerTag)
  );
}

function readTrimmedCloudflareString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function normalizeCloudflareBuildRoot(value: string | null | undefined): string | null {
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

async function readWorker(
  args: {
    token: string;
    accountId: string;
    workerIdentifier: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorker | null> {
  try {
    const raw = await requestCloudflareApiOrThrow({
      token: args.token,
      method: "GET",
      path: "/accounts/{account_id}/workers/workers/{worker_id}",
      transport: args.transport,
      params: {
        path: {
          account_id: args.accountId,
          worker_id: args.workerIdentifier,
        },
      },
      recordApiCall: args.recordApiCall,
    });
    return requireCloudflareResult(
      raw,
      `Cloudflare Worker ${args.workerIdentifier} response did not include a Worker.`,
    );
  } catch (error) {
    if (isCloudflareWorkerNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

function readCloudflareWorkerDetails(
  worker: CloudflareWorker,
  workerIdentifier: string,
): CloudflareWorkerDetails {
  const workerName = worker.name.trim();
  if (!workerName) {
    throw new Error(`Cloudflare Worker ${workerIdentifier} did not include a name.`);
  }

  const customDomains = [
    ...new Set(
      worker.references.domains.flatMap((domain) => {
        const hostname = domain.hostname.trim();
        return hostname ? [hostname] : [];
      }),
    ),
  ].sort((left, right) => left.localeCompare(right));

  let workersDev: CloudflareWorkerDetails["workersDev"] = { state: "disabled" };
  if (worker.subdomain.enabled) {
    const rawUrl = worker.subdomain.url?.trim();
    let parsedUrl: URL | null = null;
    if (rawUrl) {
      try {
        parsedUrl = new URL(rawUrl);
      } catch {
        // The error below identifies the provider response field.
      }
    }
    const workerHostnamePrefix = `${workerName.toLowerCase()}.`;
    const workersDevHostnameSuffix = ".workers.dev";
    if (
      !parsedUrl ||
      parsedUrl.protocol !== "https:" ||
      parsedUrl.username !== "" ||
      parsedUrl.password !== "" ||
      parsedUrl.port !== "" ||
      parsedUrl.pathname !== "/" ||
      parsedUrl.search !== "" ||
      parsedUrl.hash !== "" ||
      !parsedUrl.hostname.startsWith(workerHostnamePrefix) ||
      !parsedUrl.hostname.endsWith(workersDevHostnameSuffix) ||
      parsedUrl.hostname.length <= workerHostnamePrefix.length + workersDevHostnameSuffix.length
    ) {
      workersDev = { state: "failed", reason: "response_validation_failed" };
    } else {
      workersDev = { state: "enabled", url: parsedUrl.origin };
    }
  }

  return {
    customDomains,
    workersDev,
    workerName,
    workerTag: readCloudflareWorkerTag(worker, workerName),
  };
}

export async function readCloudflareWorkerIdentity(
  args: {
    token: string;
    accountId: string;
    workerName: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerDetails | null> {
  const worker = await readWorker({
    token: args.token,
    transport: args.transport,
    accountId: args.accountId,
    workerIdentifier: args.workerName,
    ...(args.recordApiCall ? { recordApiCall: args.recordApiCall } : {}),
  });
  return worker ? readCloudflareWorkerDetails(worker, args.workerName) : null;
}

export async function readCloudflareWorkerIdentityByTag(
  args: {
    token: string;
    accountId: string;
    workerTag: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerDetails | null> {
  const worker = await readWorker({
    token: args.token,
    transport: args.transport,
    accountId: args.accountId,
    workerIdentifier: args.workerTag,
    ...(args.recordApiCall ? { recordApiCall: args.recordApiCall } : {}),
  });
  return worker ? readCloudflareWorkerDetails(worker, args.workerTag) : null;
}

export async function isCloudflareWorkerNameAvailable(args: {
  token: string;
  accountId: string;
  workerName: string;
  transport: CloudflareApiTransport;
}): Promise<boolean> {
  return (await readCloudflareWorkerIdentity(args)) === null;
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

async function listLegacyCloudflareWorkers(
  args: { token: string; accountId: string } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerInventoryItem[]> {
  const workers = await requestCloudflareApiOrThrow({
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
    .map(readLegacyCloudflareWorkerInventoryItem)
    .filter(notEmpty)
    .sort(compareCloudflareWorkerInventoryItem);
}

export async function listCloudflareWorkerInventory(
  args: { token: string; accountId: string } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerInventory> {
  try {
    const workers: CloudflareWorkerInventoryItem[] = [];
    const seenWorkerTags = new Set<string>();
    const pageSize = 100;
    for (let page = 1; ; page += 1) {
      const result = await requestCloudflareApiOrThrow({
        token: args.token,
        transport: args.transport,
        method: "GET",
        path: "/accounts/{account_id}/workers/workers",
        params: {
          path: { account_id: args.accountId },
          query: { page, per_page: pageSize, order_by: "name", order: "asc" },
        },
        recordApiCall: args.recordApiCall,
      });
      if (!result) {
        throw new Error(
          `Cloudflare Workers inventory for account ${args.accountId} response did not include Workers.`,
        );
      }
      const pageWorkers = result.map(readCloudflareWorkerServiceInventoryItem);
      if (pageWorkers.some((worker) => seenWorkerTags.has(worker.workerTag))) {
        throw new Error("Cloudflare Worker inventory pagination repeated a Worker.");
      }
      for (const worker of pageWorkers) {
        seenWorkerTags.add(worker.workerTag);
        workers.push(worker);
      }
      if (pageWorkers.length < pageSize) {
        return { state: "complete", workers: workers.sort(compareCloudflareWorkerInventoryItem) };
      }
    }
  } catch {
    return {
      state: "partial",
      workers: await listLegacyCloudflareWorkers(args),
    };
  }
}

function readCloudflareWorkerProductionBuild(args: {
  triggers: readonly CloudflareBuildTrigger[];
  defaultBranch: string;
}): CloudflareWorkerProductionBuild {
  const production = args.triggers.filter(
    (trigger) =>
      matchesProductionTrigger({
        trigger,
        defaultBranch: args.defaultBranch,
      }) && readTrimmedCloudflareString(trigger.trigger_uuid),
  );
  if (production.length > 1) {
    return { state: "ambiguous" };
  }
  const productionTriggerUuid = readTrimmedCloudflareString(production[0]?.trigger_uuid);
  return productionTriggerUuid
    ? { state: "available", productionTriggerUuid }
    : { state: "not_available" };
}

export function classifyCloudflareWorkerRepositoryDiscovery(args: {
  triggers: readonly CloudflareBuildTrigger[];
  expectedRepoId: string;
  defaultBranch: string;
}): CloudflareWorkerRepositoryDiscovery {
  const activeTriggers = args.triggers.filter((trigger) => !trigger.deleted_on);
  if (activeTriggers.length === 0) {
    return { state: "not_connected" };
  }

  const matchingTriggers: CloudflareBuildTrigger[] = [];
  let ambiguousReason:
    | Extract<CloudflareWorkerRepositoryDiscovery, { state: "ambiguous" }>["reason"]
    | null = null;
  for (const trigger of activeTriggers) {
    const repoConnection = trigger.repo_connection;
    if (!repoConnection || !readTrimmedCloudflareString(repoConnection.repo_id)) {
      ambiguousReason = "missing_repo_id";
      continue;
    }
    const repoId = readTrimmedCloudflareString(repoConnection.repo_id);
    if (repoId !== args.expectedRepoId) {
      continue;
    }
    if (repoConnection.deleted_on) {
      ambiguousReason = "deleted_repository_connection";
      continue;
    }
    if (!repoConnection.provider_type) {
      ambiguousReason = "missing_provider_type";
      continue;
    }
    if (repoConnection.provider_type !== "github") {
      continue;
    }
    if (!normalizeCloudflareBuildRoot(trigger.root_directory)) {
      ambiguousReason = "missing_root_directory";
      continue;
    }
    matchingTriggers.push(trigger);
  }
  if (ambiguousReason) {
    return { state: "ambiguous", reason: ambiguousReason };
  }
  if (matchingTriggers.length === 0) {
    return { state: "connected_elsewhere" };
  }

  const rootDirectories = new Set(
    matchingTriggers.map((trigger) => normalizeCloudflareBuildRoot(trigger.root_directory)),
  );
  if (rootDirectories.size !== 1) {
    return { state: "ambiguous", reason: "multiple_root_directories" };
  }
  const rootDirectory = [...rootDirectories][0];
  if (!rootDirectory) {
    throw new Error("Matching Cloudflare Workers Builds triggers lost their normalized root.");
  }
  return {
    state: "ready",
    rootDirectory,
    builds: readCloudflareWorkerProductionBuild({
      triggers: matchingTriggers,
      defaultBranch: args.defaultBranch,
    }),
  };
}

async function readCloudflareWorkerDiscoveryForInventoryItem(
  args: {
    token: string;
    accountId: string;
    worker: CloudflareWorkerInventoryItem;
    expectedRepoId: string;
    defaultBranch: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerDiscoveryItem> {
  try {
    const repository = await readCloudflareWorkerRepositoryDiscoveryForIdentity({
      token: args.token,
      transport: args.transport,
      accountId: args.accountId,
      workerTag: args.worker.workerTag,
      expectedRepoId: args.expectedRepoId,
      defaultBranch: args.defaultBranch,
      recordApiCall: args.recordApiCall,
    });
    return { ...args.worker, repository };
  } catch (error) {
    return {
      ...args.worker,
      repository: { state: "failed", message: toErrorMessage(error) },
    };
  }
}

export async function readCloudflareWorkerRepositoryDiscoveryForIdentity(
  args: {
    token: string;
    accountId: string;
    workerTag: string;
    expectedRepoId: string;
    defaultBranch: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerRepositoryDiscovery> {
  return (await readCloudflareWorkerBuildsDiscoveryForIdentity(args)).repository;
}

export async function discoverCloudflareWorkersForRepository(
  args: {
    token: string;
    accountId: string;
    expectedRepoId: string;
    defaultBranch: string;
  } & CloudflareApiCallOptions,
): Promise<{
  inventoryState: "complete" | "partial";
  workers: CloudflareWorkerProviderDiscoveryItem[];
}> {
  const inventory = await listCloudflareWorkerInventory(args);
  const discoveredWorkers: CloudflareWorkerProviderDiscoveryItem[] = [];
  const chunkSize = 10;
  for (let start = 0; start < inventory.workers.length; start += chunkSize) {
    const chunk = inventory.workers.slice(start, start + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (worker) => {
        const discovery = await readCloudflareWorkerDiscoveryForInventoryItem({
          token: args.token,
          transport: args.transport,
          accountId: args.accountId,
          worker,
          expectedRepoId: args.expectedRepoId,
          defaultBranch: args.defaultBranch,
          recordApiCall: args.recordApiCall,
        });
        if (
          discovery.repository.state !== "ready" ||
          discovery.repository.builds.state !== "available"
        ) {
          return { ...discovery, convexBuildAccess: { state: "unavailable" as const } };
        }
        const convexBuildAccess = await readCloudflareWorkerConvexBuildAccess({
          token: args.token,
          transport: args.transport,
          accountId: args.accountId,
          workerTag: worker.workerTag,
          recordApiCall: args.recordApiCall,
        }).catch(() => ({ state: "unavailable" as const }));
        return { ...discovery, convexBuildAccess };
      }),
    );
    discoveredWorkers.push(...chunkResults);
  }
  return { inventoryState: inventory.state, workers: discoveredWorkers };
}

export async function createCloudflareWorker(args: {
  token: string;
  accountId: string;
  workerName: string;
  transport: CloudflareApiTransport;
  beforeProviderWrite?: () => void | Promise<void>;
}): Promise<CloudflareWorkerIdentity> {
  await args.beforeProviderWrite?.();
  const createdRaw = await requestCloudflareApiOrThrow({
    token: args.token,
    transport: args.transport,
    method: "POST",
    path: "/accounts/{account_id}/workers/workers",
    params: {
      path: {
        account_id: args.accountId,
      },
    },
    body: buildCloudflareWorkerCreateBody(args.workerName),
  }).catch((error: unknown) => {
    if (isCloudflareWorkerCreateConflictError(error)) {
      throw new AppResourceNameConflictError({
        provider: "cloudflare",
        name: args.workerName,
      });
    }
    throw error;
  });
  const created = requireCloudflareResult(
    createdRaw,
    `Cloudflare Worker ${args.workerName} response did not include the created Worker.`,
  );
  const workerTag = readCloudflareWorkerTag(created, args.workerName);
  return {
    workerName: args.workerName,
    workerTag,
  };
}

export async function listCloudflareBuildTokens(
  args: {
    token: string;
    accountId: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareBuildToken[]> {
  const tokens: CloudflareBuildToken[] = [];
  for (let page = 1; ; page += 1) {
    const rawTokens = await requestCloudflareApiOrThrow({
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
    tokens.push(...tokensPage.map(readCloudflareBuildToken).filter(notEmpty));
    if (tokensPage.length < BUILD_TOKEN_PAGE_SIZE) {
      return tokens.sort(compareBuildTokens);
    }
  }
}

export async function requireCloudflareBuildTokenUuid(
  args: {
    token: string;
    accountId: string;
    buildTokenUuid: string;
  } & CloudflareApiCallOptions,
): Promise<string> {
  const buildTokenUuid = args.buildTokenUuid.trim();
  if (!buildTokenUuid) {
    throw new ConvexError("Select a Cloudflare Workers Builds token and retry.");
  }
  const token = (await listCloudflareBuildTokens(args)).find(
    (candidate) => candidate.uuid === buildTokenUuid,
  );
  if (!token) {
    throw new ConvexError(
      `The selected Cloudflare Workers Builds token is not in Cloudflare's current list for account ${args.accountId}. Select another token and retry.`,
    );
  }
  return buildTokenUuid;
}

function readCloudflareBuildToken(
  tokenRecord: CloudflareBuildTokenRecord,
): CloudflareBuildToken | null {
  const uuid = tokenRecord.build_token_uuid;
  if (!uuid) {
    return null;
  }
  return {
    name: tokenRecord.build_token_name?.trim() || "Unnamed token",
    uuid,
  };
}

function compareBuildTokens(left: CloudflareBuildToken, right: CloudflareBuildToken): number {
  const leftName = left.name.toLowerCase();
  const rightName = right.name.toLowerCase();
  if (leftName !== rightName) {
    return leftName < rightName ? 1 : -1;
  }
  if (left.uuid === right.uuid) {
    return 0;
  }
  return left.uuid < right.uuid ? -1 : 1;
}

function matchesProductionTrigger(args: {
  trigger: CloudflareBuildTrigger;
  defaultBranch: string;
}): boolean {
  const branchIncludes = args.trigger.branch_includes ?? [];
  const branchExcludes = args.trigger.branch_excludes ?? [];
  return (
    branchIncludes.length === 1 &&
    branchIncludes[0] === args.defaultBranch &&
    branchExcludes.length === 0
  );
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
  githubRepositoryFullName: string;
  workerTag: string;
}): void {
  if (args.trigger.repo_connection?.deleted_on) {
    throw new Error(
      `Cannot connect Cloudflare Worker ${args.workerTag} to ${args.githubRepositoryFullName}: its existing ${args.triggerName} Workers Builds trigger references a deleted Cloudflare GitHub repository connection. Disconnect Builds in Cloudflare or choose another Worker.`,
    );
  }
  const triggerRepoId = readTriggerRepositoryId(args.trigger);
  if (!triggerRepoId) {
    throw new Error(
      `Cannot connect Cloudflare Worker ${args.workerTag} to ${args.githubRepositoryFullName}: Cloudflare did not return a GitHub repository id for the existing ${args.triggerName} Workers Builds trigger. Disconnect Builds in Cloudflare or choose another Worker.`,
    );
  }
  if (triggerRepoId !== args.expectedRepoId) {
    throw new Error(
      `Cannot connect Cloudflare Worker ${args.workerTag} to ${args.githubRepositoryFullName}: its existing ${args.triggerName} Workers Builds trigger is connected to GitHub repository ${formatExistingTriggerRepository(args.trigger, triggerRepoId)}. Disconnect Builds in Cloudflare or choose another Worker.`,
    );
  }

  const triggerRootDirectory = normalizeCloudflareBuildRoot(args.trigger.root_directory);
  if (!triggerRootDirectory) {
    throw new Error(
      `Cannot connect Cloudflare Worker ${args.workerTag} to ${args.githubRepositoryFullName}: Cloudflare did not return a root directory for the existing ${args.triggerName} Workers Builds trigger. Disconnect Builds in Cloudflare or choose another Worker.`,
    );
  }
  if (triggerRootDirectory !== args.expectedRootDirectory) {
    throw new Error(
      `Cannot connect Cloudflare Worker ${args.workerTag} to ${args.githubRepositoryFullName}: its existing ${args.triggerName} Workers Builds trigger is connected to root directory ${formatCloudflareBuildRoot(triggerRootDirectory)}. Expected ${formatCloudflareBuildRoot(args.expectedRootDirectory)}. Disconnect Builds in Cloudflare or choose another Worker.`,
    );
  }
}

async function listBuildTriggers(
  args: {
    token: string;
    accountId: string;
    workerTag: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareBuildTrigger[]> {
  const raw = await requestCloudflareApiOrThrow({
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

async function readWorkerBuildConfiguration(
  args: {
    token: string;
    accountId: string;
    workerTag: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerBuildConfiguration> {
  const configuration = await requestCloudflareApiOrThrow({
    token: args.token,
    transport: args.transport,
    method: "GET",
    path: "/accounts/{account_id}/builds/workers/{script_tag}",
    params: { path: { account_id: args.accountId, script_tag: args.workerTag } },
    recordApiCall: args.recordApiCall,
  });
  if (!configuration || configuration.script_tag !== args.workerTag) {
    throw new Error("Cloudflare did not return the expected Worker build configuration.");
  }
  return configuration;
}

function requireWorkerPreviewSettings(configuration: CloudflareWorkerBuildConfiguration) {
  const production = configuration.production_settings;
  const preview = configuration.previews_base_config;
  if (
    configuration.previews_enabled !== true ||
    !production ||
    !preview ||
    preview.proposed_deploy_command !== undefined
  ) {
    throw new Error(
      "Enable Worker Previews in Cloudflare and complete the starter changelog migration before configuring Builds or rotating Convex deploy keys. Samebase does not migrate legacy preview triggers.",
    );
  }
  return { production, preview };
}

function assertWorkerBuildRepositoryAndRoot(args: {
  configuration: CloudflareWorkerBuildConfiguration;
  expectedRepoId: string;
  expectedRootDirectory: string;
  defaultBranch: string;
}) {
  const { production, preview } = requireWorkerPreviewSettings(args.configuration);
  const repository = args.configuration.git_repository;
  if (
    repository?.provider_type !== "github" ||
    repository.repo_id !== args.expectedRepoId ||
    repository.branch !== args.defaultBranch
  ) {
    throw new Error(
      "Cloudflare Worker build configuration no longer matches the expected GitHub repository and production branch.",
    );
  }
  if (
    normalizeCloudflareBuildRoot(production.root_directory) !== args.expectedRootDirectory ||
    normalizeCloudflareBuildRoot(preview.root_directory) !== args.expectedRootDirectory
  ) {
    throw new Error(
      "Cloudflare production and preview Builds must use the expected repository root directory.",
    );
  }
  return { production, preview };
}

function assertBuildEnvironmentVariables(args: {
  triggerKind: "production" | "preview";
  workerTag: string;
  envVars: CloudflareBuildEnvVarsResponse;
  expected: CloudflareBuildEnvVars;
}): void {
  const missingKeys = Object.keys(args.expected).filter(
    (key) => !Object.prototype.hasOwnProperty.call(args.envVars, key),
  );
  if (missingKeys.length > 0) {
    throw new Error(
      `Cloudflare ${args.triggerKind} Workers Builds configuration ${args.workerTag} is missing build environment variable ${missingKeys.join(", ")} after deploy-key rotation.`,
    );
  }

  for (const [key, expected] of Object.entries(args.expected)) {
    if (!Object.prototype.hasOwnProperty.call(args.envVars, key)) {
      continue;
    }
    const actual = args.envVars[key];
    if (actual.is_secret !== expected.is_secret) {
      throw new Error(
        `Cloudflare ${args.triggerKind} Workers Builds configuration ${args.workerTag} has build environment variable ${key} with is_secret=${String(actual.is_secret)}. Expected ${String(expected.is_secret)}.`,
      );
    }
    if (!expected.is_secret && actual.value !== expected.value) {
      throw new Error(
        `Cloudflare ${args.triggerKind} Workers Builds configuration ${args.workerTag} has an unexpected value for build environment variable ${key}.`,
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
    readCommitHash: () => Promise<string>;
  } & CloudflareApiCallOptions,
): Promise<void> {
  const commitHash = await args.readCommitHash();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(commitHash)) {
    throw new Error("Initial Workers build did not receive a full commit SHA.");
  }

  await args.beforeProviderWrite?.();
  await requestCloudflareApiOrThrow({
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
      commit_hash: commitHash,
    },
  });
}

type InitialCloudflareWorkersBuild =
  | { state: "deferred" }
  | { state: "requested"; readCommitHash: () => Promise<string> };

export type CloudflareWorkersBuilds = {
  rootDirectory: string;
  buildCommand: string;
  deployCommand: string;
  previewDeployCommand: string;
  pathIncludes: string[];
  pathExcludes: string[];
  production: {
    triggerUuid: string;
  };
};
export type CloudflareConnectedWorkersBuilds = CloudflareWorkersBuilds & {
  state: "connected";
};
export type CloudflareConvexBuildAccessObservation =
  | { state: "not_configured" }
  | { state: "configured"; convexProject: SamebaseConvexProjectReference }
  | { state: "incomplete"; convexProject: SamebaseConvexProjectReference }
  | { state: "target_unknown" }
  | { state: "invalid" };
type CloudflareAuthMethod = "api_key" | "oauth" | "mcp_oauth";

type ConfigureCloudflareWorkerBuildsArgs = {
  owner: string;
  repo: string;
  githubRepositoryDatabaseId: string;
  ghRepoOwnerId: string;
  defaultBranch: string;
  cloudflareToken: string;
  accountId: string;
  buildTokenUuid: string;
  workerTag: string;
  existingBuilds: "preserve_repository" | "require_unconnected";
  buildConfig: CloudflareBuildConfig;
  transport: CloudflareApiTransport;
  recordApiCall?: ProviderApiCallRecorder;
  beforeProviderWrite?: () => void | Promise<void>;
};

type ConfigureCloudflareWorkerBuildsForGitHubArgs = {
  owner: string;
  repo: string;
  githubRepositoryDatabaseId: string;
  ghRepoOwnerId: string;
  defaultBranch: string;
  initialBuild: InitialCloudflareWorkersBuild;
  repositoryId: string;
  workerName: string;
  workerTag: string;
  existingBuilds: "preserve_repository" | "require_unconnected";
  cloudflareToken: string;
  cloudflareAuthMethod: CloudflareAuthMethod;
  accountId: string;
  buildTokenUuid: string;
  buildConfig: CloudflareBuildConfig;
  recordApiCall?: ProviderApiCallRecorder;
  beforeProviderWrite?: () => void | Promise<void>;
  afterBuildsConfigured?: () => void | Promise<void>;
};

type RotateConvexDeployKeysForCloudflareWorkerBuildsArgs = {
  defaultBranch: string;
  readInitialBuildCommitHash: () => Promise<string>;
  expectedRepoId: string;
  githubRepositoryFullName: string;
  rootDirectory: string;
  repositoryId: string;
  workerName: string;
  workerTag: string;
  cloudflareToken: string;
  cloudflareAuthMethod: CloudflareAuthMethod;
  accountId: string;
  build: {
    production: { triggerUuid: string };
  };
  convex: CloudflareProvisionConvexState;
  convexProject: SamebaseConvexProjectReference;
  recordApiCall?: ProviderApiCallRecorder;
  beforeProviderWrite?: () => void | Promise<void>;
};

function assertExpectedBuildTriggerStillExists(args: {
  triggers: readonly CloudflareBuildTrigger[];
  defaultBranch: string;
  triggerUuid: string;
  expectedRepoId: string;
  expectedRootDirectory: string;
  githubRepositoryFullName: string;
  workerTag: string;
}): void {
  const triggerName = "production";
  const trigger = args.triggers.find(
    (candidate) => !candidate.deleted_on && candidate.trigger_uuid === args.triggerUuid,
  );
  if (!trigger) {
    throw new Error(
      `Cannot configure Workers Builds for Cloudflare Worker ${args.workerTag} and ${args.githubRepositoryFullName}: Cloudflare did not return the existing ${triggerName} trigger. Retry the operation or choose another Worker.`,
    );
  }
  if (
    !matchesProductionTrigger({
      trigger,
      defaultBranch: args.defaultBranch,
    })
  ) {
    throw new Error(
      `Cannot configure Workers Builds for Cloudflare Worker ${args.workerTag} and ${args.githubRepositoryFullName}: its existing ${triggerName} trigger no longer matches the expected branch filters. Retry the operation or choose another Worker.`,
    );
  }

  assertBuildTriggerMatchesRepositoryAndRoot({
    trigger,
    triggerName,
    expectedRepoId: args.expectedRepoId,
    expectedRootDirectory: args.expectedRootDirectory,
    githubRepositoryFullName: args.githubRepositoryFullName,
    workerTag: args.workerTag,
  });
}

function hasCloudflareBuildEnvironmentVariable(
  envVars: CloudflareBuildEnvVarsResponse,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(envVars, key);
}

function hasSecretCloudflareBuildEnvironmentVariable(args: {
  envVars: CloudflareBuildEnvVarsResponse;
  key: string;
}): boolean {
  if (!hasCloudflareBuildEnvironmentVariable(args.envVars, args.key)) {
    return false;
  }
  const variable = args.envVars[args.key];
  return variable.is_secret === true;
}

type SamebaseConvexProjectMarkerObservation =
  | { state: "missing" }
  | { state: "invalid" }
  | { state: "available"; convexProject: SamebaseConvexProjectReference };

function readSamebaseConvexProjectMarker(
  envVars: CloudflareBuildEnvVarsResponse,
): SamebaseConvexProjectMarkerObservation {
  if (!Object.prototype.hasOwnProperty.call(envVars, SAMEBASE_CONVEX_PROJECT)) {
    return { state: "missing" };
  }
  const variable = envVars[SAMEBASE_CONVEX_PROJECT];
  if (variable.is_secret !== false || !variable.value) {
    return { state: "invalid" };
  }
  const convexProject = parseSamebaseConvexProjectMarker(variable.value);
  return convexProject ? { state: "available", convexProject } : { state: "invalid" };
}

function hasSameCloudflareStringList(
  left: readonly string[] | undefined,
  right: readonly string[],
): boolean {
  return (
    left !== undefined &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function verifyConvexBuildAccess(args: {
  productionEnvVars: CloudflareBuildEnvVarsResponse;
  previewEnvVars: CloudflareBuildEnvVarsResponse;
}): CloudflareConvexBuildAccessObservation {
  const productionMarker = readSamebaseConvexProjectMarker(args.productionEnvVars);
  const productionConvexDeployKeyPresent = hasSecretCloudflareBuildEnvironmentVariable({
    envVars: args.productionEnvVars,
    key: CONVEX_DEPLOY_KEY,
  });
  const previewConvexDeployKeyPresent = hasSecretCloudflareBuildEnvironmentVariable({
    envVars: args.previewEnvVars,
    key: CONVEX_DEPLOY_KEY,
  });
  const anyDeployKeyVariablePresent =
    hasCloudflareBuildEnvironmentVariable(args.productionEnvVars, CONVEX_DEPLOY_KEY) ||
    hasCloudflareBuildEnvironmentVariable(args.previewEnvVars, CONVEX_DEPLOY_KEY);
  if (productionMarker.state === "invalid") {
    return { state: "invalid" };
  }
  if (productionMarker.state === "missing") {
    return anyDeployKeyVariablePresent ? { state: "target_unknown" } : { state: "not_configured" };
  }
  return productionConvexDeployKeyPresent && previewConvexDeployKeyPresent
    ? { state: "configured", convexProject: productionMarker.convexProject }
    : { state: "incomplete", convexProject: productionMarker.convexProject };
}

export type CloudflareWorkerBuildsConnection =
  | { state: "not_connected" }
  | {
      state: "connected";
      productionTriggerUuid: string;
      productionBuildTokenUuid: string | null;
      previewBuildTokenUuid: string | null;
    };

export type CloudflareWorkerBuildsDiscovery = {
  repository: CloudflareWorkerRepositoryDiscovery;
  builds: CloudflareWorkerBuildsConnection;
};

export async function readCloudflareWorkerBuildsDiscoveryForIdentity(
  args: {
    token: string;
    accountId: string;
    workerTag: string;
    defaultBranch: string;
    expectedRepoId: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerBuildsDiscovery> {
  const triggers = await listBuildTriggers({
    token: args.token,
    accountId: args.accountId,
    workerTag: args.workerTag,
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });
  const repository = classifyCloudflareWorkerRepositoryDiscovery({
    triggers,
    expectedRepoId: args.expectedRepoId,
    defaultBranch: args.defaultBranch,
  });
  if (repository.state !== "ready" || repository.builds.state !== "available") {
    return { repository, builds: { state: "not_connected" } };
  }
  const configuration = await readWorkerBuildConfiguration(args);
  if (
    configuration.previews_enabled !== true ||
    configuration.previews_base_config?.proposed_deploy_command !== undefined
  ) {
    return {
      repository: { ...repository, builds: { state: "not_available" } },
      builds: { state: "not_connected" },
    };
  }
  const { production, preview } = assertWorkerBuildRepositoryAndRoot({
    configuration,
    expectedRepoId: args.expectedRepoId,
    expectedRootDirectory: repository.rootDirectory,
    defaultBranch: args.defaultBranch,
  });
  return {
    repository,
    builds: {
      state: "connected",
      productionTriggerUuid: repository.builds.productionTriggerUuid,
      productionBuildTokenUuid: production.build_token_uuid ?? null,
      previewBuildTokenUuid: preview.build_token_uuid ?? null,
    },
  };
}

export async function readCloudflareWorkerConvexBuildAccess(
  args: {
    token: string;
    accountId: string;
    workerTag: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareConvexBuildAccessObservation> {
  const configuration = await readWorkerBuildConfiguration(args);
  const { production, preview } = requireWorkerPreviewSettings(configuration);
  if (!production.environment_variables || !preview.environment_variables) {
    throw new Error(
      "Cloudflare did not return production and preview build environment variables.",
    );
  }
  return verifyConvexBuildAccess({
    productionEnvVars: production.environment_variables,
    previewEnvVars: preview.environment_variables,
  });
}

function assertCloudflareWorkerHasNoBuildsConnection(args: {
  triggers: readonly CloudflareBuildTrigger[];
  workerTag: string;
}): void {
  const activeTriggers = args.triggers.filter((trigger) => !trigger.deleted_on);
  if (activeTriggers.length > 0) {
    throw new Error(
      `Cannot connect Cloudflare Worker ${args.workerTag}: it already has a Workers Builds connection. Scan the account again.`,
    );
  }
}

async function configureCloudflareWorkerBuilds(
  args: ConfigureCloudflareWorkerBuildsArgs,
): Promise<CloudflareConnectedWorkersBuilds> {
  const buildTokenUuid = await requireCloudflareBuildTokenUuid({
    token: args.cloudflareToken,
    accountId: args.accountId,
    buildTokenUuid: args.buildTokenUuid,
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
  const activeTriggers = existingTriggers.filter((trigger) => !trigger.deleted_on);
  const expectedRootDirectory = requireNormalizedCloudflareBuildRoot(
    args.buildConfig.rootDir,
    "Expected Workers Builds root",
  );
  if (args.existingBuilds === "require_unconnected") {
    assertCloudflareWorkerHasNoBuildsConnection({
      triggers: existingTriggers,
      workerTag: args.workerTag,
    });
  }
  if (activeTriggers.length > 0) {
    const repository = classifyCloudflareWorkerRepositoryDiscovery({
      triggers: existingTriggers,
      expectedRepoId: args.githubRepositoryDatabaseId,
      defaultBranch: args.defaultBranch,
    });
    if (
      repository.state !== "ready" ||
      repository.rootDirectory !== expectedRootDirectory ||
      repository.builds.state !== "available"
    ) {
      throw new Error(
        "Cannot update Cloudflare Builds: its existing repository, root, or production branch does not match this app.",
      );
    }
    const configuration = await readWorkerBuildConfiguration({
      token: args.cloudflareToken,
      accountId: args.accountId,
      workerTag: args.workerTag,
      transport: args.transport,
      recordApiCall: args.recordApiCall,
    });
    assertWorkerBuildRepositoryAndRoot({
      configuration,
      expectedRepoId: args.githubRepositoryDatabaseId,
      expectedRootDirectory,
      defaultBranch: args.defaultBranch,
    });
  }

  const commonSettings = {
    build_token_uuid: buildTokenUuid,
    build_command: args.buildConfig.buildCommand,
    root_directory: args.buildConfig.rootDir,
    path_includes: args.buildConfig.pathIncludes,
    path_excludes: args.buildConfig.pathExcludes,
  };
  try {
    await args.beforeProviderWrite?.();
    if (activeTriggers.length === 0) {
      await requestCloudflareApiOrThrow({
        token: args.cloudflareToken,
        transport: args.transport,
        method: "POST",
        path: "/accounts/{account_id}/builds/workers",
        params: { path: { account_id: args.accountId } },
        recordApiCall: args.recordApiCall,
        body: {
          script_tag: args.workerTag,
          git_repository: {
            provider_type: "github",
            provider_account_id: args.ghRepoOwnerId,
            provider_account_name: args.owner,
            repo_id: args.githubRepositoryDatabaseId,
            repo_name: args.repo,
            branch: args.defaultBranch,
          },
          previews_enabled: true,
          production_settings: {
            ...commonSettings,
            build_caching_enabled: true,
            deploy_command: args.buildConfig.deployCommand,
          },
          previews_base_config: {
            ...commonSettings,
            build_caching_enabled: true,
            deploy_command: args.buildConfig.previewDeployCommand,
          },
        },
      });
    } else {
      await requestCloudflareApiOrThrow({
        token: args.cloudflareToken,
        transport: args.transport,
        method: "PATCH",
        path: "/accounts/{account_id}/builds/workers/{script_tag}",
        params: {
          path: { account_id: args.accountId, script_tag: args.workerTag },
          query: { patch_existing_previews: "false" },
        },
        recordApiCall: args.recordApiCall,
        body: {
          production_settings: {
            ...commonSettings,
            deploy_command: args.buildConfig.deployCommand,
          },
          previews_base_config: {
            ...commonSettings,
            deploy_command: args.buildConfig.previewDeployCommand,
          },
        },
      });
    }
  } catch (error) {
    if (isCloudflareGitHubAppRepositoryAuthorizationError(error)) {
      throw new Error(
        formatCloudflareGitHubAppRepositoryAuthorizationMessage(`${args.owner}/${args.repo}`),
      );
    }
    throw error;
  }

  const configuration = await readWorkerBuildConfiguration({
    token: args.cloudflareToken,
    accountId: args.accountId,
    workerTag: args.workerTag,
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });
  const { production, preview } = assertWorkerBuildRepositoryAndRoot({
    configuration,
    expectedRepoId: args.githubRepositoryDatabaseId,
    expectedRootDirectory,
    defaultBranch: args.defaultBranch,
  });
  for (const [settings, deployCommand] of [
    [production, args.buildConfig.deployCommand],
    [preview, args.buildConfig.previewDeployCommand],
  ] as const) {
    if (
      settings.build_token_uuid !== buildTokenUuid ||
      settings.build_command !== args.buildConfig.buildCommand ||
      settings.deploy_command !== deployCommand ||
      !hasSameCloudflareStringList(settings.path_includes, args.buildConfig.pathIncludes) ||
      !hasSameCloudflareStringList(settings.path_excludes, args.buildConfig.pathExcludes)
    ) {
      throw new Error("Cloudflare did not retain the requested Worker build settings.");
    }
  }
  const triggers = await listBuildTriggers({
    token: args.cloudflareToken,
    accountId: args.accountId,
    workerTag: args.workerTag,
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });
  const repository = classifyCloudflareWorkerRepositoryDiscovery({
    triggers,
    expectedRepoId: args.githubRepositoryDatabaseId,
    defaultBranch: args.defaultBranch,
  });
  if (
    repository.state !== "ready" ||
    repository.rootDirectory !== expectedRootDirectory ||
    repository.builds.state !== "available"
  ) {
    throw new Error(
      "Cloudflare did not return one production trigger for the configured repository and root.",
    );
  }
  const productionTriggerUuid = repository.builds.productionTriggerUuid;
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
    },
  };
}

export async function configureCloudflareWorkerBuildsForGitHub(
  args: ConfigureCloudflareWorkerBuildsForGitHubArgs,
): Promise<CloudflareConnectedWorkersBuilds> {
  console.log("infra:cloudflare:workers_builds:configure_github:start", {
    repositoryId: args.repositoryId,
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
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      ghRepoOwnerId: args.ghRepoOwnerId,
      defaultBranch: args.defaultBranch,
      cloudflareToken: args.cloudflareToken,
      accountId: args.accountId,
      buildTokenUuid: args.buildTokenUuid,
      workerTag: args.workerTag,
      existingBuilds: args.existingBuilds,
      buildConfig: args.buildConfig,
      transport,
      recordApiCall: args.recordApiCall,
      beforeProviderWrite: args.beforeProviderWrite,
    });

    step = "record_builds_configuration";
    await args.afterBuildsConfigured?.();

    if (args.initialBuild.state === "requested") {
      step = "trigger_initial_build";
      await triggerInitialBuild({
        token: args.cloudflareToken,
        accountId: args.accountId,
        triggerUuid: build.production.triggerUuid,
        branch: args.defaultBranch,
        readCommitHash: args.initialBuild.readCommitHash,
        transport,
        recordApiCall: args.recordApiCall,
        beforeProviderWrite: args.beforeProviderWrite,
      });
    }

    console.log("infra:cloudflare:workers_builds:configure_github:success", {
      repositoryId: args.repositoryId,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      initialBuildTriggered: args.initialBuild.state === "requested",
    });

    return build;
  } catch (error) {
    console.error(
      "infra:cloudflare:workers_builds:configure_github:failed",
      {
        repositoryId: args.repositoryId,
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        repo: `${args.owner}/${args.repo}`,
        step,
      },
      error,
    );
    throw error;
  }
}

export async function rotateConvexDeployKeysForCloudflareWorkerBuilds(
  args: RotateConvexDeployKeysForCloudflareWorkerBuildsArgs,
): Promise<void> {
  console.log("infra:cloudflare:convex_deploy_keys:rotate_for_workers_builds:start", {
    repositoryId: args.repositoryId,
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
      "Expected Workers Builds root",
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
      defaultBranch: args.defaultBranch,
      triggerUuid: args.build.production.triggerUuid,
      expectedRepoId: args.expectedRepoId,
      expectedRootDirectory,
      githubRepositoryFullName: args.githubRepositoryFullName,
      workerTag: args.workerTag,
    });
    const configuration = await readWorkerBuildConfiguration({
      token: args.cloudflareToken,
      accountId: args.accountId,
      workerTag: args.workerTag,
      transport,
      recordApiCall: args.recordApiCall,
    });
    assertWorkerBuildRepositoryAndRoot({
      configuration,
      expectedRepoId: args.expectedRepoId,
      expectedRootDirectory,
      defaultBranch: args.defaultBranch,
    });

    step = "set_environment_variables";
    const productionEnvVars = buildCloudflareWorkerEnvVars({
      triggerKind: "production",
      convexDeployKey: args.convex.production.deployKey,
      convexProject: args.convexProject,
    });
    const previewEnvVars = buildCloudflareWorkerEnvVars({
      triggerKind: "preview",
      convexDeployKey: args.convex.preview.deployKey,
    });
    await args.beforeProviderWrite?.();
    await requestCloudflareApiOrThrow({
      token: args.cloudflareToken,
      transport,
      method: "PATCH",
      path: "/accounts/{account_id}/builds/workers/{script_tag}",
      params: {
        path: { account_id: args.accountId, script_tag: args.workerTag },
        query: { patch_existing_previews: "true" },
      },
      recordApiCall: args.recordApiCall,
      body: {
        production_settings: { environment_variables: productionEnvVars },
        // Rotation revokes the prior key. Existing previews need the replacement,
        // but their commands, roots, and other settings must remain unchanged.
        previews_base_config: { environment_variables: previewEnvVars },
      },
    });

    step = "verify_environment_variables";
    const verifiedConfiguration = await readWorkerBuildConfiguration({
      token: args.cloudflareToken,
      accountId: args.accountId,
      workerTag: args.workerTag,
      transport,
      recordApiCall: args.recordApiCall,
    });
    const { production, preview } = assertWorkerBuildRepositoryAndRoot({
      configuration: verifiedConfiguration,
      expectedRepoId: args.expectedRepoId,
      expectedRootDirectory,
      defaultBranch: args.defaultBranch,
    });
    if (!production.environment_variables || !preview.environment_variables) {
      throw new Error(
        "Cloudflare did not return build environment variables after deploy-key rotation.",
      );
    }
    assertBuildEnvironmentVariables({
      triggerKind: "production",
      workerTag: args.workerTag,
      envVars: production.environment_variables,
      expected: productionEnvVars,
    });
    assertBuildEnvironmentVariables({
      triggerKind: "preview",
      workerTag: args.workerTag,
      envVars: preview.environment_variables,
      expected: previewEnvVars,
    });

    step = "trigger_initial_build";
    await triggerInitialBuild({
      token: args.cloudflareToken,
      accountId: args.accountId,
      triggerUuid: args.build.production.triggerUuid,
      branch: args.defaultBranch,
      readCommitHash: args.readInitialBuildCommitHash,
      transport,
      recordApiCall: args.recordApiCall,
      beforeProviderWrite: args.beforeProviderWrite,
    });

    console.log("infra:cloudflare:convex_deploy_keys:rotate_for_workers_builds:success", {
      repositoryId: args.repositoryId,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
    });
  } catch (error) {
    console.error(
      "infra:cloudflare:convex_deploy_keys:rotate_for_workers_builds:failed",
      {
        repositoryId: args.repositoryId,
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        step,
      },
      error,
    );
    throw error;
  }
}

export async function readCloudflareWorkerBuildsPage(args: {
  token: string;
  transport: CloudflareApiTransport;
  accountId: string;
  workerTag: string;
  page: number;
  perPage: number;
}): Promise<CloudflareApiRequestResult<CloudflareWorkerBuild[]>> {
  const [valid, builds] = await requestCloudflareApi({
    token: args.token,
    transport: args.transport,
    method: "GET",
    path: "/accounts/{account_id}/builds/workers/{external_script_id}/builds",
    params: {
      path: {
        account_id: args.accountId,
        external_script_id: args.workerTag,
      },
      query: {
        page: args.page,
        per_page: args.perPage,
      },
    },
  });
  if (!valid) {
    return bad(builds);
  }

  return good(
    requireCloudflareResult(
      builds,
      `Cloudflare Workers Builds did not return builds for Worker ${args.workerTag}.`,
    ),
  );
}

const RECENT_CLOUDFLARE_WORKER_BUILD_PAGE_SIZE = 100;
const RECENT_CLOUDFLARE_WORKER_BUILD_MAX_PAGES = 2;

export async function readRecentCloudflareWorkerBuilds(args: {
  token: string;
  transport: CloudflareApiTransport;
  accountId: string;
  workerTag: string;
}): Promise<CloudflareApiRequestResult<{ builds: CloudflareWorkerBuild[]; exhausted: boolean }>> {
  const builds: CloudflareWorkerBuild[] = [];
  for (let page = 1; page <= RECENT_CLOUDFLARE_WORKER_BUILD_MAX_PAGES; page += 1) {
    const [valid, pageBuilds] = await readCloudflareWorkerBuildsPage({
      ...args,
      page,
      perPage: RECENT_CLOUDFLARE_WORKER_BUILD_PAGE_SIZE,
    });
    if (!valid) {
      return bad(pageBuilds);
    }

    builds.push(...pageBuilds);
    if (pageBuilds.length < RECENT_CLOUDFLARE_WORKER_BUILD_PAGE_SIZE) {
      return good({ builds, exhausted: true });
    }
  }
  return good({ builds, exhausted: false });
}

type DeleteCloudflareResourcesArgs = {
  accountId: string;
  workerTag: string;
  cloudflareToken: string;
  transport: CloudflareApiTransport;
};

export async function deleteCloudflareResources(
  args: DeleteCloudflareResourcesArgs,
): Promise<void> {
  try {
    await requestCloudflareApiOrThrow({
      token: args.cloudflareToken,
      transport: args.transport,
      method: "DELETE",
      path: "/accounts/{account_id}/builds/workers/{script_tag}",
      params: { path: { account_id: args.accountId, script_tag: args.workerTag } },
    });
  } catch (error) {
    if (!isCloudflareWorkerNotFoundError(error)) {
      throw error;
    }
  }
  await requestCloudflareApiOrThrow({
    token: args.cloudflareToken,
    transport: args.transport,
    method: "DELETE",
    path: "/accounts/{account_id}/workers/workers/{worker_id}",
    params: {
      path: {
        account_id: args.accountId,
        worker_id: args.workerTag,
      },
    },
  });
}
