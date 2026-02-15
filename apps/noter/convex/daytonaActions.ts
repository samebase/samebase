"use node";

import { Daytona } from "@daytonaio/sdk";
import { Infer, v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getUserId } from "./common";
import { toSafeRepoName } from "./repoName";

const { object, id, string, optional, boolean, union, literal } = v;

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
    const target = process.env.DAYTONA_TARGET;

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
    if (target) {
      config.target = target;
    }

    const daytona = new Daytona(config);
    const baseImage =
      process.env.DAYTONA_BASE_IMAGE ??
      "mcr.microsoft.com/devcontainers/typescript-node:1-bookworm";
    const snapshotName =
      process.env.DAYTONA_SNAPSHOT_NAME ?? inferSnapshotNameFromImage(baseImage);
    const shouldCreateSnapshot =
      process.env.DAYTONA_SNAPSHOT_CREATE === undefined
        ? true
        : process.env.DAYTONA_SNAPSHOT_CREATE === "true";
    let snapshotToUse: string | null = null;

    if (snapshotName) {
      try {
        await daytona.snapshot.get(snapshotName);
        snapshotToUse = snapshotName;
      } catch (error) {
        if (isNotFoundError(error) && shouldCreateSnapshot) {
          if (
            !hasImageTagOrDigest(baseImage) ||
            baseImage.toLowerCase().endsWith(":latest")
          ) {
            throw new Error(
              "DAYTONA_BASE_IMAGE must include a non-latest tag or digest to build a snapshot.",
            );
          }
          console.log("daytona:snapshot:create", {
            snapshotName,
            image: baseImage,
          });
          const created = await daytona.snapshot.create({
            name: snapshotName,
            image: baseImage,
          });
          snapshotToUse = created.name;
        } else if (isNotFoundError(error)) {
          console.log("daytona:snapshot:missing", { snapshotName });
        } else {
          throw error;
        }
      }
    }

    const baseParams = {
      name: sandboxName,
      language: "typescript",
      envVars: {
        NOTER_VAULT_ID: args.vaultId,
        NOTER_REPO: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
        NOTER_BRANCH: branch,
      },
      labels: {
        "noter.vault_id": args.vaultId,
        "noter.repo": `${vault.ghRepoOwner}/${vault.ghRepoName}`,
        "noter.branch": branch,
      },
    };
    const sandboxParams = snapshotToUse
      ? { ...baseParams, snapshot: snapshotToUse }
      : { ...baseParams, image: baseImage };
    const sandbox = await daytona.create(sandboxParams);

    const resolvedSandboxName = sandbox.name ?? sandboxName;

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

    return {
      ok: true,
      status: "created",
      message: snapshotToUse
        ? `Daytona sandbox created from snapshot ${snapshotToUse}.`
        : "Daytona sandbox created.",
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
    const target = process.env.DAYTONA_TARGET;

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
    if (target) {
      config.target = target;
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
    const target = process.env.DAYTONA_TARGET;

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
    if (target) {
      config.target = target;
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
