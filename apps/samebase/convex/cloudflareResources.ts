import { notEmpty } from "@samebase/dependent/main";
import { bad, good } from "@samebase/sure";
import { z } from "zod";

import { readUrlSearchParamsRecord } from "../shared/urlSearchParams";
import { normalizeCloudflareWorkerPreviewUrl } from "../shared/cloudflareResourceUrls";
import { WORKER_PREVIEWS_MIGRATION_REQUIRED_MESSAGE } from "../shared/cloudflareWorkerPreviews";
import {
  createCloudflareClient,
  CloudflareApiError,
  CloudflareApiResponseError,
  type CloudflareApiRequestResult,
  type CloudflareApiTransport,
} from "./cloudflareApi/client";
import { Cloudflare } from "./cloudflareApi/generated/sdk.gen";
import type {
  BuildsBuildResponse,
  BuildsEnvironmentVariablesResponse,
  BuildsPreviewSummary,
  BuildsWorkerResponse,
  WorkersWorker,
} from "./cloudflareApi/generated/types.gen";
import type { ProviderApiCallRecorder } from "./providerApiLog";

export {
  CloudflareApiError,
  isCloudflareMcpInvalidAccessTokenError,
  isWorkersBuildsInvalidTokenMessage,
} from "./cloudflareApi/client";

type CloudflareWorker = WorkersWorker;
type CloudflareWorkerTagSource = {
  id?: string;
  external_script_id?: string;
  tag?: string;
  name?: string;
};
export type CloudflareWorkerBuild = BuildsBuildResponse;
type CloudflareBuildEnvVarsResponse = BuildsEnvironmentVariablesResponse;
type CloudflareWorkerBuildSettings = BuildsWorkerResponse;
type CloudflareApiCallOptions = {
  transport: CloudflareApiTransport;
  recordApiCall?: ProviderApiCallRecorder;
};

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

function requireCloudflareResult<T>(value: T | undefined, message: string): T {
  if (value !== undefined) {
    return value;
  }
  throw new Error(message);
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

function parseSamebaseConvexProjectMarker(value: string): SamebaseConvexProjectReference | null {
  const marker = samebaseConvexProjectMarkerSchema.safeParse(readUrlSearchParamsRecord(value));
  if (!marker.success) {
    return null;
  }

  const { teamId, projectId } = marker.data;
  return { teamId, projectId };
}

type CloudflareWorkerDetails = {
  customDomains: string[];
  workersDev:
    | { state: "enabled"; url: string }
    | { state: "disabled" }
    | { state: "failed"; reason: "response_validation_failed" };
  workerName: string;
  workerTag: string;
};

type CloudflareWorkerBuildSettingsStatus =
  | { state: "available" }
  | { state: "legacy_previews" }
  | { state: "not_available" }
  | { state: "ambiguous" };

type CloudflareWorkerRepositoryDiscovery =
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
  };
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

export type CloudflareConvexBuildAccessObservation =
  | { state: "not_configured" }
  | { state: "configured"; convexProject: SamebaseConvexProjectReference }
  | { state: "incomplete"; convexProject: SamebaseConvexProjectReference }
  | { state: "target_unknown" }
  | { state: "invalid" };
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
