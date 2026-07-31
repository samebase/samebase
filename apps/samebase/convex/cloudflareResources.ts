import { notEmpty } from "@samebase/dependent/main";
import { z } from "zod";

import { createUrlSearchParams, readUrlSearchParamsRecord } from "../shared/urlSearchParams";
import {
  requestCloudflareApi,
  CloudflareApiError,
  resolveCloudflareApiTransport,
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
export type CloudflareWorkerBuild = Readable<components["schemas"]["builds_BuildResponse"]>;
export type CloudflareWorkerVersion = Readable<components["schemas"]["workers_Version"]>;
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

export function isCloudflareBuildTriggerNotFoundError(error: unknown): boolean {
  if (!(error instanceof CloudflareApiError) || !error.path.includes("/builds/triggers/")) {
    return false;
  }

  return error.details.some((detail) => {
    const message = detail.message?.toLowerCase();
    return (
      detail.code === "10007" ||
      detail.code === "12000" ||
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
  convexProject: SamebaseConvexProjectReference;
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
    [SAMEBASE_CONVEX_PROJECT]: {
      value: buildSamebaseConvexProjectMarker(vars.convexProject),
      is_secret: false,
    },
  };
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
  previewUrlsEnabled: boolean | undefined;
  workersDevEnabled: boolean;
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

export type CloudflareWorkerBuildTriggerPair =
  | { state: "available"; productionTriggerUuid: string; previewTriggerUuid: string }
  | { state: "not_available" }
  | { state: "ambiguous" };

export type CloudflareWorkerRepositoryDiscovery =
  | {
      state: "ready";
      rootDirectory: string;
      builds: CloudflareWorkerBuildTriggerPair;
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

export async function readCloudflareWorkersDevSubdomain(
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

export async function readCloudflareWorkerIdentity(
  args: {
    token: string;
    accountId: string;
    workerName: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerDetails | null> {
  const worker = await readWorker(args);
  if (!worker) {
    return null;
  }

  const customDomains = [
    ...new Set(
      worker.references.domains.flatMap((domain) => {
        const hostname = domain.hostname.trim();
        return hostname ? [hostname] : [];
      }),
    ),
  ].sort((left, right) => left.localeCompare(right));

  return {
    customDomains,
    previewUrlsEnabled: worker.subdomain.previews_enabled,
    workersDevEnabled: worker.subdomain.enabled,
    workerName: args.workerName,
    workerTag: readCloudflareWorkerTag(worker, args.workerName),
  };
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
      const result = await requestCloudflareApi({
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

function readCloudflareWorkerBuildTriggerPair(args: {
  triggers: readonly CloudflareBuildTrigger[];
  defaultBranch: string;
}): CloudflareWorkerBuildTriggerPair {
  const production = args.triggers.filter(
    (trigger) =>
      matchesAdoptableTriggerKind({
        trigger,
        kind: "production",
        defaultBranch: args.defaultBranch,
      }) && readTrimmedCloudflareString(trigger.trigger_uuid),
  );
  const preview = args.triggers.filter(
    (trigger) =>
      matchesAdoptableTriggerKind({
        trigger,
        kind: "preview",
        defaultBranch: args.defaultBranch,
      }) && readTrimmedCloudflareString(trigger.trigger_uuid),
  );
  if (production.length > 1 || preview.length > 1) {
    return { state: "ambiguous" };
  }
  const productionTriggerUuid = readTrimmedCloudflareString(production[0]?.trigger_uuid);
  const previewTriggerUuid = readTrimmedCloudflareString(preview[0]?.trigger_uuid);
  return productionTriggerUuid && previewTriggerUuid
    ? { state: "available", productionTriggerUuid, previewTriggerUuid }
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
    builds: readCloudflareWorkerBuildTriggerPair({
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
    const triggers = await listBuildTriggers({
      token: args.token,
      transport: args.transport,
      accountId: args.accountId,
      workerTag: args.worker.workerTag,
      recordApiCall: args.recordApiCall,
    });
    return {
      ...args.worker,
      repository: classifyCloudflareWorkerRepositoryDiscovery({
        triggers,
        expectedRepoId: args.expectedRepoId,
        defaultBranch: args.defaultBranch,
      }),
    };
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
    workerName: string;
    workerTag: string;
    expectedRepoId: string;
    defaultBranch: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerRepositoryDiscovery> {
  const triggers = await listBuildTriggers({
    token: args.token,
    transport: args.transport,
    accountId: args.accountId,
    workerTag: args.workerTag,
    recordApiCall: args.recordApiCall,
  });
  return classifyCloudflareWorkerRepositoryDiscovery({
    triggers,
    expectedRepoId: args.expectedRepoId,
    defaultBranch: args.defaultBranch,
  });
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
          productionTriggerUuid: discovery.repository.builds.productionTriggerUuid,
          previewTriggerUuid: discovery.repository.builds.previewTriggerUuid,
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
  const existing = await readWorker({
    token: args.token,
    accountId: args.accountId,
    workerName: args.workerName,
    transport: args.transport,
  });
  if (existing) {
    throw new Error(
      `Cloudflare Worker name ${args.workerName} already exists. Choose another Worker name and try again.`,
    );
  }

  await args.beforeProviderWrite?.();
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
    await args.beforeProviderWrite?.();
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
    beforeProviderWrite: args.beforeProviderWrite,
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
  await args.beforeProviderWrite?.();
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

type CloudflareBuildTriggerRepositoryMatch = "conflict" | "target" | "unknown";

function classifyBuildTriggerRepository(args: {
  trigger: CloudflareBuildTrigger;
  expectedRepoId: string;
  expectedRepoConnectionUuid: string;
}): CloudflareBuildTriggerRepositoryMatch {
  const repoConnection = args.trigger.repo_connection;
  if (!repoConnection) {
    return "unknown";
  }
  if (repoConnection.deleted_on) {
    return "conflict";
  }
  if (repoConnection.repo_id !== undefined) {
    return repoConnection.repo_id === args.expectedRepoId ? "target" : "conflict";
  }
  return repoConnection.repo_connection_uuid === args.expectedRepoConnectionUuid
    ? "target"
    : "unknown";
}

function selectBuildTriggerForRepository(args: {
  triggers: readonly CloudflareBuildTrigger[];
  kind: CloudflareBuildTriggerKind;
  defaultBranch: string;
  expectedRepoId: string;
  expectedRepoConnectionUuid: string;
  workerTag: string;
}): CloudflareBuildTrigger | undefined {
  const triggerName = args.kind === "production" ? "Production Deploy" : "Preview Deploy";
  const candidates = args.triggers.filter(
    (trigger) =>
      !trigger.deleted_on &&
      matchesTriggerKind({
        trigger,
        kind: args.kind,
        defaultBranch: args.defaultBranch,
      }),
  );
  const targetCandidates = candidates.filter(
    (trigger) =>
      classifyBuildTriggerRepository({
        trigger,
        expectedRepoId: args.expectedRepoId,
        expectedRepoConnectionUuid: args.expectedRepoConnectionUuid,
      }) === "target",
  );
  if (targetCandidates.length === 1) {
    return targetCandidates[0];
  }
  if (targetCandidates.length > 1 || candidates.length > 1) {
    throw new Error(
      `Cannot update ${triggerName} trigger for Cloudflare Worker ${args.workerTag}: Cloudflare returned multiple matching trigger candidates. Disconnect duplicate triggers in Cloudflare and retry.`,
    );
  }
  if (candidates.length === 0) {
    return undefined;
  }

  const candidate = candidates[0];
  if (
    classifyBuildTriggerRepository({
      trigger: candidate,
      expectedRepoId: args.expectedRepoId,
      expectedRepoConnectionUuid: args.expectedRepoConnectionUuid,
    }) === "unknown"
  ) {
    throw new Error(
      `Cannot update ${triggerName} trigger for Cloudflare Worker ${args.workerTag}: Cloudflare did not return enough repository identity for the existing trigger. Retry after Cloudflare reports its repository connection, or disconnect the trigger in Cloudflare.`,
    );
  }
  throw new Error(
    `Cannot update ${triggerName} trigger for Cloudflare Worker ${args.workerTag}: it is connected to another or deleted repository. Disconnect the trigger in Cloudflare and retry.`,
  );
}

function readExpectedBuildTriggerUuid(args: {
  triggers: readonly CloudflareBuildTrigger[];
  kind: CloudflareBuildTriggerKind;
  defaultBranch: string;
  expectedRepoId: string;
  expectedRepoConnectionUuid: string;
  expectedRootDirectory: string;
  buildTokenUuid: string;
  buildCommand: string;
  deployCommand: string;
  pathIncludes: readonly string[];
  pathExcludes: readonly string[];
}): string | null {
  const expectedRootDirectory = requireNormalizedCloudflareBuildRoot(
    args.expectedRootDirectory,
    "Expected Workers Builds root",
  );
  const matches = args.triggers.filter(
    (trigger) =>
      !trigger.deleted_on &&
      matchesAdoptableTriggerKind({
        trigger,
        kind: args.kind,
        defaultBranch: args.defaultBranch,
      }) &&
      classifyBuildTriggerRepository({
        trigger,
        expectedRepoId: args.expectedRepoId,
        expectedRepoConnectionUuid: args.expectedRepoConnectionUuid,
      }) === "target" &&
      normalizeCloudflareBuildRoot(trigger.root_directory) === expectedRootDirectory &&
      trigger.build_token_uuid === args.buildTokenUuid &&
      trigger.build_command === args.buildCommand &&
      trigger.deploy_command === args.deployCommand &&
      hasSameCloudflareStringList(trigger.path_includes ?? [], args.pathIncludes) &&
      hasSameCloudflareStringList(trigger.path_excludes ?? [], args.pathExcludes) &&
      trigger.trigger_uuid !== undefined,
  );
  return matches.length === 1 ? (matches[0]?.trigger_uuid ?? null) : null;
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
    existingTrigger?: CloudflareBuildTrigger;
    kind: CloudflareBuildTriggerKind;
  } & CloudflareApiCallOptions,
): Promise<string> {
  const existingTrigger = args.existingTrigger;
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
    const repositoryMatch = classifyBuildTriggerRepository({
      trigger: existingTrigger,
      expectedRepoId: args.expectedRepoId,
      expectedRepoConnectionUuid: args.repoConnectionUuid,
    });
    if (repositoryMatch === "target") {
      await args.beforeProviderWrite?.();
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
        body: triggerConfig,
      });
      return existingTriggerUuid;
    }
    throw new Error(
      `Cannot update ${triggerName} trigger for Cloudflare Worker ${args.workerTag}: its repository connection is not the target repository.`,
    );
  }

  try {
    await args.beforeProviderWrite?.();
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
    try {
      const currentTriggers = await listBuildTriggers({
        token: args.token,
        accountId: args.accountId,
        workerTag: args.workerTag,
        transport: args.transport,
        recordApiCall: args.recordApiCall,
      });
      const triggerUuid = readExpectedBuildTriggerUuid({
        triggers: currentTriggers,
        kind: args.kind,
        defaultBranch: args.defaultBranch,
        expectedRepoId: args.expectedRepoId,
        expectedRepoConnectionUuid: args.repoConnectionUuid,
        expectedRootDirectory: args.buildConfig.rootDir,
        buildTokenUuid: args.buildTokenUuid,
        buildCommand: args.buildConfig.buildCommand,
        deployCommand:
          args.kind === "production"
            ? args.buildConfig.deployCommand
            : args.buildConfig.previewDeployCommand,
        pathIncludes: args.buildConfig.pathIncludes,
        pathExcludes: args.buildConfig.pathExcludes,
      });
      if (triggerUuid) {
        return triggerUuid;
      }
    } catch {
      // Preserve the original write error when read-only reconciliation also fails.
    }
    throw error;
  }
}

async function setTriggerEnvironmentVariables(
  args: {
    token: string;
    accountId: string;
    triggerUuid: string;
    envVars: CloudflareBuildEnvVars;
  } & CloudflareApiCallOptions,
): Promise<void> {
  await args.beforeProviderWrite?.();
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
      `Cloudflare ${args.triggerKind} Workers Builds trigger ${args.triggerUuid} is missing build environment variable ${missingKeys.join(", ")} after deploy-key rotation.`,
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
    readCommitHash: () => Promise<string>;
  } & CloudflareApiCallOptions,
): Promise<void> {
  const commitHash = await args.readCommitHash();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(commitHash)) {
    throw new Error("GitHub default branch ref did not include a valid commit SHA.");
  }

  await args.beforeProviderWrite?.();
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
export type CloudflareConvexBuildAccessObservation =
  | { state: "not_configured" }
  | { state: "configured"; convexProject: SamebaseConvexProjectReference }
  | { state: "incomplete"; convexProject: SamebaseConvexProjectReference }
  | { state: "target_unknown" }
  | { state: "inconsistent" }
  | { state: "invalid" };
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
  existingBuilds: "preserve_repository" | "require_unconnected";
  buildConfig: CloudflareBuildConfig;
  transport: CloudflareApiTransport;
  recordApiCall?: ProviderApiCallRecorder;
  beforeProviderWrite?: () => void | Promise<void>;
};

type ConfigureCloudflareWorkerBuildsForGitHubArgs = {
  owner: string;
  repo: string;
  ghRepoId: string;
  ghRepoOwnerId: string;
  defaultBranch: string;
  initialBuild: InitialCloudflareWorkersBuild;
  vaultId: string;
  workerName: string;
  workerTag: string;
  existingBuilds: "preserve_repository" | "require_unconnected";
  cloudflareToken: string;
  cloudflareAuthMethod: CloudflareAuthMethod;
  accountId: string;
  buildConfig: CloudflareBuildConfig;
  recordApiCall?: ProviderApiCallRecorder;
  beforeProviderWrite?: () => void | Promise<void>;
};

type RotateConvexDeployKeysForCloudflareWorkerBuildsArgs = {
  defaultBranch: string;
  readInitialBuildCommitHash: () => Promise<string>;
  expectedRepoId: string;
  repositoryFullName: string;
  rootDirectory: string;
  vaultId: string;
  workerName: string;
  workerTag: string;
  cloudflareToken: string;
  cloudflareAuthMethod: CloudflareAuthMethod;
  accountId: string;
  build: {
    production: { triggerUuid: string };
    preview: { triggerUuid: string };
  };
  convex: CloudflareProvisionConvexState;
  convexProject: SamebaseConvexProjectReference;
  recordApiCall?: ProviderApiCallRecorder;
  beforeProviderWrite?: () => void | Promise<void>;
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
      `Cannot configure Workers Builds for Cloudflare Worker ${args.workerTag} and ${args.repositoryFullName}: Cloudflare did not return the existing ${triggerName} trigger. Retry the operation or choose another Worker.`,
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
      `Cannot configure Workers Builds for Cloudflare Worker ${args.workerTag} and ${args.repositoryFullName}: its existing ${triggerName} trigger no longer matches the expected branch filters. Retry the operation or choose another Worker.`,
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

function hasSecretCloudflareBuildEnvironmentVariable(args: {
  envVars: CloudflareBuildEnvVarsResponse;
  key: string;
}): boolean {
  if (!Object.prototype.hasOwnProperty.call(args.envVars, args.key)) {
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

function hasSameCloudflareStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function verifyConvexBuildAccess(args: {
  productionEnvVars: CloudflareBuildEnvVarsResponse;
  previewEnvVars: CloudflareBuildEnvVarsResponse;
}): CloudflareConvexBuildAccessObservation {
  const productionMarker = readSamebaseConvexProjectMarker(args.productionEnvVars);
  const previewMarker = readSamebaseConvexProjectMarker(args.previewEnvVars);
  const productionConvexDeployKeyPresent = hasSecretCloudflareBuildEnvironmentVariable({
    envVars: args.productionEnvVars,
    key: CONVEX_DEPLOY_KEY,
  });
  const productionPreviewConvexDeployKeyPresent = hasSecretCloudflareBuildEnvironmentVariable({
    envVars: args.productionEnvVars,
    key: PREVIEW_CONVEX_DEPLOY_KEY,
  });
  const previewConvexDeployKeyPresent = hasSecretCloudflareBuildEnvironmentVariable({
    envVars: args.previewEnvVars,
    key: CONVEX_DEPLOY_KEY,
  });
  const previewPreviewConvexDeployKeyPresent = hasSecretCloudflareBuildEnvironmentVariable({
    envVars: args.previewEnvVars,
    key: PREVIEW_CONVEX_DEPLOY_KEY,
  });
  const productionDeployKeysPresent =
    productionConvexDeployKeyPresent && productionPreviewConvexDeployKeyPresent;
  const previewDeployKeysPresent =
    previewConvexDeployKeyPresent && previewPreviewConvexDeployKeyPresent;
  if (productionMarker.state === "invalid" || previewMarker.state === "invalid") {
    return { state: "invalid" };
  }
  if (productionMarker.state === "missing" || previewMarker.state === "missing") {
    if (productionMarker.state !== previewMarker.state) {
      return { state: "inconsistent" };
    }
    return productionConvexDeployKeyPresent ||
      productionPreviewConvexDeployKeyPresent ||
      previewConvexDeployKeyPresent ||
      previewPreviewConvexDeployKeyPresent
      ? { state: "target_unknown" }
      : { state: "not_configured" };
  }
  if (
    productionMarker.convexProject.teamId !== previewMarker.convexProject.teamId ||
    productionMarker.convexProject.projectId !== previewMarker.convexProject.projectId
  ) {
    return { state: "inconsistent" };
  }
  return productionDeployKeysPresent && previewDeployKeysPresent
    ? { state: "configured", convexProject: productionMarker.convexProject }
    : { state: "incomplete", convexProject: productionMarker.convexProject };
}

export type CloudflareWorkerBuildsConnection =
  | { state: "not_connected" }
  | {
      state: "connected";
      productionTriggerUuid: string;
      previewTriggerUuid: string;
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

  return {
    repository,
    builds: {
      state: "connected",
      productionTriggerUuid: repository.builds.productionTriggerUuid,
      previewTriggerUuid: repository.builds.previewTriggerUuid,
    },
  };
}

export async function readCloudflareWorkerConvexBuildAccess(
  args: {
    token: string;
    accountId: string;
    productionTriggerUuid: string;
    previewTriggerUuid: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareConvexBuildAccessObservation> {
  const [productionEnvVars, previewEnvVars] = await Promise.all([
    listTriggerEnvironmentVariables({
      token: args.token,
      accountId: args.accountId,
      triggerUuid: args.productionTriggerUuid,
      transport: args.transport,
      recordApiCall: args.recordApiCall,
    }),
    listTriggerEnvironmentVariables({
      token: args.token,
      accountId: args.accountId,
      triggerUuid: args.previewTriggerUuid,
      transport: args.transport,
      recordApiCall: args.recordApiCall,
    }),
  ]);
  return verifyConvexBuildAccess({ productionEnvVars, previewEnvVars });
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
  if (args.existingBuilds === "require_unconnected") {
    const priorTriggers = await listBuildTriggers({
      token: args.cloudflareToken,
      accountId: args.accountId,
      workerTag: args.workerTag,
      transport: args.transport,
      recordApiCall: args.recordApiCall,
    });
    assertCloudflareWorkerHasNoBuildsConnection({
      triggers: priorTriggers,
      workerTag: args.workerTag,
    });
  }

  const repoConnectionUuid = await ensureRepositoryConnection({
    token: args.cloudflareToken,
    accountId: args.accountId,
    ghRepoId: args.ghRepoId,
    ghRepoOwnerId: args.ghRepoOwnerId,
    owner: args.owner,
    repo: args.repo,
    transport: args.transport,
    recordApiCall: args.recordApiCall,
    beforeProviderWrite: args.beforeProviderWrite,
  });

  const existingTriggers = await listBuildTriggers({
    token: args.cloudflareToken,
    accountId: args.accountId,
    workerTag: args.workerTag,
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  });
  if (args.existingBuilds === "require_unconnected") {
    assertCloudflareWorkerHasNoBuildsConnection({
      triggers: existingTriggers,
      workerTag: args.workerTag,
    });
  }

  const existingProductionTrigger = selectBuildTriggerForRepository({
    triggers: existingTriggers,
    kind: "production",
    defaultBranch: args.defaultBranch,
    expectedRepoId: args.ghRepoId,
    expectedRepoConnectionUuid: repoConnectionUuid,
    workerTag: args.workerTag,
  });
  const existingPreviewTrigger = selectBuildTriggerForRepository({
    triggers: existingTriggers,
    kind: "preview",
    defaultBranch: args.defaultBranch,
    expectedRepoId: args.ghRepoId,
    expectedRepoConnectionUuid: repoConnectionUuid,
    workerTag: args.workerTag,
  });

  const buildTokenUuid = await resolveBuildTokenUuid({
    token: args.cloudflareToken,
    accountId: args.accountId,
    existingTriggers,
    authMethod: args.cloudflareAuthMethod,
    transport: args.transport,
    recordApiCall: args.recordApiCall,
    beforeProviderWrite: args.beforeProviderWrite,
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
    existingTrigger: existingProductionTrigger,
    kind: "production",
    transport: args.transport,
    recordApiCall: args.recordApiCall,
    beforeProviderWrite: args.beforeProviderWrite,
  });
  const previewTriggerUuid = await upsertBuildTrigger({
    token: args.cloudflareToken,
    accountId: args.accountId,
    workerTag: args.workerTag,
    repoConnectionUuid,
    expectedRepoId: args.ghRepoId,
    buildTokenUuid,
    buildConfig: args.buildConfig,
    defaultBranch: args.defaultBranch,
    existingTrigger: existingPreviewTrigger,
    kind: "preview",
    transport: args.transport,
    recordApiCall: args.recordApiCall,
    beforeProviderWrite: args.beforeProviderWrite,
  });

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

export async function configureCloudflareWorkerBuildsForGitHub(
  args: ConfigureCloudflareWorkerBuildsForGitHubArgs,
): Promise<CloudflareConnectedWorkersBuilds> {
  console.log("infra:cloudflare:workers_builds:configure_github:start", {
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
      existingBuilds: args.existingBuilds,
      buildConfig: args.buildConfig,
      transport,
      recordApiCall: args.recordApiCall,
      beforeProviderWrite: args.beforeProviderWrite,
    });

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
      vaultId: args.vaultId,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      initialBuildTriggered: args.initialBuild.state === "requested",
    });

    return build;
  } catch (error) {
    console.error("infra:cloudflare:workers_builds:configure_github:failed", {
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

export async function rotateConvexDeployKeysForCloudflareWorkerBuilds(
  args: RotateConvexDeployKeysForCloudflareWorkerBuildsArgs,
): Promise<void> {
  console.log("infra:cloudflare:convex_deploy_keys:rotate_for_workers_builds:start", {
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
      convexProject: args.convexProject,
    });
    await Promise.all([
      setTriggerEnvironmentVariables({
        token: args.cloudflareToken,
        accountId: args.accountId,
        triggerUuid: args.build.production.triggerUuid,
        envVars: convexEnvVars,
        transport,
        recordApiCall: args.recordApiCall,
        beforeProviderWrite: args.beforeProviderWrite,
      }),
      setTriggerEnvironmentVariables({
        token: args.cloudflareToken,
        accountId: args.accountId,
        triggerUuid: args.build.preview.triggerUuid,
        envVars: convexEnvVars,
        transport,
        recordApiCall: args.recordApiCall,
        beforeProviderWrite: args.beforeProviderWrite,
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
      readCommitHash: args.readInitialBuildCommitHash,
      transport,
      recordApiCall: args.recordApiCall,
      beforeProviderWrite: args.beforeProviderWrite,
    });

    console.log("infra:cloudflare:convex_deploy_keys:rotate_for_workers_builds:success", {
      vaultId: args.vaultId,
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
    });
  } catch (error) {
    console.error("infra:cloudflare:convex_deploy_keys:rotate_for_workers_builds:failed", {
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

export async function readCloudflareWorkerBuildsPage(args: {
  token: string;
  transport: CloudflareApiTransport;
  accountId: string;
  workerTag: string;
  page: number;
  perPage: number;
}): Promise<CloudflareWorkerBuild[]> {
  const builds = await requestCloudflareApi({
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

  return requireCloudflareResult(
    builds,
    `Cloudflare Workers Builds did not return builds for Worker ${args.workerTag}.`,
  );
}

const RECENT_CLOUDFLARE_WORKER_BUILD_PAGE_SIZE = 100;
const RECENT_CLOUDFLARE_WORKER_BUILD_MAX_PAGES = 2;

export async function readRecentCloudflareWorkerBuilds(args: {
  token: string;
  transport: CloudflareApiTransport;
  accountId: string;
  workerTag: string;
}): Promise<{ builds: CloudflareWorkerBuild[]; exhausted: boolean }> {
  const builds: CloudflareWorkerBuild[] = [];
  for (let page = 1; page <= RECENT_CLOUDFLARE_WORKER_BUILD_MAX_PAGES; page += 1) {
    const pageBuilds = await readCloudflareWorkerBuildsPage({
      ...args,
      page,
      perPage: RECENT_CLOUDFLARE_WORKER_BUILD_PAGE_SIZE,
    });
    builds.push(...pageBuilds);
    if (pageBuilds.length < RECENT_CLOUDFLARE_WORKER_BUILD_PAGE_SIZE) {
      return { builds, exhausted: true };
    }
  }
  return { builds, exhausted: false };
}

export async function readCloudflareWorkerVersionsPage(args: {
  token: string;
  transport: CloudflareApiTransport;
  accountId: string;
  workerName: string;
  page: number;
  perPage: number;
}): Promise<CloudflareWorkerVersion[]> {
  const versions = await requestCloudflareApi({
    token: args.token,
    transport: args.transport,
    method: "GET",
    path: "/accounts/{account_id}/workers/workers/{worker_id}/versions",
    params: {
      path: {
        account_id: args.accountId,
        worker_id: args.workerName,
      },
      query: {
        page: args.page,
        per_page: args.perPage,
      },
    },
  });

  return requireCloudflareResult(
    versions,
    `Cloudflare did not return versions for Worker ${args.workerName}.`,
  );
}

type DeleteCloudflareResourcesArgs = {
  accountId: string;
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
        worker_id: args.workerTag,
      },
    },
  });
}
