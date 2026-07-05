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
  type CloudflareBuildConfig,
  createCloudflareWorker,
  deleteCloudflareResources,
  listCloudflareWorkersWithRepositoryDiscovery,
  readCloudflareWorkerRepositoryDiscovery,
  readOptionalWorkersDevUrl,
  type CloudflareWorkerRepositoryDiscovery,
  wireCloudflareWorkerBuilds,
  wireCloudflareWorkerConvexBuildAccess,
} from "../cloudflareResources";
import { fetchGitHubRepoIdentity } from "../githubRepoApi";
import {
  createConvexDeployKey,
  createConvexPreviewDeployKey,
  ensureConvexPreviewResources,
  resolveConvexProvisioningConnection,
} from "../infraProvisioning";
import { vaultSuffix } from "../slugUtils";
import {
  vVaultCloudflareOrigin,
  type VaultCloudflareBuildConfig,
  type VaultCloudflareOrigin,
} from "./model";

const { array, id, literal, null: nullValue, object, string, union } = v;

const cloudflareAccountResult = object({
  accountId: string(),
  accountName: string(),
});
const cloudflareWorkerRepositoryEvidence = union(
  object({
    state: literal("none"),
  }),
  object({
    state: literal("matching_repo"),
    repoId: string(),
    repoName: union(string(), nullValue()),
    triggerName: union(string(), nullValue()),
  }),
  object({
    state: literal("different_repo"),
    repoId: string(),
    repoName: union(string(), nullValue()),
    triggerName: union(string(), nullValue()),
  }),
  object({
    state: literal("deleted_repo_connection"),
    repoId: union(string(), nullValue()),
    repoName: union(string(), nullValue()),
    triggerName: union(string(), nullValue()),
  }),
  object({
    state: literal("missing_repo_id"),
    repoName: union(string(), nullValue()),
    triggerName: union(string(), nullValue()),
  }),
  object({
    state: literal("trigger_read_failed"),
    message: string(),
  }),
);
const cloudflareWorkerResult = object({
  workerName: string(),
  workerTag: string(),
  discovery: object({
    classification: union(
      literal("recommended"),
      literal("available"),
      literal("blocked"),
      literal("unknown"),
    ),
    evidence: cloudflareWorkerRepositoryEvidence,
  }),
});

type CloudflareAccountResult = Infer<typeof cloudflareAccountResult>;
type CloudflareWorkerResult = Infer<typeof cloudflareWorkerResult>;
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

async function resolveGitHubConnection(
  ctx: Pick<ActionCtx, "runQuery">,
  userId: Id<"users">,
): Promise<{ githubAccessToken: string }> {
  const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
    userId,
    kind: "github",
  });
  const githubAccessToken = githubConnection?.auth.credential.trim();
  if (githubConnection?.kind !== "github" || !githubAccessToken) {
    throw new Error("GitHub connection is required.");
  }
  return { githubAccessToken };
}

function toCloudflareBuildConfig(build: VaultCloudflareBuildConfig): CloudflareBuildConfig {
  return {
    rootDir: build.rootDirectory,
    buildCommand: build.buildCommand,
    deployCommand: build.deployCommand,
    previewDeployCommand: build.previewDeployCommand,
    pathIncludes: build.pathIncludes,
    pathExcludes: build.pathExcludes,
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

type CloudflareWorkerDiscoveryContext = {
  ghRepoId: string;
  repositoryFullName: string;
};

function formatCloudflareWorkerDiscoveryTriggerName(triggerName: string | null): string {
  return triggerName ? ` "${triggerName}"` : "";
}

function formatCloudflareWorkerDiscoveryRepository(args: {
  repoId: string;
  repoName: string | null;
}): string {
  return args.repoName ? `${args.repoName} (${args.repoId})` : args.repoId;
}

function buildCloudflareWorkerDiscoveryBlockMessage(args: {
  workerName: string;
  repositoryFullName: string;
  discovery: CloudflareWorkerRepositoryDiscovery;
}): string | null {
  switch (args.discovery.classification) {
    case "recommended":
    case "available":
      return null;
    case "blocked": {
      const evidence = args.discovery.evidence;
      if (evidence.state === "different_repo") {
        return `Cannot connect Cloudflare Worker ${args.workerName} to ${args.repositoryFullName}: its existing Workers Builds trigger${formatCloudflareWorkerDiscoveryTriggerName(evidence.triggerName)} is connected to GitHub repository ${formatCloudflareWorkerDiscoveryRepository(evidence)}. Disconnect Builds in Cloudflare or choose another Worker.`;
      }
      return `Cannot connect Cloudflare Worker ${args.workerName} to ${args.repositoryFullName}: its existing Workers Builds trigger is connected to a different GitHub repository. Disconnect Builds in Cloudflare or choose another Worker.`;
    }
    case "unknown": {
      const evidence = args.discovery.evidence;
      switch (evidence.state) {
        case "deleted_repo_connection":
          return `Cannot connect Cloudflare Worker ${args.workerName} to ${args.repositoryFullName}: its existing Workers Builds trigger${formatCloudflareWorkerDiscoveryTriggerName(evidence.triggerName)} references a deleted Cloudflare GitHub repository connection. Disconnect Builds in Cloudflare or choose another Worker.`;
        case "missing_repo_id":
          return `Cannot connect Cloudflare Worker ${args.workerName} to ${args.repositoryFullName}: Cloudflare did not return a GitHub repository id for its existing Workers Builds trigger${formatCloudflareWorkerDiscoveryTriggerName(evidence.triggerName)}. Disconnect Builds in Cloudflare or choose another Worker.`;
        case "trigger_read_failed":
          return `Cannot connect Cloudflare Worker ${args.workerName} to ${args.repositoryFullName}: Samebase could not inspect its Workers Builds triggers: ${evidence.message}. Disconnect Builds in Cloudflare or choose another Worker.`;
        case "none":
        case "matching_repo":
        case "different_repo":
          return `Cannot connect Cloudflare Worker ${args.workerName} to ${args.repositoryFullName}: Samebase could not inspect its Workers Builds repository connection. Disconnect Builds in Cloudflare or choose another Worker.`;
        default:
          evidence satisfies never;
          return null;
      }
    }
    default:
      args.discovery.classification satisfies never;
      return null;
  }
}

async function readCloudflareWorkerDiscoveryContext(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    appRoot: string;
  },
): Promise<CloudflareWorkerDiscoveryContext> {
  return await ctx.runQuery(
    internal.vault.cloudflareMutations.readCloudflareWorkerDiscoveryContext,
    {
      vaultId: args.vaultId,
      userId: args.userId,
      appRoot: args.appRoot,
    },
  );
}

async function resolveSelectableExistingWorker(args: {
  token: string;
  transport: CloudflareApiTransport;
  accountId: string;
  workerName: string;
  repositoryFullName: string;
  expectedRepoId: string;
}) {
  const worker = await readCloudflareWorkerRepositoryDiscovery({
    token: args.token,
    transport: args.transport,
    accountId: args.accountId,
    workerName: args.workerName,
    expectedRepoId: args.expectedRepoId,
  });
  const blockMessage = buildCloudflareWorkerDiscoveryBlockMessage({
    workerName: worker.workerName,
    repositoryFullName: args.repositoryFullName,
    discovery: worker.discovery,
  });
  if (blockMessage) {
    throw new Error(blockMessage);
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

async function startCloudflareBuildsWiringOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    appRoot: string;
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.appProvisioningWorkflow.startCloudflareBuildsWiring, args);
  } catch (error) {
    await markCloudflareWorkerConnectionStartupFailed(ctx, {
      runId: args.runId,
      error,
    });
    throw error;
  }
}

async function startCloudflareConvexBuildAccessWiringOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    appRoot: string;
  },
): Promise<void> {
  try {
    await ctx.runMutation(
      internal.appProvisioningWorkflow.startCloudflareConvexBuildAccessWiring,
      args,
    );
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

async function readActiveCloudflareBuildsWiring(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    appRoot: string;
  },
) {
  return await ctx.runQuery(internal.vault.cloudflareMutations.readActiveCloudflareBuildsWiring, {
    vaultId: args.vaultId,
    runId: args.runId,
    userId: args.userId,
    appRoot: args.appRoot,
  });
}

async function readActiveCloudflareConvexBuildAccessWiring(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    appRoot: string;
  },
) {
  return await ctx.runQuery(
    internal.vault.cloudflareMutations.readActiveCloudflareConvexBuildAccessWiring,
    {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
      appRoot: args.appRoot,
    },
  );
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
    vaultId: id("vaults"),
    appRoot: string(),
    accountId: string(),
  },
  returns: array(cloudflareWorkerResult),
  handler: async (ctx, args): Promise<CloudflareWorkerResult[]> => {
    const userId = ctx.viewer.userId;
    const connection = await resolveCloudflareConnection(ctx, userId);
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const discoveryContext = await readCloudflareWorkerDiscoveryContext(ctx, {
      vaultId: args.vaultId,
      userId,
      appRoot,
    });
    const account = await resolveAccount(ctx, {
      token: connection.token,
      transport: connection.transport,
      accountId: args.accountId,
    });
    return await listCloudflareWorkersWithRepositoryDiscovery({
      token: connection.token,
      transport: connection.transport,
      accountId: account.accountId,
      limit: 100,
      expectedRepoId: discoveryContext.ghRepoId,
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
    const discoveryContext = await readCloudflareWorkerDiscoveryContext(ctx, {
      vaultId: args.vaultId,
      userId,
      appRoot,
    });
    const connection = await resolveCloudflareConnection(ctx, userId);
    const account = await resolveAccount(ctx, {
      token: connection.token,
      transport: connection.transport,
      accountId,
    });
    await resolveSelectableExistingWorker({
      token: connection.token,
      transport: connection.transport,
      accountId: account.accountId,
      workerName,
      repositoryFullName: discoveryContext.repositoryFullName,
      expectedRepoId: discoveryContext.ghRepoId,
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
      accountId: account.accountId,
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

export const wireBuilds = action({
  access: "access_app_create",
  args: {
    vaultId: id("vaults"),
    appRoot: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const runId = await ctx.runMutation(internal.appProvisioningRuns.createForVault, {
      userId,
      vaultId: args.vaultId,
      trigger: "wire_builds",
    });
    await startCloudflareBuildsWiringOrFail(ctx, {
      vaultId: args.vaultId,
      runId,
      userId,
      appRoot,
    });

    return null;
  },
});

export const wireConvexBuildAccess = action({
  access: "access_app_create",
  args: {
    vaultId: id("vaults"),
    appRoot: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const runId = await ctx.runMutation(internal.appProvisioningRuns.createForVault, {
      userId,
      vaultId: args.vaultId,
      trigger: "wire_convex_build_access",
    });
    await startCloudflareConvexBuildAccessWiringOrFail(ctx, {
      vaultId: args.vaultId,
      runId,
      userId,
      appRoot,
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
        const discoveryContext = await readCloudflareWorkerDiscoveryContext(ctx, {
          vaultId: args.vaultId,
          userId: args.userId,
          appRoot: args.appRoot,
        });
        const worker = await resolveSelectableExistingWorker({
          token: connection.token,
          transport: connection.transport,
          accountId: account.accountId,
          workerName: args.workerName,
          repositoryFullName: discoveryContext.repositoryFullName,
          expectedRepoId: discoveryContext.ghRepoId,
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

export const ensureCloudflareBuildsWiring = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const active = await readActiveCloudflareBuildsWiring(ctx, args);
    if (!active.active) {
      return null;
    }

    const [cloudflareConnection, githubConnection] = await Promise.all([
      resolveCloudflareConnection(ctx, args.userId),
      resolveGitHubConnection(ctx, args.userId),
    ]);
    const account = await resolveAccount(ctx, {
      token: cloudflareConnection.token,
      transport: cloudflareConnection.transport,
      accountId: active.worker.accountId,
    });
    const repoIdentity = await fetchGitHubRepoIdentity({
      githubAccessToken: githubConnection.githubAccessToken,
      owner: active.owner,
      repo: active.repo,
      expectedRepoId: active.ghRepoId,
    });
    const build = await wireCloudflareWorkerBuilds({
      owner: active.owner,
      repo: active.repo,
      ghRepoId: active.ghRepoId,
      ghRepoOwnerId: repoIdentity.ownerId,
      defaultBranch: active.defaultBranch,
      triggerInitialBuild: !active.hasConvexDeployment,
      vaultId: args.vaultId,
      workerName: active.worker.workerName,
      workerTag: active.worker.workerTag,
      cloudflareToken: cloudflareConnection.token,
      cloudflareAuthMethod: cloudflareConnection.auth.method,
      accountId: account.accountId,
      buildConfig: toCloudflareBuildConfig(active.buildConfig),
    });
    await rememberDefaultAccount(ctx, {
      userId: args.userId,
      auth: cloudflareConnection.auth,
      account,
      tokenHealth: cloudflareConnection.tokenHealth,
    });
    const { applied } = await ctx.runMutation(
      internal.vault.cloudflareMutations.recordCloudflareBuildsForRun,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        appRoot: args.appRoot,
        builds: {
          state: "connected",
          ...build,
        },
      },
    );
    if (!applied) {
      throw new Error("Cloudflare Workers Builds wiring was superseded.");
    }

    return null;
  },
});

export const ensureCloudflareConvexBuildAccessWiring = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appRoot: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const active = await readActiveCloudflareConvexBuildAccessWiring(ctx, args);
    if (!active.active) {
      return null;
    }

    const [cloudflareConnection, convexConnection] = await Promise.all([
      resolveCloudflareConnection(ctx, args.userId),
      resolveConvexProvisioningConnection(ctx, args.userId),
    ]);
    const account = await resolveAccount(ctx, {
      token: cloudflareConnection.token,
      transport: cloudflareConnection.transport,
      accountId: active.worker.accountId,
    });
    const previewConvex = await ensureConvexPreviewResources({
      convexToken: convexConnection.convexToken,
      teamId: convexConnection.convexTeamId,
      projectId: active.convex.projectId,
    });
    const productionDeployKey = await createConvexDeployKey({
      convexToken: convexConnection.convexToken,
      convexAuthMethod: convexConnection.convexAuthMethod,
      deploymentName: active.convex.deploymentName,
      name: `samebase-${vaultSuffix(args.vaultId)}`,
    });
    const productionDeployKeyRecord = await ctx.runMutation(
      internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessDeployKey,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        appRoot: args.appRoot,
        deployment: "production",
        convexDeployKeyId: productionDeployKey.convexDeployKeyId,
      },
    );
    if (!productionDeployKeyRecord.applied) {
      throw new Error("Convex build access wiring was superseded.");
    }

    const previewDeployKey = await createConvexPreviewDeployKey({
      convexToken: convexConnection.convexToken,
      projectId: active.convex.projectId,
      name: `samebase-preview-${vaultSuffix(args.vaultId)}`,
    });
    const previewDeployKeyRecord = await ctx.runMutation(
      internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessDeployKey,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        appRoot: args.appRoot,
        deployment: "preview",
        convexDeployKeyId: previewDeployKey.convexDeployKeyId,
      },
    );
    if (!previewDeployKeyRecord.applied) {
      throw new Error("Convex build access wiring was superseded.");
    }

    await wireCloudflareWorkerConvexBuildAccess({
      defaultBranch: active.defaultBranch,
      vaultId: args.vaultId,
      workerName: active.worker.workerName,
      workerTag: active.worker.workerTag,
      cloudflareToken: cloudflareConnection.token,
      cloudflareAuthMethod: cloudflareConnection.auth.method,
      accountId: account.accountId,
      build: active.worker.build,
      convex: {
        production: {
          cloudUrl: active.convex.cloudUrl,
          deployKey: productionDeployKey.deployKey,
        },
        preview: {
          cloudUrl: previewConvex.previewCloudUrl,
          deployKey: previewDeployKey.deployKey,
        },
      },
    });
    await rememberDefaultAccount(ctx, {
      userId: args.userId,
      auth: cloudflareConnection.auth,
      account,
      tokenHealth: cloudflareConnection.tokenHealth,
    });
    const { applied } = await ctx.runMutation(
      internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessForRun,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        appRoot: args.appRoot,
        previewDeployment: {
          state: "ready",
          deploymentName: previewConvex.previewDeploymentName,
          cloudUrl: previewConvex.previewCloudUrl,
        },
      },
    );
    if (!applied) {
      throw new Error("Convex build access wiring was superseded.");
    }

    return null;
  },
});
