"use node";

import { Infer, v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { allowedInfraReadTable } from "./infraReadQueries";

type JsonRecord = Record<string, unknown>;

const EXECUTION_RESULT = v.object({
  summary: v.string(),
  endpoint: v.string(),
  raw: v.string(),
  rowCount: v.optional(v.number()),
  logLineCount: v.optional(v.number()),
});
type ExecutionResult = Infer<typeof EXECUTION_RESULT>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function readString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}


async function convexApiRequest(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<unknown> {
  const token = getEnv("CONVEX_MANAGEMENT_TOKEN");
  const response = await fetch(`https://api.convex.dev/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(
      `Convex API request failed (${response.status}) for ${path}: ${payload}`,
    );
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function netlifyApiRequest(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<unknown> {
  const token = getEnv("NETLIFY_ACCESS_TOKEN");
  const response = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(
      `Netlify API request failed (${response.status}) for ${path}: ${payload}`,
    );
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getVaultInfraError(vaultId: string): string {
  return `Infrastructure not found for vault ${vaultId}. Provision the vault first.`;
}

export const getConvexDeploymentStatus = internalAction({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const infra = await ctx.runQuery(internal.infraProvisioning.getInfrastructureByVault, {
      vaultId: args.vaultId,
    });

    if (!infra?.convexDeploymentName) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const endpoint = `/deployments/${encodeURIComponent(infra.convexDeploymentName)}`;
    const payload = await convexApiRequest(endpoint, "GET");
    const raw = JSON.stringify(payload, null, 2);

    return {
      summary: `Convex deployment status for ${infra.convexDeploymentName}`,
      endpoint,
      raw,
      rowCount: 1,
    };
  },
});

export const getConvexLogs = internalAction({
  args: {
    vaultId: v.id("vaults"),
    maxLines: v.optional(v.number()),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const infra = await ctx.runQuery(internal.infraProvisioning.getInfrastructureByVault, {
      vaultId: args.vaultId,
    });

    if (!infra?.convexProjectId) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const endpoint = `/projects/${encodeURIComponent(infra.convexProjectId)}/list_deployments`;
    const payload = await convexApiRequest(endpoint, "GET");

    const deployments = Array.isArray(payload) ? payload : [];
    const max = clamp(args.maxLines ?? 20, 1, 100);

    const lines: string[] = [];
    for (const deployment of deployments.slice(0, max)) {
      const record = asRecord(deployment);
      const name = readString(record, "name") ?? "unknown";
      const deploymentType = readString(record, "deploymentType") ?? "unknown";
      const kind = readString(record, "kind") ?? "unknown";
      const createdAt = record["createTime"];
      const createdAtText =
        typeof createdAt === "number" ? new Date(createdAt).toISOString() : "unknown";
      lines.push(`[${createdAtText}] ${name} type=${deploymentType} kind=${kind}`);
    }

    return {
      summary: `Convex deployment activity snapshot for project ${infra.convexProjectId}`,
      endpoint,
      raw: lines.join("\n") || "No deployment activity entries returned.",
      logLineCount: lines.length,
    };
  },
});

export const getNetlifySiteStatus = internalAction({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const infra = await ctx.runQuery(internal.infraProvisioning.getInfrastructureByVault, {
      vaultId: args.vaultId,
    });

    if (!infra?.netlifySiteId) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const endpoint = `/sites/${encodeURIComponent(infra.netlifySiteId)}`;
    const payload = await netlifyApiRequest(endpoint, "GET");

    return {
      summary: `Netlify site status for ${infra.netlifySiteName ?? infra.netlifySiteId}`,
      endpoint,
      raw: JSON.stringify(payload, null, 2),
      rowCount: 1,
    };
  },
});

export const getNetlifyLogs = internalAction({
  args: {
    vaultId: v.id("vaults"),
    maxEntries: v.optional(v.number()),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const infra = await ctx.runQuery(internal.infraProvisioning.getInfrastructureByVault, {
      vaultId: args.vaultId,
    });

    if (!infra?.netlifySiteId) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const maxEntries = clamp(args.maxEntries ?? 10, 1, 50);
    const deploysEndpoint =
      `/sites/${encodeURIComponent(infra.netlifySiteId)}/deploys?per_page=${maxEntries}&page=1`;
    const buildsEndpoint =
      `/sites/${encodeURIComponent(infra.netlifySiteId)}/builds?per_page=${maxEntries}&page=1`;

    const deploysPayload = await netlifyApiRequest(deploysEndpoint, "GET");
    const buildsPayload = await netlifyApiRequest(buildsEndpoint, "GET");

    const lines: string[] = [];

    const deploys = Array.isArray(deploysPayload) ? deploysPayload : [];
    for (const deploy of deploys) {
      const record = asRecord(deploy);
      const createdAt = readString(record, "created_at") ?? "unknown";
      const state = readString(record, "state") ?? "unknown";
      const context = readString(record, "context") ?? "unknown";
      const branch = readString(record, "branch") ?? "unknown";
      const errorMessage = readString(record, "error_message");
      lines.push(
        `${createdAt} deploy state=${state} context=${context} branch=${branch}` +
          (errorMessage ? ` error=${errorMessage}` : ""),
      );
    }

    const builds = Array.isArray(buildsPayload) ? buildsPayload : [];
    for (const build of builds) {
      const record = asRecord(build);
      const createdAt = readString(record, "created_at") ?? "unknown";
      const done = record["done"] === true;
      const error = readString(record, "error") ?? "";
      lines.push(
        `${createdAt} build done=${done}` + (error ? ` error=${error}` : ""),
      );
    }

    return {
      summary: `Netlify deploy/build activity for site ${infra.netlifySiteId}`,
      endpoint: `${deploysEndpoint} + ${buildsEndpoint}`,
      raw: lines.join("\n") || "No deploy/build activity entries returned.",
      logLineCount: lines.length,
    };
  },
});

export const getConvexDataQuery = internalAction({
  args: {
    table: allowedInfraReadTable,
    limit: v.optional(v.number()),
    vaultId: v.optional(v.id("vaults")),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const rows = await ctx.runQuery(internal.infraReadQueries.readTableSample, {
      table: args.table,
      limit: args.limit,
      vaultId: args.vaultId,
    });

    const raw = JSON.stringify(rows, null, 2);

    return {
      summary: `Convex table sample for ${args.table}`,
      endpoint: `convex-db:${args.table}`,
      raw,
      rowCount: rows.length,
    };
  },
});
