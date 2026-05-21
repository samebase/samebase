"use node";

import { Infer, v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { vAllowedInfraReadTable } from "./infraReadQueries";
import {
  createConvexManagementApi,
  type PlatformDeploymentResponse,
  type PlatformProjectDetails,
} from "./convexManagementApi/client";
import {
  readCloudflareBuildLogs,
  readCloudflareWorkerStatus,
} from "./cloudflareResources";
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
  vault: Doc<"vaults"> | null;
  vaultUserId: Id<"users"> | null;
  convexConnection: {
    kind: "convex";
    auth: { credential: string };
    teamId: string;
    teamSlug?: string;
  } | null;
}> {
  const { infra, vault, vaultUserId, convexConnection } = await ctx.runQuery(
    internal.infraReadQueries.getVaultReadContext,
    {
      vaultId,
    },
  );

  return {
    infra,
    vault,
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

function compareConvexDeploymentActivity(
  left: PlatformDeploymentResponse,
  right: PlatformDeploymentResponse,
): number {
  const timeDelta = right.createTime - left.createTime;
  if (timeDelta !== 0) {
    return timeDelta;
  }
  return left.name.localeCompare(right.name);
}

function compareConvexProjectInventoryRow(
  left: PlatformProjectDetails,
  right: PlatformProjectDetails,
): number {
  const nameDelta = left.name.localeCompare(right.name);
  if (nameDelta !== 0) {
    return nameDelta;
  }
  return left.id.localeCompare(right.id);
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

    if (!infra) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const convex = createConvexManagementApi(
      resolveConvexToken(convexConnection),
    );
    const endpoint = convex.endpoints.deployment({
      deploymentName: infra.convexDeploymentName,
    });
    const deployment = await convex.getDeployment({
      deploymentName: infra.convexDeploymentName,
    });
    const raw = JSON.stringify(deployment, null, 2);

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

    if (!infra) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const convex = createConvexManagementApi(
      resolveConvexToken(convexConnection),
    );
    const endpoint = convex.endpoints.listDeployments({
      projectId: infra.convexProjectId,
    });
    const deployments = await convex.listDeployments({
      projectId: infra.convexProjectId,
    });
    const max = clamp(args.maxLines ?? 20, 1, 100);

    const lines: string[] = [];
    for (const deployment of [...deployments]
      .sort(compareConvexDeploymentActivity)
      .slice(0, max)) {
      const createdAtText = new Date(deployment.createTime).toISOString();
      lines.push(
        `[${createdAtText}] ${deployment.name} type=${deployment.deploymentType} kind=${deployment.kind}`,
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

export const getCloudflareWorkerStatus = internalAction({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const { vault, vaultUserId } = await loadVaultContext(ctx, args.vaultId);
    const cloudflare =
      vault?.state === "connected" && vault.cloudflare.state === "connected"
        ? vault.cloudflare
        : null;
    if (!cloudflare || !vaultUserId) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const cloudflareConnection = await ctx.runAction(
      internal.cloudflareMcpOAuth.resolveConnectionForUser,
      {
        userId: vaultUserId,
      },
    );

    return await readCloudflareWorkerStatus({
      cloudflareToken: resolveCloudflareToken(cloudflareConnection),
      cloudflareServerUrl: resolveCloudflareMcpServerUrl(cloudflareConnection),
      accountId: cloudflare.accountId,
      workerName: cloudflare.workerName,
      workerTag: cloudflare.workerTag,
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
    const { vault, vaultUserId } = await loadVaultContext(ctx, args.vaultId);
    const cloudflare =
      vault?.state === "connected" && vault.cloudflare.state === "connected"
        ? vault.cloudflare
        : null;
    if (!cloudflare || !vaultUserId) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const cloudflareConnection = await ctx.runAction(
      internal.cloudflareMcpOAuth.resolveConnectionForUser,
      {
        userId: vaultUserId,
      },
    );

    return await readCloudflareBuildLogs({
      cloudflareToken: resolveCloudflareToken(cloudflareConnection),
      cloudflareServerUrl: resolveCloudflareMcpServerUrl(cloudflareConnection),
      accountId: cloudflare.accountId,
      workerName: cloudflare.workerName,
      workerTag: cloudflare.workerTag,
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
    const convex = createConvexManagementApi(
      resolveConvexToken(convexConnection),
    );
    const teamId = resolveConvexTeamId(convexConnection);
    const endpoint = convex.endpoints.listProjects({ teamId });
    const projects = await convex.listProjects({ teamId });
    const max = clamp(args.limit ?? 50, 1, 100);
    const rows = [...projects]
      .sort(compareConvexProjectInventoryRow)
      .slice(0, max);

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

export const getCloudflareWorkersInventory = internalAction({
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
        "Cloudflare accountId is required to list Workers. Reconnect or select an account first.",
      );
    }

    const code = `async () => {
  const accountId = ${JSON.stringify(accountId)};
  const response = await cloudflare.request({
    method: "GET",
    path:
      "/accounts/" +
      encodeURIComponent(accountId) +
      "/workers/scripts?page=1&per_page=${perPage}",
  });
  if (!response || response.success !== true) {
    const errors = response && Array.isArray(response.errors) ? response.errors : response;
    throw new Error("Cloudflare API error: " + JSON.stringify(errors));
  }
  const result = Array.isArray(response.result) ? response.result : [];
  return result.map((worker) => ({
    name: worker?.id,
    tag: worker?.tag,
    modifiedOn: worker?.modified_on,
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
      summary: `Cloudflare Workers inventory for account ${accountId}`,
      endpoint: `/accounts/${encodeURIComponent(accountId)}/workers/scripts`,
      raw,
      rowCount: Array.isArray(parsed) ? parsed.length : undefined,
    };
  },
});

export const getConvexDataQuery = internalAction({
  args: {
    table: vAllowedInfraReadTable,
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
