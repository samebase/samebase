"use node";

import { Infer, v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { allowedInfraReadTable } from "./infraReadQueries";
import { createInfraProviders } from "./infraProviders";
import {
  readCloudflareDeploymentLogs,
  readCloudflareProjectStatus,
} from "./cloudflareResources";
import { resolveCloudflareState } from "./cloudflareStateHelpers";
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
  vaultUserId: Id<"users"> | null;
  convexConnection: {
    kind: "convex";
    auth: { credential: string };
    teamId: string;
    teamSlug?: string;
  } | null;
}> {
  const { infra, vaultUserId, convexConnection } = await ctx.runQuery(
    internal.infraReadQueries.getVaultReadContext,
    {
      vaultId,
    },
  );

  return {
    infra,
    vaultUserId,
    convexConnection,
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

function resolveCloudflareToken(
  connection: {
    auth: { credential: string };
  } | null,
): string {
  if (connection) {
    return connection.auth.credential;
  }
  throw new Error("Cloudflare is not connected");
}

function resolveCloudflareMcpServerUrl(
  connection: { auth: { method: string } } | null,
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

export const getCloudflareProjectStatus = internalAction({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const { infra, vaultUserId } = await loadVaultContext(ctx, args.vaultId);
    const cloudflare = resolveCloudflareState(infra);
    if (!cloudflare || !vaultUserId) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const cloudflareConnection = await ctx.runAction(
      internal.cloudflareMcpOAuth.resolveConnectionForUser,
      {
        userId: vaultUserId,
      },
    );

    return await readCloudflareProjectStatus({
      provider: "cloudflare",
      cloudflareToken: resolveCloudflareToken(cloudflareConnection),
      cloudflareServerUrl: resolveCloudflareMcpServerUrl(cloudflareConnection),
      accountId: cloudflare.accountId,
      projectName: cloudflare.projectName,
    });
  },
});

export const getCloudflareLogs = internalAction({
  args: {
    vaultId: v.id("vaults"),
    maxEntries: v.optional(v.number()),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const { infra, vaultUserId } = await loadVaultContext(ctx, args.vaultId);
    const cloudflare = resolveCloudflareState(infra);
    if (!cloudflare || !vaultUserId) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const cloudflareConnection = await ctx.runAction(
      internal.cloudflareMcpOAuth.resolveConnectionForUser,
      {
        userId: vaultUserId,
      },
    );

    return await readCloudflareDeploymentLogs({
      provider: "cloudflare",
      cloudflareToken: resolveCloudflareToken(cloudflareConnection),
      cloudflareServerUrl: resolveCloudflareMcpServerUrl(cloudflareConnection),
      accountId: cloudflare.accountId,
      projectName: cloudflare.projectName,
      maxEntries: args.maxEntries ?? 10,
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

export const getCloudflareAccountInventory = internalAction({
  args: {
    limit: v.optional(v.number()),
    userId: v.id("users"),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const cloudflareConnection = await ctx.runAction(
      internal.cloudflareMcpOAuth.resolveConnectionForUser,
      {
        userId: args.userId,
      },
    );

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
    userId: v.id("users"),
    accountId: v.optional(v.string()),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const cloudflareConnection = await ctx.runAction(
      internal.cloudflareMcpOAuth.resolveConnectionForUser,
      {
        userId: args.userId,
      },
    );

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
