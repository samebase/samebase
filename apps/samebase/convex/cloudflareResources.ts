import { notEmpty } from "@samebase/dependent/main";
import { bad, good } from "@samebase/sure";
import { ConvexError } from "convex/values";
import { z } from "zod";

import { createUrlSearchParams, readUrlSearchParamsRecord } from "../shared/urlSearchParams";
import { AppResourceNameConflictError } from "../shared/appResourceNames";
import { normalizeCloudflareWorkerPreviewUrl } from "../shared/cloudflareResourceUrls";
import { WORKER_PREVIEWS_MIGRATION_REQUIRED_MESSAGE } from "../shared/cloudflareWorkerPreviews";
import {
  createCloudflareClient,
  CloudflareApiError,
  CloudflareApiResponseError,
  resolveCloudflareApiTransport,
  type CloudflareApiRequestResult,
  type CloudflareApiTransport,
} from "./cloudflareApi/client";
import { Cloudflare } from "./cloudflareApi/generated/sdk.gen";
import type {
  BuildsBuildResponse,
  BuildsEnvironmentVariablesRequest,
  BuildsEnvironmentVariablesResponse,
  BuildsListTokensResponse,
  BuildsPreviewSummary,
  BuildsTriggerResponse,
  BuildsWorkerResponse,
  WorkersWorker,
  WorkersWorkerWritable,
} from "./cloudflareApi/generated/types.gen";
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

type CloudflareWorker = WorkersWorker;
type CloudflareWorkerCreateBody = WorkersWorkerWritable;
type CloudflareWorkerTagSource = {
  id?: string;
  external_script_id?: string;
  tag?: string;
  name?: string;
};
type CloudflareBuildTokenRecord = BuildsListTokensResponse;
export type CloudflareBuildTrigger = BuildsTriggerResponse;
export type CloudflareWorkerBuild = BuildsBuildResponse;
type CloudflareBuildEnvVars = BuildsEnvironmentVariablesRequest;
type CloudflareBuildEnvVarsResponse = BuildsEnvironmentVariablesResponse;
type CloudflareWorkerBuildSettings = BuildsWorkerResponse;
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

export function buildCloudflareWorkersEnvVars(vars: {
  productionConvexDeployKey: string;
  previewConvexDeployKey: string;
  convexProject: SamebaseConvexProjectReference;
}): { production: CloudflareBuildEnvVars; preview: CloudflareBuildEnvVars } {
  return {
    production: {
      [CONVEX_DEPLOY_KEY]: { value: vars.productionConvexDeployKey, is_secret: true },
      [SAMEBASE_CONVEX_PROJECT]: {
        value: buildSamebaseConvexProjectMarker(vars.convexProject),
        is_secret: false,
      },
    },
    preview: {
      [CONVEX_DEPLOY_KEY]: { value: vars.previewConvexDeployKey, is_secret: true },
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
  workersDev:
    | { state: "enabled"; url: string }
    | { state: "disabled" }
    | { state: "failed"; reason: "response_validation_failed" };
  workerName: string;
  workerTag: string;
  /**
  When Cloudflare created the Worker, in milliseconds. The response validation accepts only an ISO
  date-time `created_on`, so a Worker read without one fails.
  */
  createdAt: number;
};

export type CloudflareWorkerInventoryItem = {
  workerName: string;
  workerTag: string;
};

export type CloudflareWorkerInventory = {
  state: "complete" | "partial";
  workers: CloudflareWorkerInventoryItem[];
};

export type CloudflareWorkerBuildSettingsStatus =
  | { state: "available" }
  | { state: "legacy_previews" }
  | { state: "not_available" }
  | { state: "ambiguous" };

export type CloudflareWorkerRepositoryDiscovery =
  | {
      state: "ready";
      rootDirectory: string;
      builds: CloudflareWorkerBuildSettingsStatus;
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

async function readWorker(
  args: {
    token: string;
    accountId: string;
    workerIdentifier: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorker | null> {
  try {
    const { result: raw } = await Cloudflare.GET[
      "/accounts/{account_id}/workers/workers/{worker_id}"
    ]({
      client: createCloudflareClient({
        token: args.token,
        transport: args.transport,
        recordApiCall: args.recordApiCall,
      }),
      path: {
        account_id: args.accountId,
        worker_id: args.workerIdentifier,
      },
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
    createdAt: Date.parse(worker.created_on),
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
  const { result: workers } = await Cloudflare.GET["/accounts/{account_id}/workers/scripts"]({
    client: createCloudflareClient({
      token: args.token,
      transport: args.transport,
      recordApiCall: args.recordApiCall,
    }),
    path: {
      account_id: args.accountId,
    },
  });
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
      const { result } = await Cloudflare.GET["/accounts/{account_id}/workers/workers"]({
        client: createCloudflareClient({
          token: args.token,
          transport: args.transport,
          recordApiCall: args.recordApiCall,
        }),
        path: { account_id: args.accountId },
        query: { page, per_page: pageSize, order_by: "name", order: "asc" },
      });
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

export function classifyCloudflareWorkerRepositoryDiscovery(args: {
  settings: CloudflareWorkerBuildSettings | null;
  expectedRepoId: string;
  defaultBranch: string;
}): CloudflareWorkerRepositoryDiscovery {
  const settings = args.settings;
  if (!settings?.git_repository) {
    return { state: "not_connected" };
  }
  const repository = settings.git_repository;
  if (!repository.repo_id) {
    return { state: "ambiguous", reason: "missing_repo_id" };
  }
  if (!repository.provider_type) {
    return { state: "ambiguous", reason: "missing_provider_type" };
  }
  if (repository.provider_type !== "github" || repository.repo_id !== args.expectedRepoId) {
    return { state: "connected_elsewhere" };
  }
  const rootDirectory = normalizeCloudflareBuildRoot(settings.production_settings?.root_directory);
  if (!rootDirectory) {
    return { state: "ambiguous", reason: "missing_root_directory" };
  }
  const previewRoot = normalizeCloudflareBuildRoot(settings.previews_base_config?.root_directory);
  if (previewRoot && previewRoot !== rootDirectory) {
    return { state: "ambiguous", reason: "multiple_root_directories" };
  }
  return {
    state: "ready",
    rootDirectory,
    builds:
      settings.previews_enabled === false
        ? { state: "legacy_previews" }
        : settings.previews_enabled &&
            settings.previews_base_config &&
            repository.branch === args.defaultBranch
          ? { state: "available" }
          : { state: "not_available" },
  };
}

async function readCloudflareWorkerBuildSettings(
  args: {
    token: string;
    accountId: string;
    workerTag: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerBuildSettings | null> {
  try {
    const { result: raw } = await Cloudflare.GET[
      "/accounts/{account_id}/builds/workers/{script_tag}"
    ]({
      client: createCloudflareClient({
        token: args.token,
        transport: args.transport,
        recordApiCall: args.recordApiCall,
      }),
      path: { account_id: args.accountId, script_tag: args.workerTag },
    });
    return raw ?? null;
  } catch (error) {
    if (
      error instanceof CloudflareApiError &&
      error.details.some((detail) => detail.code === "12040")
    ) {
      return null;
    }
    throw error;
  }
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
    const settings = await readCloudflareWorkerBuildSettings({
      token: args.token,
      transport: args.transport,
      accountId: args.accountId,
      workerTag: args.worker.workerTag,
      recordApiCall: args.recordApiCall,
    });
    return {
      ...args.worker,
      repository: classifyCloudflareWorkerRepositoryDiscovery({
        settings,
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
    workerTag: string;
    expectedRepoId: string;
    defaultBranch: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareWorkerRepositoryDiscovery> {
  const settings = await readCloudflareWorkerBuildSettings({
    token: args.token,
    transport: args.transport,
    accountId: args.accountId,
    workerTag: args.workerTag,
    recordApiCall: args.recordApiCall,
  });
  return classifyCloudflareWorkerRepositoryDiscovery({
    settings,
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
  workers: CloudflareWorkerDiscoveryItem[];
}> {
  const inventory = await listCloudflareWorkerInventory(args);
  const discoveredWorkers: CloudflareWorkerDiscoveryItem[] = [];
  const chunkSize = 10;
  for (let start = 0; start < inventory.workers.length; start += chunkSize) {
    const chunk = inventory.workers.slice(start, start + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(
        async (worker) =>
          await readCloudflareWorkerDiscoveryForInventoryItem({
            token: args.token,
            transport: args.transport,
            accountId: args.accountId,
            worker,
            expectedRepoId: args.expectedRepoId,
            defaultBranch: args.defaultBranch,
            recordApiCall: args.recordApiCall,
          }),
      ),
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
  const { result: createdRaw } = await Cloudflare.POST["/accounts/{account_id}/workers/workers"]({
    client: createCloudflareClient({ token: args.token, transport: args.transport }),
    path: {
      account_id: args.accountId,
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
    const { result: rawTokens } = await Cloudflare.GET["/accounts/{account_id}/builds/tokens"]({
      client: createCloudflareClient({
        token: args.token,
        transport: args.transport,
        recordApiCall: args.recordApiCall,
      }),
      path: {
        account_id: args.accountId,
      },
      query: {
        page,
        per_page: BUILD_TOKEN_PAGE_SIZE,
      },
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

async function listBuildTriggers(
  args: {
    token: string;
    accountId: string;
    workerTag: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareBuildTrigger[]> {
  const { result: raw } = await Cloudflare.GET[
    "/accounts/{account_id}/builds/workers/{external_script_id}/triggers"
  ]({
    client: createCloudflareClient({
      token: args.token,
      transport: args.transport,
      recordApiCall: args.recordApiCall,
    }),
    path: { account_id: args.accountId, external_script_id: args.workerTag },
  });
  return requireCloudflareResult(raw, "Cloudflare did not return Workers Builds triggers.");
}

function assertBuildEnvironmentVariables(args: {
  settingsKind: "production" | "preview";
  envVars: CloudflareBuildEnvVarsResponse;
  expected: CloudflareBuildEnvVars;
}): void {
  for (const [key, expected] of Object.entries(args.expected)) {
    const actual = args.envVars[key];
    if (
      !Object.prototype.hasOwnProperty.call(args.envVars, key) ||
      actual.is_secret !== expected.is_secret
    ) {
      throw new Error(
        `Cloudflare ${args.settingsKind} Builds settings are missing the expected ${key} variable after deploy-key rotation.`,
      );
    }
    if (!expected.is_secret && actual.value !== expected.value) {
      throw new Error(
        `Cloudflare ${args.settingsKind} Builds settings have an unexpected value for ${key}.`,
      );
    }
  }
}

async function triggerInitialBuild(
  args: {
    token: string;
    accountId: string;
    workerTag: string;
    expectedRepoId: string;
    rootDirectory: string;
    branch: string;
    readCommitHash: () => Promise<string>;
  } & CloudflareApiCallOptions,
): Promise<void> {
  const commitHash = await args.readCommitHash();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(commitHash)) {
    throw new Error("Initial Workers build did not receive a full commit SHA.");
  }

  const triggers = await listBuildTriggers(args);
  const productionTriggers = triggers.filter(
    (trigger) =>
      !trigger.deleted_on &&
      trigger.repo_connection?.provider_type === "github" &&
      trigger.repo_connection.repo_id === args.expectedRepoId &&
      !trigger.repo_connection.deleted_on &&
      normalizeCloudflareBuildRoot(trigger.root_directory) ===
        normalizeCloudflareBuildRoot(args.rootDirectory) &&
      trigger.branch_includes?.length === 1 &&
      trigger.branch_includes[0] === args.branch &&
      (trigger.branch_excludes?.length ?? 0) === 0,
  );
  const triggerUuid = productionTriggers.length === 1 ? productionTriggers[0]?.trigger_uuid : null;
  if (!triggerUuid) {
    throw new Error(
      "Cloudflare did not return one production Builds trigger for this repository and root.",
    );
  }
  await args.beforeProviderWrite?.();
  await Cloudflare.POST["/accounts/{account_id}/builds/triggers/{trigger_uuid}/builds"]({
    client: createCloudflareClient({
      token: args.token,
      transport: args.transport,
      recordApiCall: args.recordApiCall,
    }),
    path: {
      account_id: args.accountId,
      trigger_uuid: triggerUuid,
    },
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
  existingBuilds: "preserve_repository" | "require_unconnected" | "initialize_created_worker";
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
  existingBuilds: "preserve_repository" | "require_unconnected" | "initialize_created_worker";
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
  convex: CloudflareProvisionConvexState;
  convexProject: SamebaseConvexProjectReference;
  recordApiCall?: ProviderApiCallRecorder;
  beforeProviderWrite?: () => void | Promise<void>;
};

function assertWorkerBuildSettingsTarget(args: {
  settings: CloudflareWorkerBuildSettings | null;
  expectedRepoId: string;
  defaultBranch: string;
  rootDirectory: string;
}): CloudflareWorkerBuildSettings {
  const discovery = classifyCloudflareWorkerRepositoryDiscovery({
    settings: args.settings,
    expectedRepoId: args.expectedRepoId,
    defaultBranch: args.defaultBranch,
  });
  if (discovery.state === "ready" && discovery.builds.state === "legacy_previews") {
    throw new Error(WORKER_PREVIEWS_MIGRATION_REQUIRED_MESSAGE);
  }
  if (
    !args.settings ||
    discovery.state !== "ready" ||
    discovery.builds.state !== "available" ||
    discovery.rootDirectory !==
      requireNormalizedCloudflareBuildRoot(args.rootDirectory, "Expected Workers Builds root")
  ) {
    throw new Error(
      "Cloudflare native Builds settings no longer match this repository, production branch, and root directory.",
    );
  }
  return args.settings;
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

function verifyConvexBuildAccess(args: {
  productionEnvVars: CloudflareBuildEnvVarsResponse;
  previewEnvVars: CloudflareBuildEnvVarsResponse;
}): CloudflareConvexBuildAccessObservation {
  const marker = readSamebaseConvexProjectMarker(args.productionEnvVars);
  const productionKey = hasSecretCloudflareBuildEnvironmentVariable({
    envVars: args.productionEnvVars,
    key: CONVEX_DEPLOY_KEY,
  });
  const previewKey = hasSecretCloudflareBuildEnvironmentVariable({
    envVars: args.previewEnvVars,
    key: CONVEX_DEPLOY_KEY,
  });
  if (marker.state === "invalid") {
    return { state: "invalid" };
  }
  if (marker.state === "missing") {
    return productionKey || previewKey ? { state: "target_unknown" } : { state: "not_configured" };
  }
  return productionKey && previewKey
    ? { state: "configured", convexProject: marker.convexProject }
    : { state: "incomplete", convexProject: marker.convexProject };
}

export type CloudflareWorkerBuildsConnection =
  | { state: "not_connected" }
  | {
      state: "connected";
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
  const settings = await readCloudflareWorkerBuildSettings(args);
  const repository = classifyCloudflareWorkerRepositoryDiscovery({
    settings,
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
      productionBuildTokenUuid: settings?.production_settings?.build_token_uuid ?? null,
      previewBuildTokenUuid: settings?.previews_base_config?.build_token_uuid ?? null,
    },
  };
}

export async function readCloudflareWorkerBranchPreviewUrls(
  args: {
    token: string;
    accountId: string;
    workerTag: string;
    workerName: string;
    expectedRepoId: string;
    defaultBranch: string;
    rootDirectory: string;
    branches: readonly string[];
  } & CloudflareApiCallOptions,
): Promise<Map<string, string>> {
  assertWorkerBuildSettingsTarget({
    settings: await readCloudflareWorkerBuildSettings(args),
    expectedRepoId: args.expectedRepoId,
    defaultBranch: args.defaultBranch,
    rootDirectory: args.rootDirectory,
  });
  const previews: BuildsPreviewSummary[] = [];
  const seenIds = new Set<string>();
  for (let page = 1; ; page += 1) {
    const previewPage = requireCloudflareResult(
      (
        await Cloudflare.GET["/accounts/{account_id}/builds/workers/{script_tag}/previews"]({
          client: createCloudflareClient({
            token: args.token,
            transport: args.transport,
            recordApiCall: args.recordApiCall,
          }),
          path: { account_id: args.accountId, script_tag: args.workerTag },
          query: { page, per_page: 100 },
        })
      ).result,
      "Cloudflare did not return Worker Previews.",
    );
    for (const preview of previewPage) {
      if (!preview.preview_id || seenIds.has(preview.preview_id)) {
        throw new Error("Cloudflare Worker Preview pagination omitted or repeated a Preview ID.");
      }
      seenIds.add(preview.preview_id);
      previews.push(preview);
    }
    if (previewPage.length < 100) break;
  }
  const urls = await Promise.all(
    [...new Set(args.branches)].map(async (branch) => {
      const matches = previews.filter((preview) => preview.branch === branch);
      const previewId = matches.length === 1 ? matches[0]?.preview_id : undefined;
      if (!previewId) return null;
      const preview = requireCloudflareResult(
        (
          await Cloudflare.GET[
            "/accounts/{account_id}/workers/workers/{worker_id}/previews/{preview_id}"
          ]({
            client: createCloudflareClient({
              token: args.token,
              transport: args.transport,
              recordApiCall: args.recordApiCall,
            }),
            path: { account_id: args.accountId, worker_id: args.workerTag, preview_id: previewId },
          })
        ).result,
        "Cloudflare did not return the Worker Preview.",
      );
      if (preview.id !== previewId || preview.urls.length !== 1) return null;
      const normalized = normalizeCloudflareWorkerPreviewUrl(preview.urls[0], args.workerName);
      return normalized ? ([branch, normalized.url] as const) : null;
    }),
  );
  return new Map(urls.filter(notEmpty));
}

export async function readCloudflareWorkerConvexBuildAccess(
  args: {
    token: string;
    accountId: string;
    workerTag: string;
  } & CloudflareApiCallOptions,
): Promise<CloudflareConvexBuildAccessObservation> {
  const settings = await readCloudflareWorkerBuildSettings(args);
  return verifyConvexBuildAccess({
    productionEnvVars: settings?.production_settings?.environment_variables ?? {},
    previewEnvVars: settings?.previews_base_config?.environment_variables ?? {},
  });
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
  const settingsArgs = {
    token: args.cloudflareToken,
    accountId: args.accountId,
    workerTag: args.workerTag,
    transport: args.transport,
    recordApiCall: args.recordApiCall,
  };
  const existing = await readCloudflareWorkerBuildSettings(settingsArgs);
  const discovery = classifyCloudflareWorkerRepositoryDiscovery({
    settings: existing,
    expectedRepoId: args.githubRepositoryDatabaseId,
    defaultBranch: args.defaultBranch,
  });
  if (args.existingBuilds === "require_unconnected" && discovery.state !== "not_connected") {
    throw new Error(
      "This Cloudflare Worker already has a Builds connection. Scan the account again.",
    );
  }
  if (discovery.state !== "not_connected" && discovery.state !== "ready") {
    throw new Error(
      "Cloudflare Builds is connected to another repository or has incomplete repository identity.",
    );
  }
  if (
    discovery.state === "ready" &&
    !existing?.previews_enabled &&
    args.existingBuilds !== "initialize_created_worker"
  ) {
    throw new Error(WORKER_PREVIEWS_MIGRATION_REQUIRED_MESSAGE);
  }
  const common = {
    build_token_uuid: buildTokenUuid,
    build_command: args.buildConfig.buildCommand,
    root_directory: args.buildConfig.rootDir,
    path_includes: args.buildConfig.pathIncludes,
    path_excludes: args.buildConfig.pathExcludes,
  };
  const productionSettings = { ...common, deploy_command: args.buildConfig.deployCommand };
  const previewSettings = { ...common, deploy_command: args.buildConfig.previewDeployCommand };

  try {
    let configured = existing;
    if (discovery.state === "not_connected") {
      await args.beforeProviderWrite?.();
      configured = requireCloudflareResult(
        (
          await Cloudflare.POST["/accounts/{account_id}/builds/workers"]({
            client: createCloudflareClient({
              token: args.cloudflareToken,
              transport: args.transport,
              recordApiCall: args.recordApiCall,
            }),
            path: { account_id: args.accountId },
            body: {
              script_tag: args.workerTag,
              git_repository: {
                branch: args.defaultBranch,
                provider_type: "github",
                provider_account_id: args.ghRepoOwnerId,
                provider_account_name: args.owner,
                repo_id: args.githubRepositoryDatabaseId,
                repo_name: args.repo,
              },
              production_settings: { ...productionSettings, build_caching_enabled: true },
              previews_base_config: { ...previewSettings, build_caching_enabled: true },
              previews_enabled: true,
            },
          })
        ).result,
        "Cloudflare did not return the created Builds configuration.",
      );
    }
    if (!configured?.previews_enabled) {
      const createdDiscovery = classifyCloudflareWorkerRepositoryDiscovery({
        settings: configured,
        expectedRepoId: args.githubRepositoryDatabaseId,
        defaultBranch: args.defaultBranch,
      });
      if (
        createdDiscovery.state !== "ready" ||
        createdDiscovery.rootDirectory !== normalizeCloudflareBuildRoot(args.buildConfig.rootDir) ||
        configured?.git_repository?.branch !== args.defaultBranch
      ) {
        throw new Error("Cloudflare created Builds settings for an unexpected repository or root.");
      }
      // The create endpoint can return legacy triggers even when the request enables previews.
      await args.beforeProviderWrite?.();
      await Cloudflare.POST[
        "/accounts/{account_id}/builds/workers/{script_tag}/migrate_to_previews"
      ]({
        client: createCloudflareClient({
          token: args.cloudflareToken,
          transport: args.transport,
          recordApiCall: args.recordApiCall,
        }),
        path: { account_id: args.accountId, script_tag: args.workerTag },
        body: { deploy_command: args.buildConfig.previewDeployCommand },
      });
    }
    if (discovery.state === "ready") {
      await args.beforeProviderWrite?.();
      await Cloudflare.PATCH["/accounts/{account_id}/builds/workers/{script_tag}"]({
        client: createCloudflareClient({
          token: args.cloudflareToken,
          transport: args.transport,
          recordApiCall: args.recordApiCall,
        }),
        path: { account_id: args.accountId, script_tag: args.workerTag },
        query: { patch_existing_previews: "true" },
        body: {
          git_repository: { branch: args.defaultBranch },
          production_settings: productionSettings,
          previews_base_config: previewSettings,
          previews_enabled: true,
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
  const verified = assertWorkerBuildSettingsTarget({
    settings: await readCloudflareWorkerBuildSettings(settingsArgs),
    expectedRepoId: args.githubRepositoryDatabaseId,
    defaultBranch: args.defaultBranch,
    rootDirectory: args.buildConfig.rootDir,
  });
  if (
    verified.production_settings?.build_token_uuid !== buildTokenUuid ||
    verified.previews_base_config?.build_token_uuid !== buildTokenUuid ||
    verified.production_settings.build_command !== args.buildConfig.buildCommand ||
    verified.previews_base_config.build_command !== args.buildConfig.buildCommand ||
    verified.production_settings.deploy_command !== args.buildConfig.deployCommand ||
    verified.previews_base_config.deploy_command !== args.buildConfig.previewDeployCommand
  ) {
    throw new Error("Cloudflare Builds did not save the selected token and commands.");
  }
  return {
    state: "connected",
    rootDirectory: args.buildConfig.rootDir,
    buildCommand: args.buildConfig.buildCommand,
    deployCommand: args.buildConfig.deployCommand,
    previewDeployCommand: args.buildConfig.previewDeployCommand,
    pathIncludes: args.buildConfig.pathIncludes,
    pathExcludes: args.buildConfig.pathExcludes,
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
        workerTag: args.workerTag,
        expectedRepoId: args.githubRepositoryDatabaseId,
        rootDirectory: args.buildConfig.rootDir,
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
  const transport = resolveCloudflareApiTransport(args.cloudflareAuthMethod);
  const settingsArgs = {
    token: args.cloudflareToken,
    accountId: args.accountId,
    workerTag: args.workerTag,
    transport,
    recordApiCall: args.recordApiCall,
  };
  assertWorkerBuildSettingsTarget({
    settings: await readCloudflareWorkerBuildSettings(settingsArgs),
    expectedRepoId: args.expectedRepoId,
    defaultBranch: args.defaultBranch,
    rootDirectory: args.rootDirectory,
  });
  const envVars = buildCloudflareWorkersEnvVars({
    productionConvexDeployKey: args.convex.production.deployKey,
    previewConvexDeployKey: args.convex.preview.deployKey,
    convexProject: args.convexProject,
  });

  await args.beforeProviderWrite?.();
  await Cloudflare.PATCH["/accounts/{account_id}/builds/workers/{script_tag}"]({
    client: createCloudflareClient({
      token: args.cloudflareToken,
      transport,
      recordApiCall: args.recordApiCall,
    }),
    path: { account_id: args.accountId, script_tag: args.workerTag },
    query: { patch_existing_previews: "true" },
    body: {
      production_settings: { environment_variables: envVars.production },
      previews_base_config: { environment_variables: envVars.preview },
    },
  });
  const verified = assertWorkerBuildSettingsTarget({
    settings: await readCloudflareWorkerBuildSettings(settingsArgs),
    expectedRepoId: args.expectedRepoId,
    defaultBranch: args.defaultBranch,
    rootDirectory: args.rootDirectory,
  });
  assertBuildEnvironmentVariables({
    settingsKind: "production",
    envVars: verified.production_settings?.environment_variables ?? {},
    expected: envVars.production,
  });
  assertBuildEnvironmentVariables({
    settingsKind: "preview",
    envVars: verified.previews_base_config?.environment_variables ?? {},
    expected: envVars.preview,
  });
  await triggerInitialBuild({
    token: args.cloudflareToken,
    accountId: args.accountId,
    workerTag: args.workerTag,
    expectedRepoId: args.expectedRepoId,
    rootDirectory: args.rootDirectory,
    branch: args.defaultBranch,
    readCommitHash: args.readInitialBuildCommitHash,
    transport,
    recordApiCall: args.recordApiCall,
    beforeProviderWrite: args.beforeProviderWrite,
  });
}

export async function readCloudflareWorkerBuildsPage(args: {
  token: string;
  transport: CloudflareApiTransport;
  accountId: string;
  workerTag: string;
  page: number;
  perPage: number;
}): Promise<CloudflareApiRequestResult<CloudflareWorkerBuild[]>> {
  try {
    const { result: builds } = await Cloudflare.GET[
      "/accounts/{account_id}/builds/workers/{external_script_id}/builds"
    ]({
      client: createCloudflareClient({ token: args.token, transport: args.transport }),
      path: {
        account_id: args.accountId,
        external_script_id: args.workerTag,
      },
      query: {
        page: args.page,
        per_page: args.perPage,
      },
    });
    return good(
      requireCloudflareResult(
        builds,
        `Cloudflare Workers Builds did not return builds for Worker ${args.workerTag}.`,
      ),
    );
  } catch (error) {
    if (error instanceof CloudflareApiResponseError) {
      return bad(error.failure);
    }
    throw error;
  }
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

async function deleteCloudflareBuildTrigger(args: {
  accountId: string;
  triggerUuid: string;
  cloudflareToken: string;
  transport: CloudflareApiTransport;
}): Promise<void> {
  try {
    await Cloudflare.DELETE["/accounts/{account_id}/builds/triggers/{trigger_uuid}"]({
      client: createCloudflareClient({ token: args.cloudflareToken, transport: args.transport }),
      path: {
        account_id: args.accountId,
        trigger_uuid: args.triggerUuid,
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
  await Cloudflare.DELETE["/accounts/{account_id}/workers/workers/{worker_id}"]({
    client: createCloudflareClient({ token: args.cloudflareToken, transport: args.transport }),
    path: {
      account_id: args.accountId,
      worker_id: args.workerTag,
    },
  });
}
