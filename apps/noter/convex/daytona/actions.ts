"use node";

import {
  Configuration as DaytonaApiConfiguration,
  CreateDockerRegistryRegistryTypeEnum,
  DockerRegistryApi,
  type DockerRegistry,
} from "@daytonaio/api-client";
import {
  CreateSandboxFromSnapshotParams,
  Daytona,
  Image,
  type Resources,
  type Sandbox,
} from "@daytonaio/sdk";
import { Infer, v } from "convex/values";
import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { action, internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { getUserId } from "../common";
import { getDaytonaEnvLabel } from "./env";
import {
  DEFAULT_BASE_IMAGE,
  DAYTONA_CODEX_CLI_VERSION,
  DAYTONA_PNPM_VERSION,
  DAYTONA_RUNTIME_APT_PACKAGE_LIST,
  DAYTONA_RUNTIME_AUTH_FALLBACK_DOCKERFILE_COMMANDS,
  DAYTONA_RUNTIME_PREBUILD_DOCKERFILE_COMMANDS,
} from "./runtime.generated";
import { DAYTONA_ENSURE_REPO_AUTO_CD_PROGRAM_SOURCE } from "./sandboxPrograms.generated";
import {
  canonicalizeCommitPinnedDaytonaBranch,
  DAYTONA_COMMIT_PINNED_BRANCH,
  DAYTONA_SNAPSHOT_RETENTION_COUNT,
  calculateSnapshotRetryDelayMs,
  inferCommitPinnedSnapshotName,
  inferCommitPinnedSnapshotPrefix,
  inferDaytonaWorkspaceSandboxName,
  isCommitPinnedDaytonaBranch,
  shortenCommitSha,
} from "./snapshotPolicy";
import {
  decideExistingDaytonaTmuxLaunch,
  describeDaytonaDevServerLaunchStatus,
  type DaytonaDevServerLaunchStatus,
  type DaytonaTmuxSessionState,
} from "./devServerLaunchPolicy";
import { toSafeRepoName } from "../repoName";
import type { Id } from "../_generated/dataModel";

const { object, id, string, optional, boolean, union, literal, number, array } =
  v;
const DEFAULT_WORKSPACE_DIR = "/home/daytona/workspace";
const DAYTONA_API_URL_ENV = "DAYTONA_API_URL";
const DAYTONA_API_TOKEN_ENV = "DAYTONA_API_TOKEN";
const DAYTONA_API_KEY_ENV = "DAYTONA_API_KEY";
const DAYTONA_DEPS_IMAGE_TEMPLATE_ENV = "DAYTONA_DEPS_IMAGE_TEMPLATE";
const DAYTONA_BASE_IMAGE_ENV = "DAYTONA_BASE_IMAGE";
const PNPM_LOCKFILE_NAME = "pnpm-lock.yaml";
const DAYTONA_DEPS_HASH_INPUT_FILES = [
  "Dockerfile.daytona-deps",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "apps/noter/package.json",
  "apps/noter-starter-template/package.json",
];
const PNPM_INSTALL_LOG = "/tmp/noter-pnpm-install.log";
const PNPM_INSTALL_STATUS = "/tmp/noter-pnpm-install.status";
const DAYTONA_PREVIEW_PORT = 5173;
const DAYTONA_PREVIEW_TTL_SECONDS = 3600;
const DAYTONA_DEV_SERVER_VERIFY_TIMEOUT_MS = 15_000;
const DAYTONA_DEV_SERVER_VERIFY_POLL_MS = 1_000;
const DAYTONA_TMUX_STARTUP_GRACE_MS = 120_000;
const DAYTONA_TERMINAL_PORT = 22222;
const DAYTONA_TERMINAL_TTL_SECONDS = 300;
const DAYTONA_DEV_LOG = "/tmp/noter-dev.log";
const DAYTONA_DEV_SERVER_TMUX_SESSION = "noter-dev-server";
// Daytona terminals currently run with a root home in our tested sandbox setup.
const DAYTONA_CODEX_HOME = "/root/.codex";
const DAYTONA_CODEX_AUTH_VOLUME_PREFIX = "noter-codex-auth";
const DAYTONA_CODEX_AUTH_SANDBOX_PREFIX = "noter-codex-auth";
const DAYTONA_VOLUME_READY_TIMEOUT_MS = 60_000;
const DAYTONA_VOLUME_READY_POLL_MS = 2_000;
const DEV_ENV_ORIGIN_ENV = "DEV_ENV_ORIGIN";
const MAX_PREBUILD_LOG_CHARS = 50_000;
const PREBUILD_LOG_FLUSH_MS = 1_000;
const DAYTONA_SNAPSHOT_ACTIVE_TIMEOUT_MS = 10 * 60_000;
const DAYTONA_SNAPSHOT_ACTIVE_POLL_INITIAL_DELAY_MS = 1_000;
const DAYTONA_SNAPSHOT_ACTIVE_POLL_MAX_DELAY_MS = 10_000;
const DAYTONA_REGISTRY_URL_ENV = "DAYTONA_REGISTRY_URL";
const DAYTONA_REGISTRY_USERNAME_ENV = "DAYTONA_REGISTRY_USERNAME";
const DAYTONA_REGISTRY_PASSWORD_ENV = "DAYTONA_REGISTRY_PASSWORD";
const DAYTONA_REGISTRY_PROJECT_ENV = "DAYTONA_REGISTRY_PROJECT";
const DAYTONA_REGISTRY_NAME_ENV = "DAYTONA_REGISTRY_NAME";
const DAYTONA_REGISTRY_SET_DEFAULT_ENV = "DAYTONA_REGISTRY_SET_DEFAULT";
const DAYTONA_ORGANIZATION_ID_ENV = "DAYTONA_ORGANIZATION_ID";
const DAYTONA_SNAPSHOT_BUILD_CONTEXT_REPO_DIR = "repo";
const DAYTONA_SNAPSHOT_BUILD_CONTEXT_AUTO_CD_PROGRAM_PATH =
  ".noter/daytona/ensureRepoAutoCd.js";
const DAYTONA_SNAPSHOT_BUILD_CONTEXT_AUTO_CD_PROGRAM_TEMP_PATH =
  "/tmp/noter-daytona-ensureRepoAutoCd.js";
const DAYTONA_PREBUILD_RESOURCES: Resources = {
  cpu: 4,
  memory: 8,
  disk: 10,
};

type GithubConnection = {
  kind: "github";
  auth: { credential: string };
  username?: string;
} | null;

async function getGithubConnection(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<GithubConnection> {
  const connection = await ctx.runQuery(
    internal.providerConnections.getByUserAndKind,
    {
      userId,
      kind: "github",
    },
  );
  return connection?.kind === "github" ? connection : null;
}

type DaytonaSnapshot = Awaited<
  ReturnType<Daytona["snapshot"]["list"]>
>["items"][number];
type DaytonaSnapshotDetails = Awaited<ReturnType<Daytona["snapshot"]["get"]>>;
type SnapshotCacheEntry = {
  expiresAtMs: number;
  snapshots: DaytonaSnapshot[];
};

const daytonaSnapshotCache = new Map<string, SnapshotCacheEntry>();
const daytonaSnapshotInFlight = new Map<string, Promise<DaytonaSnapshot[]>>();

function isNotFoundError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const status = Reflect.get(error, "status");
    if (typeof status === "number" && status === 404) {
      return true;
    }
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes("not found") || message.includes("404");
  }
  return false;
}

function isMissingFileError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const code = Reflect.get(error, "code");
    return code === "ENOENT";
  }
  return false;
}

function hasImageTagOrDigest(image: string): boolean {
  if (image.includes("@")) {
    return true;
  }
  const lastColon = image.lastIndexOf(":");
  const lastSlash = image.lastIndexOf("/");
  return lastColon > lastSlash;
}

function resolveDaytonaBaseImage(): string {
  const configured = process.env[DAYTONA_BASE_IMAGE_ENV]?.trim();
  if (configured && configured.length > 0) {
    return configured;
  }
  return DEFAULT_BASE_IMAGE;
}

function normalizeRegistryUrl(url: string): string {
  return url.trim().replace(/\/+$/g, "").toLowerCase();
}

function resolveDaytonaApiConfig():
  | { ok: true; baseUrl: string; token: string }
  | { ok: false; message: string } {
  const baseUrl = process.env[DAYTONA_API_URL_ENV]?.trim() ?? "";
  const token =
    process.env[DAYTONA_API_TOKEN_ENV] ??
    process.env[DAYTONA_API_KEY_ENV] ??
    "";
  const missing = [
    baseUrl.length === 0 ? DAYTONA_API_URL_ENV : null,
    token.length === 0
      ? `${DAYTONA_API_TOKEN_ENV} (or ${DAYTONA_API_KEY_ENV})`
      : null,
  ].filter((value): value is string => value !== null);

  if (missing.length > 0) {
    return {
      ok: false,
      message:
        missing.length === 0
          ? "Daytona is not configured."
          : `Daytona is not configured. Missing ${missing.join(", ")}.`,
    };
  }

  const isHttp =
    baseUrl.startsWith("http://") || baseUrl.startsWith("https://");
  if (!isHttp) {
    return {
      ok: false,
      message: `DAYTONA_API_URL must start with http:// or https:// (received "${baseUrl}").`,
    };
  }

  return { ok: true, baseUrl, token };
}

async function inferSandboxDevOrigin(args: {
  sandbox: Sandbox;
  port: number;
  ttlSeconds: number;
}): Promise<string | null> {
  try {
    const preview = args.sandbox.public
      ? await args.sandbox.getPreviewLink(args.port)
      : await args.sandbox.getSignedPreviewUrl(args.port, args.ttlSeconds);
    const origin = new URL(preview.url).origin;
    return origin.trim().length > 0 ? origin : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("daytona:dev-origin:failed", {
      sandboxId: args.sandbox.id,
      message,
    });
    return null;
  }
}

async function readPnpmLockHash(repoDir: string): Promise<string | null> {
  const lockfilePath = path.join(repoDir, PNPM_LOCKFILE_NAME);
  try {
    const contents = await fs.promises.readFile(lockfilePath);
    return createHash("sha256").update(contents).digest("hex");
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

async function readRepoFileHash(args: {
  repoDir: string;
  relativePath: string;
}): Promise<string | null> {
  const filePath = path.join(args.repoDir, args.relativePath);
  try {
    const contents = await fs.promises.readFile(filePath);
    return createHash("sha256").update(contents).digest("hex");
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

async function readDepsInputHash(args: {
  repoDir: string;
  baseImage: string;
  pnpmVersion: string;
}): Promise<string | null> {
  const hash = createHash("sha256");
  hash.update(`baseImage=${args.baseImage}\n`);
  hash.update(`pnpmVersion=${args.pnpmVersion}\n`);

  for (const relativePath of DAYTONA_DEPS_HASH_INPUT_FILES) {
    const fileHash = await readRepoFileHash({
      repoDir: args.repoDir,
      relativePath,
    });
    if (!fileHash) {
      return null;
    }
    hash.update(`${relativePath}:${fileHash}\n`);
  }

  return hash.digest("hex");
}

function replaceTemplateTokens(
  template: string,
  replacements: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.split(`{${key}}`).join(value);
    result = result.split("${" + key + "}").join(value);
  }
  return result;
}

function resolveDepsImageNameForTag(args: {
  owner: string;
  repo: string;
  tag: string;
}): string | null {
  const templateRaw = process.env[DAYTONA_DEPS_IMAGE_TEMPLATE_ENV];
  if (!templateRaw || templateRaw.trim().length === 0) {
    return null;
  }

  const owner = args.owner.toLowerCase();
  const repo = args.repo.toLowerCase();
  let resolved = replaceTemplateTokens(templateRaw.trim(), {
    owner,
    repo,
    inputHash: args.tag,
    lockHash: args.tag,
  });

  if (!hasImageTagOrDigest(resolved)) {
    resolved = `${resolved}:${args.tag}`;
  }

  return resolved;
}

function resolveDepsImageNames(args: {
  owner: string;
  repo: string;
  inputHash: string | null;
  lockHash: string | null;
}): string[] {
  const names = new Set<string>();
  if (args.inputHash) {
    const image = resolveDepsImageNameForTag({
      owner: args.owner,
      repo: args.repo,
      tag: args.inputHash,
    });
    if (image) {
      names.add(image);
    }
  }
  if (args.lockHash && args.lockHash !== args.inputHash) {
    const image = resolveDepsImageNameForTag({
      owner: args.owner,
      repo: args.repo,
      tag: args.lockHash,
    });
    if (image) {
      names.add(image);
    }
  }
  return [...names];
}

type RegistryConfig = {
  url: string;
  username: string;
  password: string;
  project?: string;
  name: string;
  setDefault: boolean;
  organizationId?: string;
};

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function readRegistryConfig(): {
  config: RegistryConfig | null;
  missing: string[];
} {
  const url = process.env[DAYTONA_REGISTRY_URL_ENV]?.trim() ?? "";
  const username = process.env[DAYTONA_REGISTRY_USERNAME_ENV]?.trim() ?? "";
  const password = process.env[DAYTONA_REGISTRY_PASSWORD_ENV] ?? "";

  if (!url && !username && !password) {
    return { config: null, missing: [] };
  }

  const missing: string[] = [];
  if (!url) missing.push(DAYTONA_REGISTRY_URL_ENV);
  if (!username) missing.push(DAYTONA_REGISTRY_USERNAME_ENV);
  if (!password) missing.push(DAYTONA_REGISTRY_PASSWORD_ENV);

  if (missing.length > 0) {
    return { config: null, missing };
  }

  const project =
    process.env[DAYTONA_REGISTRY_PROJECT_ENV]?.trim() || undefined;
  const nameOverride = process.env[DAYTONA_REGISTRY_NAME_ENV]?.trim();
  const isGhcr = normalizeRegistryUrl(url).includes("ghcr.io");
  const name =
    nameOverride && nameOverride.length > 0
      ? nameOverride
      : isGhcr
        ? "ghcr"
        : "registry";
  const setDefault =
    parseBooleanEnv(process.env[DAYTONA_REGISTRY_SET_DEFAULT_ENV]) ?? false;
  const organizationId =
    process.env[DAYTONA_ORGANIZATION_ID_ENV]?.trim() || undefined;

  return {
    config: {
      url,
      username,
      password,
      project,
      name,
      setDefault,
      organizationId,
    },
    missing: [],
  };
}

function buildRegistryConfigFromGithub(args: {
  githubUsername: string;
  githubAccessToken: string;
}): RegistryConfig {
  const url = process.env[DAYTONA_REGISTRY_URL_ENV]?.trim() || "ghcr.io";
  const project =
    process.env[DAYTONA_REGISTRY_PROJECT_ENV]?.trim() || undefined;
  const nameOverride = process.env[DAYTONA_REGISTRY_NAME_ENV]?.trim();
  const name =
    nameOverride && nameOverride.length > 0
      ? nameOverride
      : normalizeRegistryUrl(url).includes("ghcr.io")
        ? "ghcr"
        : "registry";
  const setDefault =
    parseBooleanEnv(process.env[DAYTONA_REGISTRY_SET_DEFAULT_ENV]) ?? false;
  const organizationId =
    process.env[DAYTONA_ORGANIZATION_ID_ENV]?.trim() || undefined;

  return {
    url,
    username: args.githubUsername,
    password: args.githubAccessToken,
    project,
    name,
    setDefault,
    organizationId,
  };
}

function normalizeProjectScope(project: unknown): string {
  return typeof project === "string" ? project : "";
}

function getRegistryMatch(
  registries: DockerRegistry[],
  config: RegistryConfig,
): DockerRegistry | null {
  const targetUrl = normalizeRegistryUrl(config.url);
  const targetProject = normalizeProjectScope(config.project);
  for (const registry of registries) {
    const registryUrl = normalizeRegistryUrl(registry.url);
    if (registryUrl !== targetUrl) {
      continue;
    }
    const registryProject = normalizeProjectScope(registry.project);
    if (registryProject !== targetProject) {
      continue;
    }
    return registry;
  }
  return null;
}

function readSandboxLabel(candidate: Sandbox, key: string): string {
  const value = candidate.labels[key];
  return typeof value === "string" ? value.trim() : "";
}

function buildDaytonaCodexAuthVolumeName(args: {
  envLabel: string;
  userId: Id<"users">;
}): string {
  const safeName = toSafeRepoName(
    `${DAYTONA_CODEX_AUTH_VOLUME_PREFIX}-${args.envLabel}-${args.userId}`,
  );
  return safeName || `${DAYTONA_CODEX_AUTH_VOLUME_PREFIX}-${args.envLabel}`;
}

function buildDaytonaCodexAuthSandboxName(args: {
  envLabel: string;
  userId: Id<"users">;
}): string {
  const safeName = toSafeRepoName(
    `${DAYTONA_CODEX_AUTH_SANDBOX_PREFIX}-${args.envLabel}-${args.userId}`,
  );
  return safeName || `${DAYTONA_CODEX_AUTH_SANDBOX_PREFIX}-${args.envLabel}`;
}

function buildDaytonaCodexAuthSandboxLabels(args: { userId: Id<"users"> }) {
  return {
    "noter.kind": "codex_auth",
    "noter.user_id": String(args.userId),
  };
}

function hasMatchingCodexAuthSandboxLabels(args: {
  sandbox: Sandbox;
  userId: Id<"users">;
}): boolean {
  return (
    readSandboxLabel(args.sandbox, "noter.kind") === "codex_auth" &&
    readSandboxLabel(args.sandbox, "noter.user_id") === String(args.userId)
  );
}

function parseGithubRepoFromRemote(remoteUrl: string): {
  owner: string;
  repo: string;
} | null {
  const trimmed = remoteUrl.trim().replace(/\.git$/i, "");
  if (trimmed.length === 0) {
    return null;
  }

  const sshMatch = /^git@github\.com:(?<owner>[^/]+)\/(?<repo>[^/]+)$/i.exec(
    trimmed,
  );
  if (sshMatch?.groups?.owner && sshMatch.groups.repo) {
    return {
      owner: sshMatch.groups.owner,
      repo: sshMatch.groups.repo,
    };
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname.toLowerCase() !== "github.com") {
      return null;
    }
    const [owner, repo] = url.pathname.replace(/^\/+/, "").split("/");
    if (!owner || !repo) {
      return null;
    }
    return { owner, repo };
  } catch {
    return null;
  }
}

function findWorkspaceRootDir(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  for (;;) {
    const hasWorkspaceManifest = fs.existsSync(
      path.join(currentDir, "pnpm-workspace.yaml"),
    );
    const hasPackageJson = fs.existsSync(path.join(currentDir, "package.json"));
    if (hasWorkspaceManifest && hasPackageJson) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

async function writeDaytonaSandboxProgramToBuildContext(args: {
  buildContextDir: string;
  programRelativePath: string;
  source: string;
}): Promise<void> {
  const targetPath = path.join(args.buildContextDir, args.programRelativePath);
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.writeFile(targetPath, args.source, "utf8");
}

async function resolveCurrentRepoIdentity(repoDir: string): Promise<{
  owner: string;
  repo: string;
} | null> {
  const originUrl = await git.getConfig({
    fs,
    dir: repoDir,
    path: "remote.origin.url",
  });
  if (typeof originUrl !== "string") {
    return null;
  }
  return parseGithubRepoFromRemote(originUrl);
}

async function ensureDaytonaCodexAuthVolume(args: {
  daytona: Daytona;
  envLabel: string;
  userId: Id<"users">;
}) {
  const volumeName = buildDaytonaCodexAuthVolumeName({
    envLabel: args.envLabel,
    userId: args.userId,
  });
  let volume = await args.daytona.volume.get(volumeName, true);
  const startedAt = Date.now();

  for (;;) {
    const currentState = volume.state.trim().toLowerCase();
    if (currentState === "ready") {
      return volume;
    }
    if (
      currentState === "error" ||
      currentState === "deleting" ||
      currentState === "deleted" ||
      currentState === "pending_delete"
    ) {
      throw new Error(
        `Volume ${volume.name} entered ${volume.state} before becoming ready.`,
      );
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= DAYTONA_VOLUME_READY_TIMEOUT_MS) {
      throw new Error(
        `Volume ${volume.name} did not become ready within ${Math.round(
          DAYTONA_VOLUME_READY_TIMEOUT_MS / 1000,
        )} seconds. Last Daytona state: ${volume.state}.`,
      );
    }

    await sleep(DAYTONA_VOLUME_READY_POLL_MS);
    volume = await args.daytona.volume.get(volumeName);
  }
}

function hasCodexAuthVolumeMount(args: {
  sandbox: Sandbox;
  volumeId: string;
}): boolean {
  const volumes = Array.isArray(args.sandbox.volumes)
    ? args.sandbox.volumes
    : [];
  return volumes.some((volume) => {
    const mountPath =
      typeof volume.mountPath === "string" ? volume.mountPath.trim() : "";
    const mountedVolumeId =
      typeof volume.volumeId === "string" ? volume.volumeId.trim() : "";
    return (
      mountPath === DAYTONA_CODEX_HOME && mountedVolumeId === args.volumeId
    );
  });
}

function hasAnyCodexAuthMount(sandbox: Sandbox): boolean {
  const volumes = Array.isArray(sandbox.volumes) ? sandbox.volumes : [];
  return volumes.some((volume) => {
    const mountPath =
      typeof volume.mountPath === "string" ? volume.mountPath.trim() : "";
    return mountPath === DAYTONA_CODEX_HOME;
  });
}

function hasCodexHomeEnv(sandbox: Sandbox): boolean {
  const codexHomeValue =
    typeof sandbox.env.CODEX_HOME === "string"
      ? sandbox.env.CODEX_HOME.trim()
      : "";
  return codexHomeValue === DAYTONA_CODEX_HOME;
}

function hasCompatibleCodexAuthSetup(args: {
  sandbox: Sandbox;
  volumeId: string;
}): boolean {
  return (
    hasCodexHomeEnv(args.sandbox) &&
    hasCodexAuthVolumeMount({
      sandbox: args.sandbox,
      volumeId: args.volumeId,
    })
  );
}

function hasExpectedCodexAuthSetup(args: {
  sandbox: Sandbox;
  volumeId?: string;
}): boolean {
  if (args.volumeId) {
    return hasCompatibleCodexAuthSetup({
      sandbox: args.sandbox,
      volumeId: args.volumeId,
    });
  }
  return !hasCodexHomeEnv(args.sandbox) && !hasAnyCodexAuthMount(args.sandbox);
}

async function listDaytonaSandboxIdsUsingVolume(args: {
  daytona: Daytona;
  volumeId: string;
}): Promise<string[]> {
  const sandboxIds: string[] = [];
  let page = 1;
  const perPage = 100;

  for (;;) {
    const result = await args.daytona.list(undefined, page, perPage);
    for (const sandbox of result.items) {
      if (
        hasCodexAuthVolumeMount({
          sandbox,
          volumeId: args.volumeId,
        })
      ) {
        sandboxIds.push(sandbox.id);
      }
    }
    if (result.items.length < perPage) {
      break;
    }
    page += 1;
  }

  return sandboxIds;
}

async function clearCodexAuthHomeInSandbox(args: {
  sandbox: Sandbox;
}): Promise<void> {
  await ensureDaytonaSandboxStarted(args.sandbox);

  const result = await args.sandbox.process.executeCommand(
    `mkdir -p ${DAYTONA_CODEX_HOME} && find ${DAYTONA_CODEX_HOME} -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +`,
    undefined,
    undefined,
    30,
  );
  if (result.exitCode !== 0) {
    throw new Error(result.result.trim() || "Failed to clear Codex auth data.");
  }
}

async function ensureDaytonaSandboxStarted(sandbox: Sandbox): Promise<void> {
  if (sandbox.state?.toLowerCase() !== "started") {
    await sandbox.start();
  }
  await sandbox.refreshData();
}

type CodexAuthCheckStatus = "ready" | "needs_reauth" | "error";

type CodexAuthSandboxResolution = {
  sandbox: Sandbox;
  sandboxName: string;
  lifecycle: "created" | "resumed" | "reused";
};

async function resolveDaytonaCodexAuthSandboxImagePlan(args: {
  ctx: ActionCtx;
  userId: Id<"users">;
  daytona: Daytona;
  baseUrl: string;
  token: string;
}): Promise<{
  depsImageCandidates: string[];
  fallbackImage: Image;
}> {
  // TODO: Move user-facing Daytona sandboxes onto a single Noter-maintained
  // standard image so auth and workspace flows run on a known-good baseline for
  // every user, instead of depending on repo-specific deps images or ad hoc
  // fallback installs.
  const workspaceRoot = findWorkspaceRootDir(process.cwd());
  const baseImage = resolveDaytonaBaseImage();
  const fallbackImage = Image.base(baseImage).dockerfileCommands(
    [...DAYTONA_RUNTIME_AUTH_FALLBACK_DOCKERFILE_COMMANDS],
    workspaceRoot ?? process.cwd(),
  );

  if (!workspaceRoot) {
    return { depsImageCandidates: [], fallbackImage };
  }

  const repoIdentity = await resolveCurrentRepoIdentity(workspaceRoot);
  if (!repoIdentity) {
    return { depsImageCandidates: [], fallbackImage };
  }

  const [depsInputHash, lockHash] = await Promise.all([
    readDepsInputHash({
      repoDir: workspaceRoot,
      baseImage,
      pnpmVersion: DAYTONA_PNPM_VERSION,
    }),
    readPnpmLockHash(workspaceRoot),
  ]);
  const depsImageCandidates = resolveDepsImageNames({
    owner: repoIdentity.owner,
    repo: repoIdentity.repo,
    inputHash: depsInputHash,
    lockHash,
  });

  if (depsImageCandidates.length === 0) {
    return { depsImageCandidates, fallbackImage };
  }

  const githubConnection = await getGithubConnection(args.ctx, args.userId);
  if (githubConnection?.auth.credential && githubConnection.username) {
    try {
      await ensureDaytonaRegistry({
        baseUrl: args.baseUrl,
        token: args.token,
        config: buildRegistryConfigFromGithub({
          githubUsername: githubConnection.username,
          githubAccessToken: githubConnection.auth.credential,
        }),
      });
    } catch (error) {
      console.warn("daytona:codex-auth:registry:failed", {
        userId: args.userId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { depsImageCandidates, fallbackImage };
}

async function createDaytonaCodexAuthSandbox(args: {
  ctx: ActionCtx;
  userId: Id<"users">;
  daytona: Daytona;
  baseUrl: string;
  token: string;
  sandboxName: string;
  volumeId: string;
}): Promise<Sandbox> {
  const imagePlan = await resolveDaytonaCodexAuthSandboxImagePlan({
    ctx: args.ctx,
    userId: args.userId,
    daytona: args.daytona,
    baseUrl: args.baseUrl,
    token: args.token,
  });

  const baseParams = {
    name: args.sandboxName,
    language: "typescript",
    user: "daytona",
    public: true,
    envVars: {
      CODEX_HOME: DAYTONA_CODEX_HOME,
    },
    labels: buildDaytonaCodexAuthSandboxLabels({
      userId: args.userId,
    }),
    volumes: [
      {
        volumeId: args.volumeId,
        mountPath: DAYTONA_CODEX_HOME,
      },
    ],
  };

  for (const depsImage of imagePlan.depsImageCandidates) {
    let sandbox: Sandbox | null = null;
    try {
      sandbox = await args.daytona.create({
        ...baseParams,
        image: depsImage,
      });
      await verifyCodexBinaryInSandbox({ sandbox });
      return sandbox;
    } catch (error) {
      if (sandbox) {
        try {
          await sandbox.delete();
        } catch (deleteError) {
          if (!isNotFoundError(deleteError)) {
            console.warn("daytona:codex-auth:create:cleanup-failed", {
              userId: args.userId,
              image: depsImage,
              sandboxId: sandbox.id,
              message:
                deleteError instanceof Error
                  ? deleteError.message
                  : String(deleteError),
            });
          }
        }
      }
      console.warn("daytona:codex-auth:create:deps-image-failed", {
        userId: args.userId,
        image: depsImage,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
  }

  const sandbox = await args.daytona.create({
    ...baseParams,
    image: imagePlan.fallbackImage,
  });
  await verifyCodexBinaryInSandbox({ sandbox });
  return sandbox;
}

async function resolveDaytonaCodexAuthSandbox(args: {
  ctx: ActionCtx;
  userId: Id<"users">;
  daytona: Daytona;
  baseUrl: string;
  token: string;
  volumeId: string;
  persistedSandboxId?: string;
}): Promise<CodexAuthSandboxResolution> {
  const envLabel = getDaytonaEnvLabel();
  const sandboxName = buildDaytonaCodexAuthSandboxName({
    envLabel,
    userId: args.userId,
  });

  let sandbox: Sandbox | null = null;
  let lifecycle: CodexAuthSandboxResolution["lifecycle"] = "created";

  if (args.persistedSandboxId) {
    try {
      const persistedSandbox = await args.daytona.get(args.persistedSandboxId);
      if (
        hasMatchingCodexAuthSandboxLabels({
          sandbox: persistedSandbox,
          userId: args.userId,
        })
      ) {
        if (
          hasCompatibleCodexAuthSetup({
            sandbox: persistedSandbox,
            volumeId: args.volumeId,
          })
        ) {
          sandbox = persistedSandbox;
        } else {
          await persistedSandbox.delete();
        }
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  if (!sandbox) {
    const matches = await args.daytona.list(
      buildDaytonaCodexAuthSandboxLabels({
        userId: args.userId,
      }),
      1,
      10,
    );
    for (const match of matches.items) {
      try {
        const matchedSandbox = await args.daytona.get(match.id);
        if (
          !hasMatchingCodexAuthSandboxLabels({
            sandbox: matchedSandbox,
            userId: args.userId,
          })
        ) {
          continue;
        }
        if (
          hasCompatibleCodexAuthSetup({
            sandbox: matchedSandbox,
            volumeId: args.volumeId,
          })
        ) {
          sandbox = matchedSandbox;
          break;
        }
        await matchedSandbox.delete();
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
      }
    }
  }

  if (sandbox) {
    if (sandbox.state?.toLowerCase() === "started") {
      lifecycle = "reused";
    } else {
      await sandbox.start();
      await sandbox.refreshData();
      lifecycle = "resumed";
    }
    return {
      sandbox,
      sandboxName: sandbox.name,
      lifecycle,
    };
  }

  const createdSandbox = await createDaytonaCodexAuthSandbox({
    ctx: args.ctx,
    userId: args.userId,
    daytona: args.daytona,
    baseUrl: args.baseUrl,
    token: args.token,
    sandboxName,
    volumeId: args.volumeId,
  });
  return {
    sandbox: createdSandbox,
    sandboxName: createdSandbox.name,
    lifecycle: "created",
  };
}

async function resolveVerifiedDaytonaCodexAuthSandbox(args: {
  ctx: ActionCtx;
  userId: Id<"users">;
  daytona: Daytona;
  baseUrl: string;
  token: string;
  volumeId: string;
  persistedSandboxId?: string;
}): Promise<CodexAuthSandboxResolution> {
  const authSandbox = await resolveDaytonaCodexAuthSandbox(args);

  try {
    await verifyCodexBinaryInSandbox({ sandbox: authSandbox.sandbox });
    return authSandbox;
  } catch (error) {
    try {
      await authSandbox.sandbox.delete();
    } catch (deleteError) {
      if (!isNotFoundError(deleteError)) {
        throw deleteError;
      }
    }

    const recreatedSandbox = await createDaytonaCodexAuthSandbox({
      ctx: args.ctx,
      userId: args.userId,
      daytona: args.daytona,
      baseUrl: args.baseUrl,
      token: args.token,
      sandboxName: buildDaytonaCodexAuthSandboxName({
        envLabel: getDaytonaEnvLabel(),
        userId: args.userId,
      }),
      volumeId: args.volumeId,
    });

    return {
      sandbox: recreatedSandbox,
      sandboxName: recreatedSandbox.name,
      lifecycle: "created",
    };
  }
}

async function getDaytonaSandboxTerminalUrl(args: { sandbox: Sandbox }) {
  const preview = await args.sandbox.getSignedPreviewUrl(
    DAYTONA_TERMINAL_PORT,
    DAYTONA_TERMINAL_TTL_SECONDS,
  );
  return preview.url;
}

async function checkCodexLoginInSandbox(args: { sandbox: Sandbox }): Promise<{
  status: CodexAuthCheckStatus;
  checkedAt: number;
  message?: string;
}> {
  const checkedAt = Date.now();
  try {
    const result = await args.sandbox.process.executeCommand(
      "codex login status",
      undefined,
      undefined,
      30,
    );
    if (result.exitCode === 0) {
      return {
        status: "ready",
        checkedAt,
      };
    }
    return {
      status: "needs_reauth",
      checkedAt,
      message: result.result.trim() || "Codex login is missing.",
    };
  } catch (error) {
    return {
      status: "error",
      checkedAt,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function verifyCodexBinaryInSandbox(args: { sandbox: Sandbox }) {
  const result = await args.sandbox.process.executeCommand(
    "command -v codex",
    undefined,
    undefined,
    30,
  );
  if (result.exitCode !== 0) {
    throw new Error("Codex CLI is not installed in the Daytona auth sandbox.");
  }
}

async function ensureCodexBinaryInSandbox(args: {
  sandbox: Sandbox;
}): Promise<"already_present" | "installed"> {
  try {
    await verifyCodexBinaryInSandbox(args);
    return "already_present";
  } catch {
    const installResult = await args.sandbox.process.executeCommand(
      `npm install -g @openai/codex@${DAYTONA_CODEX_CLI_VERSION}`,
      undefined,
      undefined,
      300,
    );
    if (installResult.exitCode !== 0) {
      throw new Error(
        installResult.result.trim() ||
          "Failed to install Codex CLI in the Daytona sandbox.",
      );
    }
    await verifyCodexBinaryInSandbox(args);
    return "installed";
  }
}

async function ensureDaytonaRegistry(args: {
  baseUrl: string;
  token: string;
  config: RegistryConfig;
}): Promise<{
  registryId: string;
  status: "created" | "updated" | "existing";
}> {
  const configuration = new DaytonaApiConfiguration({
    accessToken: args.token,
    basePath: args.baseUrl,
  });
  const registryApi = new DockerRegistryApi(configuration);
  const listResponse = await registryApi.listRegistries(
    args.config.organizationId,
  );
  const registries = listResponse.data;
  const match = getRegistryMatch(registries, args.config);

  if (!match) {
    const created = await registryApi.createRegistry(
      {
        name: args.config.name,
        url: args.config.url,
        username: args.config.username,
        password: args.config.password,
        project: args.config.project,
        registryType: CreateDockerRegistryRegistryTypeEnum.ORGANIZATION,
        isDefault: args.config.setDefault,
      },
      args.config.organizationId,
    );
    return { registryId: created.data.id, status: "created" };
  }

  const targetProject = normalizeProjectScope(args.config.project);
  const projectMatch = normalizeProjectScope(match.project) === targetProject;
  const needsUpdate =
    match.name !== args.config.name ||
    match.username !== args.config.username ||
    !projectMatch;

  if (needsUpdate) {
    await registryApi.updateRegistry(
      match.id,
      {
        name: args.config.name,
        url: args.config.url,
        username: args.config.username,
        password: args.config.password,
        project: args.config.project,
      },
      args.config.organizationId,
    );
  }

  if (args.config.setDefault) {
    await registryApi.setDefaultRegistry(match.id, args.config.organizationId);
  }

  return { registryId: match.id, status: needsUpdate ? "updated" : "existing" };
}

function truncateLogTail(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }
  return input.slice(input.length - maxChars);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function inferPrebuildSnapshotName(args: {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
}): string {
  return inferCommitPinnedSnapshotName(args);
}

function inferDaytonaSnapshotPrefix(args: {
  owner: string;
  repo: string;
}): string | null {
  try {
    const prefix = inferCommitPinnedSnapshotPrefix(args);
    if (prefix.length > 0) {
      return prefix;
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("daytona:snapshot:prefix:failed", {
      owner: args.owner,
      repo: args.repo,
      message,
    });
    return null;
  }
}

async function waitForDaytonaSnapshotActive(args: {
  daytona: Daytona;
  snapshotName: string;
  appendPrebuildLog: (line: string) => Promise<void>;
}): Promise<DaytonaSnapshotDetails> {
  const startedAt = Date.now();
  let pollDelayMs = DAYTONA_SNAPSHOT_ACTIVE_POLL_INITIAL_DELAY_MS;
  let lastObservedState: string | null = null;

  for (;;) {
    let snapshot: DaytonaSnapshotDetails | null = null;
    try {
      snapshot = await args.daytona.snapshot.get(args.snapshotName);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      if (lastObservedState !== "missing") {
        await args.appendPrebuildLog(
          `Waiting for snapshot ${args.snapshotName} to appear in Daytona.\n`,
        );
        lastObservedState = "missing";
      }
    }

    if (snapshot?.state === "active") {
      return snapshot;
    }

    if (snapshot?.state === "error" || snapshot?.state === "build_failed") {
      throw new Error(
        `Snapshot ${args.snapshotName} entered ${snapshot.state} before activation.`,
      );
    }

    if (snapshot && snapshot.state !== lastObservedState) {
      await args.appendPrebuildLog(
        `Waiting for snapshot ${args.snapshotName} to become active. Current Daytona state: ${snapshot.state}.\n`,
      );
      lastObservedState = snapshot.state;
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= DAYTONA_SNAPSHOT_ACTIVE_TIMEOUT_MS) {
      const lastState = snapshot?.state ?? "missing";
      throw new Error(
        `Snapshot ${args.snapshotName} did not become active within ${Math.round(
          DAYTONA_SNAPSHOT_ACTIVE_TIMEOUT_MS / 1000,
        )} seconds. Last Daytona state: ${lastState}.`,
      );
    }

    const remainingMs = DAYTONA_SNAPSHOT_ACTIVE_TIMEOUT_MS - elapsedMs;
    await sleep(Math.min(pollDelayMs, remainingMs));
    pollDelayMs = Math.min(
      DAYTONA_SNAPSHOT_ACTIVE_POLL_MAX_DELAY_MS,
      pollDelayMs * 2,
    );
  }
}

function buildDaytonaSnapshotCacheKey(args: {
  apiUrl: string;
  apiToken: string;
}): string {
  const tokenHash = createHash("sha256")
    .update(args.apiToken)
    .digest("hex")
    .slice(0, 12);
  return `${args.apiUrl}::${tokenHash}`;
}

function resolveDaytonaDashboardBaseUrl(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    const trimmedPath = url.pathname.replace(/\/+$/g, "");
    const pathWithoutApi = trimmedPath.endsWith("/api")
      ? trimmedPath.slice(0, -4)
      : trimmedPath;
    const normalizedPath =
      pathWithoutApi.length > 0
        ? `${pathWithoutApi.replace(/\/+$/g, "")}/`
        : "/";
    url.pathname = normalizedPath;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "https://app.daytona.io";
  }
}

function buildDaytonaSnapshotDashboardUrl(args: {
  dashboardBaseUrl: string;
  snapshotId: string;
  snapshotName: string;
}): string {
  const base = args.dashboardBaseUrl.endsWith("/")
    ? args.dashboardBaseUrl
    : `${args.dashboardBaseUrl}/`;
  const url = new URL("dashboard/snapshots", base);
  url.searchParams.set("snapshotId", args.snapshotId);
  url.searchParams.set("snapshotName", args.snapshotName);
  return url.toString();
}

function isVaultSnapshotName(args: {
  snapshotName: string;
  snapshotPrefix: string;
}): boolean {
  return args.snapshotName.startsWith(args.snapshotPrefix);
}

function quoteForBash(input: string): string {
  return `'${input.replace(/'/g, `'\\''`)}'`;
}

type TemplateValue = string | number | boolean | null | undefined;

function stripIndent(
  strings: TemplateStringsArray,
  ...values: TemplateValue[]
): string {
  let combined = "";
  for (let index = 0; index < strings.length; index += 1) {
    combined += strings[index];
    if (index < values.length) {
      combined += String(values[index]);
    }
  }

  const trimmed = combined.trim();
  if (trimmed.length === 0) {
    return "";
  }

  const lines = trimmed.split("\n");
  let minIndent: number | null = null;
  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    const match = line.match(/^ +/);
    const indent = match ? match[0].length : 0;
    if (minIndent === null || indent < minIndent) {
      minIndent = indent;
      if (minIndent === 0) {
        break;
      }
    }
  }

  if (minIndent === null || minIndent === 0) {
    return lines.join("\n");
  }

  const stripPrefix = " ".repeat(minIndent);
  return lines
    .map((line) =>
      line.startsWith(stripPrefix) ? line.slice(minIndent) : line,
    )
    .join("\n");
}

const DEV_SERVER_STATUS_MARKER = "__NOTER_DEV_STATUS__";
const DEV_SERVER_LOG_MARKER = "__NOTER_DEV_LOG_START__";
const DEV_SERVER_NO_LOG_MARKER = "__NOTER_NO_DEV_LOG__";

type DevServerStatus = {
  running?: boolean;
  pid?: number;
  logTail?: string;
  message?: string;
};

type DaytonaDevServerLaunch = {
  status: DaytonaDevServerLaunchStatus;
  transport: "tmux" | "background";
};

function buildDevServerStatusScript(): string {
  return stripIndent`
    port=${DAYTONA_PREVIEW_PORT}
    check="none"
    running="unknown"
    pid=""
    if command -v ss >/dev/null; then
      check="ss"
      running="false"
      line=$(ss -ltnp 2>/dev/null | grep ":\${port} " || true)
      if [ -n "$line" ]; then
        running="true"
        pid=$(printf "%s\n" "$line" | sed -n 's/.*pid=\\([0-9][0-9]*\\).*/\\1/p' | head -n 1)
      fi
    elif command -v lsof >/dev/null; then
      check="lsof"
      running="false"
      line=$(lsof -iTCP:\${port} -sTCP:LISTEN -n -P 2>/dev/null | sed -n '2p')
      if [ -n "$line" ]; then
        running="true"
        pid=$(printf "%s\n" "$line" | awk '{print $2}')
      fi
    elif (exec 3<>/dev/tcp/127.0.0.1/\${port}) 2>/dev/null; then
      check="tcp"
      running="true"
      exec 3<&- 2>/dev/null || true
      exec 3>&- 2>/dev/null || true
    else
      check="tcp"
      running="false"
    fi
    echo "${DEV_SERVER_STATUS_MARKER}running=\${running};pid=\${pid};check=\${check}"
    echo "${DEV_SERVER_LOG_MARKER}"
    if [ -f ${DAYTONA_DEV_LOG} ]; then tail -n 200 ${DAYTONA_DEV_LOG}; else echo "${DEV_SERVER_NO_LOG_MARKER}"; fi
  `;
}

function parseDevServerStatus(raw: string): DevServerStatus {
  const lines = raw.split("\n");
  const statusLine = lines.find((line) =>
    line.startsWith(DEV_SERVER_STATUS_MARKER),
  );
  const statusPayload = statusLine
    ? statusLine.slice(DEV_SERVER_STATUS_MARKER.length)
    : "";
  const values = new Map<string, string>();
  for (const part of statusPayload.split(";")) {
    if (part.trim().length === 0) {
      continue;
    }
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = part.slice(0, separatorIndex);
    const value = part.slice(separatorIndex + 1);
    values.set(key, value);
  }

  const check = values.get("check");
  const runningValue = values.get("running");
  let running: boolean | undefined;
  if (runningValue === "true") {
    running = true;
  } else if (runningValue === "false") {
    running = false;
  }
  if (check === "none") {
    running = undefined;
  }

  const pidValue = values.get("pid");
  let pid: number | undefined;
  if (pidValue && pidValue.trim().length > 0) {
    const parsed = Number(pidValue);
    if (Number.isFinite(parsed)) {
      pid = parsed;
    }
  }

  let logTail: string | undefined;
  let message: string | undefined;
  const logIndex = raw.indexOf(DEV_SERVER_LOG_MARKER);
  if (logIndex >= 0) {
    let tail = raw.slice(logIndex + DEV_SERVER_LOG_MARKER.length);
    if (tail.startsWith("\n")) {
      tail = tail.slice(1);
    }
    const hasNoLog = tail.includes(DEV_SERVER_NO_LOG_MARKER);
    if (hasNoLog) {
      tail = tail.split(DEV_SERVER_NO_LOG_MARKER).join("");
      message = "Dev log not found yet.";
    }
    logTail = tail.length > 0 ? tail : "";
  }

  if (check === "none") {
    message = message
      ? `${message} Port status unavailable (ss/lsof missing).`
      : "Port status unavailable (ss/lsof missing).";
  }

  return { running, pid, logTail, message };
}

function formatDurationMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

async function ensureDaytonaRuntimePackagesInSandbox(args: {
  sandbox: Sandbox;
}): Promise<"already_present" | "installed"> {
  const checkResult = await args.sandbox.process.executeCommand(
    `command -v tmux >/dev/null 2>&1 && command -v fish >/dev/null 2>&1 && command -v make >/dev/null 2>&1 && [ "$(grep "^$(id -un):" /etc/passwd | cut -d: -f7 | head -n 1 || true)" = "$(command -v fish)" ]`,
    undefined,
    undefined,
    30,
  );
  if (checkResult.exitCode === 0) {
    return "already_present";
  }

  const installScript = stripIndent`
    set -e
    if command -v tmux >/dev/null 2>&1 && command -v fish >/dev/null 2>&1 && command -v make >/dev/null 2>&1 && [ "$(grep "^$(id -un):" /etc/passwd | cut -d: -f7 | head -n 1 || true)" = "$(command -v fish)" ]; then
      exit 0
    fi
    if ! command -v apt-get >/dev/null 2>&1; then
      echo "__NOTER_APT_MISSING__"
      exit 1
    fi
    prefix=""
    if [ "$(id -u)" != "0" ]; then
      if command -v sudo >/dev/null 2>&1; then
        prefix="sudo "
      else
        echo "__NOTER_RUNTIME_PRIVILEGE_MISSING__"
        exit 1
      fi
    fi
    ${"$"}{prefix}apt-get update
    ${"$"}{prefix}apt-get install -y --no-install-recommends ${DAYTONA_RUNTIME_APT_PACKAGE_LIST}
    fish_path="$(command -v fish)"
    current_user="$(id -un)"
    current_shell="$(grep "^${"$"}current_user:" /etc/passwd | cut -d: -f7 | head -n 1 || true)"
    if [ "$current_shell" != "$fish_path" ]; then
      ${"$"}{prefix}usermod -s "$fish_path" "$current_user"
    fi
    ${"$"}{prefix}rm -rf /var/lib/apt/lists/*
  `;
  const installCommand = `bash -lc ${quoteForBash(installScript)}`;
  const installResult = await args.sandbox.process.executeCommand(
    installCommand,
    undefined,
    undefined,
    300,
  );
  if (installResult.exitCode !== 0) {
    const output = installResult.result.trim();
    if (output.includes("__NOTER_APT_MISSING__")) {
      throw new Error(
        "Daytona runtime packages are missing and apt-get is unavailable in this sandbox.",
      );
    }
    if (output.includes("__NOTER_RUNTIME_PRIVILEGE_MISSING__")) {
      throw new Error(
        "Daytona runtime packages are missing and this sandbox cannot install them automatically.",
      );
    }
    throw new Error(
      output.length > 0
        ? output
        : "Failed to install Daytona runtime packages in the sandbox.",
    );
  }

  return "installed";
}

function buildDaytonaSafeDevServerCommand(args: {
  repoDir: string;
  devOrigin: string | null;
}): string {
  const ensurePnpm = stripIndent`
    if ! command -v pnpm >/dev/null; then
      if command -v corepack >/dev/null; then
        corepack enable && corepack prepare pnpm@${DAYTONA_PNPM_VERSION} --activate
      else
        npm install -g pnpm@${DAYTONA_PNPM_VERSION}
      fi
    fi
  `;
  const installFallback = stripIndent`
    if [ ! -d "node_modules" ] \\
      && [ ! -d "apps/noter/node_modules" ] \\
      && [ ! -d "apps/noter-starter-template/node_modules" ]; then
      echo "node_modules missing; running pnpm install";
      NPM_CONFIG_ENGINE_STRICT=false pnpm install --prod=false --force --node-linker=hoisted;
    fi
  `;
  const devEnvExports = [
    args.devOrigin
      ? `export ${DEV_ENV_ORIGIN_ENV}=${quoteForBash(args.devOrigin)}`
      : "",
    "export NOTER_DEV_HOST=0.0.0.0",
    `export NOTER_DEV_PORT=${DAYTONA_PREVIEW_PORT}`,
    "export NOTER_DEV_STRICT_PORT=1",
  ]
    .filter((part) => part.length > 0)
    .join("\n");
  const runDevCommand = stripIndent`
    if [ -f "Makefile" ] && grep -Eq '^[[:space:]]*run:' Makefile; then
      make run
    elif [ -f "package.json" ]; then
      pnpm run dev
    elif [ -f "Makefile" ] && grep -Eq '^[[:space:]]*anon:' Makefile; then
      make anon
    else
      echo "__NOTER_DEV_COMMAND_MISSING__"
      exit 1
    fi
  `;

  return stripIndent`
    set -e
    cd "${args.repoDir}"
    ${ensurePnpm}
    if [ -f "${PNPM_INSTALL_STATUS}" ]; then
      status=$(cat "${PNPM_INSTALL_STATUS}" 2>/dev/null || echo 1);
      if [ "$status" != "0" ]; then
        echo "pnpm install failed with $status";
        exit 1;
      fi;
    fi
    ${installFallback}
    ${devEnvExports}
    ${runDevCommand}
  `;
}

async function hasDaytonaTmuxSession(args: {
  sandbox: Sandbox;
  sessionName: string;
}): Promise<boolean> {
  const state = await getDaytonaTmuxSessionState(args);
  return state === "running";
}

async function getDaytonaTmuxSessionState(args: {
  sandbox: Sandbox;
  sessionName: string;
}): Promise<"missing" | "running" | "dead"> {
  const inspection = await inspectDaytonaTmuxSession(args);
  return inspection.state;
}

async function inspectDaytonaTmuxSession(args: {
  sandbox: Sandbox;
  sessionName: string;
}): Promise<{ state: DaytonaTmuxSessionState; createdAtMs?: number }> {
  const command = `bash -lc ${quoteForBash(
    stripIndent`
      session=${quoteForBash(args.sessionName)}
      if ! command -v tmux >/dev/null 2>&1; then
        echo "state=missing"
        exit 0
      fi
      if ! tmux has-session -t "$session" 2>/dev/null; then
        echo "state=missing"
        exit 0
      fi
      created="$(tmux display-message -p -t "$session" '#{session_created}' 2>/dev/null || true)"
      pane_dead="$(tmux list-panes -t "$session" -F '#{pane_dead}' 2>/dev/null | head -n 1 || true)"
      if [ "$pane_dead" = "1" ]; then
        echo "state=dead;created=$created"
      else
        echo "state=running;created=$created"
      fi
    `,
  )}`;
  const result = await args.sandbox.process.executeCommand(
    command,
    undefined,
    undefined,
    30,
  );
  if (result.exitCode !== 0) {
    throw new Error(result.result.trim() || "Failed to inspect tmux session.");
  }
  const values = new Map<string, string>();
  for (const part of result.result.trim().split(";")) {
    if (part.trim().length === 0) {
      continue;
    }
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    values.set(part.slice(0, separatorIndex), part.slice(separatorIndex + 1));
  }
  const state = values.get("state");
  if (state !== "running" && state !== "dead" && state !== "missing") {
    throw new Error(
      `Unexpected tmux session state: ${state ?? (result.result.trim() || "<empty>")}.`,
    );
  }
  const createdValue = values.get("created");
  if (!createdValue || createdValue.trim().length === 0) {
    return { state };
  }
  const createdAtSeconds = Number(createdValue);
  if (!Number.isFinite(createdAtSeconds)) {
    return { state };
  }
  return {
    state,
    createdAtMs: Math.round(createdAtSeconds * 1000),
  };
}

async function startDaytonaTmuxSession(args: {
  sandbox: Sandbox;
  sessionName: string;
  command: string;
  replaceRunning?: boolean;
}): Promise<"started" | "already_running"> {
  const existingSessionState = await getDaytonaTmuxSessionState({
    sandbox: args.sandbox,
    sessionName: args.sessionName,
  });
  if (existingSessionState === "running") {
    if (args.replaceRunning !== true) {
      return "already_running";
    }
  }
  if (existingSessionState === "dead" || existingSessionState === "running") {
    const cleanupCommand = `bash -lc ${quoteForBash(
      `tmux kill-session -t ${quoteForBash(args.sessionName)}`,
    )}`;
    const cleanupResult = await args.sandbox.process.executeCommand(
      cleanupCommand,
      undefined,
      undefined,
      30,
    );
    if (cleanupResult.exitCode !== 0) {
      throw new Error(
        cleanupResult.result.trim() || "Failed to reset dead tmux session.",
      );
    }
  }

  const startScript = stripIndent`
    set -e
    session=${quoteForBash(args.sessionName)}
    rm -f ${quoteForBash(DAYTONA_DEV_LOG)} ${quoteForBash(PNPM_INSTALL_LOG)}
    tmux new-session -d -s "$session" ${quoteForBash(
      `bash -lc ${quoteForBash(args.command)}`,
    )}
    tmux pipe-pane -o -t "$session":0.0 ${quoteForBash(
      `tee -a ${quoteForBash(PNPM_INSTALL_LOG)} ${quoteForBash(
        DAYTONA_DEV_LOG,
      )} >/dev/null`,
    )}
    tmux set-option -t "$session" status off >/dev/null
    tmux set-option -t "$session" mouse off >/dev/null
    tmux set-option -t "$session" remain-on-exit on >/dev/null
    sleep 1
    pane_dead="$(tmux list-panes -t "$session" -F '#{pane_dead}' 2>/dev/null | head -n 1 || true)"
    [ "$pane_dead" = "0" ]
  `;
  const startCommand = `bash -lc ${quoteForBash(startScript)}`;
  const result = await args.sandbox.process.executeCommand(
    startCommand,
    undefined,
    undefined,
    600,
  );
  if (result.exitCode !== 0) {
    throw new Error(
      result.result.trim() || "Failed to start Daytona tmux session.",
    );
  }
  return "started";
}

async function startDaytonaDevServerBackground(args: {
  sandbox: Sandbox;
  repoDir: string;
  devOrigin: string | null;
}): Promise<void> {
  const devServerScript = buildDaytonaSafeDevServerCommand({
    repoDir: args.repoDir,
    devOrigin: args.devOrigin,
  });
  const installLogPath = quoteForBash(PNPM_INSTALL_LOG);
  const devLogPath = quoteForBash(DAYTONA_DEV_LOG);
  const wrappedCommand = stripIndent`
    (
    ${devServerScript}
    ) 2>&1 | tee ${installLogPath}
  `;
  const script = stripIndent`
    set -e
    rm -f ${quoteForBash(PNPM_INSTALL_LOG)} ${quoteForBash(DAYTONA_DEV_LOG)}
    nohup bash -lc ${quoteForBash(wrappedCommand)} > ${devLogPath} 2>&1 &
  `;
  const command = `bash -lc ${quoteForBash(script)}`;
  const result = await args.sandbox.process.executeCommand(
    command,
    undefined,
    undefined,
    600,
  );
  if (result.exitCode !== 0) {
    throw new Error(`Failed to start dev server (exit ${result.exitCode}).`);
  }
}

async function readDaytonaDevServerStatus(args: {
  sandbox: Sandbox;
}): Promise<DevServerStatus | null> {
  const statusCommand = `bash -lc ${quoteForBash(buildDevServerStatusScript())}`;
  const statusResult = await args.sandbox.process.executeCommand(
    statusCommand,
    undefined,
    undefined,
    60,
  );
  if (statusResult.exitCode !== 0) {
    return null;
  }
  return parseDevServerStatus(statusResult.result);
}

async function waitForDaytonaDevServerRunning(args: {
  sandbox: Sandbox;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<DevServerStatus> {
  const timeoutMs = args.timeoutMs ?? DAYTONA_DEV_SERVER_VERIFY_TIMEOUT_MS;
  const pollMs = args.pollMs ?? DAYTONA_DEV_SERVER_VERIFY_POLL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastStatus: DevServerStatus | null = null;

  while (Date.now() <= deadline) {
    const status = await readDaytonaDevServerStatus({ sandbox: args.sandbox });
    if (status) {
      lastStatus = status;
      if (status.running) {
        return status;
      }
    }
    if (Date.now() + pollMs > deadline) {
      break;
    }
    await sleep(pollMs);
  }

  const logTail = lastStatus?.logTail?.trim();
  const message =
    logTail && logTail.length > 0
      ? truncateLogTail(logTail, 800)
      : lastStatus?.message ??
        "Dev server exited before it bound the preview port.";
  throw new Error(message);
}

async function startDaytonaDevServer(args: {
  sandbox: Sandbox;
  repoDir: string;
}): Promise<DaytonaDevServerLaunch> {
  await ensureDaytonaSandboxStarted(args.sandbox);

  const status = await readDaytonaDevServerStatus({ sandbox: args.sandbox });
  if (status) {
    if (status.running) {
      const transport = (await hasDaytonaTmuxSession({
        sandbox: args.sandbox,
        sessionName: DAYTONA_DEV_SERVER_TMUX_SESSION,
      }))
        ? "tmux"
        : "background";
      return {
        status: "already_running",
        transport,
      };
    }
  }

  const existingTmuxSession = await inspectDaytonaTmuxSession({
    sandbox: args.sandbox,
    sessionName: DAYTONA_DEV_SERVER_TMUX_SESSION,
  });
  if (existingTmuxSession.state === "running") {
    const deadline = Date.now() + DAYTONA_DEV_SERVER_VERIFY_TIMEOUT_MS;
    let shouldKeepWaitingForTmux = true;
    while (shouldKeepWaitingForTmux) {
      const nextStatus = await readDaytonaDevServerStatus({
        sandbox: args.sandbox,
      });
      const nextInspection = await inspectDaytonaTmuxSession({
        sandbox: args.sandbox,
        sessionName: DAYTONA_DEV_SERVER_TMUX_SESSION,
      });
      const launchDecision = decideExistingDaytonaTmuxLaunch({
        portRunning: nextStatus?.running === true,
        sessionState: nextInspection.state,
        sessionCreatedAtMs: nextInspection.createdAtMs,
        nowMs: Date.now(),
        startupGraceMs: DAYTONA_TMUX_STARTUP_GRACE_MS,
      });
      if (launchDecision === "reuse_running") {
        return {
          status: "already_running",
          transport: "tmux",
        };
      }
      if (launchDecision === "replace") {
        shouldKeepWaitingForTmux = false;
        continue;
      }
      if (Date.now() >= deadline) {
        return {
          status: "already_starting",
          transport: "tmux",
        };
      }
      await sleep(DAYTONA_DEV_SERVER_VERIFY_POLL_MS);
    }
  }

  const devOrigin = await inferSandboxDevOrigin({
    sandbox: args.sandbox,
    port: DAYTONA_PREVIEW_PORT,
    ttlSeconds: DAYTONA_PREVIEW_TTL_SECONDS,
  });
  if (devOrigin) {
    console.log("daytona:dev-origin", {
      sandboxId: args.sandbox.id,
      origin: devOrigin,
    });
  }

  try {
    await ensureDaytonaRuntimePackagesInSandbox({ sandbox: args.sandbox });
    const tmuxStatus = await startDaytonaTmuxSession({
      sandbox: args.sandbox,
      sessionName: DAYTONA_DEV_SERVER_TMUX_SESSION,
      command: buildDaytonaSafeDevServerCommand({
        repoDir: args.repoDir,
        devOrigin,
      }),
      replaceRunning: true,
    });
    return {
      status: tmuxStatus,
      transport: "tmux",
    };
  } catch (error) {
    console.warn("daytona:dev-server:tmux-fallback", {
      sandboxId: args.sandbox.id,
      message: error instanceof Error ? error.message : String(error),
    });
    await startDaytonaDevServerBackground({
      sandbox: args.sandbox,
      repoDir: args.repoDir,
      devOrigin,
    });
    await waitForDaytonaDevServerRunning({ sandbox: args.sandbox });
    return {
      status: "started",
      transport: "background",
    };
  }
}

const startDaytonaWorkspaceArgs = object({
  vaultId: id("vaults"),
  branch: optional(string()),
});

const daytonaRepoRefreshMode = union(
  literal("always"),
  literal("smart"),
  literal("never"),
);
type RepoRefreshMode = Infer<typeof daytonaRepoRefreshMode>;

const daytonaStartupMetrics = object({
  totalMs: number(),
  sandboxCreateMs: number(),
  repoRefreshMs: number(),
  devServerStartMs: number(),
  repoRefreshMode: daytonaRepoRefreshMode,
  repoRefreshed: boolean(),
  repoRefreshReason: string(),
});

const startDaytonaWorkspaceResult = object({
  ok: boolean(),
  status: union(literal("not_configured"), literal("created")),
  message: optional(string()),
  branch: string(),
  sandboxId: optional(string()),
  sandboxName: optional(string()),
  startupMetrics: optional(daytonaStartupMetrics),
});

const getDaytonaTerminalUrlArgs = object({
  vaultId: id("vaults"),
  branch: optional(string()),
});

const getDaytonaTerminalUrlResult = object({
  ok: boolean(),
  url: optional(string()),
  message: optional(string()),
});

const getDaytonaPreviewUrlArgs = object({
  vaultId: id("vaults"),
  branch: optional(string()),
});

const getDaytonaPreviewUrlResult = object({
  ok: boolean(),
  url: optional(string()),
  message: optional(string()),
  branch: optional(string()),
});

const codexCheckStatusValidator = union(
  literal("ready"),
  literal("needs_reauth"),
  literal("error"),
);

const prepareCodexAuthSandboxArgs = object({
  openTerminal: optional(boolean()),
});

const prepareCodexAuthSandboxResult = object({
  ok: boolean(),
  sandboxId: optional(string()),
  sandboxName: optional(string()),
  terminalUrl: optional(string()),
  lastCheckStatus: optional(codexCheckStatusValidator),
  message: optional(string()),
});

const verifyCodexLoginInSandboxArgs = object({});

const verifyCodexLoginInSandboxResult = object({
  ok: boolean(),
  connected: boolean(),
  lastCheckStatus: optional(codexCheckStatusValidator),
  message: optional(string()),
});

const disconnectCodexProviderArgs = object({});

const disconnectCodexProviderResult = object({
  ok: boolean(),
  message: optional(string()),
});

const startDaytonaDevServerSafeArgs = object({
  vaultId: id("vaults"),
});

const startDaytonaDevServerSafeResult = object({
  ok: boolean(),
  message: optional(string()),
});

const startDaytonaDevServerFastArgs = object({
  vaultId: id("vaults"),
});

const startDaytonaDevServerFastResult = object({
  ok: boolean(),
  message: optional(string()),
});

const getDaytonaDevServerStatusArgs = object({
  vaultId: id("vaults"),
});

const getDaytonaDevServerStatusResult = object({
  ok: boolean(),
  running: optional(boolean()),
  port: number(),
  pid: optional(number()),
  logTail: optional(string()),
  message: optional(string()),
});

const removeDaytonaSandboxArgs = object({
  vaultId: id("vaults"),
});

const removeDaytonaSandboxResult = object({
  ok: boolean(),
  message: optional(string()),
});

const getDaytonaBootstrapLogsArgs = object({
  vaultId: id("vaults"),
});

const getDaytonaBootstrapLogsResult = object({
  ok: boolean(),
  logs: optional(string()),
  message: optional(string()),
});

const prebuildDaytonaSnapshotArgs = object({
  vaultId: id("vaults"),
  branch: optional(string()),
});

const prebuildDaytonaSnapshotResult = object({
  ok: boolean(),
  snapshotName: optional(string()),
  commitSha: optional(string()),
  message: optional(string()),
});

const buildCommitPinnedSnapshotArgs = object({
  userId: id("users"),
  owner: string(),
  repo: string(),
  branch: string(),
  commitSha: string(),
});

const daytonaSnapshotListItem = object({
  name: string(),
  state: string(),
  commitSha: optional(string()),
  dashboardUrl: optional(string()),
  errorReason: optional(string()),
  attemptCount: number(),
  createdAt: optional(number()),
  updatedAt: optional(number()),
  lastUsedAt: optional(number()),
  nextRetryAt: optional(number()),
});

const listDaytonaSnapshotsForVaultArgs = object({
  vaultId: id("vaults"),
});

const listDaytonaSnapshotsForVaultResult = object({
  ok: boolean(),
  snapshots: array(daytonaSnapshotListItem),
  message: optional(string()),
});

const removeDaytonaSnapshotArgs = object({
  vaultId: id("vaults"),
  branch: optional(string()),
  snapshotName: optional(string()),
});

const removeDaytonaSnapshotResult = object({
  ok: boolean(),
  snapshotName: optional(string()),
  message: optional(string()),
});

const getDaytonaPrebuildStatusArgs = object({
  vaultId: id("vaults"),
  branch: optional(string()),
});

const getDaytonaPrebuildStatusResult = object({
  ok: boolean(),
  commitSha: optional(string()),
  snapshotName: optional(string()),
  state: optional(string()),
  errorReason: optional(string()),
  message: optional(string()),
});

const getDaytonaPrebuildLogsArgs = object({
  vaultId: id("vaults"),
  branch: optional(string()),
});

const getDaytonaPrebuildLogsResult = object({
  ok: boolean(),
  logs: optional(string()),
  branch: optional(string()),
  snapshotName: optional(string()),
  updatedAt: optional(number()),
  message: optional(string()),
});

const ensureDaytonaRegistryArgs = object({
  vaultId: id("vaults"),
});

const ensureDaytonaRegistryResult = object({
  ok: boolean(),
  message: optional(string()),
});

export const startDaytonaWorkspace = action({
  args: startDaytonaWorkspaceArgs,
  returns: startDaytonaWorkspaceResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof startDaytonaWorkspaceResult>> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    const requestedBranch = args.branch?.trim() || DAYTONA_COMMIT_PINNED_BRANCH;
    const startupStartedAt = Date.now();
    if (!isCommitPinnedDaytonaBranch(requestedBranch)) {
      return {
        ok: false,
        status: "not_configured",
        message: `Daytona commit-pinned snapshots currently support ${DAYTONA_COMMIT_PINNED_BRANCH} only.`,
        branch: requestedBranch,
      };
    }
    const branch = canonicalizeCommitPinnedDaytonaBranch(requestedBranch);

    const expectedCommitSha = vault.commitSHA?.trim();
    if (!expectedCommitSha) {
      return {
        ok: false,
        status: "not_configured",
        message:
          "Latest main commit is not known yet. Refresh the repository first.",
        branch,
      };
    }

    const snapshotRecord = await ctx.runQuery(
      internal.daytona.snapshotRecords.getByRepoBranchCommit,
      {
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        branch,
        commitSha: expectedCommitSha,
      },
    );
    if (!snapshotRecord) {
      return {
        ok: false,
        status: "not_configured",
        message: `Snapshot for ${branch}@${shortenCommitSha(expectedCommitSha)} has not started building yet.`,
        branch,
      };
    }
    if (snapshotRecord.status === "queued") {
      return {
        ok: false,
        status: "not_configured",
        message: `Snapshot for ${branch}@${shortenCommitSha(expectedCommitSha)} is queued.`,
        branch,
      };
    }
    if (snapshotRecord.status === "building") {
      return {
        ok: false,
        status: "not_configured",
        message: `Snapshot for ${branch}@${shortenCommitSha(expectedCommitSha)} is still building.`,
        branch,
      };
    }
    if (snapshotRecord.status === "failed") {
      return {
        ok: false,
        status: "not_configured",
        message:
          snapshotRecord.lastError && snapshotRecord.lastError.length > 0
            ? `Latest snapshot for ${branch}@${shortenCommitSha(expectedCommitSha)} failed: ${snapshotRecord.lastError}`
            : `Latest snapshot for ${branch}@${shortenCommitSha(expectedCommitSha)} failed.`,
        branch,
      };
    }
    if (snapshotRecord.status === "removing") {
      return {
        ok: false,
        status: "not_configured",
        message: `Snapshot for ${branch}@${shortenCommitSha(expectedCommitSha)} is being removed.`,
        branch,
      };
    }

    const apiConfig = resolveDaytonaApiConfig();
    if (!apiConfig.ok) {
      return {
        ok: false,
        status: "not_configured",
        message: apiConfig.message,
        branch,
      };
    }
    const baseUrl = apiConfig.baseUrl;
    const token = apiConfig.token;

    console.log("daytona:workspace:request", {
      vaultId: args.vaultId,
      repo: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
      branch,
    });

    const envLabel = getDaytonaEnvLabel();
    const sandboxName = inferDaytonaWorkspaceSandboxName({
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
      branch,
      commitSha: expectedCommitSha,
      vaultId: args.vaultId,
    });

    const config: { apiKey: string; apiUrl?: string; target?: string } = {
      apiKey: token,
    };
    if (baseUrl) {
      config.apiUrl = baseUrl;
    }
    const daytona = new Daytona(config);
    const repoWorkdir = `${DEFAULT_WORKSPACE_DIR}/${vault.ghRepoName}`;
    const requestedVaultLabel = String(args.vaultId);
    const requestedBranchLabel = branch;
    const requestedCommitLabel = expectedCommitSha;
    const codexConnection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId,
        kind: "codex",
      },
    );
    let codexWorkspaceWarning: string | null = null;
    const codexAuthVolume =
      codexConnection?.kind === "codex"
        ? await (async () => {
            try {
              return await ensureDaytonaCodexAuthVolume({
                daytona,
                envLabel,
                userId,
              });
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              console.warn("daytona:workspace:codex-volume:failed", {
                vaultId: args.vaultId,
                userId,
                message,
              });
              codexWorkspaceWarning =
                "Codex auth volume is unavailable, so this workspace launched without Codex auth reuse.";
              return null;
            }
          })()
        : null;
    const hasMatchingLabels = (candidate: Sandbox): boolean => {
      const candidateVaultLabel = readSandboxLabel(candidate, "noter.vault_id");
      if (candidateVaultLabel !== requestedVaultLabel) {
        return false;
      }
      const candidateBranchLabel = readSandboxLabel(candidate, "noter.branch");
      if (candidateBranchLabel !== requestedBranchLabel) {
        return false;
      }
      const candidateCommitLabel = readSandboxLabel(
        candidate,
        "noter.commit_sha",
      );
      return candidateCommitLabel === requestedCommitLabel;
    };
    const hasCompatibleSandboxSetup = (candidate: Sandbox): boolean =>
      hasExpectedCodexAuthSetup({
        sandbox: candidate,
        volumeId: codexAuthVolume?.id,
      });

    let sandbox: Sandbox | null = null;
    const snapshotToUse = snapshotRecord.snapshotName ?? null;
    let sandboxCreateMs = 0;
    let sandboxLifecycle: "created" | "resumed" | "reused" = "created";

    if (vault.daytonaSandboxId) {
      try {
        const persistedSandbox = await daytona.get(vault.daytonaSandboxId);
        if (hasMatchingLabels(persistedSandbox)) {
          if (hasCompatibleSandboxSetup(persistedSandbox)) {
            sandbox = persistedSandbox;
          } else {
            console.log("daytona:workspace:recreate-for-codex-auth", {
              vaultId: args.vaultId,
              sandboxId: persistedSandbox.id,
              reason: "mismatched_codex_auth_setup",
            });
            await persistedSandbox.delete();
          }
        }
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
      }
    }

    if (!sandbox) {
      const matches = await daytona.list(
        {
          "noter.vault_id": requestedVaultLabel,
          "noter.branch": requestedBranchLabel,
          "noter.commit_sha": requestedCommitLabel,
        },
        1,
        5,
      );
      for (const match of matches.items) {
        try {
          const matchedSandbox = await daytona.get(match.id);
          if (hasMatchingLabels(matchedSandbox)) {
            if (hasCompatibleSandboxSetup(matchedSandbox)) {
              sandbox = matchedSandbox;
              break;
            }
            console.log("daytona:workspace:recreate-for-codex-auth", {
              vaultId: args.vaultId,
              sandboxId: matchedSandbox.id,
              reason: "mismatched_codex_auth_setup",
            });
            await matchedSandbox.delete();
          }
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error;
          }
        }
      }
    }

    if (sandbox) {
      const currentState = sandbox.state?.toLowerCase();
      if (currentState === "started") {
        sandboxLifecycle = "reused";
      } else {
        const resumeStartedAt = Date.now();
        try {
          await sandbox.start();
          await sandbox.refreshData();
          sandboxCreateMs = Date.now() - resumeStartedAt;
          sandboxLifecycle = "resumed";
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.warn("daytona:workspace:resume:failed", {
            vaultId: args.vaultId,
            sandboxId: sandbox.id,
            state: sandbox.state,
            message,
          });
          sandbox = null;
        }
      }
    }

    let codexBinaryStatus: "already_present" | "installed" | null = null;
    if (sandbox && codexAuthVolume) {
      try {
        codexBinaryStatus = await ensureCodexBinaryInSandbox({ sandbox });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("daytona:workspace:codex-binary:failed", {
          vaultId: args.vaultId,
          sandboxId: sandbox.id,
          message,
        });
        codexWorkspaceWarning =
          "Codex is connected, but the CLI could not be prepared in this workspace yet.";
      }
    }

    if (!snapshotToUse) {
      return {
        ok: false,
        status: "not_configured",
        message: `Snapshot name is missing for ${branch}@${shortenCommitSha(expectedCommitSha)}.`,
        branch,
      };
    }

    if (!sandbox) {
      try {
        const snapshot = await daytona.snapshot.get(snapshotToUse);
        if (snapshot.state !== "active") {
          return {
            ok: false,
            status: "not_configured",
            message: `Snapshot ${snapshotToUse} is ${snapshot.state}. Wait for it to become active.`,
            branch,
          };
        }
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
        return {
          ok: false,
          status: "not_configured",
          message: `Snapshot ${snapshotToUse} is missing.`,
          branch,
        };
      }

      const baseParams: CreateSandboxFromSnapshotParams = {
        name: sandboxName,
        language: "typescript",
        user: "daytona",
        public: true,
        envVars: (() => {
          const envVars: Record<string, string> = {
            NOTER_VAULT_ID: args.vaultId,
            NOTER_REPO: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
            NOTER_BRANCH: branch,
            NOTER_COMMIT_SHA: expectedCommitSha,
          };
          if (codexAuthVolume) {
            envVars.CODEX_HOME = DAYTONA_CODEX_HOME;
          }
          return envVars;
        })(),
        labels: {
          "noter.vault_id": args.vaultId,
          "noter.repo": `${vault.ghRepoOwner}/${vault.ghRepoName}`,
          "noter.branch": branch,
          "noter.commit_sha": expectedCommitSha,
        },
        ...(codexAuthVolume
          ? {
              volumes: [
                {
                  volumeId: codexAuthVolume.id,
                  mountPath: DAYTONA_CODEX_HOME,
                },
              ],
            }
          : {}),
      };
      const sandboxParams: CreateSandboxFromSnapshotParams = {
        ...baseParams,
        snapshot: snapshotToUse,
      };
      const sandboxCreateStartedAt = Date.now();
      sandbox = await daytona.create(sandboxParams);
      sandboxCreateMs = Date.now() - sandboxCreateStartedAt;
      sandboxLifecycle = "created";
    }

    const resolvedSandboxName = sandbox.name;

    const repoRefreshMode: RepoRefreshMode = "never";
    const repoRefreshMs = 0;
    let devServerStartMs = 0;
    const repoRefreshed = false;
    const repoRefreshReason = "commit_pinned";
    const bootstrapMessage = `Using commit-pinned snapshot ${snapshotToUse} for ${shortenCommitSha(expectedCommitSha)}. Repo refresh skipped to preserve the exact commit.`;
    let devServerMessage: string | null = null;

    const devServerStartedAt = Date.now();
    try {
      const devServerLaunch = await startDaytonaDevServer({
        sandbox,
        repoDir: repoWorkdir,
      });
      devServerStartMs = Date.now() - devServerStartedAt;

      devServerMessage =
        devServerLaunch.transport === "tmux"
          ? `Dev server ${describeDaytonaDevServerLaunchStatus(devServerLaunch.status)} on port ${DAYTONA_PREVIEW_PORT} in tmux session ${DAYTONA_DEV_SERVER_TMUX_SESSION}.`
          : `Dev server ${describeDaytonaDevServerLaunchStatus(devServerLaunch.status)} on port ${DAYTONA_PREVIEW_PORT} (logs: ${DAYTONA_DEV_LOG}).`;
    } catch (error) {
      devServerStartMs = Date.now() - devServerStartedAt;
      const message = error instanceof Error ? error.message : String(error);
      console.warn("daytona:dev-server:failed", {
        vaultId: args.vaultId,
        message,
      });
      devServerMessage = `Dev server failed to start: ${message}`;
    }

    await ctx.runMutation(internal.vault.updateVaultDaytonaSandbox, {
      vaultId: args.vaultId,
      sandboxId: sandbox.id,
      sandboxName: resolvedSandboxName,
      createdAt: Date.now(),
    });

    const startupMetrics: Infer<typeof daytonaStartupMetrics> = {
      totalMs: Date.now() - startupStartedAt,
      sandboxCreateMs,
      repoRefreshMs,
      devServerStartMs,
      repoRefreshMode,
      repoRefreshed,
      repoRefreshReason,
    };

    console.log("daytona:workspace:timing", {
      vaultId: args.vaultId,
      sandboxId: sandbox.id,
      metrics: startupMetrics,
    });

    console.log("daytona:workspace:created", {
      vaultId: args.vaultId,
      sandboxId: sandbox.id,
      sandboxName: resolvedSandboxName,
    });

    const baseMessage =
      sandboxLifecycle === "created"
        ? `Daytona sandbox created from snapshot ${snapshotToUse}.`
        : sandboxLifecycle === "resumed"
          ? `Daytona sandbox resumed for ${shortenCommitSha(expectedCommitSha)} (${resolvedSandboxName}).`
          : `Reusing Daytona sandbox ${resolvedSandboxName}.`;
    const messageParts: string[] = [baseMessage];
    if (bootstrapMessage) {
      messageParts.push(bootstrapMessage);
    }
    if (devServerMessage) {
      messageParts.push(devServerMessage);
    }
    if (codexBinaryStatus === "installed") {
      messageParts.push("Codex CLI was installed for this workspace.");
    }
    if (codexWorkspaceWarning) {
      messageParts.push(codexWorkspaceWarning);
    }
    messageParts.push(
      `Startup timing: total ${formatDurationMs(startupMetrics.totalMs)} (sandbox ${formatDurationMs(
        startupMetrics.sandboxCreateMs,
      )}, repo ${formatDurationMs(startupMetrics.repoRefreshMs)}, dev ${formatDurationMs(
        startupMetrics.devServerStartMs,
      )}).`,
    );

    return {
      ok: true,
      status: "created",
      message: messageParts.join(" "),
      branch,
      sandboxId: sandbox.id,
      sandboxName: resolvedSandboxName,
      startupMetrics,
    };
  },
});

export const prepareCodexAuthSandbox = action({
  args: prepareCodexAuthSandboxArgs,
  returns: prepareCodexAuthSandboxResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof prepareCodexAuthSandboxResult>> => {
    const userId = await getUserId(ctx);
    const apiConfig = resolveDaytonaApiConfig();
    if (!apiConfig.ok) {
      return {
        ok: false,
        message: apiConfig.message,
      };
    }

    const daytona = new Daytona({
      apiKey: apiConfig.token,
      ...(apiConfig.baseUrl ? { apiUrl: apiConfig.baseUrl } : {}),
    });
    const envLabel = getDaytonaEnvLabel();
    const existingConnection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId,
        kind: "codex",
      },
    );
    const codexAuthVolume = await ensureDaytonaCodexAuthVolume({
      daytona,
      envLabel,
      userId,
    });
    const authSandbox = await resolveVerifiedDaytonaCodexAuthSandbox({
      ctx,
      userId,
      daytona,
      baseUrl: apiConfig.baseUrl,
      token: apiConfig.token,
      volumeId: codexAuthVolume.id,
      persistedSandboxId:
        existingConnection?.kind === "codex"
          ? existingConnection.auth.authSandboxId
          : undefined,
    });

    const loginCheck = await checkCodexLoginInSandbox({
      sandbox: authSandbox.sandbox,
    });
    await ctx.runMutation(internal.providerConnections.upsertCodex, {
      userId,
      auth: {
        method: "device_auth",
        storage: "daytona_volume",
        volumeId: codexAuthVolume.id,
        volumeName: codexAuthVolume.name,
        codexHome: DAYTONA_CODEX_HOME,
        authSandboxId: authSandbox.sandbox.id,
        authSandboxName: authSandbox.sandboxName,
        lastCheckAt: loginCheck.checkedAt,
        lastCheckStatus: loginCheck.status,
        ...(loginCheck.message ? { lastError: loginCheck.message } : {}),
      },
    });

    const shouldOpenTerminal =
      args.openTerminal === true || loginCheck.status !== "ready";

    let terminalUrl: string | undefined;
    if (shouldOpenTerminal) {
      try {
        terminalUrl = await getDaytonaSandboxTerminalUrl({
          sandbox: authSandbox.sandbox,
        });
      } catch (error) {
        return {
          ok: false,
          sandboxId: authSandbox.sandbox.id,
          sandboxName: authSandbox.sandboxName,
          lastCheckStatus: loginCheck.status,
          message:
            error instanceof Error
              ? error.message
              : "Failed to create a Daytona terminal link.",
        };
      }
    }

    return {
      ok: true,
      sandboxId: authSandbox.sandbox.id,
      sandboxName: authSandbox.sandboxName,
      terminalUrl,
      lastCheckStatus: loginCheck.status,
      message:
        loginCheck.status === "ready"
          ? authSandbox.lifecycle === "created"
            ? "Codex auth sandbox is ready and already logged in."
            : "Codex is already logged in."
          : "Codex auth sandbox is ready. Run codex login --device-auth in Daytona, finish the browser step, then click Check login.",
    };
  },
});

export const verifyCodexLoginInSandbox = action({
  args: verifyCodexLoginInSandboxArgs,
  returns: verifyCodexLoginInSandboxResult,
  handler: async (
    ctx,
  ): Promise<Infer<typeof verifyCodexLoginInSandboxResult>> => {
    const userId = await getUserId(ctx);
    const connection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId,
        kind: "codex",
      },
    );
    if (connection?.kind !== "codex") {
      return {
        ok: false,
        connected: false,
        message: "Codex is not configured in Daytona yet.",
      };
    }

    const apiConfig = resolveDaytonaApiConfig();
    if (!apiConfig.ok) {
      return {
        ok: false,
        connected: false,
        message: apiConfig.message,
      };
    }

    const daytona = new Daytona({
      apiKey: apiConfig.token,
      ...(apiConfig.baseUrl ? { apiUrl: apiConfig.baseUrl } : {}),
    });
    const codexAuthVolume = await ensureDaytonaCodexAuthVolume({
      daytona,
      envLabel: getDaytonaEnvLabel(),
      userId,
    });
    const authSandbox = await resolveVerifiedDaytonaCodexAuthSandbox({
      ctx,
      userId,
      daytona,
      baseUrl: apiConfig.baseUrl,
      token: apiConfig.token,
      volumeId: codexAuthVolume.id,
      persistedSandboxId: connection.auth.authSandboxId,
    });

    const loginCheck = await checkCodexLoginInSandbox({
      sandbox: authSandbox.sandbox,
    });
    await ctx.runMutation(internal.providerConnections.upsertCodex, {
      userId,
      auth: {
        method: "device_auth",
        storage: "daytona_volume",
        volumeId: codexAuthVolume.id,
        volumeName: codexAuthVolume.name,
        codexHome: DAYTONA_CODEX_HOME,
        authSandboxId: authSandbox.sandbox.id,
        authSandboxName: authSandbox.sandboxName,
        lastCheckAt: loginCheck.checkedAt,
        lastCheckStatus: loginCheck.status,
        ...(loginCheck.message ? { lastError: loginCheck.message } : {}),
      },
    });

    return {
      ok: true,
      connected: loginCheck.status === "ready",
      lastCheckStatus: loginCheck.status,
      message:
        loginCheck.status === "ready"
          ? "Codex is logged in and ready in Daytona."
          : loginCheck.message ?? "Codex login is still missing in Daytona.",
    };
  },
});

export const disconnectCodexProvider = action({
  args: disconnectCodexProviderArgs,
  returns: disconnectCodexProviderResult,
  handler: async (
    ctx,
  ): Promise<Infer<typeof disconnectCodexProviderResult>> => {
    const userId = await getUserId(ctx);
    const connection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId,
        kind: "codex",
      },
    );
    if (connection?.kind !== "codex") {
      return {
        ok: true,
        message: "Codex is already disconnected.",
      };
    }

    const apiConfig = resolveDaytonaApiConfig();
    if (!apiConfig.ok) {
      return {
        ok: false,
        message: `${apiConfig.message} Codex disconnect was not completed so the Daytona auth resources can be retried.`,
      };
    }

    const warningMessages: string[] = [];
    const daytona = new Daytona({
      apiKey: apiConfig.token,
      ...(apiConfig.baseUrl ? { apiUrl: apiConfig.baseUrl } : {}),
    });
    let clearedAuthData = false;
    let clearAuthError: string | null = null;

    const mountedSandboxIds = await listDaytonaSandboxIdsUsingVolume({
      daytona,
      volumeId: connection.auth.volumeId,
    });
    const cleanupSandboxIds = [
      ...(connection.auth.authSandboxId ? [connection.auth.authSandboxId] : []),
      ...mountedSandboxIds.filter(
        (sandboxId) => sandboxId !== connection.auth.authSandboxId,
      ),
    ];

    if (cleanupSandboxIds.length > 0) {
      for (const sandboxId of cleanupSandboxIds) {
        try {
          const sandbox = await daytona.get(sandboxId);
          if (
            !hasCodexAuthVolumeMount({
              sandbox,
              volumeId: connection.auth.volumeId,
            })
          ) {
            continue;
          }
          await clearCodexAuthHomeInSandbox({ sandbox });
          clearedAuthData = true;
          clearAuthError = null;
          break;
        } catch (error) {
          clearAuthError =
            error instanceof Error
              ? error.message
              : "Failed to clear Codex auth data.";
        }
      }
    }

    if (connection.auth.authSandboxId) {
      try {
        const sandbox = await daytona.get(connection.auth.authSandboxId);
        await sandbox.delete();
      } catch (error) {
        if (!isNotFoundError(error)) {
          warningMessages.push(
            error instanceof Error
              ? error.message
              : "Failed to delete the Codex auth sandbox.",
          );
        }
      }
    }

    let deletedVolume = false;
    try {
      const volume = await daytona.volume.get(connection.auth.volumeName);
      await daytona.volume.delete(volume);
      deletedVolume = true;
    } catch (error) {
      if (isNotFoundError(error)) {
        deletedVolume = true;
      } else {
        warningMessages.push(
          error instanceof Error
            ? error.message
            : "Failed to delete the Codex auth volume.",
        );
      }
    }

    if (!clearedAuthData && clearAuthError && !deletedVolume) {
      warningMessages.push(clearAuthError);
    }

    if (warningMessages.length > 0) {
      return {
        ok: false,
        message: `Codex disconnect did not finish. Cleanup failed: ${warningMessages.join(" ")}`,
      };
    }

    await ctx.runMutation(internal.providerConnections.removeByUserAndKind, {
      userId,
      kind: "codex",
    });

    return {
      ok: true,
      message: "Codex disconnected from Daytona.",
    };
  },
});

async function resolveDaytonaSandboxForVault(args: {
  ctx: ActionCtx;
  daytona: Daytona;
  vaultId: Id<"vaults">;
  daytonaSandboxId?: string;
  daytonaSandboxName?: string;
  requestedBranch?: string;
  requestedCommitSha?: string;
}): Promise<
  | { ok: true; sandbox: Sandbox; sandboxName: string | undefined }
  | { ok: false; message: string }
> {
  const requestedBranchValue = args.requestedBranch?.trim();
  const requestedBranch = requestedBranchValue
    ? canonicalizeCommitPinnedDaytonaBranch(requestedBranchValue)
    : undefined;
  const requestedCommitSha = args.requestedCommitSha?.trim();
  const matchesRequestedBranch = (candidate: Sandbox): boolean => {
    if (!requestedBranch) {
      return true;
    }
    const branchLabel = readSandboxLabel(candidate, "noter.branch");
    if (branchLabel !== requestedBranch) {
      return false;
    }
    if (!requestedCommitSha) {
      return true;
    }
    const commitLabel = readSandboxLabel(candidate, "noter.commit_sha");
    return commitLabel === requestedCommitSha;
  };

  let sandbox: Sandbox | null = null;
  let sandboxName = args.daytonaSandboxName;

  if (args.daytonaSandboxId) {
    try {
      const persistedSandbox = await args.daytona.get(args.daytonaSandboxId);
      if (matchesRequestedBranch(persistedSandbox)) {
        sandbox = persistedSandbox;
        sandboxName = persistedSandbox.name;
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  if (!sandbox) {
    const labels: Record<string, string> = { "noter.vault_id": args.vaultId };
    if (requestedBranch) {
      labels["noter.branch"] = requestedBranch;
    }
    if (requestedCommitSha) {
      labels["noter.commit_sha"] = requestedCommitSha;
    }
    const matches = await args.daytona.list(labels, 1, 5);
    if (matches.items.length === 0) {
      return {
        ok: false,
        message: requestedBranch
          ? `No Daytona sandbox found for branch ${requestedBranch}. Click Create sandbox first.`
          : "No Daytona sandbox is connected to this vault yet. Click Create sandbox first.",
      };
    }
    const match = matches.items[0];
    if (!match.id) {
      return {
        ok: false,
        message: requestedBranch
          ? `No Daytona sandbox found for branch ${requestedBranch}. Click Create sandbox first.`
          : "No Daytona sandbox is connected to this vault yet. Click Create sandbox first.",
      };
    }

    const matchedSandbox = await args.daytona.get(match.id);
    if (!matchesRequestedBranch(matchedSandbox)) {
      return {
        ok: false,
        message: requestedBranch
          ? `No Daytona sandbox found for branch ${requestedBranch}. Click Create sandbox first.`
          : "No Daytona sandbox is connected to this vault yet. Click Create sandbox first.",
      };
    }

    sandbox = matchedSandbox;
    sandboxName = sandbox.name;
    await args.ctx.runMutation(internal.vault.updateVaultDaytonaSandbox, {
      vaultId: args.vaultId,
      sandboxId: sandbox.id,
      sandboxName,
      createdAt: Date.now(),
    });
  }

  return {
    ok: true,
    sandbox,
    sandboxName,
  };
}

export const getDaytonaTerminalUrl = action({
  args: getDaytonaTerminalUrlArgs,
  returns: getDaytonaTerminalUrlResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof getDaytonaTerminalUrlResult>> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    const apiConfig = resolveDaytonaApiConfig();
    if (!apiConfig.ok) {
      return {
        ok: false,
        message: apiConfig.message,
      };
    }
    const baseUrl = apiConfig.baseUrl;
    const token = apiConfig.token;

    const config: { apiKey: string; apiUrl?: string; target?: string } = {
      apiKey: token,
    };
    if (baseUrl) {
      config.apiUrl = baseUrl;
    }
    const daytona = new Daytona(config);
    const resolvedSandbox = await resolveDaytonaSandboxForVault({
      ctx,
      daytona,
      vaultId: args.vaultId,
      daytonaSandboxId: vault.daytonaSandboxId,
      daytonaSandboxName: vault.daytonaSandboxName,
      requestedBranch: args.branch,
      requestedCommitSha:
        canonicalizeCommitPinnedDaytonaBranch(
          args.branch?.trim() || DAYTONA_COMMIT_PINNED_BRANCH,
        ) === DAYTONA_COMMIT_PINNED_BRANCH
          ? vault.commitSHA?.trim()
          : undefined,
    });
    if (!resolvedSandbox.ok) {
      return {
        ok: false,
        message: resolvedSandbox.message,
      };
    }
    const { sandbox, sandboxName } = resolvedSandbox;

    try {
      const preview = await sandbox.getSignedPreviewUrl(22222, 300);
      return {
        ok: true,
        url: preview.url,
        message: sandboxName
          ? `Terminal link ready for ${sandboxName}.`
          : "Terminal link ready.",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        message:
          "Failed to create a terminal link. Try opening the Terminal from the Daytona dashboard instead. " +
          `(${errorMessage})`,
      };
    }
  },
});

export const getDaytonaPreviewUrl = action({
  args: getDaytonaPreviewUrlArgs,
  returns: getDaytonaPreviewUrlResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof getDaytonaPreviewUrlResult>> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    const apiConfig = resolveDaytonaApiConfig();
    if (!apiConfig.ok) {
      return {
        ok: false,
        message: apiConfig.message,
      };
    }
    const baseUrl = apiConfig.baseUrl;
    const token = apiConfig.token;

    const config: { apiKey: string; apiUrl?: string; target?: string } = {
      apiKey: token,
    };
    if (baseUrl) {
      config.apiUrl = baseUrl;
    }
    const daytona = new Daytona(config);
    const resolvedSandbox = await resolveDaytonaSandboxForVault({
      ctx,
      daytona,
      vaultId: args.vaultId,
      daytonaSandboxId: vault.daytonaSandboxId,
      daytonaSandboxName: vault.daytonaSandboxName,
      requestedBranch: args.branch,
      requestedCommitSha:
        canonicalizeCommitPinnedDaytonaBranch(
          args.branch?.trim() || DAYTONA_COMMIT_PINNED_BRANCH,
        ) === DAYTONA_COMMIT_PINNED_BRANCH
          ? vault.commitSHA?.trim()
          : undefined,
    });
    if (!resolvedSandbox.ok) {
      return {
        ok: false,
        message: resolvedSandbox.message,
      };
    }
    const { sandbox, sandboxName } = resolvedSandbox;

    const branchLabel = readSandboxLabel(sandbox, "noter.branch");

    try {
      const preview = sandbox.public
        ? await sandbox.getPreviewLink(DAYTONA_PREVIEW_PORT)
        : await sandbox.getSignedPreviewUrl(
            DAYTONA_PREVIEW_PORT,
            DAYTONA_PREVIEW_TTL_SECONDS,
          );
      return {
        ok: true,
        url: preview.url,
        branch: branchLabel.length > 0 ? branchLabel : undefined,
        message: sandboxName
          ? `Preview link ready for ${sandboxName}.`
          : "Preview link ready.",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        message: `Failed to create a preview link. (${errorMessage})`,
      };
    }
  },
});

export const startDaytonaDevServerSafe = action({
  args: startDaytonaDevServerSafeArgs,
  returns: startDaytonaDevServerSafeResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof startDaytonaDevServerSafeResult>> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    const apiConfig = resolveDaytonaApiConfig();
    if (!apiConfig.ok) {
      return {
        ok: false,
        message: apiConfig.message,
      };
    }
    const baseUrl = apiConfig.baseUrl;
    const token = apiConfig.token;

    const config: { apiKey: string; apiUrl?: string; target?: string } = {
      apiKey: token,
    };
    if (baseUrl) {
      config.apiUrl = baseUrl;
    }
    const daytona = new Daytona(config);
    let sandboxId = vault.daytonaSandboxId;
    let sandboxName = vault.daytonaSandboxName;

    if (!sandboxId) {
      const matches = await daytona.list(
        { "noter.vault_id": args.vaultId },
        1,
        5,
      );
      const match = matches.items.at(0);
      if (!match) {
        return {
          ok: false,
          message:
            "No Daytona sandbox is connected to this vault yet. Click Start Daytona first.",
        };
      }
      sandboxId = match.id;
      sandboxName = match.name;
      await ctx.runMutation(internal.vault.updateVaultDaytonaSandbox, {
        vaultId: args.vaultId,
        sandboxId,
        sandboxName,
        createdAt: Date.now(),
      });
    }

    const sandbox = await daytona.get(sandboxId);
    await ensureDaytonaSandboxStarted(sandbox);
    const repoDir = `${DEFAULT_WORKSPACE_DIR}/${vault.ghRepoName}`;

    const statusCommand = `bash -lc ${quoteForBash(buildDevServerStatusScript())}`;
    const statusResult = await sandbox.process.executeCommand(
      statusCommand,
      undefined,
      undefined,
      60,
    );
    if (statusResult.exitCode === 0) {
      const status = parseDevServerStatus(statusResult.result);
      if (status.running) {
        return {
          ok: true,
          message: "Dev server already running.",
        };
      }
    }

    try {
      await startDaytonaDevServer({ sandbox, repoDir });
      return {
        ok: true,
        message: sandboxName
          ? `Dev server start requested for ${sandboxName}.`
          : "Dev server start requested.",
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to start dev server.",
      };
    }
  },
});

export const startDaytonaDevServerFast = action({
  args: startDaytonaDevServerFastArgs,
  returns: startDaytonaDevServerFastResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof startDaytonaDevServerFastResult>> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    const apiConfig = resolveDaytonaApiConfig();
    if (!apiConfig.ok) {
      return {
        ok: false,
        message: apiConfig.message,
      };
    }
    const baseUrl = apiConfig.baseUrl;
    const token = apiConfig.token;

    const config: { apiKey: string; apiUrl?: string; target?: string } = {
      apiKey: token,
    };
    if (baseUrl) {
      config.apiUrl = baseUrl;
    }
    const daytona = new Daytona(config);
    let sandboxId = vault.daytonaSandboxId;
    let sandboxName = vault.daytonaSandboxName;

    if (!sandboxId) {
      const matches = await daytona.list(
        { "noter.vault_id": args.vaultId },
        1,
        5,
      );
      const match = matches.items.at(0);
      if (!match) {
        return {
          ok: false,
          message:
            "No Daytona sandbox is connected to this vault yet. Click Start Daytona first.",
        };
      }
      sandboxId = match.id;
      sandboxName = match.name;
      await ctx.runMutation(internal.vault.updateVaultDaytonaSandbox, {
        vaultId: args.vaultId,
        sandboxId,
        sandboxName,
        createdAt: Date.now(),
      });
    }

    const sandbox = await daytona.get(sandboxId);
    await ensureDaytonaSandboxStarted(sandbox);

    const statusCommand = `bash -lc ${quoteForBash(buildDevServerStatusScript())}`;
    const statusResult = await sandbox.process.executeCommand(
      statusCommand,
      undefined,
      undefined,
      60,
    );
    if (statusResult.exitCode === 0) {
      const status = parseDevServerStatus(statusResult.result);
      if (status.running) {
        return {
          ok: true,
          message: "Dev server already running.",
        };
      }
    }

    const repoDir = `${DEFAULT_WORKSPACE_DIR}/${vault.ghRepoName}`;
    const installLogPath = quoteForBash(PNPM_INSTALL_LOG);
    const devLogPath = quoteForBash(DAYTONA_DEV_LOG);
    const devServerScript = buildDaytonaSafeDevServerCommand({
      repoDir,
      devOrigin: null,
    });
    const wrappedCommand = stripIndent`
      (
      ${devServerScript}
      ) 2>&1 | tee ${installLogPath}
    `;
    const startScript = stripIndent`
      set -e
      if [ ! -d "${repoDir}" ]; then
        echo "__NOTER_REPO_MISSING__"
        exit 1
      fi
      rm -f ${quoteForBash(PNPM_INSTALL_LOG)} ${quoteForBash(DAYTONA_DEV_LOG)}
      nohup bash -lc ${quoteForBash(wrappedCommand)} > ${devLogPath} 2>&1 &
    `;
    const startCommand = `bash -lc ${quoteForBash(startScript)}`;
    const startResult = await sandbox.process.executeCommand(
      startCommand,
      undefined,
      undefined,
      600,
    );

    if (startResult.exitCode !== 0) {
      const raw = startResult.result;
      const message = raw.includes("__NOTER_REPO_MISSING__")
        ? "Repo directory not found in sandbox. Start Daytona first."
        : `Failed to start dev server (exit ${startResult.exitCode}).`;
      return {
        ok: false,
        message,
      };
    }

    return {
      ok: true,
      message: sandboxName
        ? `Fast dev start requested for ${sandboxName}.`
        : "Fast dev start requested.",
    };
  },
});

export const getDaytonaDevServerStatus = action({
  args: getDaytonaDevServerStatusArgs,
  returns: getDaytonaDevServerStatusResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof getDaytonaDevServerStatusResult>> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    const apiConfig = resolveDaytonaApiConfig();
    if (!apiConfig.ok) {
      return {
        ok: false,
        port: DAYTONA_PREVIEW_PORT,
        message: apiConfig.message,
      };
    }
    const baseUrl = apiConfig.baseUrl;
    const token = apiConfig.token;

    const config: { apiKey: string; apiUrl?: string; target?: string } = {
      apiKey: token,
    };
    if (baseUrl) {
      config.apiUrl = baseUrl;
    }
    const daytona = new Daytona(config);
    let sandboxId = vault.daytonaSandboxId;
    let sandboxName = vault.daytonaSandboxName;

    if (!sandboxId) {
      const matches = await daytona.list(
        { "noter.vault_id": args.vaultId },
        1,
        5,
      );
      const match = matches.items.at(0);
      if (!match) {
        return {
          ok: false,
          port: DAYTONA_PREVIEW_PORT,
          message:
            "No Daytona sandbox is connected to this vault yet. Click Start Daytona first.",
        };
      }
      sandboxId = match.id;
      sandboxName = match.name;
      await ctx.runMutation(internal.vault.updateVaultDaytonaSandbox, {
        vaultId: args.vaultId,
        sandboxId,
        sandboxName,
        createdAt: Date.now(),
      });
    }

    const sandbox = await daytona.get(sandboxId);
    const statusCommand = `bash -lc ${quoteForBash(buildDevServerStatusScript())}`;
    const statusResult = await sandbox.process.executeCommand(
      statusCommand,
      undefined,
      undefined,
      60,
    );

    if (statusResult.exitCode !== 0) {
      return {
        ok: false,
        port: DAYTONA_PREVIEW_PORT,
        message: `Failed to check dev server (exit ${statusResult.exitCode}).`,
      };
    }

    const status = parseDevServerStatus(statusResult.result);
    const defaultMessage = sandboxName
      ? `Dev status for ${sandboxName}.`
      : "Dev status ready.";
    return {
      ok: true,
      port: DAYTONA_PREVIEW_PORT,
      running: status.running,
      pid: status.pid,
      logTail: status.logTail,
      message: status.message ?? defaultMessage,
    };
  },
});

export const removeDaytonaSandbox = action({
  args: removeDaytonaSandboxArgs,
  returns: removeDaytonaSandboxResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof removeDaytonaSandboxResult>> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    const apiConfig = resolveDaytonaApiConfig();
    if (!apiConfig.ok) {
      return {
        ok: false,
        message: apiConfig.message,
      };
    }
    const baseUrl = apiConfig.baseUrl;
    const token = apiConfig.token;

    const config: { apiKey: string; apiUrl?: string; target?: string } = {
      apiKey: token,
    };
    if (baseUrl) {
      config.apiUrl = baseUrl;
    }
    const daytona = new Daytona(config);
    let sandboxId = vault.daytonaSandboxId;
    let sandboxName = vault.daytonaSandboxName;

    if (!sandboxId) {
      const matches = await daytona.list(
        { "noter.vault_id": args.vaultId },
        1,
        5,
      );
      const match = matches.items.at(0);
      if (!match) {
        return {
          ok: false,
          message: "No Daytona sandbox found for this vault.",
        };
      }
      sandboxId = match.id;
      sandboxName = match.name;
    }

    const sandbox = await daytona.get(sandboxId);
    await sandbox.delete();

    await ctx.runMutation(internal.vault.clearVaultDaytonaSandbox, {
      vaultId: args.vaultId,
    });

    return {
      ok: true,
      message: sandboxName
        ? `Removed Daytona sandbox ${sandboxName}.`
        : "Removed Daytona sandbox.",
    };
  },
});

export const getDaytonaBootstrapLogs = action({
  args: getDaytonaBootstrapLogsArgs,
  returns: getDaytonaBootstrapLogsResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof getDaytonaBootstrapLogsResult>> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    const apiConfig = resolveDaytonaApiConfig();
    if (!apiConfig.ok) {
      return {
        ok: false,
        message: apiConfig.message,
      };
    }
    const baseUrl = apiConfig.baseUrl;
    const token = apiConfig.token;

    const config: { apiKey: string; apiUrl?: string; target?: string } = {
      apiKey: token,
    };
    if (baseUrl) {
      config.apiUrl = baseUrl;
    }
    const daytona = new Daytona(config);
    let sandboxId = vault.daytonaSandboxId;

    if (!sandboxId) {
      const matches = await daytona.list(
        { "noter.vault_id": args.vaultId },
        1,
        5,
      );
      const match = matches.items.at(0);
      if (!match) {
        return {
          ok: false,
          message: "No Daytona sandbox found for this vault.",
        };
      }
      sandboxId = match.id;
    }

    const sandbox = await daytona.get(sandboxId);
    const command = `bash -lc 'if [ -f ${PNPM_INSTALL_LOG} ]; then tail -n 200 ${PNPM_INSTALL_LOG}; else echo "__NOTER_NO_LOG__"; fi; if [ -f ${PNPM_INSTALL_STATUS} ]; then echo ""; echo "Install status:"; cat ${PNPM_INSTALL_STATUS}; fi'`;
    const result = await sandbox.process.executeCommand(
      command,
      undefined,
      undefined,
      60,
    );

    const rawLogs = result.result;
    const hasNoLog = rawLogs.includes("__NOTER_NO_LOG__");
    const cleanedLogs = hasNoLog
      ? rawLogs.replace(/__NOTER_NO_LOG__\n?/g, "")
      : rawLogs;
    const message = hasNoLog
      ? "No install log found yet."
      : "Fetched bootstrap logs.";

    return {
      ok: true,
      logs: cleanedLogs,
      message,
    };
  },
});

async function cloneRepoForSnapshotBuild(args: {
  repoDir: string;
  repoUrl: string;
  branch: string;
  githubToken: string;
  commitSha: string;
}): Promise<void> {
  const cloneRepo = async (depth?: number) => {
    await git.clone({
      fs,
      http,
      dir: args.repoDir,
      url: args.repoUrl,
      ref: args.branch,
      singleBranch: true,
      depth,
      onAuth: () => ({
        username: args.githubToken,
        password: "x-oauth-basic",
      }),
    });
    await git.checkout({
      fs,
      dir: args.repoDir,
      ref: args.commitSha,
      force: true,
    });
  };

  try {
    await cloneRepo(50);
  } catch (error) {
    await fs.promises.rm(args.repoDir, { recursive: true, force: true });
    await cloneRepo();
    if (!isNotFoundError(error)) {
      console.warn("daytona:prebuild:clone:retrying_with_full_history", {
        repoUrl: args.repoUrl,
        branch: args.branch,
        commitSha: args.commitSha,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const resolvedCommitSha = await git.resolveRef({
    fs,
    dir: args.repoDir,
    ref: "HEAD",
  });
  if (resolvedCommitSha !== args.commitSha) {
    throw new Error(
      `Snapshot checkout mismatch: expected ${args.commitSha}, got ${resolvedCommitSha}.`,
    );
  }
}

async function pruneCommitPinnedSnapshots(args: {
  ctx: ActionCtx;
  daytona: Daytona;
  apiUrl: string;
  apiToken: string;
  owner: string;
  repo: string;
  branch: string;
}) {
  const records = await args.ctx.runQuery(
    internal.daytona.snapshotRecords.listByRepoBranch,
    {
      owner: args.owner,
      repo: args.repo,
      branch: args.branch,
    },
  );
  const terminalRecords = records.filter(
    (record) => record.status !== "queued" && record.status !== "building",
  );
  const recordsToRemove = [...terminalRecords]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(DAYTONA_SNAPSHOT_RETENTION_COUNT);

  if (recordsToRemove.length === 0) {
    return;
  }

  const snapshotIds = recordsToRemove.map((record) => record._id);
  await args.ctx.runMutation(
    internal.daytona.snapshotRecords.markBuildRemoving,
    {
      snapshotIds,
      updatedAt: Date.now(),
    },
  );

  for (const record of recordsToRemove) {
    if (!record.snapshotName) {
      continue;
    }
    try {
      const snapshot = await args.daytona.snapshot.get(record.snapshotName);
      await args.daytona.snapshot.delete(snapshot);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  await args.ctx.runMutation(
    internal.daytona.snapshotRecords.removeRecordsByIds,
    {
      snapshotIds,
    },
  );

  const snapshotCacheKey = buildDaytonaSnapshotCacheKey({
    apiUrl: args.apiUrl,
    apiToken: args.apiToken,
  });
  daytonaSnapshotCache.delete(snapshotCacheKey);
  daytonaSnapshotInFlight.delete(snapshotCacheKey);
}

export const buildCommitPinnedSnapshot = internalAction({
  args: buildCommitPinnedSnapshotArgs,
  returns: prebuildDaytonaSnapshotResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof prebuildDaytonaSnapshotResult>> => {
    const branch = canonicalizeCommitPinnedDaytonaBranch(args.branch);
    const snapshotName = inferPrebuildSnapshotName({
      owner: args.owner,
      repo: args.repo,
      branch,
      commitSha: args.commitSha,
    });
    const prebuildStartedAt = Date.now();
    const prebuildStartLine = `Snapshot build started for ${branch}@${shortenCommitSha(
      args.commitSha,
    )} at ${new Date(prebuildStartedAt).toISOString()}\n`;
    const markStartedResult = await ctx.runMutation(
      internal.daytona.snapshotRecords.tryMarkBuildStarted,
      {
        owner: args.owner,
        repo: args.repo,
        branch,
        commitSha: args.commitSha,
        startedAt: prebuildStartedAt,
        logs: prebuildStartLine,
      },
    );
    if (!markStartedResult.snapshotRecord) {
      return {
        ok: false,
        snapshotName,
        commitSha: args.commitSha,
        message: "Snapshot record not found.",
      };
    }
    if (!markStartedResult.started) {
      if (markStartedResult.snapshotRecord.status === "active") {
        return {
          ok: true,
          snapshotName:
            markStartedResult.snapshotRecord.snapshotName ?? snapshotName,
          commitSha: args.commitSha,
          message: `Snapshot for ${branch}@${shortenCommitSha(args.commitSha)} is already active.`,
        };
      }
      if (markStartedResult.snapshotRecord.status === "building") {
        return {
          ok: true,
          snapshotName:
            markStartedResult.snapshotRecord.snapshotName ?? snapshotName,
          commitSha: args.commitSha,
          message: `Snapshot for ${branch}@${shortenCommitSha(args.commitSha)} is already building.`,
        };
      }
      if (
        markStartedResult.snapshotRecord.status === "failed" &&
        typeof markStartedResult.snapshotRecord.nextRetryAt === "number"
      ) {
        return {
          ok: false,
          snapshotName:
            markStartedResult.snapshotRecord.snapshotName ?? snapshotName,
          commitSha: args.commitSha,
          message: `Snapshot retry is scheduled for ${new Date(
            markStartedResult.snapshotRecord.nextRetryAt,
          ).toISOString()}.`,
        };
      }
      return {
        ok: false,
        snapshotName:
          markStartedResult.snapshotRecord.snapshotName ?? snapshotName,
        commitSha: args.commitSha,
        message: `Snapshot record is ${markStartedResult.snapshotRecord.status}; skipping duplicate build.`,
      };
    }
    const startedSnapshotRecord = markStartedResult.snapshotRecord;

    const prebuildLogState = {
      buffer: prebuildStartLine,
      lastFlushAt: prebuildStartedAt,
    };

    const flushPrebuildLogs = async (force: boolean) => {
      const now = Date.now();
      if (
        !force &&
        now - prebuildLogState.lastFlushAt < PREBUILD_LOG_FLUSH_MS
      ) {
        return;
      }
      prebuildLogState.lastFlushAt = now;
      await ctx.runMutation(internal.daytona.snapshotRecords.updateLogs, {
        owner: args.owner,
        repo: args.repo,
        branch,
        commitSha: args.commitSha,
        snapshotName,
        logs: prebuildLogState.buffer,
        updatedAt: now,
      });
    };

    const appendPrebuildLog = async (chunk: string) => {
      if (chunk.trim().length === 0) {
        return;
      }
      prebuildLogState.buffer = truncateLogTail(
        prebuildLogState.buffer + chunk,
        MAX_PREBUILD_LOG_CHARS,
      );
      await flushPrebuildLogs(false);
    };

    const apiConfig = resolveDaytonaApiConfig();
    if (!apiConfig.ok) {
      const failedAt = Date.now();
      const retryDelayMs = calculateSnapshotRetryDelayMs(
        startedSnapshotRecord.attemptCount,
      );
      await appendPrebuildLog(`${apiConfig.message}\n`);
      await ctx.runMutation(
        internal.daytona.snapshotRecords.markBuildFailedAndScheduleRetry,
        {
          owner: args.owner,
          repo: args.repo,
          branch,
          commitSha: args.commitSha,
          userId: args.userId,
          error: apiConfig.message,
          updatedAt: failedAt,
          retryDelayMs,
        },
      );
      return {
        ok: false,
        snapshotName,
        commitSha: args.commitSha,
        message: apiConfig.message,
      };
    }
    const baseUrl = apiConfig.baseUrl;
    const token = apiConfig.token;
    const githubConnection = await getGithubConnection(ctx, args.userId);
    const githubToken = githubConnection?.auth.credential ?? null;
    if (!githubToken) {
      const message = "Missing GitHub token for snapshot clone.";
      await appendPrebuildLog(`${message}\n`);
      const failedAt = Date.now();
      const retryDelayMs = calculateSnapshotRetryDelayMs(
        startedSnapshotRecord.attemptCount,
      );
      await ctx.runMutation(
        internal.daytona.snapshotRecords.markBuildFailedAndScheduleRetry,
        {
          owner: args.owner,
          repo: args.repo,
          branch,
          commitSha: args.commitSha,
          userId: args.userId,
          error: message,
          updatedAt: failedAt,
          retryDelayMs,
        },
      );
      return {
        ok: false,
        snapshotName,
        commitSha: args.commitSha,
        message,
      };
    }

    const config: { apiKey: string; apiUrl?: string } = {
      apiKey: token,
    };
    if (baseUrl) {
      config.apiUrl = baseUrl;
    }
    const daytona = new Daytona(config);

    console.log("daytona:prebuild:start", {
      repo: `${args.owner}/${args.repo}`,
      branch,
      commitSha: args.commitSha,
      snapshotName,
      attemptCount: startedSnapshotRecord.attemptCount,
    });

    try {
      try {
        const existing = await daytona.snapshot.get(snapshotName);
        await daytona.snapshot.delete(existing);
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
      }

      const tmpRoot = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "noter-prebuild-"),
      );
      const buildContextDir = tmpRoot;
      const repoDir = path.join(
        buildContextDir,
        DAYTONA_SNAPSHOT_BUILD_CONTEXT_REPO_DIR,
      );
      const repoUrl = `https://github.com/${args.owner}/${args.repo}.git`;

      try {
        await cloneRepoForSnapshotBuild({
          repoDir,
          repoUrl,
          branch,
          githubToken,
          commitSha: args.commitSha,
        });

        await fs.promises.writeFile(
          path.join(buildContextDir, ".dockerignore"),
          `${DAYTONA_SNAPSHOT_BUILD_CONTEXT_REPO_DIR}/.git\n${DAYTONA_SNAPSHOT_BUILD_CONTEXT_REPO_DIR}/node_modules\n${DAYTONA_SNAPSHOT_BUILD_CONTEXT_REPO_DIR}/.pnpm\n`,
          "utf8",
        );
        await writeDaytonaSandboxProgramToBuildContext({
          buildContextDir,
          programRelativePath:
            DAYTONA_SNAPSHOT_BUILD_CONTEXT_AUTO_CD_PROGRAM_PATH,
          source: DAYTONA_ENSURE_REPO_AUTO_CD_PROGRAM_SOURCE,
        });

        const repoPath = `${DEFAULT_WORKSPACE_DIR}/${args.repo}`;

        const lockHash = await readPnpmLockHash(repoDir);
        const depsInputHash = await readDepsInputHash({
          repoDir,
          baseImage: resolveDaytonaBaseImage(),
          pnpmVersion: DAYTONA_PNPM_VERSION,
        });
        const depsImageCandidates = resolveDepsImageNames({
          owner: args.owner,
          repo: args.repo,
          inputHash: depsInputHash,
          lockHash,
        });

        const registryConfigResult = readRegistryConfig();
        if (
          depsImageCandidates.length > 0 &&
          registryConfigResult.missing.length > 0
        ) {
          await appendPrebuildLog(
            `Registry config missing (${registryConfigResult.missing.join(
              ", ",
            )}); attempting to pull image without registry auth.\n`,
          );
        }
        if (depsImageCandidates.length > 0 && registryConfigResult.config) {
          await appendPrebuildLog(
            `Ensuring registry access for ${registryConfigResult.config.url}...\n`,
          );
          try {
            const registryStatus = await ensureDaytonaRegistry({
              baseUrl,
              token,
              config: registryConfigResult.config,
            });
            await appendPrebuildLog(
              `Registry ${registryStatus.status}: ${registryConfigResult.config.url}\n`,
            );
          } catch (error) {
            const message = `Registry setup failed: ${
              error instanceof Error ? error.message : String(error)
            }\n`;
            await appendPrebuildLog(message);
            throw new Error(message.trim());
          }
        }

        const baseCommands = [
          "USER root",
          `WORKDIR ${repoPath}`,
          `COPY ${DAYTONA_SNAPSHOT_BUILD_CONTEXT_REPO_DIR}/ ${repoPath}`,
          `COPY ${DAYTONA_SNAPSHOT_BUILD_CONTEXT_AUTO_CD_PROGRAM_PATH} ${DAYTONA_SNAPSHOT_BUILD_CONTEXT_AUTO_CD_PROGRAM_TEMP_PATH}`,
          ...DAYTONA_RUNTIME_PREBUILD_DOCKERFILE_COMMANDS,
        ];
        const installCommand =
          "RUN pnpm install --prod=false --force --node-linker=hoisted";
        const autoCdStep = `RUN node ${JSON.stringify(
          DAYTONA_SNAPSHOT_BUILD_CONTEXT_AUTO_CD_PROGRAM_TEMP_PATH,
        )} ${JSON.stringify(repoPath)} && rm -f ${JSON.stringify(
          DAYTONA_SNAPSHOT_BUILD_CONTEXT_AUTO_CD_PROGRAM_TEMP_PATH,
        )}`;

        const createSnapshot = async (
          baseImage: string,
          includeInstall: boolean,
        ) => {
          const dockerfileCommands = includeInstall
            ? [...baseCommands, installCommand, autoCdStep]
            : [...baseCommands, autoCdStep];
          const image = Image.base(baseImage).dockerfileCommands(
            dockerfileCommands,
            buildContextDir,
          );
          await daytona.snapshot.create(
            {
              name: snapshotName,
              image,
              resources: DAYTONA_PREBUILD_RESOURCES,
            },
            {
              timeout: 0,
              onLogs: (chunk) => {
                if (chunk.trim().length > 0) {
                  console.log("daytona:prebuild:log", {
                    snapshotName,
                    chunk,
                  });
                  void appendPrebuildLog(chunk).catch((error) => {
                    console.warn("daytona:prebuild:log-append-failed", {
                      snapshotName,
                      message:
                        error instanceof Error ? error.message : String(error),
                    });
                  });
                }
              },
            },
          );
        };

        if (depsImageCandidates.length > 0) {
          let selectedDepsImage: string | null = null;
          const missingDepsImages: string[] = [];
          for (const depsImage of depsImageCandidates) {
            try {
              await appendPrebuildLog(
                `Trying deps image ${depsImage} (input hash ${depsInputHash ?? "unknown"}, lock hash ${lockHash ?? "unknown"})\n`,
              );
              await createSnapshot(depsImage, false);
              selectedDepsImage = depsImage;
              await appendPrebuildLog(`Using deps image ${depsImage}\n`);
              break;
            } catch (error) {
              if (isNotFoundError(error)) {
                missingDepsImages.push(depsImage);
                await appendPrebuildLog(`Deps image not found: ${depsImage}\n`);
                continue;
              }
              await appendPrebuildLog(
                `Snapshot build failed: ${
                  error instanceof Error ? error.message : String(error)
                }\n`,
              );
              throw error;
            }
          }

          if (!selectedDepsImage) {
            const missingList =
              missingDepsImages.length > 0
                ? missingDepsImages.join(", ")
                : "none";
            const message = `Deps image not found for candidates: ${missingList}. Build and publish the deps image first.`;
            await appendPrebuildLog(`${message}\n`);
            throw new Error(message);
          }
        } else {
          await appendPrebuildLog(
            "No deps image configured; installing dependencies in snapshot.\n",
          );
          const fallbackBaseImage = resolveDaytonaBaseImage();
          await appendPrebuildLog(
            `Using base image ${fallbackBaseImage} for fallback snapshot build.\n`,
          );
          await createSnapshot(fallbackBaseImage, true);
        }

        const activeSnapshot = await waitForDaytonaSnapshotActive({
          daytona,
          snapshotName,
          appendPrebuildLog,
        });
        const completedAt = Date.now();
        await appendPrebuildLog(
          `Snapshot build finished at ${new Date(completedAt).toISOString()}\n`,
        );
        await flushPrebuildLogs(true);
        await ctx.runMutation(
          internal.daytona.snapshotRecords.markBuildActive,
          {
            owner: args.owner,
            repo: args.repo,
            branch,
            commitSha: args.commitSha,
            snapshotName,
            snapshotId: activeSnapshot.id,
            updatedAt: completedAt,
          },
        );
        try {
          await pruneCommitPinnedSnapshots({
            ctx,
            daytona,
            apiUrl: baseUrl,
            apiToken: token,
            owner: args.owner,
            repo: args.repo,
            branch,
          });
        } catch (pruneError) {
          const pruneMessage =
            pruneError instanceof Error
              ? pruneError.message
              : String(pruneError);
          await appendPrebuildLog(
            `Snapshot retention cleanup failed: ${pruneMessage}\n`,
          );
          await flushPrebuildLogs(true);
          console.warn("daytona:prebuild:prune:failed", {
            repo: `${args.owner}/${args.repo}`,
            branch,
            commitSha: args.commitSha,
            message: pruneMessage,
          });
        }

        console.log("daytona:prebuild:done", {
          repo: `${args.owner}/${args.repo}`,
          branch,
          snapshotName,
          commitSha: args.commitSha,
        });

        return {
          ok: true,
          snapshotName,
          commitSha: args.commitSha,
          message: `Snapshot ${snapshotName} created for ${branch}@${shortenCommitSha(
            args.commitSha,
          )}.`,
        };
      } finally {
        await fs.promises.rm(tmpRoot, { recursive: true, force: true });
      }
    } catch (error) {
      const failedAt = Date.now();
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await appendPrebuildLog(`Snapshot build failed: ${errorMessage}\n`);
      await flushPrebuildLogs(true);
      const retryDelayMs = calculateSnapshotRetryDelayMs(
        startedSnapshotRecord.attemptCount,
      );
      await ctx.runMutation(
        internal.daytona.snapshotRecords.markBuildFailedAndScheduleRetry,
        {
          owner: args.owner,
          repo: args.repo,
          branch,
          commitSha: args.commitSha,
          userId: args.userId,
          error: errorMessage,
          updatedAt: failedAt,
          retryDelayMs,
        },
      );
      return {
        ok: false,
        snapshotName,
        commitSha: args.commitSha,
        message: `Snapshot build failed: ${errorMessage}`,
      };
    }
  },
});

export const prebuildDaytonaSnapshot = action({
  args: prebuildDaytonaSnapshotArgs,
  returns: prebuildDaytonaSnapshotResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof prebuildDaytonaSnapshotResult>> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    const requestedBranch = args.branch?.trim() || DAYTONA_COMMIT_PINNED_BRANCH;
    if (!isCommitPinnedDaytonaBranch(requestedBranch)) {
      return {
        ok: false,
        message: `Daytona commit-pinned snapshots currently support ${DAYTONA_COMMIT_PINNED_BRANCH} only.`,
      };
    }
    const branch = canonicalizeCommitPinnedDaytonaBranch(requestedBranch);
    const commitSha = vault.commitSHA?.trim();
    if (!commitSha) {
      return {
        ok: false,
        message:
          "Latest main commit is not known yet. Refresh the repository first.",
      };
    }

    const queueResult = await ctx.runMutation(
      internal.daytona.snapshotRecords.enqueueBuild,
      {
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        branch,
        commitSha,
        force: true,
      },
    );
    if (!queueResult.shouldSchedule) {
      if (queueResult.status === "active") {
        return {
          ok: true,
          snapshotName: queueResult.snapshotName,
          commitSha,
          message: `Snapshot ${queueResult.snapshotName} is already active for ${branch}@${shortenCommitSha(
            commitSha,
          )}.`,
        };
      }
      if (
        queueResult.status === "building" ||
        queueResult.status === "queued"
      ) {
        return {
          ok: true,
          snapshotName: queueResult.snapshotName,
          commitSha,
          message: `Snapshot ${queueResult.snapshotName} is already ${queueResult.status}.`,
        };
      }
    }

    await ctx.scheduler.runAfter(
      0,
      internal.daytona.actions.buildCommitPinnedSnapshot,
      {
        userId,
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        branch,
        commitSha,
      },
    );

    return {
      ok: true,
      snapshotName: queueResult.snapshotName,
      commitSha,
      message: `Snapshot ${queueResult.snapshotName} queued for ${branch}@${shortenCommitSha(
        commitSha,
      )}.`,
    };
  },
});

export const getDaytonaPrebuildStatus = action({
  args: getDaytonaPrebuildStatusArgs,
  returns: getDaytonaPrebuildStatusResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof getDaytonaPrebuildStatusResult>> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    const requestedBranch = args.branch?.trim() || DAYTONA_COMMIT_PINNED_BRANCH;
    if (!isCommitPinnedDaytonaBranch(requestedBranch)) {
      return {
        ok: false,
        message: `Daytona commit-pinned snapshots currently support ${DAYTONA_COMMIT_PINNED_BRANCH} only.`,
      };
    }
    const branch = canonicalizeCommitPinnedDaytonaBranch(requestedBranch);
    const commitSha = vault.commitSHA?.trim();
    if (!commitSha) {
      return {
        ok: true,
        state: "missing",
        message: `No ${branch} commit is known yet.`,
      };
    }

    const snapshotRecord = await ctx.runQuery(
      internal.daytona.snapshotRecords.getByRepoBranchCommit,
      {
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        branch,
        commitSha,
      },
    );
    if (!snapshotRecord) {
      return {
        ok: true,
        commitSha,
        state: "missing",
        message: `No snapshot found for ${branch}@${shortenCommitSha(commitSha)} yet.`,
      };
    }

    return {
      ok: true,
      commitSha,
      snapshotName: snapshotRecord.snapshotName,
      state: snapshotRecord.status,
      errorReason: snapshotRecord.lastError,
      message: `Snapshot ${snapshotRecord.snapshotName ?? "record"} is ${snapshotRecord.status}.`,
    };
  },
});

export const getDaytonaPrebuildLogs = action({
  args: getDaytonaPrebuildLogsArgs,
  returns: getDaytonaPrebuildLogsResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof getDaytonaPrebuildLogsResult>> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    const requestedBranch = args.branch?.trim() || DAYTONA_COMMIT_PINNED_BRANCH;
    if (!isCommitPinnedDaytonaBranch(requestedBranch)) {
      return {
        ok: true,
        logs: "",
        branch: requestedBranch,
        message: `Daytona commit-pinned snapshots currently support ${DAYTONA_COMMIT_PINNED_BRANCH} only.`,
      };
    }
    const branch = canonicalizeCommitPinnedDaytonaBranch(requestedBranch);

    const commitSha = vault.commitSHA?.trim();
    let snapshotRecord = commitSha
      ? await ctx.runQuery(
          internal.daytona.snapshotRecords.getByRepoBranchCommit,
          {
            owner: vault.ghRepoOwner,
            repo: vault.ghRepoName,
            branch,
            commitSha,
          },
        )
      : null;

    if (!snapshotRecord) {
      const records = await ctx.runQuery(
        internal.daytona.snapshotRecords.listByRepoBranch,
        {
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          branch,
        },
      );
      const latestSnapshotRecord = [...records]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .at(0);
      snapshotRecord = latestSnapshotRecord ?? null;
    }

    if (!snapshotRecord) {
      return {
        ok: true,
        logs: "",
        branch,
        message: "No snapshot logs yet.",
      };
    }

    return {
      ok: true,
      logs: snapshotRecord.logs ?? "",
      branch,
      snapshotName: snapshotRecord.snapshotName,
      updatedAt: snapshotRecord.logsUpdatedAt ?? snapshotRecord.updatedAt,
      message: snapshotRecord.logs
        ? "Fetched snapshot logs."
        : "No snapshot logs yet.",
    };
  },
});

export const listDaytonaSnapshotsForVault = action({
  args: listDaytonaSnapshotsForVaultArgs,
  returns: listDaytonaSnapshotsForVaultResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof listDaytonaSnapshotsForVaultResult>> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    try {
      const apiConfig = resolveDaytonaApiConfig();
      const dashboardBaseUrl = apiConfig.ok
        ? resolveDaytonaDashboardBaseUrl(apiConfig.baseUrl)
        : null;
      const records = await ctx.runQuery(
        internal.daytona.snapshotRecords.listByRepoBranch,
        {
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          branch: DAYTONA_COMMIT_PINNED_BRANCH,
        },
      );
      const filteredSnapshots = [...records]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((record) => ({
          name:
            record.snapshotName ??
            inferPrebuildSnapshotName({
              owner: record.ghRepoOwner,
              repo: record.ghRepoName,
              branch: record.branch,
              commitSha: record.commitSha,
            }),
          state: record.status,
          commitSha: record.commitSha,
          dashboardUrl:
            dashboardBaseUrl && record.snapshotId && record.snapshotName
              ? buildDaytonaSnapshotDashboardUrl({
                  dashboardBaseUrl,
                  snapshotId: record.snapshotId,
                  snapshotName: record.snapshotName,
                })
              : undefined,
          errorReason: record.lastError,
          attemptCount: record.attemptCount,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          lastUsedAt: undefined,
          nextRetryAt: record.nextRetryAt,
        }));

      return {
        ok: true,
        snapshots: filteredSnapshots,
        message: `Fetched ${filteredSnapshots.length} snapshot${filteredSnapshots.length === 1 ? "" : "s"}.`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        snapshots: [],
        message: `Failed to fetch snapshots: ${message}`,
      };
    }
  },
});

export const removeDaytonaSnapshot = action({
  args: removeDaytonaSnapshotArgs,
  returns: removeDaytonaSnapshotResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof removeDaytonaSnapshotResult>> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    const branch = canonicalizeCommitPinnedDaytonaBranch(
      args.branch?.trim() || DAYTONA_COMMIT_PINNED_BRANCH,
    );
    const apiConfig = resolveDaytonaApiConfig();
    if (!apiConfig.ok) {
      return {
        ok: false,
        message: apiConfig.message,
      };
    }

    const snapshotPrefix = inferDaytonaSnapshotPrefix({
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
    });
    if (!snapshotPrefix) {
      return {
        ok: false,
        message: "Failed to infer snapshot prefix for this vault.",
      };
    }

    const explicitSnapshotName = args.snapshotName?.trim();
    const currentCommitSha = vault.commitSHA?.trim();
    const currentSnapshotRecord =
      !explicitSnapshotName && currentCommitSha
        ? await ctx.runQuery(
            internal.daytona.snapshotRecords.getByRepoBranchCommit,
            {
              owner: vault.ghRepoOwner,
              repo: vault.ghRepoName,
              branch,
              commitSha: currentCommitSha,
            },
          )
        : null;
    const snapshotName =
      explicitSnapshotName && explicitSnapshotName.length > 0
        ? explicitSnapshotName
        : currentSnapshotRecord?.snapshotName;
    if (!snapshotName) {
      return {
        ok: false,
        message: "Snapshot name is missing.",
      };
    }
    if (
      !isVaultSnapshotName({
        snapshotName,
        snapshotPrefix,
      })
    ) {
      return {
        ok: false,
        snapshotName,
        message: "Snapshot does not belong to this vault.",
      };
    }

    const config: { apiKey: string; apiUrl?: string } = {
      apiKey: apiConfig.token,
    };
    if (apiConfig.baseUrl) {
      config.apiUrl = apiConfig.baseUrl;
    }
    const daytona = new Daytona(config);
    const snapshotCacheKey = buildDaytonaSnapshotCacheKey({
      apiUrl: apiConfig.baseUrl,
      apiToken: apiConfig.token,
    });
    const hasOtherVaultsForRepository = await ctx.runQuery(
      internal.vault.hasOtherVaultsForRepository,
      {
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        excludeVaultId: vault._id,
      },
    );
    if (hasOtherVaultsForRepository) {
      return {
        ok: true,
        snapshotName,
        message: `Snapshot ${snapshotName} is shared across vaults and was not deleted.`,
      };
    }

    try {
      const snapshot = await daytona.snapshot.get(snapshotName);
      await daytona.snapshot.delete(snapshot);
      await ctx.runMutation(
        internal.daytona.snapshotRecords.removeBySnapshotName,
        {
          snapshotName,
        },
      );
      daytonaSnapshotCache.delete(snapshotCacheKey);
      daytonaSnapshotInFlight.delete(snapshotCacheKey);
      return {
        ok: true,
        snapshotName,
        message: `Snapshot ${snapshotName} deleted.`,
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        await ctx.runMutation(
          internal.daytona.snapshotRecords.removeBySnapshotName,
          {
            snapshotName,
          },
        );
        daytonaSnapshotCache.delete(snapshotCacheKey);
        daytonaSnapshotInFlight.delete(snapshotCacheKey);
        return {
          ok: true,
          snapshotName,
          message: `Snapshot ${snapshotName} is already removed.`,
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        snapshotName,
        message: `Failed to delete snapshot: ${message}`,
      };
    }
  },
});

export const ensureDaytonaRegistryForVault = action({
  args: ensureDaytonaRegistryArgs,
  returns: ensureDaytonaRegistryResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof ensureDaytonaRegistryResult>> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    const apiConfig = resolveDaytonaApiConfig();
    if (!apiConfig.ok) {
      return {
        ok: false,
        message: apiConfig.message,
      };
    }
    const baseUrl = apiConfig.baseUrl;
    const token = apiConfig.token;

    const githubConnection = await getGithubConnection(ctx, userId);
    const githubToken = githubConnection?.auth.credential ?? null;
    const githubUsername = githubConnection?.username ?? null;

    if (!githubToken || !githubUsername) {
      return {
        ok: false,
        message:
          "GitHub access token not found. Re-authenticate with GitHub to enable registry setup.",
      };
    }

    const registryConfig = buildRegistryConfigFromGithub({
      githubUsername,
      githubAccessToken: githubToken,
    });

    try {
      const registryStatus = await ensureDaytonaRegistry({
        baseUrl,
        token,
        config: registryConfig,
      });

      return {
        ok: true,
        message: `Registry ${registryStatus.status} for ${registryConfig.url}.`,
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to configure Daytona registry.",
      };
    }
  },
});
