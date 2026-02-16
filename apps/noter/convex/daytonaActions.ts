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
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getUserId } from "./common";
import { getEnvLabel } from "./env";
import { toSafeRepoName } from "./repoName";

const { object, id, string, optional, boolean, union, literal, number } = v;
const DEFAULT_BASE_IMAGE =
  "mcr.microsoft.com/devcontainers/javascript-node:24-bookworm";
const DEFAULT_WORKSPACE_DIR = "/home/daytona/workspace";
const DAYTONA_API_URL_ENV = "DAYTONA_API_URL";
const DAYTONA_API_TOKEN_ENV = "DAYTONA_API_TOKEN";
const DAYTONA_API_KEY_ENV = "DAYTONA_API_KEY";
const DAYTONA_CONVEX_DEPLOY_KEY_ENV = "DAYTONA_CONVEX_DEPLOY_KEY";
const DAYTONA_DEPS_IMAGE_TEMPLATE_ENV = "DAYTONA_DEPS_IMAGE_TEMPLATE";
const PNPM_LOCKFILE_NAME = "pnpm-lock.yaml";
const PNPM_INSTALL_STATUS = "/tmp/noter-pnpm-install.status";
const DAYTONA_PREVIEW_PORT = 5173;
const DAYTONA_PREVIEW_TTL_SECONDS = 3600;
const DAYTONA_DEV_LOG = "/tmp/noter-dev.log";
const DEV_ENV_ORIGIN_ENV = "DEV_ENV_ORIGIN";
const MAX_PREBUILD_LOG_CHARS = 50_000;
const PREBUILD_LOG_FLUSH_MS = 1_000;
const DAYTONA_REGISTRY_URL_ENV = "DAYTONA_REGISTRY_URL";
const DAYTONA_REGISTRY_USERNAME_ENV = "DAYTONA_REGISTRY_USERNAME";
const DAYTONA_REGISTRY_PASSWORD_ENV = "DAYTONA_REGISTRY_PASSWORD";
const DAYTONA_REGISTRY_PROJECT_ENV = "DAYTONA_REGISTRY_PROJECT";
const DAYTONA_REGISTRY_NAME_ENV = "DAYTONA_REGISTRY_NAME";
const DAYTONA_REGISTRY_SET_DEFAULT_ENV = "DAYTONA_REGISTRY_SET_DEFAULT";
const DAYTONA_ORGANIZATION_ID_ENV = "DAYTONA_ORGANIZATION_ID";
const DAYTONA_PREBUILD_RESOURCES: Resources = {
  cpu: 4,
  memory: 8,
  disk: 10,
};

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

function resolveDepsImageName(args: {
  owner: string;
  repo: string;
  lockHash: string;
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
    lockHash: args.lockHash,
  });

  if (!hasImageTagOrDigest(resolved)) {
    resolved = `${resolved}:${args.lockHash}`;
  }

  return resolved;
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

function getRegistryMatch(
  registries: DockerRegistry[],
  config: RegistryConfig,
): DockerRegistry | null {
  const targetUrl = normalizeRegistryUrl(config.url);
  const targetProject = config.project ?? "";
  for (const registry of registries) {
    const registryUrl = normalizeRegistryUrl(registry.url);
    if (registryUrl !== targetUrl) {
      continue;
    }
    const registryProject = registry.project ?? "";
    if (config.project && registryProject !== targetProject) {
      continue;
    }
    return registry;
  }
  return null;
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
  const registries = listResponse.data ?? [];
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

  const projectMatch = (match.project ?? "") === (args.config.project ?? "");
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

function inferPrebuildSnapshotName(args: {
  owner: string;
  repo: string;
  branch: string;
}): string {
  const envLabel = getEnvLabel();
  const base = toSafeRepoName(
    `noter-prebuild-${envLabel}-${args.owner}-${args.repo}-${args.branch}`,
  );
  if (base) {
    return base;
  }
  return `noter-prebuild-${envLabel}-snapshot`;
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

function buildCloneUrl(args: {
  token: string | null;
  owner: string;
  repo: string;
}): string {
  const base = `https://github.com/${args.owner}/${args.repo}.git`;
  if (!args.token) {
    return base;
  }
  const encoded = encodeURIComponent(args.token);
  return `https://x-access-token:${encoded}@github.com/${args.owner}/${args.repo}.git`;
}

function buildAutoCdCommand(repoDir: string): string {
  const autoCdLine = `cd ${repoDir}`;
  return stripIndent`
    auto_cd_line=${quoteForBash(autoCdLine)}
    for file in /root/.bashrc /home/daytona/.bashrc /etc/bash.bashrc; do
      if [ -f "$file" ]; then
        if ! grep -Fqx "$auto_cd_line" "$file"; then printf "%s\\n" "$auto_cd_line" >> "$file"; fi
      else
        printf "%s\\n" "$auto_cd_line" >> "$file"
      fi
    done
  `;
}

function buildWriteConvexEnvCommand(repoDir: string): string {
  return stripIndent`
    if [ -n "$CONVEX_DEPLOY_KEY" ]; then
      env_file="${repoDir}/apps/noter/.env.local";
      if [ -f "$env_file" ]; then
        grep -v '^CONVEX_DEPLOY_KEY=' "$env_file" > "$env_file.tmp" || true;
        mv "$env_file.tmp" "$env_file";
      else
        mkdir -p "$(dirname "$env_file")";
      fi;
      printf "CONVEX_DEPLOY_KEY=%s\\n" "$CONVEX_DEPLOY_KEY" >> "$env_file";
      chmod 600 "$env_file";
    fi
  `;
}

async function refreshSandboxRepo(args: {
  sandbox: Sandbox;
  owner: string;
  repo: string;
  branch: string;
  token: string | null;
}): Promise<void> {
  const workspaceDir = DEFAULT_WORKSPACE_DIR;
  const repoDir = `${workspaceDir}/${args.repo}`;
  const cloneUrl = buildCloneUrl({
    token: args.token,
    owner: args.owner,
    repo: args.repo,
  });
  const autoCdCommand = buildAutoCdCommand(repoDir);
  const writeConvexEnvCommand = buildWriteConvexEnvCommand(repoDir);
  const script = stripIndent`
set -e
export GIT_TERMINAL_PROMPT=0
mkdir -p "${workspaceDir}"
if ! command -v git >/dev/null; then (command -v sudo >/dev/null && sudo apt-get update && sudo apt-get install -y git) || (apt-get update && sudo apt-get install -y git); fi
[ -d "${repoDir}" ] || mkdir -p "${repoDir}"
cd "${repoDir}"
if [ ! -d ".git" ]; then git init; fi
if git remote get-url origin >/dev/null 2>&1; then git remote set-url origin "${cloneUrl}"; else git remote add origin "${cloneUrl}"; fi
git fetch origin "${args.branch}" --depth=1
git checkout -f -B "${args.branch}" FETCH_HEAD
git reset --hard FETCH_HEAD
${writeConvexEnvCommand}
${autoCdCommand}
  `;
  const command = `bash -lc ${quoteForBash(script)}`;
  const result = await args.sandbox.process.executeCommand(
    command,
    undefined,
    undefined,
    600,
  );

  console.log("daytona:repo:refresh:result", {
    sandboxId: args.sandbox.id,
    repo: `${args.owner}/${args.repo}`,
    branch: args.branch,
    result,
  });

  if (result.exitCode !== 0) {
    throw new Error(`Failed to refresh repo (exit ${result.exitCode}).`);
  }
}

async function startDaytonaDevServer(args: {
  sandbox: Sandbox;
  repoDir: string;
}): Promise<void> {
  const ensurePnpm = stripIndent`
    if ! command -v pnpm >/dev/null; then
      if command -v corepack >/dev/null; then
        corepack enable && corepack prepare pnpm@9.15.0 --activate
      else
        npm install -g pnpm@9.15.0
      fi
    fi
  `;
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
  const installFallback = stripIndent`
    if [ ! -d "node_modules" ] \\
      && [ ! -d "apps/noter/node_modules" ] \\
      && [ ! -d "apps/noter-starter-template/node_modules" ]; then
      echo "node_modules missing; running pnpm install";
      NPM_CONFIG_ENGINE_STRICT=false pnpm install --prod=false --force --node-linker=hoisted;
    fi
  `;
  const devEnv = [
    devOrigin ? `${DEV_ENV_ORIGIN_ENV}=${quoteForBash(devOrigin)}` : "",
    "NOTER_DEV_HOST=0.0.0.0",
    `NOTER_DEV_PORT=${DAYTONA_PREVIEW_PORT}`,
    "NOTER_DEV_STRICT_PORT=1",
  ]
    .filter((part) => part.length > 0)
    .join(" ");
  const devCommand = `cd "${args.repoDir}" && pnpm run dev`;
  const script = stripIndent`
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
    ${devEnv} nohup bash -lc ${quoteForBash(devCommand)} > ${quoteForBash(
      DAYTONA_DEV_LOG,
    )} 2>&1 &
  `;
  const command = `bash -lc ${quoteForBash(script)}`;
  const result = await args.sandbox.process.executeCommand(
    command,
    undefined,
    undefined,
    600,
  );

  console.log("daytona:dev-server:result", {
    sandboxId: args.sandbox.id,
    result,
  });

  if (result.exitCode !== 0) {
    throw new Error(`Failed to start dev server (exit ${result.exitCode}).`);
  }
}

const startDaytonaWorkspaceArgs = object({
  vaultId: id("vaults"),
  branch: optional(string()),
});

const startDaytonaWorkspaceResult = object({
  ok: boolean(),
  status: union(literal("not_configured"), literal("created")),
  message: optional(string()),
  branch: string(),
  sandboxId: optional(string()),
  sandboxName: optional(string()),
});

const getDaytonaTerminalUrlArgs = object({
  vaultId: id("vaults"),
});

const getDaytonaTerminalUrlResult = object({
  ok: boolean(),
  url: optional(string()),
  message: optional(string()),
});

const getDaytonaPreviewUrlArgs = object({
  vaultId: id("vaults"),
});

const getDaytonaPreviewUrlResult = object({
  ok: boolean(),
  url: optional(string()),
  message: optional(string()),
  branch: optional(string()),
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

const getDaytonaPrebuildStatusArgs = object({
  vaultId: id("vaults"),
  branch: optional(string()),
});

const getDaytonaPrebuildStatusResult = object({
  ok: boolean(),
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

    const branch = args.branch?.trim() || "main";
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

    const envLabel = getEnvLabel();
    const baseName = toSafeRepoName(
      `noter-${envLabel}-${vault.ghRepoOwner}-${vault.ghRepoName}-${branch}`,
    );
    const sandboxName = baseName || `noter-${envLabel}-${args.vaultId}`;

    const config: { apiKey: string; apiUrl?: string; target?: string } = {
      apiKey: token,
    };
    if (baseUrl) {
      config.apiUrl = baseUrl;
    }
    const daytona = new Daytona(config);
    const prebuildSnapshotName = inferPrebuildSnapshotName({
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
      branch,
    });
    const repoWorkdir = `${DEFAULT_WORKSPACE_DIR}/${vault.ghRepoName}`;
    let snapshotToUse: string | null = null;
    if (prebuildSnapshotName) {
      try {
        const snapshot = await daytona.snapshot.get(prebuildSnapshotName);
        if (snapshot.state !== "active") {
          return {
            ok: false,
            status: "not_configured",
            message: `Prebuild snapshot ${prebuildSnapshotName} is ${snapshot.state}. Wait for it to become active.`,
            branch,
          };
        }
        snapshotToUse = prebuildSnapshotName;
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
        return {
          ok: false,
          status: "not_configured",
          message: `No prebuild snapshot found for ${branch} yet. Run a prebuild before creating a workspace.`,
          branch,
        };
      }
    }
    if (!snapshotToUse) {
      return {
        ok: false,
        status: "not_configured",
        message: "Prebuild snapshot name is missing.",
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
        };

        const convexDeployKey = process.env[DAYTONA_CONVEX_DEPLOY_KEY_ENV];
        if (convexDeployKey) {
          envVars.CONVEX_DEPLOY_KEY = convexDeployKey;
        }
        return envVars;
      })(),
      labels: {
        "noter.vault_id": args.vaultId,
        "noter.repo": `${vault.ghRepoOwner}/${vault.ghRepoName}`,
        "noter.branch": branch,
      },
    };
    const sandboxParams: CreateSandboxFromSnapshotParams = {
      ...baseParams,
      snapshot: snapshotToUse,
    };
    const sandbox = await daytona.create(sandboxParams);

    const resolvedSandboxName = sandbox.name ?? sandboxName;

    const currentUser = await ctx.runQuery(internal.users.getAuthUser, {});
    const githubToken = currentUser?.githubAccessToken ?? null;
    let bootstrapMessage: string | null = null;
    let devServerMessage: string | null = null;
    try {
      console.log("daytona:repo:refresh:start", {
        vaultId: args.vaultId,
        repo: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
        branch,
      });
      await refreshSandboxRepo({
        sandbox,
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        branch,
        token: githubToken,
      });
      console.log("daytona:repo:refresh:done", {
        vaultId: args.vaultId,
        repo: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
        branch,
      });
      bootstrapMessage =
        "Using prebuild snapshot; repo refreshed to latest branch.";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("daytona:repo:refresh:failed", {
        vaultId: args.vaultId,
        message,
      });
      bootstrapMessage = `Using prebuild snapshot; repo refresh failed: ${message}`;
    }

    try {
      {
        const command = stripIndent`
          set -e
          whoami
        `;

        // testing
        //
        const result = await sandbox.process.executeCommand(
          command,
          undefined,
          undefined,
          600,
        );

        console.log("daytona:process:executeCommand:result", {
          sandboxId: sandbox.id,
          command,
          result,
        });
      }

      await startDaytonaDevServer({ sandbox, repoDir: repoWorkdir });

      devServerMessage = `Dev server starting on port ${DAYTONA_PREVIEW_PORT} (logs: ${DAYTONA_DEV_LOG}).`;
    } catch (error) {
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

    console.log("daytona:workspace:created", {
      vaultId: args.vaultId,
      sandboxId: sandbox.id,
      sandboxName: resolvedSandboxName,
    });

    const baseMessage = snapshotToUse
      ? `Daytona sandbox created from snapshot ${snapshotToUse}.`
      : "Daytona sandbox created.";
    const messageParts: string[] = [baseMessage];
    if (bootstrapMessage) {
      messageParts.push(bootstrapMessage);
    }
    if (devServerMessage) {
      messageParts.push(devServerMessage);
    }

    return {
      ok: true,
      status: "created",
      message: messageParts.join(" "),
      branch,
      sandboxId: sandbox.id,
      sandboxName: resolvedSandboxName,
    };
  },
});

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
    let sandboxId = vault.daytonaSandboxId;
    let sandboxName = vault.daytonaSandboxName;

    if (!sandboxId) {
      const matches = await daytona.list(
        { "noter.vault_id": args.vaultId },
        1,
        5,
      );
      const match = matches.items[0];
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
    let sandboxId = vault.daytonaSandboxId;
    let sandboxName = vault.daytonaSandboxName;

    if (!sandboxId) {
      const matches = await daytona.list(
        { "noter.vault_id": args.vaultId },
        1,
        5,
      );
      const match = matches.items[0];
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
    const branchLabel = sandbox.labels?.["noter.branch"];

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
        branch:
          branchLabel && branchLabel.trim().length > 0
            ? branchLabel
            : undefined,
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
      const match = matches.items[0];
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
    const repoDir = `${DEFAULT_WORKSPACE_DIR}/${vault.ghRepoName}`;

    const statusCommand = `bash -lc ${quoteForBash(buildDevServerStatusScript())}`;
    const statusResult = await sandbox.process.executeCommand(
      statusCommand,
      undefined,
      undefined,
      60,
    );
    if (statusResult.exitCode === 0) {
      const status = parseDevServerStatus(statusResult.result ?? "");
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
      const match = matches.items[0];
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

    const statusCommand = `bash -lc ${quoteForBash(buildDevServerStatusScript())}`;
    const statusResult = await sandbox.process.executeCommand(
      statusCommand,
      undefined,
      undefined,
      60,
    );
    if (statusResult.exitCode === 0) {
      const status = parseDevServerStatus(statusResult.result ?? "");
      if (status.running) {
        return {
          ok: true,
          message: "Dev server already running.",
        };
      }
    }

    const repoDir = `${DEFAULT_WORKSPACE_DIR}/${vault.ghRepoName}`;
    const devCommand = `cd "${repoDir}" && pnpm run dev`;
    const startScript = stripIndent`
      set -e
      if [ ! -d "${repoDir}" ]; then
        echo "__NOTER_REPO_MISSING__"
        exit 1
      fi
      NOTER_DEV_HOST=0.0.0.0 NOTER_DEV_PORT=${DAYTONA_PREVIEW_PORT} NOTER_DEV_STRICT_PORT=1 nohup bash -lc ${quoteForBash(
        devCommand,
      )} > ${quoteForBash(DAYTONA_DEV_LOG)} 2>&1 &
    `;
    const startCommand = `bash -lc ${quoteForBash(startScript)}`;
    const startResult = await sandbox.process.executeCommand(
      startCommand,
      undefined,
      undefined,
      600,
    );

    if (startResult.exitCode !== 0) {
      const raw = startResult.result ?? "";
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
      const match = matches.items[0];
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

    const status = parseDevServerStatus(statusResult.result ?? "");
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
      const match = matches.items[0];
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
      const match = matches.items[0];
      if (!match) {
        return {
          ok: false,
          message: "No Daytona sandbox found for this vault.",
        };
      }
      sandboxId = match.id;
    }

    const sandbox = await daytona.get(sandboxId);
    const command =
      'bash -lc \'if [ -f /tmp/noter-pnpm-install.log ]; then tail -n 200 /tmp/noter-pnpm-install.log; else echo "__NOTER_NO_LOG__"; fi; if [ -f /tmp/noter-pnpm-install.status ]; then echo ""; echo "Install status:"; cat /tmp/noter-pnpm-install.status; fi\'';
    const result = await sandbox.process.executeCommand(
      command,
      undefined,
      undefined,
      60,
    );

    const rawLogs = result.result ?? "";
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

    const branch = args.branch?.trim() || "main";
    const apiConfig = resolveDaytonaApiConfig();
    if (!apiConfig.ok) {
      return {
        ok: false,
        message: apiConfig.message,
      };
    }
    const baseUrl = apiConfig.baseUrl;
    const token = apiConfig.token;

    const currentUser = await ctx.runQuery(internal.users.getAuthUser, {});
    const githubToken = currentUser?.githubAccessToken ?? null;
    if (!githubToken) {
      return {
        ok: false,
        message: "Missing GitHub token for prebuild clone.",
      };
    }

    const config: { apiKey: string; apiUrl?: string } = {
      apiKey: token,
    };
    if (baseUrl) {
      config.apiUrl = baseUrl;
    }
    const daytona = new Daytona(config);

    const snapshotName = inferPrebuildSnapshotName({
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
      branch,
    });

    const prebuildStartedAt = Date.now();
    const prebuildStartLine = `Prebuild started for ${branch} at ${new Date(prebuildStartedAt).toISOString()}\n`;
    await ctx.runMutation(internal.vault.updateVaultDaytonaPrebuildLogs, {
      vaultId: args.vaultId,
      branch,
      snapshotName,
      logs: prebuildStartLine,
      updatedAt: prebuildStartedAt,
    });

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
      await ctx.runMutation(internal.vault.updateVaultDaytonaPrebuildLogs, {
        vaultId: args.vaultId,
        branch,
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

    console.log("daytona:prebuild:start", {
      vaultId: args.vaultId,
      repo: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
      branch,
      snapshotName,
    });

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
    const repoDir = path.join(tmpRoot, "repo");
    const repoUrl = `https://github.com/${vault.ghRepoOwner}/${vault.ghRepoName}.git`;

    try {
      await git.clone({
        fs,
        http,
        dir: repoDir,
        url: repoUrl,
        ref: branch,
        singleBranch: true,
        depth: 1,
        onAuth: () => ({
          username: githubToken,
          password: "x-oauth-basic",
        }),
      });

      const headSha = await git.resolveRef({
        fs,
        dir: repoDir,
        ref: "HEAD",
      });

      await fs.promises.writeFile(
        path.join(repoDir, ".dockerignore"),
        ".git\nnode_modules\n.pnpm\n",
      );

      const repoPath = `${DEFAULT_WORKSPACE_DIR}/${vault.ghRepoName}`;
      const autoCdCommand = stripIndent`
        auto_cd_line="cd ${repoPath}";
        for file in /root/.bashrc /home/daytona/.bashrc /etc/bash.bashrc; do
          if [ -f "$file" ]; then
            if ! grep -Fqx "$auto_cd_line" "$file"; then printf "%s\\n" "$auto_cd_line" >> "$file"; fi;
          else
            printf "%s\\n" "$auto_cd_line" >> "$file";
          fi;
        done
      `
        // Dockerfile RUN instructions must be a single line; keep loop inline.
        .replace(/\n/g, " ");

      const lockHash = await readPnpmLockHash(repoDir);
      const depsImage = lockHash
        ? resolveDepsImageName({
            owner: vault.ghRepoOwner,
            repo: vault.ghRepoName,
            lockHash,
          })
        : null;

      const registryConfigResult = readRegistryConfig();
      if (depsImage && registryConfigResult.missing.length > 0) {
        await appendPrebuildLog(
          `Registry config missing (${registryConfigResult.missing.join(
            ", ",
          )}); attempting to pull image without registry auth.\n`,
        );
      }
      if (depsImage && registryConfigResult.config) {
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
        `COPY . ${repoPath}`,
        "RUN corepack enable && corepack prepare pnpm@9.15.0 --activate",
      ];
      const installCommand =
        "RUN pnpm install --prod=false --force --node-linker=hoisted";
      const autoCdStep = `RUN ${autoCdCommand}`;

      const createSnapshot = async (
        baseImage: string,
        includeInstall: boolean,
      ) => {
        const dockerfileCommands = includeInstall
          ? [...baseCommands, installCommand, autoCdStep]
          : [...baseCommands, autoCdStep];
        const image = Image.base(baseImage).dockerfileCommands(
          dockerfileCommands,
          repoDir,
        );
        await daytona.snapshot.create(
          { name: snapshotName, image, resources: DAYTONA_PREBUILD_RESOURCES },
          {
            timeout: 0,
            onLogs: (chunk) => {
              if (chunk.trim().length > 0) {
                console.log("daytona:prebuild:log", {
                  vaultId: args.vaultId,
                  snapshotName,
                  chunk,
                });
                void appendPrebuildLog(chunk).catch((error) => {
                  console.warn("daytona:prebuild:log-append-failed", {
                    vaultId: args.vaultId,
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

      if (depsImage) {
        try {
          console.log("daytona:prebuild:deps-image", {
            vaultId: args.vaultId,
            snapshotName,
            depsImage,
            lockHash,
          });
          await appendPrebuildLog(
            `Using deps image ${depsImage} for lock ${lockHash}\n`,
          );
          await createSnapshot(depsImage, false);
        } catch (error) {
          if (isNotFoundError(error)) {
            const message = `Deps image not found: ${depsImage}. Build the image for lock hash ${lockHash ?? "unknown"} before prebuild.\n`;
            await appendPrebuildLog(message);
            throw new Error(message.trim());
          }
          await appendPrebuildLog(
            `Prebuild failed: ${
              error instanceof Error ? error.message : String(error)
            }\n`,
          );
          throw error;
        }
      } else {
        await appendPrebuildLog(
          "No deps image configured; installing dependencies in snapshot.\n",
        );
        await createSnapshot(DEFAULT_BASE_IMAGE, true);
      }

      console.log("daytona:prebuild:done", {
        vaultId: args.vaultId,
        snapshotName,
        commitSha: headSha,
      });

      await appendPrebuildLog(
        `Prebuild finished at ${new Date().toISOString()}\n`,
      );
      await flushPrebuildLogs(true);

      return {
        ok: true,
        snapshotName,
        commitSha: headSha,
        message: `Prebuild snapshot ${snapshotName} created for ${branch}@${headSha.slice(0, 7)}.`,
      };
    } catch (error) {
      const message = `Prebuild failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`;
      await appendPrebuildLog(message);
      await flushPrebuildLogs(true);
      throw error;
    } finally {
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
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

    const branch = args.branch?.trim() || "main";
    const apiConfig = resolveDaytonaApiConfig();
    if (!apiConfig.ok) {
      return {
        ok: false,
        message: apiConfig.message,
      };
    }
    const baseUrl = apiConfig.baseUrl;
    const token = apiConfig.token;

    const config: { apiKey: string; apiUrl?: string } = {
      apiKey: token,
    };
    if (baseUrl) {
      config.apiUrl = baseUrl;
    }
    const daytona = new Daytona(config);

    const snapshotName = inferPrebuildSnapshotName({
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
      branch,
    });

    try {
      const snapshot = await daytona.snapshot.get(snapshotName);
      return {
        ok: true,
        snapshotName,
        state: snapshot.state,
        errorReason: snapshot.errorReason || undefined,
        message: `Prebuild snapshot ${snapshotName} is ${snapshot.state}.`,
      };
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      return {
        ok: true,
        snapshotName,
        state: "missing",
        message: `No prebuild snapshot found for ${branch} yet.`,
      };
    }
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

    const branch = args.branch?.trim();
    if (branch && vault.daytonaPrebuildLogsBranch !== branch) {
      return {
        ok: true,
        logs: "",
        branch: vault.daytonaPrebuildLogsBranch,
        snapshotName: vault.daytonaPrebuildLogsSnapshot,
        updatedAt: vault.daytonaPrebuildLogsUpdatedAt,
        message: "No prebuild logs for this branch yet.",
      };
    }

    return {
      ok: true,
      logs: vault.daytonaPrebuildLogs ?? "",
      branch: vault.daytonaPrebuildLogsBranch,
      snapshotName: vault.daytonaPrebuildLogsSnapshot,
      updatedAt: vault.daytonaPrebuildLogsUpdatedAt,
      message: vault.daytonaPrebuildLogs
        ? "Fetched prebuild logs."
        : "No prebuild logs yet.",
    };
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

    const currentUser = await ctx.runQuery(internal.users.getAuthUser, {});
    const githubToken = currentUser?.githubAccessToken ?? null;
    const githubUsername = currentUser?.githubUsername ?? null;

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
