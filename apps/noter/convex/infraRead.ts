"use node";

import { Infer, v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { vAllowedInfraReadTable } from "./infraReadQueries";
import {
  formatConvexManagementApiEndpoint,
  requestConvexManagementApi,
} from "./convexManagementApi/client";
import type {
  PlatformDeploymentResponse,
  PlatformProjectDetails,
} from "./convexManagementApi/types.generated";
import { readCloudflareBuildLogs, readCloudflareWorkerStatus } from "./cloudflareResources";
import { formatCloudflareApiEndpoint, requestCloudflareApi } from "./cloudflareApi/client";
import { clamp } from "./jsonUtils";
import type { Doc, Id } from "./_generated/dataModel";

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
  convexDeployments: Doc<"vaultConvexDeployments">[];
  vault: Doc<"vaults"> | null;
  cloudflareWorkers: Doc<"vaultCloudflareWorkers">[];
  vaultUserId: Id<"users"> | null;
  convexConnection: {
    kind: "convex";
    auth: { credential: string };
    teamId: string;
    teamSlug?: string;
  } | null;
}> {
  const { convexDeployments, vault, cloudflareWorkers, vaultUserId, convexConnection } =
    await ctx.runQuery(internal.infraReadQueries.getVaultReadContext, {
      vaultId,
    });

  return {
    convexDeployments,
    vault,
    cloudflareWorkers,
    vaultUserId,
    convexConnection,
  };
}

function selectConvexDeploymentForInfraRead(
  deployments: Doc<"vaultConvexDeployments">[],
): Doc<"vaultConvexDeployments"> | null {
  if (deployments.length === 0) {
    return null;
  }
  const rootDeployment = deployments.find((deployment) => deployment.appRoot === ".");
  if (rootDeployment) {
    return rootDeployment;
  }
  return [...deployments].sort(
    (left, right) =>
      left.appRoot.localeCompare(right.appRoot) ||
      left.projectSlug.localeCompare(right.projectSlug) ||
      left.projectId.localeCompare(right.projectId),
  )[0];
}

function selectCloudflareWorkerForInfraRead(
  workers: Doc<"vaultCloudflareWorkers">[],
): Doc<"vaultCloudflareWorkers"> | null {
  if (workers.length === 0) {
    return null;
  }
  const rootWorker = workers.find((worker) => worker.appRoot === ".");
  if (rootWorker) {
    return rootWorker;
  }
  return [...workers].sort(
    (left, right) =>
      left.appRoot.localeCompare(right.appRoot) ||
      left.workerName.localeCompare(right.workerName) ||
      left.accountId.localeCompare(right.accountId),
  )[0];
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

function compareCloudflareInventoryRow(
  left: { id?: string; name?: string },
  right: { id?: string; name?: string },
): number {
  return (
    (left.name ?? "").localeCompare(right.name ?? "") ||
    (left.id ?? "").localeCompare(right.id ?? "")
  );
}

export const getConvexDeploymentStatus = internalAction({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: EXECUTION_RESULT,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const { convexDeployments, convexConnection } = await loadVaultContext(ctx, args.vaultId);
    const deployment = selectConvexDeploymentForInfraRead(convexDeployments);

    if (!deployment) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const convexToken = resolveConvexToken(convexConnection);
    const endpoint = formatConvexManagementApiEndpoint({
      path: "/deployments/{deployment_name}",
      method: "GET",
      params: {
        path: {
          deployment_name: deployment.deploymentName,
        },
      },
    });
    const deploymentStatus = await requestConvexManagementApi(
      convexToken,
      "GET",
      "/deployments/{deployment_name}",
      { params: { path: { deployment_name: deployment.deploymentName } } },
    );
    const raw = JSON.stringify(deploymentStatus, null, 2);

    return {
      summary: `Convex deployment status for ${deployment.deploymentName}`,
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
    const { convexDeployments, convexConnection } = await loadVaultContext(ctx, args.vaultId);
    const deployment = selectConvexDeploymentForInfraRead(convexDeployments);

    if (!deployment) {
      throw new Error(getVaultInfraError(args.vaultId));
    }

    const convexToken = resolveConvexToken(convexConnection);
    const endpoint = formatConvexManagementApiEndpoint({
      path: "/projects/{project_id}/list_deployments",
      method: "GET",
      params: {
        path: {
          project_id: deployment.projectId,
        },
      },
    });
    const deployments = await requestConvexManagementApi(
      convexToken,
      "GET",
      "/projects/{project_id}/list_deployments",
      { params: { path: { project_id: deployment.projectId } } },
    );
    const max = clamp(args.maxLines ?? 20, 1, 100);

    const lines: string[] = [];
    for (const deployment of [...deployments].sort(compareConvexDeploymentActivity).slice(0, max)) {
      const createdAtText = new Date(deployment.createTime).toISOString();
      lines.push(
        `[${createdAtText}] ${deployment.name} type=${deployment.deploymentType} kind=${deployment.kind}`,
      );
    }

    return {
      summary: `Convex deployment activity snapshot for project ${deployment.projectId}`,
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
    const { vault, cloudflareWorkers, vaultUserId } = await loadVaultContext(ctx, args.vaultId);
    const cloudflare =
      vault?.state === "connected" ? selectCloudflareWorkerForInfraRead(cloudflareWorkers) : null;
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
    const { vault, cloudflareWorkers, vaultUserId } = await loadVaultContext(ctx, args.vaultId);
    const cloudflare =
      vault?.state === "connected" ? selectCloudflareWorkerForInfraRead(cloudflareWorkers) : null;
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
    const convexConnection = convexConnectionRaw?.kind === "convex" ? convexConnectionRaw : null;
    const convexToken = resolveConvexToken(convexConnection);
    const teamId = resolveConvexTeamId(convexConnection);
    const endpoint = formatConvexManagementApiEndpoint({
      path: "/teams/{team_id}/list_projects",
      method: "GET",
      params: {
        path: {
          team_id: teamId,
        },
      },
    });
    const projects = await requestConvexManagementApi(
      convexToken,
      "GET",
      "/teams/{team_id}/list_projects",
      { params: { path: { team_id: teamId } } },
    );
    const max = clamp(args.limit ?? 50, 1, 100);
    const rows = [...projects].sort(compareConvexProjectInventoryRow).slice(0, max);

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
    const perPage = clamp(args.limit ?? 50, 1, 100);
    const request = {
      params: {
        query: {
          page: 1,
          per_page: perPage,
        },
      },
    };
    const accounts = await requestCloudflareApi({
      token,
      method: "GET",
      path: "/accounts",
      ...request,
    });
    if (!accounts) {
      throw new Error("Cloudflare account inventory response did not include accounts.");
    }
    const rows = [...accounts].sort(compareCloudflareInventoryRow).map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
    }));

    return {
      summary: "Cloudflare account inventory",
      endpoint: formatCloudflareApiEndpoint({
        method: "GET",
        path: "/accounts",
        ...request,
      }),
      raw: JSON.stringify(rows, null, 2),
      rowCount: rows.length,
    };
  },
});

/**
 * Executes an approved Cloudflare Workers inventory read for the concrete
 * account captured in the proposal payload. Default-account fallback belongs
 * before approval so the approver and audit trail see the same account that
 * execution reads.
 */
export const getCloudflareWorkersInventory = internalAction({
  args: {
    limit: v.optional(v.number()),
    userId: v.id("users"),
    accountId: v.string(),
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
    const perPage = clamp(args.limit ?? 50, 1, 100);
    const accountId = args.accountId;
    const request = {
      params: {
        path: {
          account_id: accountId,
        },
      },
    };
    const workers = await requestCloudflareApi({
      token,
      method: "GET",
      path: "/accounts/{account_id}/workers/scripts",
      ...request,
    });
    if (!workers) {
      throw new Error(
        `Cloudflare Workers inventory for account ${accountId} response did not include Workers.`,
      );
    }
    const rows = [...workers]
      .sort(compareCloudflareInventoryRow)
      .slice(0, perPage)
      .map((worker) => ({
        name: worker.id,
        tag: worker.tag,
        modifiedOn: worker.modified_on,
      }));

    return {
      summary: `Cloudflare Workers inventory for account ${accountId}`,
      endpoint: formatCloudflareApiEndpoint({
        method: "GET",
        path: "/accounts/{account_id}/workers/scripts",
        ...request,
      }),
      raw: JSON.stringify(rows, null, 2),
      rowCount: rows.length,
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
