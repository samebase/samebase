"use node";

import { Infer, v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { allowedInfraReadTable } from "./infraReadQueries";
import { createInfraProviders } from "./infraProviders";
import {
  readHostingInventory,
  readHostingLogs,
  readHostingSiteStatus,
} from "./hostingProviders";
import type { Doc, Id } from "./_generated/dataModel";

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

function getVaultInfraError(vaultId: Id<"vaults">): string {
  return `Infrastructure not found for vault ${vaultId}. Provision the vault first.`;
}

async function loadVaultContext(
  ctx: ActionCtx,
  vaultId: Id<"vaults">,
): Promise<{
  infra: Doc<"vaultInfrastructure"> | null;
  convexConnection: {
    kind: "convex";
    auth: { credential: string };
    teamId: string;
    teamSlug?: string;
  } | null;
  netlifyConnection: {
    kind: "netlify";
    auth: { credential: string };
    teamId: string;
    teamSlug?: string;
  } | null;
}> {
  const { infra, convexConnection, netlifyConnection } = await ctx.runQuery(
    internal.infraReadQueries.getVaultReadContext,
    { vaultId },
  );

  return {
    infra,
    convexConnection,
    netlifyConnection,
  };
}

function resolveConvexToken(
  connection: {
    kind: "convex";
    auth: { credential: string };
  } | null,
): string {
  if (connection) {
    return connection.auth.credential;
  }
  throw new Error("Convex is not connected");
}

function resolveConvexTeamId(
  connection: {
    kind: "convex";
    teamId: string;
  } | null,
): string {
  if (connection) {
    return connection.teamId;
  }
  throw new Error("Convex is not connected");
}

function resolveNetlifyToken(
  connection: {
    kind: "netlify";
    auth: { credential: string };
  } | null,
): string {
  if (connection) {
    return connection.auth.credential;
  }
  throw new Error("Netlify is not connected");
}

function resolveNetlifyTeamSlug(
  connection: {
    kind: "netlify";
    teamSlug?: string;
  } | null,
): string {
  const slug = connection?.teamSlug?.trim() ?? "";
  if (slug) {
    return slug;
  }
  throw new Error("Netlify is not connected");
}

export const getConvexDeploymentStatus = internalAction({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const { infra, convexConnection } = await loadVaultContext(
      ctx,
      args.vaultId,
    );

    if (!infra?.convexDeploymentName) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const providers = createInfraProviders({
      convexToken: resolveConvexToken(convexConnection),
    });
    const endpoint = `/deployments/${encodeURIComponent(infra.convexDeploymentName)}`;
    const payload = await providers.convex.request(endpoint, "GET");
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
    const { infra, convexConnection } = await loadVaultContext(
      ctx,
      args.vaultId,
    );

    if (!infra?.convexProjectId) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const providers = createInfraProviders({
      convexToken: resolveConvexToken(convexConnection),
    });
    const endpoint = `/projects/${encodeURIComponent(infra.convexProjectId)}/list_deployments`;
    const payload = await providers.convex.request(endpoint, "GET");

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
        typeof createdAt === "number"
          ? new Date(createdAt).toISOString()
          : "unknown";
      lines.push(
        `[${createdAtText}] ${name} type=${deploymentType} kind=${kind}`,
      );
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
    const { infra, netlifyConnection } = await loadVaultContext(
      ctx,
      args.vaultId,
    );

    if (!infra?.netlifySiteId) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const providers = createInfraProviders({
      netlifyToken: resolveNetlifyToken(netlifyConnection),
    });
    return await readHostingSiteStatus({
      provider: "netlify",
      netlifyProvider: providers.netlify,
      siteId: infra.netlifySiteId,
      siteName: infra.netlifySiteName,
    });
  },
});

export const getNetlifyLogs = internalAction({
  args: {
    vaultId: v.id("vaults"),
    maxEntries: v.optional(v.number()),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const { infra, netlifyConnection } = await loadVaultContext(
      ctx,
      args.vaultId,
    );

    if (!infra?.netlifySiteId) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const providers = createInfraProviders({
      netlifyToken: resolveNetlifyToken(netlifyConnection),
    });
    return await readHostingLogs({
      provider: "netlify",
      netlifyProvider: providers.netlify,
      siteId: infra.netlifySiteId,
      maxEntries: clamp(args.maxEntries ?? 10, 1, 50),
    });
  },
});

export const getConvexProjectInventory = internalAction({
  args: {
    limit: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const convexConnectionRaw = args.userId
      ? await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
          userId: args.userId,
          kind: "convex",
        })
      : null;
    const convexConnection =
      convexConnectionRaw?.kind === "convex" ? convexConnectionRaw : null;
    const providers = createInfraProviders({
      convexToken: resolveConvexToken(convexConnection),
    });
    const teamId = resolveConvexTeamId(convexConnection);
    const endpoint = `/teams/${encodeURIComponent(teamId)}/list_projects`;
    const payload = await providers.convex.request(endpoint, "GET");

    const projects = Array.isArray(payload) ? payload : [];
    const max = clamp(args.limit ?? 50, 1, 100);
    const rows = projects.slice(0, max);

    return {
      summary: `Convex project inventory for team ${teamId}`,
      endpoint,
      raw: JSON.stringify(rows, null, 2),
      rowCount: rows.length,
    };
  },
});

export const getNetlifySiteInventory = internalAction({
  args: {
    limit: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const netlifyConnectionRaw = args.userId
      ? await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
          userId: args.userId,
          kind: "netlify",
        })
      : null;
    const netlifyConnection =
      netlifyConnectionRaw?.kind === "netlify" ? netlifyConnectionRaw : null;
    const providers = createInfraProviders({
      netlifyToken: resolveNetlifyToken(netlifyConnection),
    });
    const teamSlug = resolveNetlifyTeamSlug(netlifyConnection);
    return await readHostingInventory({
      provider: "netlify",
      netlifyProvider: providers.netlify,
      teamSlug,
      limit: clamp(args.limit ?? 50, 1, 100),
    });
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
