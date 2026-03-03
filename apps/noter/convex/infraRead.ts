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
import { resolveNetlifyHostingState } from "./hostingStateHelpers";
import { asRecord, clamp, readString } from "./jsonUtils";
import type { Doc, Id } from "./_generated/dataModel";
import {
  callCloudflareMcpTool,
  CLOUDFLARE_MCP_SERVER_URL,
} from "./cloudflareMcp";

const EXECUTION_RESULT = v.object({
  summary: v.string(),
  endpoint: v.string(),
  raw: v.string(),
  rowCount: v.optional(v.number()),
  logLineCount: v.optional(v.number()),
});
type ExecutionResult = Infer<typeof EXECUTION_RESULT>;

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
  railwayConnection: {
    kind: "railway";
    auth: { credential: string };
    accountId: string;
    email?: string;
    name?: string;
  } | null;
}> {
  const { infra, convexConnection, netlifyConnection, railwayConnection } =
    await ctx.runQuery(internal.infraReadQueries.getVaultReadContext, {
      vaultId,
    });

  return {
    infra,
    convexConnection,
    netlifyConnection,
    railwayConnection,
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

function resolveRailwayToken(
  connection: {
    kind: "railway";
    auth: { credential: string };
  } | null,
): string {
  if (connection) {
    return connection.auth.credential;
  }
  throw new Error("Railway is not connected");
}

function resolveCloudflareToken(
  connection: {
    kind: "cloudflare";
    auth: { credential: string };
  } | null,
): string {
  if (connection) {
    return connection.auth.credential;
  }
  throw new Error("Cloudflare is not connected");
}

function resolveCloudflareMcpServerUrl(
  connection: { kind: "cloudflare"; auth: { method: string } } | null,
): string {
  if (connection?.auth.method === "mcp_oauth") {
    const auth = asRecord(connection.auth);
    const url = readString(auth, "mcpServerUrl")?.trim() ?? "";
    if (url) return url;
  }
  return CLOUDFLARE_MCP_SERVER_URL;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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

    const netlifyHosting = resolveNetlifyHostingState(infra);
    if (!netlifyHosting) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const providers = createInfraProviders({
      netlifyToken: resolveNetlifyToken(netlifyConnection),
    });
    return await readHostingSiteStatus({
      provider: "netlify",
      netlifyProvider: providers.netlify,
      siteId: netlifyHosting.siteId,
      siteName: netlifyHosting.siteName,
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

    const netlifyHosting = resolveNetlifyHostingState(infra);
    if (!netlifyHosting) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const providers = createInfraProviders({
      netlifyToken: resolveNetlifyToken(netlifyConnection),
    });
    return await readHostingLogs({
      provider: "netlify",
      netlifyProvider: providers.netlify,
      siteId: netlifyHosting.siteId,
      maxEntries: args.maxEntries ?? 10,
    });
  },
});

export const getRailwaySiteStatus = internalAction({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const { infra, railwayConnection } = await loadVaultContext(
      ctx,
      args.vaultId,
    );

    const railwayHosting = infra?.hosting;
    if (!railwayHosting || railwayHosting.provider !== "railway") {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const providers = createInfraProviders({
      railwayToken: resolveRailwayToken(railwayConnection),
    });
    return await readHostingSiteStatus({
      provider: "railway",
      railwayProvider: providers.railway,
      projectId: railwayHosting.projectId,
      environmentId: railwayHosting.environmentId,
      serviceId: railwayHosting.serviceId,
    });
  },
});

export const getRailwayLogs = internalAction({
  args: {
    vaultId: v.id("vaults"),
    maxEntries: v.optional(v.number()),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const { infra, railwayConnection } = await loadVaultContext(
      ctx,
      args.vaultId,
    );

    const railwayHosting = infra?.hosting;
    if (!railwayHosting || railwayHosting.provider !== "railway") {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const providers = createInfraProviders({
      railwayToken: resolveRailwayToken(railwayConnection),
    });
    return await readHostingLogs({
      provider: "railway",
      railwayProvider: providers.railway,
      projectId: railwayHosting.projectId,
      environmentId: railwayHosting.environmentId,
      serviceId: railwayHosting.serviceId,
      maxEntries: args.maxEntries ?? 50,
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
      limit: args.limit ?? 50,
    });
  },
});

export const getRailwayProjectInventory = internalAction({
  args: {
    limit: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const railwayConnectionRaw = args.userId
      ? await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
          userId: args.userId,
          kind: "railway",
        })
      : null;
    const railwayConnection =
      railwayConnectionRaw?.kind === "railway" ? railwayConnectionRaw : null;
    const providers = createInfraProviders({
      railwayToken: resolveRailwayToken(railwayConnection),
    });
    return await readHostingInventory({
      provider: "railway",
      railwayProvider: providers.railway,
      limit: args.limit ?? 50,
    });
  },
});

export const getCloudflareAccountInventory = internalAction({
  args: {
    limit: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const cloudflareConnectionRaw = args.userId
      ? await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
          userId: args.userId,
          kind: "cloudflare",
        })
      : null;
    const cloudflareConnection =
      cloudflareConnectionRaw?.kind === "cloudflare"
        ? cloudflareConnectionRaw
        : null;

    const token = resolveCloudflareToken(cloudflareConnection);
    const serverUrl = resolveCloudflareMcpServerUrl(cloudflareConnection);
    const perPage = clamp(args.limit ?? 50, 1, 100);

    const code = `async () => {
  const response = await cloudflare.request({
    method: "GET",
    path: "/accounts?page=1&per_page=${perPage}",
  });
  if (!response || response.success !== true) {
    const errors = response && Array.isArray(response.errors) ? response.errors : response;
    throw new Error("Cloudflare API error: " + JSON.stringify(errors));
  }
  const result = Array.isArray(response.result) ? response.result : [];
  return result.map((account) => ({
    id: account?.id,
    name: account?.name,
    isDefault:
      account?.is_default === true || account?.default === true,
  }));
}`;

    const text = await callCloudflareMcpTool({
      token,
      toolName: "execute",
      toolArgs: { code },
      serverUrl,
    });

    const parsed = tryParseJson(text);
    const raw =
      typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);

    return {
      summary: "Cloudflare account inventory",
      endpoint: "/accounts",
      raw,
      rowCount: Array.isArray(parsed) ? parsed.length : undefined,
    };
  },
});

export const getCloudflarePagesProjectInventory = internalAction({
  args: {
    limit: v.optional(v.number()),
    userId: v.optional(v.id("users")),
    accountId: v.optional(v.string()),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const cloudflareConnectionRaw = args.userId
      ? await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
          userId: args.userId,
          kind: "cloudflare",
        })
      : null;
    const cloudflareConnection =
      cloudflareConnectionRaw?.kind === "cloudflare"
        ? cloudflareConnectionRaw
        : null;

    const token = resolveCloudflareToken(cloudflareConnection);
    const serverUrl = resolveCloudflareMcpServerUrl(cloudflareConnection);
    const perPage = clamp(args.limit ?? 50, 1, 100);
    const accountId = args.accountId ?? cloudflareConnection?.accountId;
    if (!accountId) {
      throw new Error(
        "Cloudflare accountId is required to list Pages projects. Reconnect or select an account first.",
      );
    }

    const code = `async () => {
  const accountId = ${JSON.stringify(accountId)};
  const response = await cloudflare.request({
    method: "GET",
    path:
      "/accounts/" +
      encodeURIComponent(accountId) +
      "/pages/projects?page=1&per_page=${perPage}",
  });
  if (!response || response.success !== true) {
    const errors = response && Array.isArray(response.errors) ? response.errors : response;
    throw new Error("Cloudflare API error: " + JSON.stringify(errors));
  }
  const result = Array.isArray(response.result) ? response.result : [];
  return result.map((project) => ({
    name: project?.name,
    subdomain: project?.subdomain,
    productionBranch: project?.production_branch,
  }));
}`;

    const text = await callCloudflareMcpTool({
      token,
      toolName: "execute",
      toolArgs: { code },
      serverUrl,
    });

    const parsed = tryParseJson(text);
    const raw =
      typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);

    return {
      summary: `Cloudflare Pages project inventory for account ${accountId}`,
      endpoint: `/accounts/${encodeURIComponent(accountId)}/pages/projects`,
      raw,
      rowCount: Array.isArray(parsed) ? parsed.length : undefined,
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
