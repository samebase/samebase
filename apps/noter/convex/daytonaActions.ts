"use node";

import { Daytona, Image, type Sandbox } from "@daytonaio/sdk";
import { Infer, v } from "convex/values";
import fs from "fs";
import os from "os";
import path from "path";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getUserId } from "./common";
import { toSafeRepoName } from "./repoName";

const { object, id, string, optional, boolean, union, literal } = v;
const DEFAULT_BASE_IMAGE =
  "mcr.microsoft.com/devcontainers/javascript-node:24-bookworm";
const DEFAULT_WORKSPACE_DIR = "/home/daytona/workspace";
const DAYTONA_CONVEX_DEPLOY_KEY_ENV = "DAYTONA_CONVEX_DEPLOY_KEY";

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

function hasImageTagOrDigest(image: string): boolean {
  if (image.includes("@")) {
    return true;
  }
  const lastColon = image.lastIndexOf(":");
  const lastSlash = image.lastIndexOf("/");
  return lastColon > lastSlash;
}

function inferSnapshotNameFromImage(image: string): string {
  const normalized = image
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  const base = normalized.length > 0 ? normalized : "devcontainer-base";
  return `noter-${base}`;
}

function inferBaseSnapshotName(args: {
  image: string;
  owner: string;
  repo: string;
}): string {
  const base = inferSnapshotNameFromImage(args.image);
  const combined = `${base}-${args.owner}-${args.repo}`.toLowerCase();
  const safe = toSafeRepoName(combined);
  return safe || base;
}

function inferPrebuildSnapshotName(args: {
  owner: string;
  repo: string;
  branch: string;
}): string {
  const base = toSafeRepoName(
    `noter-prebuild-${args.owner}-${args.repo}-${args.branch}`,
  );
  if (base) {
    return base;
  }
  return "noter-prebuild-snapshot";
}

function quoteForBash(input: string): string {
  return `'${input.replace(/'/g, `'\\''`)}'`;
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

async function bootstrapSandbox(args: {
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
  const autoCdLine = `cd ${repoDir}`;
  const autoCdCommand = [
    `auto_cd_line=${quoteForBash(autoCdLine)}`,
    "for file in /root/.bashrc /home/daytona/.bashrc /etc/bash.bashrc; do",
    '  if [ -f "$file" ]; then',
    '    if ! grep -Fqx "$auto_cd_line" "$file"; then printf "%s\\n" "$auto_cd_line" >> "$file"; fi',
    "  else",
    '    printf "%s\\n" "$auto_cd_line" >> "$file"',
    "  fi",
    "done",
  ].join(" ");
  const installLog = "/tmp/noter-pnpm-install.log";
  const installStatus = "/tmp/noter-pnpm-install.status";
  const installScript = [
    `cd "${repoDir}"`,
    "set +e",
    'echo "pwd: $(pwd)"',
    'echo "node: $(node -v 2>/dev/null || echo missing)"',
    'echo "pnpm: $(pnpm -v 2>/dev/null || echo missing)"',
    'echo "pnpm node-linker: $(pnpm config get node-linker 2>/dev/null || echo unknown)"',
    'echo "pnpm engine-strict: $(pnpm config get engine-strict 2>/dev/null || echo unknown)"',
    'echo "pnpm store-dir: $(pnpm config get store-dir 2>/dev/null || echo unknown)"',
    'echo "pnpm virtual-store-dir: $(pnpm config get virtual-store-dir 2>/dev/null || echo unknown)"',
    'echo "pnpm install started: $(date -Is)"',
    "status=0",
    "NPM_CONFIG_ENGINE_STRICT=false pnpm install --prod=false --force --node-linker=hoisted",
    "status=$?",
    'if [ "$status" != "0" ]; then echo "pnpm install failed with $status"; fi',
    'for path in node_modules node_modules/.pnpm apps/noter/node_modules apps/noter-starter-template/node_modules; do if [ -d "$path" ]; then echo "$path present"; ls -la "$path" | head -n 20; else echo "$path missing"; fi; done',
    'if [ ! -d "node_modules" ] && [ ! -d "apps/noter/node_modules" ] && [ ! -d "apps/noter-starter-template/node_modules" ]; then echo "No node_modules found in repo"; if [ "$status" = "0" ]; then status=1; fi; fi',
    'echo "exit_code=$status"',
    `echo "$status" > "${installStatus}"`,
  ].join("; ");
  const quotedInstallScript = quoteForBash(installScript);
  const writeConvexEnvCommand = [
    'if [ -n "$CONVEX_DEPLOY_KEY" ]; then',
    `  env_file="${repoDir}/apps/noter/.env.local";`,
    '  if [ -f "$env_file" ]; then',
    "    grep -v '^CONVEX_DEPLOY_KEY=' \"$env_file\" > \"$env_file.tmp\" || true;",
    "    mv \"$env_file.tmp\" \"$env_file\";",
    "  else",
    '    mkdir -p "$(dirname "$env_file")";',
    "  fi;",
    '  printf "CONVEX_DEPLOY_KEY=%s\\n" "$CONVEX_DEPLOY_KEY" >> "$env_file";',
    '  chmod 600 "$env_file";',
    "fi",
  ].join(" ");
  const script = [
    "set -e",
    "export GIT_TERMINAL_PROMPT=0",
    `mkdir -p "${workspaceDir}"`,
    "if ! command -v git >/dev/null; then (command -v sudo >/dev/null && sudo apt-get update && sudo apt-get install -y git) || (apt-get update && apt-get install -y git); fi",
    `[ -d "${repoDir}/.git" ] || git clone "${cloneUrl}" "${repoDir}"`,
    `cd "${repoDir}"`,
    `git fetch origin "${args.branch}"`,
    `git checkout "${args.branch}"`,
    writeConvexEnvCommand,
    "if ! command -v pnpm >/dev/null; then if command -v corepack >/dev/null; then corepack enable && corepack prepare pnpm@9.15.0 --activate; else npm install -g pnpm@9.15.0; fi; fi",
    autoCdCommand,
    `rm -f "${installLog}" "${installStatus}"`,
    `nohup bash -lc ${quotedInstallScript} > "${installLog}" 2>&1 &`,
  ].join(" && ");
  const command = `bash -lc ${quoteForBash(script)}`;
  await args.sandbox.process.executeCommand(command, undefined, undefined, 600);
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
    const baseUrl = process.env.DAYTONA_API_URL;
    const token = process.env.DAYTONA_API_TOKEN ?? process.env.DAYTONA_API_KEY;
    if (!baseUrl || !token) {
      const missing = [
        !baseUrl ? "DAYTONA_API_URL" : null,
        !token ? "DAYTONA_API_TOKEN (or DAYTONA_API_KEY)" : null,
      ].filter((value): value is string => value !== null);
      return {
        ok: false,
        status: "not_configured",
        message:
          missing.length === 0
            ? "Daytona is not configured."
            : `Daytona is not configured. Missing ${missing.join(", ")}.`,
        branch,
      };
    }

    console.log("daytona:workspace:request", {
      vaultId: args.vaultId,
      repo: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
      branch,
    });

    const baseName = toSafeRepoName(
      `noter-${vault.ghRepoOwner}-${vault.ghRepoName}-${branch}`,
    );
    const sandboxName = baseName || `noter-${args.vaultId}`;

    const config: { apiKey: string; apiUrl?: string; target?: string } = {
      apiKey: token,
    };
    if (baseUrl) {
      config.apiUrl = baseUrl;
    }
    const daytona = new Daytona(config);
    const baseImage = DEFAULT_BASE_IMAGE;
    const prebuildSnapshotName = inferPrebuildSnapshotName({
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
      branch,
    });
    const baseSnapshotName = inferBaseSnapshotName({
      image: baseImage,
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
    });
    const shouldCreateSnapshot = true;
    let usePrebuildSnapshot = false;
    let snapshotToUse: string | null = null;
    const repoWorkdir = `${DEFAULT_WORKSPACE_DIR}/${vault.ghRepoName}`;

    if (prebuildSnapshotName) {
      try {
        await daytona.snapshot.get(prebuildSnapshotName);
        snapshotToUse = prebuildSnapshotName;
        usePrebuildSnapshot = true;
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
      }
    }

    if (!snapshotToUse && baseSnapshotName) {
      try {
        await daytona.snapshot.get(baseSnapshotName);
        snapshotToUse = baseSnapshotName;
      } catch (error) {
        if (isNotFoundError(error) && shouldCreateSnapshot) {
          if (
            !hasImageTagOrDigest(baseImage) ||
            baseImage.toLowerCase().endsWith(":latest")
          ) {
            throw new Error(
              "Base image must include a non-latest tag or digest to build a snapshot.",
            );
          }
          console.log("daytona:snapshot:create", {
            snapshotName: baseSnapshotName,
            image: baseImage,
          });
          const baseSnapshotImage = Image.base(baseImage).workdir(repoWorkdir);
          const created = await daytona.snapshot.create({
            name: baseSnapshotName,
            image: baseSnapshotImage,
          });
          snapshotToUse = created.name;
        } else if (isNotFoundError(error)) {
          console.log("daytona:snapshot:missing", { snapshotName: baseSnapshotName });
        } else {
          throw error;
        }
      }
    }

    const baseParams = {
      name: sandboxName,
      language: "typescript",
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
    const sandboxParams = snapshotToUse
      ? { ...baseParams, snapshot: snapshotToUse }
      : { ...baseParams, image: Image.base(baseImage).workdir(repoWorkdir) };
    const sandbox = await daytona.create(sandboxParams);

    const resolvedSandboxName = sandbox.name ?? sandboxName;

    const currentUser = await ctx.runQuery(internal.users.getAuthUser, {});
    const githubToken = currentUser?.githubAccessToken ?? null;
    const shouldBootstrapRepo = !usePrebuildSnapshot;
    let bootstrapMessage: string | null = null;

    if (shouldBootstrapRepo) {
      try {
        console.log("daytona:bootstrap:start", {
          vaultId: args.vaultId,
          repo: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
          branch,
        });
        await bootstrapSandbox({
          sandbox,
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          branch,
          token: githubToken,
        });
        bootstrapMessage = `Bootstrapping repo in ${repoWorkdir}. Installing dependencies in background (see /tmp/noter-pnpm-install.log).`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("daytona:bootstrap:failed", {
          vaultId: args.vaultId,
          message,
        });
        bootstrapMessage = `Sandbox created, but bootstrap failed: ${message}`;
      }
    } else {
      bootstrapMessage =
        "Using prebuild snapshot; bootstrap skipped for faster startup.";
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

    return {
      ok: true,
      status: "created",
      message: bootstrapMessage ? `${baseMessage} ${bootstrapMessage}` : baseMessage,
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

    const baseUrl = process.env.DAYTONA_API_URL;
    const token = process.env.DAYTONA_API_TOKEN ?? process.env.DAYTONA_API_KEY;
    if (!baseUrl || !token) {
      const missing = [
        !baseUrl ? "DAYTONA_API_URL" : null,
        !token ? "DAYTONA_API_TOKEN (or DAYTONA_API_KEY)" : null,
      ].filter((value): value is string => value !== null);
      return {
        ok: false,
        message:
          missing.length === 0
            ? "Daytona is not configured."
            : `Daytona is not configured. Missing ${missing.join(", ")}.`,
      };
    }

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

    const baseUrl = process.env.DAYTONA_API_URL;
    const token = process.env.DAYTONA_API_TOKEN ?? process.env.DAYTONA_API_KEY;
    if (!baseUrl || !token) {
      const missing = [
        !baseUrl ? "DAYTONA_API_URL" : null,
        !token ? "DAYTONA_API_TOKEN (or DAYTONA_API_KEY)" : null,
      ].filter((value): value is string => value !== null);
      return {
        ok: false,
        message:
          missing.length === 0
            ? "Daytona is not configured."
            : `Daytona is not configured. Missing ${missing.join(", ")}.`,
      };
    }

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

    const baseUrl = process.env.DAYTONA_API_URL;
    const token = process.env.DAYTONA_API_TOKEN ?? process.env.DAYTONA_API_KEY;
    if (!baseUrl || !token) {
      const missing = [
        !baseUrl ? "DAYTONA_API_URL" : null,
        !token ? "DAYTONA_API_TOKEN (or DAYTONA_API_KEY)" : null,
      ].filter((value): value is string => value !== null);
      return {
        ok: false,
        message:
          missing.length === 0
            ? "Daytona is not configured."
            : `Daytona is not configured. Missing ${missing.join(", ")}.`,
      };
    }

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
      "bash -lc 'if [ -f /tmp/noter-pnpm-install.log ]; then tail -n 200 /tmp/noter-pnpm-install.log; else echo \"__NOTER_NO_LOG__\"; fi; if [ -f /tmp/noter-pnpm-install.status ]; then echo \"\"; echo \"Install status:\"; cat /tmp/noter-pnpm-install.status; fi'";
    const result = await sandbox.process.executeCommand(command, undefined, undefined, 60);

    const rawLogs = result.result ?? "";
    const hasNoLog = rawLogs.includes("__NOTER_NO_LOG__");
    const cleanedLogs = hasNoLog
      ? rawLogs.replace(/__NOTER_NO_LOG__\n?/g, "")
      : rawLogs;
    const message = hasNoLog ? "No install log found yet." : "Fetched bootstrap logs.";

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
    const baseUrl = process.env.DAYTONA_API_URL;
    const token = process.env.DAYTONA_API_TOKEN ?? process.env.DAYTONA_API_KEY;
    if (!baseUrl || !token) {
      const missing = [
        !baseUrl ? "DAYTONA_API_URL" : null,
        !token ? "DAYTONA_API_TOKEN (or DAYTONA_API_KEY)" : null,
      ].filter((value): value is string => value !== null);
      return {
        ok: false,
        message:
          missing.length === 0
            ? "Daytona is not configured."
            : `Daytona is not configured. Missing ${missing.join(", ")}.`,
      };
    }

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
      const autoCdCommand = [
        `auto_cd_line="cd ${repoPath}";`,
        "for file in /root/.bashrc /home/daytona/.bashrc /etc/bash.bashrc; do",
        '  if [ -f "$file" ]; then',
        '    if ! grep -Fqx "$auto_cd_line" "$file"; then printf "%s\\n" "$auto_cd_line" >> "$file"; fi;',
        "  else",
        '    printf "%s\\n" "$auto_cd_line" >> "$file";',
        "  fi;",
        "done",
      ].join(" ");

      const image = Image.base(DEFAULT_BASE_IMAGE).dockerfileCommands(
        [
          "USER root",
          `WORKDIR ${repoPath}`,
          `COPY . ${repoPath}`,
          "RUN corepack enable && corepack prepare pnpm@9.15.0 --activate",
          "RUN pnpm install --prod=false --force --node-linker=hoisted",
          `RUN ${autoCdCommand}`,
        ],
        repoDir,
      );

      await daytona.snapshot.create(
        { name: snapshotName, image },
        {
          timeout: 0,
          onLogs: (chunk) => {
            if (chunk.trim().length > 0) {
              console.log("daytona:prebuild:log", {
                vaultId: args.vaultId,
                snapshotName,
                chunk,
              });
            }
          },
        },
      );

      console.log("daytona:prebuild:done", {
        vaultId: args.vaultId,
        snapshotName,
        commitSha: headSha,
      });

      return {
        ok: true,
        snapshotName,
        commitSha: headSha,
        message: `Prebuild snapshot ${snapshotName} created for ${branch}@${headSha.slice(0, 7)}.`,
      };
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
    const baseUrl = process.env.DAYTONA_API_URL;
    const token = process.env.DAYTONA_API_TOKEN ?? process.env.DAYTONA_API_KEY;
    if (!baseUrl || !token) {
      const missing = [
        !baseUrl ? "DAYTONA_API_URL" : null,
        !token ? "DAYTONA_API_TOKEN (or DAYTONA_API_KEY)" : null,
      ].filter((value): value is string => value !== null);
      return {
        ok: false,
        message:
          missing.length === 0
            ? "Daytona is not configured."
            : `Daytona is not configured. Missing ${missing.join(", ")}.`,
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
