"use node";

import { Infer, v } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action } from "../functions";
import { toErrorMessage } from "../jsonUtils";
import type { McpTokenHealth } from "../mcpTokenHealth";
import { listCloudflareAccountsForToken } from "../cloudflareAccountDiscovery";
import {
  resolveCloudflareApiTransport,
  type CloudflareApiTransport,
} from "../cloudflareApi/client";
import { validateAppResourceName } from "../../shared/appResourceNames";
import { normalizeVaultAppRoot } from "../../shared/vaultAppRoot";
import {
  createCloudflareWorker,
  deleteCloudflareResources,
  ensureCloudflareResources,
  listCloudflareWorkers,
  readOptionalWorkersDevUrl,
} from "../cloudflareResources";
import {
  buildVaultCloudflareBuildConfigForAppRoot,
  vVaultCloudflareOrigin,
  type VaultCloudflareOrigin,
} from "./model";
import {
  createConvexDeployKey,
  createConvexPreviewDeployKey,
  ensureConvexPreviewResources,
  fetchGitHubRepoIdentity,
  resolveConvexProvisioningConnection,
  resolveGitHubProvisioningConnection,
  toCloudflareBuildConfig,
} from "../infraProvisioning";
import { vaultSuffix } from "../slugUtils";

const { array, id, null: nullValue, object, string } = v;

const cloudflareAccountResult = object({
  accountId: string(),
  accountName: string(),
});
const cloudflareWorkerResult = object({
  workerName: string(),
  workerTag: string(),
});

type CloudflareAccountResult = Infer<typeof cloudflareAccountResult>;
type CloudflareActionConnection = {
  auth:
    | {
        method: "api_key";
        credential: string;
      }
    | {
        method: "oauth";
        credential: string;
        refreshCredential: string;
        credentialExpiresAt: number;
      }
    | {
        method: "mcp_oauth";
        credential: string;
        refreshCredential: string;
        credentialExpiresAt: number;
        clientId: string;
      };
  token: string;
  transport: CloudflareApiTransport;
  tokenHealth?: McpTokenHealth;
};

async function resolveCloudflareConnection(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<CloudflareActionConnection> {
  const connection = await ctx.runAction(internal.cloudflareOAuth.resolveConnectionForUser, {
    userId,
  });
  const token = connection?.auth.credential.trim();
  if (!connection || !token) {
    throw new Error("Cloudflare connection is required.");
  }

  return {
    auth: connection.auth,
    token,
    transport: resolveCloudflareApiTransport(connection.auth.method),
    tokenHealth: connection.tokenHealth,
  };
}

async function listAccountsForConnection(args: {
  token: string;
  transport: CloudflareApiTransport;
}): Promise<CloudflareAccountResult[]> {
  return await listCloudflareAccountsForToken({
    token: args.token,
    transport: args.transport,
    perPage: 100,
  });
}

async function resolveAccount(
  ctx: ActionCtx,
  args: { token: string; transport: CloudflareApiTransport; accountId: string },
) {
  const accounts = await listAccountsForConnection(args);
  const account = accounts.find((candidate) => candidate.accountId === args.accountId);
  if (!account) {
    throw new Error("Cloudflare account is not available for this connection.");
  }
  return account;
}

async function rememberDefaultAccount(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    auth: Awaited<ReturnType<typeof resolveCloudflareConnection>>["auth"];
    account: CloudflareAccountResult;
    tokenHealth: Awaited<ReturnType<typeof resolveCloudflareConnection>>["tokenHealth"];
  },
) {
  await ctx.runMutation(internal.providerConnections.upsertCloudflare, {
    userId: args.userId,
    auth: args.auth,
    defaultAccount: {
      state: "selected",
      accountId: args.account.accountId,
      accountName: args.account.accountName,
    },
    ...(args.tokenHealth ? { tokenHealth: args.tokenHealth } : {}),
  });
}

async function resolveListedWorker(args: {
  token: string;
  transport: CloudflareApiTransport;
  accountId: string;
  workerName: string;
}) {
  const workers = await listCloudflareWorkers({
    token: args.token,
    transport: args.transport,
    accountId: args.accountId,
    limit: 100,
  });
  const worker = workers.find((candidate) => candidate.workerName === args.workerName);
  if (!worker) {
    throw new Error(`Cloudflare Worker ${args.workerName} was not found.`);
  }
  return {
    workerName: worker.workerName,
    workerTag: worker.workerTag,
    workersDevUrl: await readOptionalWorkersDevUrl({
      token: args.token,
      transport: args.transport,
      accountId: args.accountId,
      workerName: worker.workerName,
    }),
  };
}

async function markCloudflareWorkerConnectionStartupFailed(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"appProvisioningRuns">;
    error: unknown;
  },
): Promise<void> {
  await ctx.runMutation(internal.infraProvisioning.markWorkflowStartupFailed, {
    runId: args.runId,
    message: toErrorMessage(args.error),
  });
}

async function startCloudflareWorkerConnectionOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    appRoot: string;
    accountId: string;
    workerName: string;
    origin: VaultCloudflareOrigin;
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.appProvisioningWorkflow.startCloudflareWorkerConnection, args);
  } catch (error) {
    await markCloudflareWorkerConnectionStartupFailed(ctx, {
      runId: args.runId,
      error,
    });
    throw error;
  }
}

async function isCloudflareWorkerConnectionRunActive(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    appRoot: string;
  },
): Promise<boolean> {
  const result = await ctx.runQuery(
    internal.vault.cloudflareMutations.readActiveCloudflareWorkerConnection,
    {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
      appRoot: args.appRoot,
    },
  );
  return result.active;
}

async function recordConvexDeployKeyForCloudflareWorkerConnectionOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    appRoot: string;
    deployment: "production" | "preview";
    convexDeployKeyId: string;
  },
): Promise<void> {
  const record = await ctx.runMutation(
    internal.vault.cloudflareMutations.recordConvexDeployKeyForCloudflareWorkerConnection,
    args,
  );
  if (!record.applied) {
    throw new Error(
      "Could not record Convex deploy key identity for Cloudflare Worker connection.",
    );
  }
}

export const listAccounts = action({
  access: "access_app_create",
  args: {},
  returns: array(cloudflareAccountResult),
  handler: async (ctx): Promise<CloudflareAccountResult[]> => {
    const userId = ctx.viewer.userId;
    const connection = await resolveCloudflareConnection(ctx, userId);
    return await listAccountsForConnection({
      token: connection.token,
      transport: connection.transport,
    });
  },
});

export const selectDefaultAccount = action({
  access: "access_app_create",
  args: {
    accountId: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const connection = await resolveCloudflareConnection(ctx, userId);
    const account = await resolveAccount(ctx, {
      token: connection.token,
      transport: connection.transport,
      accountId: args.accountId,
    });
    await rememberDefaultAccount(ctx, {
      userId,
      auth: connection.auth,
      account,
      tokenHealth: connection.tokenHealth,
    });

    return null;
  },
});

export const listWorkers = action({
  access: "access_app_create",
  args: {
    accountId: string(),
  },
  returns: array(cloudflareWorkerResult),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const connection = await resolveCloudflareConnection(ctx, userId);
    const account = await resolveAccount(ctx, {
      token: connection.token,
      transport: connection.transport,
      accountId: args.accountId,
    });
    return await listCloudflareWorkers({
      token: connection.token,
      transport: connection.transport,
      accountId: account.accountId,
      limit: 100,
    });
  },
});

export const connectExistingWorker = action({
  access: "access_app_create",
  args: {
    vaultId: id("vaults"),
    appRoot: string(),
    accountId: string(),
    workerName: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const accountId = args.accountId.trim();
    const workerName = args.workerName.trim();
    if (!accountId) {
      throw new Error("Cloudflare account is required.");
    }
    if (!workerName) {
      throw new Error("Cloudflare Worker is required.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    await ctx.runQuery(internal.vault.cloudflareMutations.requireCloudflareWorkerConnectionVault, {
      vaultId: args.vaultId,
      userId,
      appRoot,
    });
    const runId = await ctx.runMutation(internal.appProvisioningRuns.createForVault, {
      userId,
      vaultId: args.vaultId,
      trigger: "connect_cloudflare_worker",
    });
    await startCloudflareWorkerConnectionOrFail(ctx, {
      vaultId: args.vaultId,
      runId,
      userId,
      appRoot,
      accountId,
      workerName,
      origin: "selected_existing",
    });

    return null;
  },
});

export const createWorker = action({
  access: "access_app_create",
  args: {
    vaultId: id("vaults"),
    appRoot: string(),
    accountId: string(),
    workerName: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const validation = validateAppResourceName(args.workerName, "cloudflare");
    if (!validation.valid) {
      throw new Error(validation.message);
    }
    const accountId = args.accountId.trim();
    if (!accountId) {
      throw new Error("Cloudflare account is required.");
    }
    const appRoot = normalizeVaultAppRoot(args.appRoot);

    const userId = ctx.viewer.userId;
    await ctx.runQuery(internal.vault.cloudflareMutations.requireCloudflareWorkerConnectionVault, {
      vaultId: args.vaultId,
      userId,
      appRoot,
    });
    const runId = await ctx.runMutation(internal.appProvisioningRuns.createForVault, {
      userId,
      vaultId: args.vaultId,
      trigger: "connect_cloudflare_worker",
    });
    await startCloudflareWorkerConnectionOrFail(ctx, {
      vaultId: args.vaultId,
      runId,
      userId,
      appRoot,
      accountId,
      workerName: validation.value,
      origin: "provisioned",
    });

    return null;
  },
});

export const ensureCloudflareWorkerConnection = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appRoot: string(),
    accountId: string(),
    workerName: string(),
    origin: vVaultCloudflareOrigin,
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    if (!(await isCloudflareWorkerConnectionRunActive(ctx, args))) {
      return null;
    }

    const connection = await resolveCloudflareConnection(ctx, args.userId);
    const account = await resolveAccount(ctx, {
      token: connection.token,
      transport: connection.transport,
      accountId: args.accountId,
    });

    switch (args.origin) {
      case "selected_existing": {
        const worker = await resolveListedWorker({
          token: connection.token,
          transport: connection.transport,
          accountId: account.accountId,
          workerName: args.workerName,
        });
        await rememberDefaultAccount(ctx, {
          userId: args.userId,
          auth: connection.auth,
          account,
          tokenHealth: connection.tokenHealth,
        });
        const { attached } = await ctx.runMutation(
          internal.vault.cloudflareMutations.attachWorkerForRun,
          {
            vaultId: args.vaultId,
            runId: args.runId,
            userId: args.userId,
            appRoot: args.appRoot,
            accountId: account.accountId,
            workerName: worker.workerName,
            workerTag: worker.workerTag,
            workersDevUrl: worker.workersDevUrl,
            origin: args.origin,
            deployment: { state: "not_configured" },
          },
        );
        if (!attached) {
          throw new Error("Cloudflare Worker connection did not attach a Worker.");
        }
        return null;
      }
      case "provisioned": {
        const validation = validateAppResourceName(args.workerName, "cloudflare");
        if (!validation.valid) {
          throw new Error(validation.message);
        }
        if (!(await isCloudflareWorkerConnectionRunActive(ctx, args))) {
          return null;
        }

        const [buildContext, githubConnection, convexConnection] = await Promise.all([
          ctx.runQuery(internal.vault.cloudflareMutations.readCloudflareWorkerBuildContext, {
            vaultId: args.vaultId,
            runId: args.runId,
            userId: args.userId,
            appRoot: args.appRoot,
          }),
          resolveGitHubProvisioningConnection(ctx, args.userId),
          resolveConvexProvisioningConnection(ctx, args.userId),
        ]);

        const repoIdentity = await fetchGitHubRepoIdentity({
          githubAccessToken: githubConnection.githubAccessToken,
          owner: buildContext.owner,
          repo: buildContext.repo,
          expectedRepoId: buildContext.ghRepoId,
        });

        let worker: Awaited<ReturnType<typeof createCloudflareWorker>>;
        try {
          worker = await createCloudflareWorker({
            token: connection.token,
            transport: connection.transport,
            accountId: account.accountId,
            workerName: validation.value,
          });
        } catch (error) {
          throw new Error(toErrorMessage(error));
        }

        try {
          const previewConvex = await ensureConvexPreviewResources({
            convexToken: convexConnection.convexToken,
            teamId: convexConnection.convexTeamId,
            projectId: buildContext.convex.projectId,
          });
          const productionDeployKey = await createConvexDeployKey({
            convexToken: convexConnection.convexToken,
            convexAuthMethod: convexConnection.convexAuthMethod,
            deploymentName: buildContext.convex.deploymentName,
            name: `samebase-${vaultSuffix(args.vaultId)}`,
          });
          await recordConvexDeployKeyForCloudflareWorkerConnectionOrFail(ctx, {
            vaultId: args.vaultId,
            runId: args.runId,
            userId: args.userId,
            appRoot: args.appRoot,
            deployment: "production",
            convexDeployKeyId: productionDeployKey.convexDeployKeyId,
          });
          const previewDeployKey = await createConvexPreviewDeployKey({
            convexToken: convexConnection.convexToken,
            projectId: buildContext.convex.projectId,
            name: `samebase-preview-${vaultSuffix(args.vaultId)}`,
          });
          await recordConvexDeployKeyForCloudflareWorkerConnectionOrFail(ctx, {
            vaultId: args.vaultId,
            runId: args.runId,
            userId: args.userId,
            appRoot: args.appRoot,
            deployment: "preview",
            convexDeployKeyId: previewDeployKey.convexDeployKeyId,
          });

          const vaultBuildConfig = buildVaultCloudflareBuildConfigForAppRoot({
            appRoot: args.appRoot,
          });
          const provisionedCloudflare = await ensureCloudflareResources({
            owner: buildContext.owner,
            repo: buildContext.repo,
            ghRepoId: buildContext.ghRepoId,
            ghRepoOwnerId: repoIdentity.ownerId,
            defaultBranch: buildContext.defaultBranch,
            vaultId: args.vaultId,
            workerName: worker.workerName,
            cloudflareToken: connection.token,
            cloudflareAuthMethod: connection.auth.method,
            accountId: account.accountId,
            buildConfig: toCloudflareBuildConfig(vaultBuildConfig),
            existingWorker: {
              state: "created",
              workerTag: worker.workerTag,
            },
            convex: {
              production: {
                cloudUrl: buildContext.convex.cloudUrl,
                deployKey: productionDeployKey.deployKey,
              },
              preview: {
                cloudUrl: previewConvex.previewCloudUrl,
                deployKey: previewDeployKey.deployKey,
              },
            },
            onWorkerResolved: async () => {},
          });

          await rememberDefaultAccount(ctx, {
            userId: args.userId,
            auth: connection.auth,
            account,
            tokenHealth: connection.tokenHealth,
          });
          const { attached } = await ctx.runMutation(
            internal.vault.cloudflareMutations.attachWorkerForRun,
            {
              vaultId: args.vaultId,
              runId: args.runId,
              userId: args.userId,
              appRoot: args.appRoot,
              accountId: account.accountId,
              workerName: provisionedCloudflare.workerName,
              workerTag: provisionedCloudflare.workerTag,
              workersDevUrl: provisionedCloudflare.workersDevUrl,
              origin: args.origin,
              deployment: {
                state: "workers_builds_connected",
                ...provisionedCloudflare.build,
              },
            },
          );
          if (!attached) {
            throw new Error("Cloudflare Worker connection did not attach a Worker.");
          }
        } catch (error) {
          const { shouldDelete } = await ctx.runQuery(
            internal.vault.cloudflareMutations.readCreatedWorkerRollbackSafety,
            {
              vaultId: args.vaultId,
              runId: args.runId,
              userId: args.userId,
              appRoot: args.appRoot,
              accountId: account.accountId,
              workerName: worker.workerName,
            },
          );
          if (shouldDelete) {
            await deleteCloudflareResources({
              cloudflareToken: connection.token,
              transport: connection.transport,
              accountId: account.accountId,
              workerName: worker.workerName,
              workerTag: worker.workerTag,
            }).catch((cleanupError: unknown) => {
              console.warn("cloudflare:create:rollback_failed", {
                accountId: account.accountId,
                workerName: worker.workerName,
                error: toErrorMessage(cleanupError),
              });
            });
          }
          throw error;
        }

        return null;
      }
    }

    args.origin satisfies never;
    throw new Error("Unsupported Cloudflare Worker origin.");
  },
});
