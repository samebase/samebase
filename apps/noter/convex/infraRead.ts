"use node";

import { Infer, v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { allowedInfraReadTable } from "./infraReadQueries";
import { createInfraProviders } from "./infraProviders";
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
  user: Doc<"users"> | null;
}> {
  const vault = await ctx.runQuery(internal.vault.getById, {
    id: vaultId,
  });
  if (!vault) {
    return { infra: null, user: null };
  }
  const infra = await ctx.runQuery(internal.infraProvisioning.getInfrastructureByVault, {
    vaultId,
  });
  const user = await ctx.runQuery(internal.users.getById, {
    userId: vault.userId,
  });
  return { infra, user };
}

function resolveConvexToken(user: { convexAccessToken?: string } | null): string {
  if (user?.convexAccessToken) {
    return user.convexAccessToken;
  }
  throw new Error("Convex connection required to perform this read.");
}

function resolveConvexTeamId(user: { convexTeamId?: string } | null): string {
  if (user?.convexTeamId) {
    return user.convexTeamId;
  }
  throw new Error("Convex connection required to perform this read.");
}

function resolveNetlifyToken(user: { netlifyAccessToken?: string } | null): string {
  if (user?.netlifyAccessToken) {
    return user.netlifyAccessToken;
  }
  throw new Error("Netlify connection required to perform this read.");
}

function resolveNetlifyTeamSlug(user: {
  netlifyTeamSlug?: string;
  netlifyTeamId?: string;
} | null): string {
  const slug = user?.netlifyTeamSlug?.trim() ?? "";
  if (slug) {
    return slug;
  }
  const teamId = user?.netlifyTeamId?.trim() ?? "";
  if (teamId) {
    return teamId;
  }
  throw new Error("Netlify team selection required to perform this read.");
}

export const getConvexDeploymentStatus = internalAction({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const { infra, user } = await loadVaultContext(ctx, args.vaultId);

    if (!infra?.convexDeploymentName) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const providers = createInfraProviders({
      convexToken: resolveConvexToken(user),
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
    const { infra, user } = await loadVaultContext(ctx, args.vaultId);

    if (!infra?.convexProjectId) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const providers = createInfraProviders({
      convexToken: resolveConvexToken(user),
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
    const { infra, user } = await loadVaultContext(ctx, args.vaultId);

    if (!infra?.netlifySiteId) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const providers = createInfraProviders({
      netlifyToken: resolveNetlifyToken(user),
    });
    const endpoint = `/sites/${encodeURIComponent(infra.netlifySiteId)}`;
    const payload = await providers.netlify.request(endpoint, "GET");

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
    const { infra, user } = await loadVaultContext(ctx, args.vaultId);

    if (!infra?.netlifySiteId) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const providers = createInfraProviders({
      netlifyToken: resolveNetlifyToken(user),
    });
    const maxEntries = clamp(args.maxEntries ?? 10, 1, 50);
    const deploysEndpoint =
      `/sites/${encodeURIComponent(infra.netlifySiteId)}/deploys?per_page=${maxEntries}&page=1`;
    const buildsEndpoint =
      `/sites/${encodeURIComponent(infra.netlifySiteId)}/builds?per_page=${maxEntries}&page=1`;

    const deploysPayload = await providers.netlify.request(deploysEndpoint, "GET");
    const buildsPayload = await providers.netlify.request(buildsEndpoint, "GET");

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


export const getConvexProjectInventory = internalAction({
  args: {
    limit: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const user = args.userId
      ? await ctx.runQuery(internal.users.getById, { userId: args.userId })
      : null;
    const providers = createInfraProviders({
      convexToken: resolveConvexToken(user),
    });
    const teamId = resolveConvexTeamId(user);
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
    const user = args.userId
      ? await ctx.runQuery(internal.users.getById, { userId: args.userId })
      : null;
    const providers = createInfraProviders({
      netlifyToken: resolveNetlifyToken(user),
    });
    const teamSlug = resolveNetlifyTeamSlug(user);
    const max = clamp(args.limit ?? 50, 1, 100);
    const endpoint =
      `/${encodeURIComponent(teamSlug)}/sites?per_page=${max}&page=1`;
    const payload = await providers.netlify.request(endpoint, "GET");

    const sites = Array.isArray(payload) ? payload : [];
    const rows = sites.slice(0, max);

    return {
      summary: `Netlify site inventory for team ${teamSlug}`,
      endpoint,
      raw: JSON.stringify(rows, null, 2),
      rowCount: rows.length,
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
