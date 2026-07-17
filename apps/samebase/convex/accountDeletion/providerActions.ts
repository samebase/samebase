import { Infer, v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";

import { internal } from "../_generated/api";
import { internalAction, internalQuery, type ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { revokeCloudflareMcpOAuthGrant } from "../cloudflareMcpOAuth";
import { revokeCloudflareOAuthGrant } from "../cloudflareOAuth";
import { resolveCloudflareApiTransport } from "../cloudflareApi/client";
import { deleteCloudflareWorkerBuildTriggers } from "../cloudflareResources";
import { revokeGithubOAuthGrant } from "../githubOAuth";
import { isConvexManagementNotFoundError } from "../convexManagementApi/errors";
import { deleteConvexDeployKey, deleteConvexPreviewDeployKey } from "../infraProvisioning";
import { vConvexDeployKeys, type ConvexDeployKeys } from "../vault/deployKeyModel";
import { readOwnedActiveRun } from "./stepContext";
import {
  CLOUDFLARE_REVOCATION_UNCONFIRMED_ERROR,
  CONVEX_MANUAL_REVOCATION_NOTICE,
  GITHUB_REVOCATION_UNCONFIRMED_ERROR,
  type AccountDeletionCloudflareOutcome,
  type AccountDeletionConvexOutcome,
  type AccountDeletionGithubOutcome,
  vAccountDeletionCloudflareOutcome,
  vAccountDeletionConvexOutcome,
  vAccountDeletionGithubOutcome,
} from "./model";

const { id, object, string } = v;
const ACCOUNT_DELETION_PROVIDER_RESOURCE_PAGE_SIZE = 50;

const vAccountDeletionConvexDependencyDeployKeys = object({
  deployKeys: vConvexDeployKeys,
});

const vAccountDeletionCloudflareBuildTarget = object({
  accountId: string(),
  workerTag: string(),
});

export const listConvexDependencyDeployKeys = internalQuery({
  args: {
    runId: id("accountDeletionRuns"),
    workflowId: string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(vAccountDeletionConvexDependencyDeployKeys),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const page = await ctx.db
      .query("vaultWorkerDeploymentDependencies")
      .withIndex("by_user", (q) => q.eq("userId", run.identity.userId))
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((dependency) => ({
        deployKeys: dependency.wiring.deployKeys,
      })),
    };
  },
});

export const listCloudflareBuildTargets = internalQuery({
  args: {
    runId: id("accountDeletionRuns"),
    workflowId: string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(vAccountDeletionCloudflareBuildTarget),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const page = await ctx.db
      .query("vaultCloudflareWorkers")
      .withIndex("by_user", (q) => q.eq("userId", run.identity.userId))
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page
        .filter((worker) => worker.builds.state === "connected")
        .map((worker) => ({
          accountId: worker.accountId,
          workerTag: worker.workerTag,
        })),
    };
  },
});

async function revokeConvexDependencyDeployKeys(
  ctx: ActionCtx,
  args: { runId: Doc<"accountDeletionRuns">["_id"]; workflowId: string },
  connection: Doc<"providerConnections"> | null,
): Promise<void> {
  if (connection?.kind !== "convex") {
    return;
  }

  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const page: {
      continueCursor: string;
      isDone: boolean;
      page: { deployKeys: ConvexDeployKeys }[];
    } = await ctx.runQuery(
      internal.accountDeletion.providerActions.listConvexDependencyDeployKeys,
      {
        ...args,
        paginationOpts: {
          cursor,
          numItems: ACCOUNT_DELETION_PROVIDER_RESOURCE_PAGE_SIZE,
          maximumRowsRead: ACCOUNT_DELETION_PROVIDER_RESOURCE_PAGE_SIZE,
        },
      },
    );
    for (const dependency of page.page) {
      const production = dependency.deployKeys.production;
      if (production.state === "created") {
        try {
          await deleteConvexDeployKey({
            convexToken: connection.auth.credential,
            deploymentName: production.deploymentName,
            convexDeployKeyName: production.name,
          });
        } catch (error) {
          if (!isConvexManagementNotFoundError(error)) {
            throw error;
          }
        }
      }
      const preview = dependency.deployKeys.preview;
      if (preview.state === "created") {
        try {
          await deleteConvexPreviewDeployKey({
            convexToken: connection.auth.credential,
            projectId: preview.projectId,
            convexDeployKeyName: preview.name,
          });
        } catch (error) {
          if (!isConvexManagementNotFoundError(error)) {
            throw error;
          }
        }
      }
    }
    cursor = page.continueCursor;
    isDone = page.isDone;
  }
}

async function detachCloudflareBuildTargets(
  ctx: ActionCtx,
  args: { runId: Doc<"accountDeletionRuns">["_id"]; workflowId: string },
  connection: Doc<"providerConnections"> | null,
): Promise<void> {
  if (connection?.kind !== "cloudflare") {
    return;
  }

  const transport = resolveCloudflareApiTransport(connection.auth.method);
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const page: {
      continueCursor: string;
      isDone: boolean;
      page: { accountId: string; workerTag: string }[];
    } = await ctx.runQuery(internal.accountDeletion.providerActions.listCloudflareBuildTargets, {
      ...args,
      paginationOpts: {
        cursor,
        numItems: ACCOUNT_DELETION_PROVIDER_RESOURCE_PAGE_SIZE,
        maximumRowsRead: ACCOUNT_DELETION_PROVIDER_RESOURCE_PAGE_SIZE,
      },
    });
    for (const worker of page.page) {
      await deleteCloudflareWorkerBuildTriggers({
        accountId: worker.accountId,
        workerTag: worker.workerTag,
        cloudflareToken: connection.auth.credential,
        transport,
      });
    }
    cursor = page.continueCursor;
    isDone = page.isDone;
  }
}

export const vRevokeProviderAccessResult = object({
  github: vAccountDeletionGithubOutcome,
  cloudflare: vAccountDeletionCloudflareOutcome,
  convex: vAccountDeletionConvexOutcome,
});
export type RevokeProviderAccessResult = Infer<typeof vRevokeProviderAccessResult>;

async function revokeGithub(
  connection: Doc<"providerConnections"> | null,
): Promise<AccountDeletionGithubOutcome> {
  if (connection?.kind !== "github") {
    return { state: "not_connected" };
  }
  if (connection.auth.method === "api_key") {
    return { state: "local_delete_only" };
  }

  try {
    await revokeGithubOAuthGrant(connection.auth.credential);
    return { state: "revoked" };
  } catch {
    return {
      state: "unconfirmed",
      safeError: GITHUB_REVOCATION_UNCONFIRMED_ERROR,
    };
  }
}

async function revokeCloudflare(
  connection: Doc<"providerConnections"> | null,
): Promise<AccountDeletionCloudflareOutcome> {
  if (connection?.kind !== "cloudflare") {
    return { state: "not_connected" };
  }
  if (connection.auth.method === "api_key") {
    return { state: "local_delete_only" };
  }

  try {
    if (connection.auth.method === "oauth") {
      await revokeCloudflareOAuthGrant(connection.auth.refreshCredential);
    } else {
      await revokeCloudflareMcpOAuthGrant({
        refreshToken: connection.auth.refreshCredential,
        clientId: connection.auth.clientId,
      });
    }
    return { state: "revoked" };
  } catch {
    return {
      state: "unconfirmed",
      safeError: CLOUDFLARE_REVOCATION_UNCONFIRMED_ERROR,
    };
  }
}

function classifyConvex(
  connection: Doc<"providerConnections"> | null,
): AccountDeletionConvexOutcome {
  if (connection?.kind !== "convex") {
    return { state: "not_connected" };
  }
  if (connection.auth.method === "api_key") {
    return { state: "local_delete_only" };
  }
  return {
    state: "manual_revocation_required",
    safeNotice: CONVEX_MANUAL_REVOCATION_NOTICE,
  };
}

export const revokeForAccountDeletion = internalAction({
  args: {
    runId: id("accountDeletionRuns"),
    workflowId: string(),
  },
  returns: vRevokeProviderAccessResult,
  handler: async (ctx, args): Promise<RevokeProviderAccessResult> => {
    const identity = await ctx.runQuery(
      internal.accountDeletion.stepContext.getOwnedIdentity,
      args,
    );

    const [githubConnection, cloudflareConnection, convexConnection] = await Promise.all([
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId: identity.userId,
        kind: "github",
      }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId: identity.userId,
        kind: "cloudflare",
      }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId: identity.userId,
        kind: "convex",
      }),
    ]);

    await detachCloudflareBuildTargets(ctx, args, cloudflareConnection);
    const [github, cloudflare] = await Promise.all([
      revokeGithub(githubConnection),
      revokeCloudflare(cloudflareConnection),
      revokeConvexDependencyDeployKeys(ctx, args, convexConnection),
    ]);

    return {
      github,
      cloudflare,
      convex: classifyConvex(convexConnection),
    };
  },
});
