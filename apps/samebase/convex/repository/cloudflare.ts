"use node";

import { exactly } from "@samebase/dependent/main";
import { ConvexError, Infer, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { ORGANIZATION_CONNECTION_LIMIT_ERROR_PREFIX } from "../billingErrors";
import {
  listCloudflareAccountsForToken,
  type CloudflareAccount,
} from "../cloudflareAccountDiscovery";
import {
  resolveCloudflareApiTransport,
  type CloudflareApiTransport,
} from "../cloudflareApi/client";
import {
  createCloudflareWorker,
  discoverCloudflareWorkersForRepository,
  readCloudflareWorkerIdentity,
  readCloudflareWorkerIdentityByTag,
  readCloudflareWorkerConvexBuildAccess,
  readCloudflareWorkerRepositoryDiscoveryForIdentity,
  configureCloudflareWorkerBuildsForGitHub,
  requireCloudflareBuildTokenUuid,
  rotateConvexDeployKeysForCloudflareWorkerBuilds,
  type CloudflareBuildConfig,
  type CloudflareConnectedWorkersBuilds,
} from "../cloudflareResources";
import { fetchGitHubDefaultBranchHead, fetchGitHubRepoIdentity } from "../githubRepoApi";
import type { ResolvedCloudflareConnection } from "../cloudflareOAuth";
import { organizationProviderCredentialAad } from "../organization/providerCredentialModel";
import { openSecret } from "../sealedSecret";
import {
  resolveGitHubAppAccess,
  resolveGitHubAppAccessForProvisioningRun,
  type GitHubAppAccess,
} from "../githubAppAccess";
import {
  createConvexDeployKey,
  createConvexPreviewDeployKey,
  deleteConvexDeployKeyByName,
  deleteConvexPreviewDeployKeyByName,
  resolveConvexProvisioningConnection,
  resolveConvexProvisioningConnectionForRepositoryWorkflow,
} from "../infraProvisioning";
import { action } from "../functions";
import { toErrorMessage } from "../jsonUtils";
import type { McpTokenHealth } from "../mcpTokenHealth";
import {
  AppResourceNameConflictError,
  validateAppResourceName,
} from "../../shared/appResourceNames";
import { WORKER_PREVIEWS_MIGRATION_REQUIRED_MESSAGE } from "../../shared/cloudflareWorkerPreviews";
import { normalizeRepositoryRootDirectory } from "../../shared/repositoryRootDirectory";
import type { ConfirmationSurface } from "./confirmationModel";
import type { ActionConfirmation, ActionConfirmationRequest } from "./contracts/actionConfirmation";
import { buildRepositoryCloudflareBuildConfigForRootDirectory } from "./model";
import { toCloudflareWorkerDiscovery } from "./cloudflareWorkerDiscovery";
import { buildWorkersBuildsConvexDeployKeyNames } from "./workersBuildsConvexDeployKeyNames";
import type {
  WorkerConfigurationContext,
  WorkerConvexProjectConfigurationContext,
} from "./cloudflareMutations";
import {
  formatAttachedConvexProjects,
  nameAttachedConvexProjects,
  readRepositoryConvexTeamProjectNames,
} from "./convex";
import { readConvexProductionDeployment } from "./convexProjectResources";
import type {
  CloudflareWorkerRecordedAttachment,
  RepositoryProviderObservationContext,
} from "./providerObservationQueries";
import {
  cloudflareAttachWorkersContract,
  cloudflareConnectWorkerContract,
  cloudflareCreateWorkerContract,
  cloudflareDiscoverWorkersContract,
  type vConvexDeployKeyInstallation,
} from "./contracts/cloudflareAttachments";
import { cloudflareConfigureWorkersBuildsForGitHubContract } from "./contracts/cloudflareConfigureWorkersBuildsForGitHub";
import { cloudflareRotateConvexDeployKeysForWorkersBuildsContract } from "./contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds";
import {
  attemptManualProviderWriteFailureRecord,
  requireManualProviderActionDeadline,
} from "./infrastructureOperation";

const { id, object, string } = v;

type CloudflareConnectWorkerResult = Infer<typeof cloudflareConnectWorkerContract.returns>;
type CloudflareCreateWorkerResult = Infer<typeof cloudflareCreateWorkerContract.returns>;
type ConvexDeployKeyInstallation = Infer<typeof vConvexDeployKeyInstallation>;
type CloudflareActionConnection = {
  organizationId: Id<"organizations">;
  auth: ResolvedCloudflareConnection["auth"];
  /** The opened `auth.credential`. */
  token: string;
  transport: CloudflareApiTransport;
  account: { accountId: string; accountName: string };
  tokenHealth?: McpTokenHealth;
};

const vPreparedCloudflareWorkerBuilds = object({
  rootDirectory: string(),
});
type PreparedCloudflareWorkerBuilds = Infer<typeof vPreparedCloudflareWorkerBuilds>;
type CloudflareWorkerBuildPreparation =
  | { state: "discover" }
  | { state: "prepared"; build: PreparedCloudflareWorkerBuilds };

type ProviderAttachmentRepositoryContext = {
  organizationId: Id<"organizations">;
  convexTeamId?: string;
  cloudflareAccountId?: string;
  githubRepositoryDatabaseId: string;
  githubOwnerLogin: string;
  githubRepositoryName: string;
  defaultBranch: string;
};
type RepositoryActionAuthority =
  | {
      kind: "user";
      userId: Id<"users">;
      repositoryId: Id<"repositories">;
    }
  | {
      kind: "manual_provider_write";
      userId: Id<"users">;
      repositoryId: Id<"repositories">;
      actionId: string;
    }
  | {
      kind: "provisioning";
      runId: Id<"workflow_repositoryProvisioning_runs">;
      userId: Id<"users">;
      repositoryId: Id<"repositories">;
    };

async function resolveCloudflareConnection(
  ctx: Pick<ActionCtx, "runAction">,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
  },
): Promise<CloudflareActionConnection> {
  const connection = await ctx.runAction(
    internal.cloudflareOAuth.resolveConnectionForOrganization,
    {
      userId: args.userId,
      organizationId: args.organizationId,
    },
  );
  const token =
    connection &&
    (
      await openSecret({
        sealed: connection.auth.credential,
        aad: organizationProviderCredentialAad(args.organizationId, "cloudflare.auth.credential"),
      })
    ).trim();
  if (!connection || !token) {
    throw new ConvexError("Cloudflare connection is required.");
  }
  return {
    organizationId: args.organizationId,
    auth: connection.auth,
    token,
    transport: resolveCloudflareApiTransport(connection.auth.method),
    account: connection.account,
    ...(connection.tokenHealth ? { tokenHealth: connection.tokenHealth } : {}),
  };
}

async function resolveCloudflareConnectionForManualProviderWrite(
  ctx: Pick<ActionCtx, "runAction">,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    organizationId: Id<"organizations">;
    actionId: string;
  },
): Promise<CloudflareActionConnection> {
  const connection = await ctx.runAction(
    internal.cloudflareOAuth.resolveConnectionForManualProviderWrite,
    {
      userId: args.userId,
      repositoryId: args.repositoryId,
      organizationId: args.organizationId,
      actionId: args.actionId,
    },
  );
  const token =
    connection &&
    (
      await openSecret({
        sealed: connection.auth.credential,
        aad: organizationProviderCredentialAad(args.organizationId, "cloudflare.auth.credential"),
      })
    ).trim();
  if (!connection || !token) {
    throw new ConvexError("Cloudflare connection is required.");
  }
  return {
    organizationId: args.organizationId,
    auth: connection.auth,
    token,
    transport: resolveCloudflareApiTransport(connection.auth.method),
    account: connection.account,
    ...(connection.tokenHealth ? { tokenHealth: connection.tokenHealth } : {}),
  };
}

async function resolveCloudflareConnectionForProvisioningRun(
  ctx: Pick<ActionCtx, "runAction">,
  args: {
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    organizationId: Id<"organizations">;
  },
): Promise<CloudflareActionConnection> {
  const connection = await ctx.runAction(
    internal.cloudflareOAuth.resolveConnectionForRepositoryWorkflow,
    {
      authority: {
        kind: "provisioning",
        runId: args.runId,
        userId: args.userId,
        repositoryId: args.repositoryId,
      },
    },
  );
  const token =
    connection &&
    (
      await openSecret({
        sealed: connection.auth.credential,
        aad: organizationProviderCredentialAad(args.organizationId, "cloudflare.auth.credential"),
      })
    ).trim();
  if (!connection || !token) {
    throw new ConvexError("Cloudflare connection is required.");
  }
  return {
    organizationId: args.organizationId,
    auth: connection.auth,
    token,
    transport: resolveCloudflareApiTransport(connection.auth.method),
    account: connection.account,
    ...(connection.tokenHealth ? { tokenHealth: connection.tokenHealth } : {}),
  };
}

async function resolveCloudflareConnectionForAuthority(
  ctx: Pick<ActionCtx, "runAction">,
  authority: RepositoryActionAuthority,
  organizationId: Id<"organizations">,
): Promise<CloudflareActionConnection> {
  switch (authority.kind) {
    case "user":
      return await resolveCloudflareConnection(ctx, {
        userId: authority.userId,
        organizationId,
      });
    case "manual_provider_write":
      return await resolveCloudflareConnectionForManualProviderWrite(ctx, {
        userId: authority.userId,
        repositoryId: authority.repositoryId,
        organizationId,
        actionId: authority.actionId,
      });
    case "provisioning":
      return await resolveCloudflareConnectionForProvisioningRun(ctx, {
        ...authority,
        organizationId,
      });
    default:
      authority satisfies never;
      throw new Error("Repository action authority is invalid.");
  }
}

async function resolveGitHubAppAccessForAuthority(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  authority: RepositoryActionAuthority,
): Promise<GitHubAppAccess> {
  switch (authority.kind) {
    case "user":
      return await resolveGitHubAppAccess(ctx, {
        userId: authority.userId,
        target: { kind: "repository", repositoryId: authority.repositoryId },
      });
    case "manual_provider_write":
      return await resolveGitHubAppAccess(ctx, {
        userId: authority.userId,
        target: { kind: "repository", repositoryId: authority.repositoryId },
      });
    case "provisioning":
      return await resolveGitHubAppAccessForProvisioningRun(ctx, authority);
    default:
      authority satisfies never;
      throw new Error("Repository action authority is invalid.");
  }
}

async function resolveConvexConnectionForAuthority(
  ctx: Pick<ActionCtx, "runQuery">,
  authority: RepositoryActionAuthority,
  args: { organizationId: Id<"organizations">; teamId: string },
) {
  switch (authority.kind) {
    case "user":
      return await resolveConvexProvisioningConnection(ctx, {
        userId: authority.userId,
        organizationId: args.organizationId,
        teamId: args.teamId,
      });
    case "manual_provider_write":
      return await resolveConvexProvisioningConnection(ctx, {
        userId: authority.userId,
        organizationId: args.organizationId,
        teamId: args.teamId,
      });
    case "provisioning":
      return await resolveConvexProvisioningConnectionForRepositoryWorkflow(ctx, {
        ...authority,
        teamId: args.teamId,
      });
    default:
      authority satisfies never;
      throw new Error("Repository action authority is invalid.");
  }
}

function requireCloudflareAccountTarget(
  connection: CloudflareActionConnection,
  accountId: string,
): void {
  if (connection.account.accountId !== accountId) {
    throw new ConvexError("Cloudflare connection is required for this account.");
  }
}

async function listAccountsForConnection(args: {
  token: string;
  transport: CloudflareApiTransport;
}): Promise<CloudflareAccount[]> {
  return await listCloudflareAccountsForToken(args);
}

async function resolveAccount(args: {
  token: string;
  transport: CloudflareApiTransport;
  accountId: string;
}): Promise<CloudflareAccount> {
  const account = (await listAccountsForConnection(args)).find(
    (candidate) => candidate.accountId === args.accountId,
  );
  if (!account) {
    throw new ConvexError(
      "Cloudflare cannot access the repository's configured account. Reconnect Cloudflare, then retry.",
    );
  }
  return account;
}

async function readProviderAttachmentRepositoryContext(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
): Promise<ProviderAttachmentRepositoryContext> {
  return await ctx.runQuery(
    internal.repository.providerObservationQueries.readProviderAttachmentRepositoryContext,
    {
      repositoryId: args.repositoryId,
      userId: args.userId,
    },
  );
}

async function readWorkerConfigurationContext(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    repositoryId: Id<"repositories">;
    userId: Id<"users">;
    workerId: Id<"repositoryCloudflareWorkers">;
  },
) {
  return await ctx.runQuery(
    internal.repository.cloudflareMutations.readWorkerConfigurationContext,
    {
      repositoryId: args.repositoryId,
      userId: args.userId,
      workerId: args.workerId,
    },
  );
}

async function readWorkerConvexProjectConfigurationContext(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    repositoryId: Id<"repositories">;
    userId: Id<"users">;
    workerId: Id<"repositoryCloudflareWorkers">;
    convexProjectId: Id<"repositoryConvexProjects">;
  },
): Promise<WorkerConvexProjectConfigurationContext> {
  return await ctx.runQuery(
    internal.repository.cloudflareMutations.readWorkerConvexProjectConfigurationContext,
    {
      repositoryId: args.repositoryId,
      userId: args.userId,
      workerId: args.workerId,
      convexProjectId: args.convexProjectId,
    },
  );
}

function requireRepositoryCloudflareAccountId(
  context: ProviderAttachmentRepositoryContext,
): string {
  if (context.cloudflareAccountId === undefined) {
    throw new ConvexError(
      "This repository has no Cloudflare account yet. Connect Cloudflare to its organization in Samebase, then retry.",
    );
  }
  return context.cloudflareAccountId;
}

/** Every repository-level Cloudflare action uses the repository's stored Cloudflare account. */
async function resolveCloudflareRepositoryContext(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    actionId?: string;
  },
): Promise<{
  account: CloudflareAccount;
  connection: CloudflareActionConnection;
  context: ProviderAttachmentRepositoryContext;
  githubAccess: GitHubAppAccess;
  githubOwnerId: string;
  githubDefaultBranch: string;
}> {
  const context = await readProviderAttachmentRepositoryContext(ctx, {
    repositoryId: args.repositoryId,
    userId: args.userId,
  });
  const accountId = requireRepositoryCloudflareAccountId(context);
  const [connection, githubAccess] = await Promise.all([
    args.actionId === undefined
      ? resolveCloudflareConnection(ctx, {
          userId: args.userId,
          organizationId: context.organizationId,
        })
      : resolveCloudflareConnectionForManualProviderWrite(ctx, {
          userId: args.userId,
          repositoryId: args.repositoryId,
          organizationId: context.organizationId,
          actionId: args.actionId,
        }),
    resolveGitHubAppAccess(ctx, {
      userId: args.userId,
      target: { kind: "repository", repositoryId: args.repositoryId },
    }),
  ]);
  requireCloudflareAccountTarget(connection, accountId);
  const account = await resolveAccount({
    token: connection.token,
    transport: connection.transport,
    accountId,
  });
  const repository = await fetchGitHubRepoIdentity({
    octokit: githubAccess.octokit,
    owner: context.githubOwnerLogin,
    repo: context.githubRepositoryName,
    expectedRepoId: context.githubRepositoryDatabaseId,
  });
  return {
    account,
    connection,
    context,
    githubAccess,
    githubOwnerId: repository.ownerId,
    githubDefaultBranch: repository.defaultBranch,
  };
}

/**
Reads the stable tag of each named Worker in the repository's Cloudflare account. MCP tools take
Worker names; the dashboard passes the tags that discovery returned.
*/
export async function readCloudflareWorkerTagsByNameForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    workerNames: string[];
  },
): Promise<Array<{ workerName: string; workerTag: string }>> {
  const context = await readProviderAttachmentRepositoryContext(ctx, args);
  const accountId = requireRepositoryCloudflareAccountId(context);
  const connection = await resolveCloudflareConnection(ctx, {
    userId: args.userId,
    organizationId: context.organizationId,
  });
  requireCloudflareAccountTarget(connection, accountId);
  return await Promise.all(
    args.workerNames.map(async (requestedName) => {
      const workerName = requestedName.trim();
      const identity = await readCloudflareWorkerIdentity({
        token: connection.token,
        transport: connection.transport,
        accountId,
        workerName,
      });
      if (!identity) {
        throw new ConvexError(
          `Cloudflare Worker ${workerName} does not exist in this repository's Cloudflare account. Call repository_cloudflare_findWorkers to see the Workers that can be added.`,
        );
      }
      return { workerName: identity.workerName, workerTag: identity.workerTag };
    }),
  );
}

export async function attachExistingCloudflareWorkersForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    workers: Array<{ workerName: string; workerTag: string }>;
  },
): Promise<Array<Id<"repositoryCloudflareWorkers">>> {
  if (args.workers.length === 0) {
    throw new ConvexError("Select at least one Cloudflare Worker.");
  }
  const workers = args.workers.map((worker) => ({
    workerName: worker.workerName.trim(),
    workerTag: worker.workerTag.trim(),
  }));
  if (
    workers.some((worker) => !worker.workerName || !worker.workerTag) ||
    new Set(workers.map((worker) => worker.workerName)).size !== workers.length ||
    new Set(workers.map((worker) => worker.workerTag)).size !== workers.length
  ) {
    throw new ConvexError("Each selected Cloudflare Worker must have one unique identity.");
  }
  const resolved = await resolveCloudflareRepositoryContext(ctx, args);
  const verifiedWorkers = await Promise.all(
    workers.map(async (worker) => {
      const identity = await readCloudflareWorkerIdentityByTag({
        token: resolved.connection.token,
        transport: resolved.connection.transport,
        accountId: resolved.account.accountId,
        workerTag: worker.workerTag,
      });
      if (!identity || identity.workerTag !== worker.workerTag) {
        throw new ConvexError(
          "The selected Cloudflare Worker changed. Discover Workers again before attaching.",
        );
      }
      const discovery = await readCloudflareWorkerRepositoryDiscoveryForIdentity({
        token: resolved.connection.token,
        transport: resolved.connection.transport,
        accountId: resolved.account.accountId,
        workerTag: identity.workerTag,
        expectedRepoId: resolved.context.githubRepositoryDatabaseId,
        defaultBranch: resolved.githubDefaultBranch,
      });
      if (discovery.state === "not_connected") {
        throw new ConvexError(
          `Cloudflare Worker ${identity.workerName} is not connected to a GitHub repository, so it cannot be attached. Connect it to this repository instead; that replaces what it serves.`,
        );
      }
      if (discovery.state === "connected_elsewhere") {
        throw new ConvexError(
          `Cloudflare Worker ${identity.workerName} builds another GitHub repository, so it cannot be attached to this one.`,
        );
      }
      if (discovery.state !== "ready") {
        throw new ConvexError(
          "The selected Cloudflare Worker changed. Discover Workers again before attaching.",
        );
      }
      if (discovery.builds.state === "available") {
        await readCloudflareWorkerConvexBuildAccess({
          token: resolved.connection.token,
          transport: resolved.connection.transport,
          accountId: resolved.account.accountId,
          workerTag: identity.workerTag,
        });
      }
      return {
        workerName: identity.workerName,
        workerTag: identity.workerTag,
        rootDirectory: discovery.rootDirectory,
      };
    }),
  );
  return await ctx.runMutation(internal.repository.cloudflareMutations.attachWorkers, {
    repositoryId: args.repositoryId,
    userId: args.userId,
    workers: verifiedWorkers.map((worker) => ({
      accountId: resolved.account.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
      rootDirectory: worker.rootDirectory,
      origin: "selected_existing" as const,
    })),
  });
}

async function createWorkerForManagedWorkflow(
  ctx: ActionCtx,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    accountId: string;
    workerName: string;
  },
): Promise<Id<"repositoryCloudflareWorkers">> {
  const validation = validateAppResourceName(args.workerName, "cloudflare");
  if (!validation.valid) {
    throw new Error(validation.message);
  }
  const accountId = args.accountId.trim();
  if (!accountId) {
    throw new Error("Cloudflare account is required.");
  }
  const checkpoint = await ctx.runQuery(
    internal.repository.cloudflareMutations.readManagedWorkerCreateCheckpoint,
    {
      repositoryId: args.repositoryId,
      runId: args.runId,
      userId: args.userId,
      accountId,
      workerName: validation.value,
    },
  );
  const context = await ctx.runQuery(
    internal.repository.providerObservationQueries
      .readProviderAttachmentRepositoryContextForProvisioningRun,
    {
      repositoryId: args.repositoryId,
      runId: args.runId,
      userId: args.userId,
    },
  );
  const connection = await resolveCloudflareConnectionForProvisioningRun(ctx, {
    repositoryId: args.repositoryId,
    runId: args.runId,
    userId: args.userId,
    organizationId: context.organizationId,
  });
  requireCloudflareAccountTarget(connection, accountId);
  const account = await resolveAccount({
    token: connection.token,
    transport: connection.transport,
    accountId,
  });
  await requireCloudflareBuildTokenUuid({
    token: connection.token,
    transport: connection.transport,
    accountId: account.accountId,
    buildTokenUuid: checkpoint.buildTokenUuid,
  });

  let worker: { workerName: string; workerTag: string };
  let workerCreated = false;
  if (checkpoint.state === "created") {
    const identity = await readCloudflareWorkerIdentity({
      token: connection.token,
      transport: connection.transport,
      accountId: account.accountId,
      workerName: validation.value,
    });
    if (!identity || identity.workerTag !== checkpoint.workerTag) {
      throw new Error("Managed Cloudflare Worker checkpoint is missing from Cloudflare.");
    }
    worker = identity;
  } else {
    const existing = await readCloudflareWorkerIdentity({
      token: connection.token,
      transport: connection.transport,
      accountId: account.accountId,
      workerName: validation.value,
    });
    if (existing) {
      if (checkpoint.state === "creating") {
        throw new Error(
          `Cloudflare Worker ${validation.value} exists after an interrupted create. Delete it in the Cloudflare dashboard, then retry.`,
        );
      }
      throw new Error(
        `Cloudflare Worker name ${validation.value} already exists. Choose another Worker name and try again.`,
      );
    }
    await ctx.runQuery(
      internal.billingResourceQuotas.requireBillingResourceCapacityForRepositoryProvisioning,
      {
        repositoryId: args.repositoryId,
        runId: args.runId,
        userId: args.userId,
      },
    );
    if (checkpoint.state === "planned") {
      await ctx.runMutation(internal.repository.cloudflareMutations.beginManagedWorkerCreate, {
        repositoryId: args.repositoryId,
        runId: args.runId,
        userId: args.userId,
        accountId: account.accountId,
        workerName: validation.value,
      });
    }
    try {
      worker = await createCloudflareWorker({
        token: connection.token,
        transport: connection.transport,
        accountId: account.accountId,
        workerName: validation.value,
      });
      workerCreated = true;
    } catch (error) {
      if (error instanceof AppResourceNameConflictError) {
        throw new Error(
          `Cloudflare Worker ${validation.value} exists after an interrupted create. Delete it in the Cloudflare dashboard, then retry.`,
        );
      }
      throw error;
    }
  }

  try {
    return await ctx.runMutation(
      internal.repository.cloudflareMutations.recordManagedWorkerCreated,
      {
        repositoryId: args.repositoryId,
        runId: args.runId,
        userId: args.userId,
        accountId: account.accountId,
        workerName: worker.workerName,
        workerTag: worker.workerTag,
      },
    );
  } catch (error) {
    if (
      !workerCreated ||
      !toErrorMessage(error).includes(ORGANIZATION_CONNECTION_LIMIT_ERROR_PREFIX)
    ) {
      throw error;
    }
    throw new Error(
      `${ORGANIZATION_CONNECTION_LIMIT_ERROR_PREFIX} after Worker ${validation.value} was created. Delete it in the Cloudflare dashboard, then retry.`,
    );
  }
}

function toCloudflareBuildConfig(rootDirectory: string): CloudflareBuildConfig {
  const config = buildRepositoryCloudflareBuildConfigForRootDirectory({ rootDirectory });
  return {
    rootDir: config.rootDirectory,
    buildCommand: config.buildCommand,
    deployCommand: config.deployCommand,
    previewDeployCommand: config.previewDeployCommand,
    pathIncludes: config.pathIncludes,
    pathExcludes: config.pathExcludes,
  };
}

function requireStoredWorkerBuildConfig(
  context: WorkerConfigurationContext,
  requestedRootDirectory: string,
): CloudflareBuildConfig {
  const requested = toCloudflareBuildConfig(requestedRootDirectory);
  const stored = toCloudflareBuildConfig(context.rootDirectory);
  if (requested.rootDir !== stored.rootDir) {
    throw new Error("Cloudflare Worker root changed before Workers Builds configuration.");
  }
  return stored;
}

async function prepareWorkersBuildsForGitHub(
  ctx: ActionCtx,
  args: {
    authority: RepositoryActionAuthority;
    rootDirectory: string;
  },
  context: WorkerConfigurationContext,
): Promise<{
  connection: CloudflareActionConnection;
  context: WorkerConfigurationContext;
  githubAccess: GitHubAppAccess;
  githubOwnerId: string;
  githubDefaultBranch: string;
  buildConfig: CloudflareBuildConfig;
}> {
  const [connection, githubAccess] = await Promise.all([
    resolveCloudflareConnectionForAuthority(ctx, args.authority, context.organizationId),
    resolveGitHubAppAccessForAuthority(ctx, args.authority),
  ]);
  requireCloudflareAccountTarget(connection, context.accountId);
  await resolveAccount({
    token: connection.token,
    transport: connection.transport,
    accountId: context.accountId,
  });
  const repository = await fetchGitHubRepoIdentity({
    octokit: githubAccess.octokit,
    owner: context.githubOwnerLogin,
    repo: context.githubRepositoryName,
    expectedRepoId: context.githubRepositoryDatabaseId,
  });
  return {
    connection,
    context,
    githubAccess,
    githubOwnerId: repository.ownerId,
    githubDefaultBranch: repository.defaultBranch,
    buildConfig: toCloudflareBuildConfig(args.rootDirectory),
  };
}

async function readInitialBuildCommitHash(args: {
  octokit: GitHubAppAccess["octokit"];
  owner: string;
  repo: string;
  expectedRepoId: string;
  expectedDefaultBranch: string;
}): Promise<string> {
  const repository = await fetchGitHubDefaultBranchHead({
    octokit: args.octokit,
    owner: args.owner,
    repo: args.repo,
    expectedRepoId: args.expectedRepoId,
  });
  if (repository.defaultBranch !== args.expectedDefaultBranch) {
    throw new Error("GitHub default branch changed while Samebase configured Workers Builds.");
  }
  return repository.commitSha;
}

async function configurePreparedWorkersBuildsForGitHub(
  args: {
    repositoryId: Id<"repositories">;
    buildTokenUuid: string;
    initialBuild: "deferred" | "requested";
    existingBuilds: "preserve_repository" | "require_unconnected" | "initialize_created_worker";
    beforeProviderWrite?: () => void | Promise<void>;
    afterBuildsConfigured?: () => void | Promise<void>;
  },
  prepared: Awaited<ReturnType<typeof prepareWorkersBuildsForGitHub>>,
): Promise<CloudflareConnectedWorkersBuilds> {
  const { connection, context } = prepared;
  const build = await configureCloudflareWorkerBuildsForGitHub({
    owner: context.githubOwnerLogin,
    repo: context.githubRepositoryName,
    githubRepositoryDatabaseId: context.githubRepositoryDatabaseId,
    ghRepoOwnerId: prepared.githubOwnerId,
    defaultBranch: prepared.githubDefaultBranch,
    initialBuild:
      args.initialBuild === "deferred"
        ? { state: "deferred" }
        : {
            state: "requested",
            readCommitHash: async () =>
              await readInitialBuildCommitHash({
                octokit: prepared.githubAccess.octokit,
                owner: context.githubOwnerLogin,
                repo: context.githubRepositoryName,
                expectedRepoId: context.githubRepositoryDatabaseId,
                expectedDefaultBranch: prepared.githubDefaultBranch,
              }),
          },
    repositoryId: args.repositoryId,
    workerName: context.workerName,
    workerTag: context.workerTag,
    existingBuilds: args.existingBuilds,
    cloudflareToken: connection.token,
    cloudflareAuthMethod: connection.auth.method,
    accountId: context.accountId,
    buildTokenUuid: args.buildTokenUuid,
    buildConfig: prepared.buildConfig,
    beforeProviderWrite: args.beforeProviderWrite,
    afterBuildsConfigured: args.afterBuildsConfigured,
  });
  return build;
}

async function configureResolvedWorkersBuildsForGitHub(
  args: {
    repositoryId: Id<"repositories">;
    rootDirectory: string;
    buildTokenUuid: string;
    initialBuild: "deferred" | "requested";
    existingBuilds: "preserve_repository" | "require_unconnected";
    beforeProviderWrite?: () => void | Promise<void>;
    afterBuildsConfigured?: () => void | Promise<void>;
  },
  resolved: Awaited<ReturnType<typeof resolveCloudflareRepositoryContext>>,
  worker: { workerName: string; workerTag: string },
): Promise<CloudflareConnectedWorkersBuilds> {
  return await configurePreparedWorkersBuildsForGitHub(
    {
      repositoryId: args.repositoryId,
      buildTokenUuid: args.buildTokenUuid,
      initialBuild: args.initialBuild,
      existingBuilds: args.existingBuilds,
      beforeProviderWrite: args.beforeProviderWrite,
      afterBuildsConfigured: args.afterBuildsConfigured,
    },
    {
      connection: resolved.connection,
      context: {
        ...resolved.context,
        accountId: resolved.account.accountId,
        workerName: worker.workerName,
        workerTag: worker.workerTag,
        rootDirectory: args.rootDirectory,
      },
      githubAccess: resolved.githubAccess,
      githubOwnerId: resolved.githubOwnerId,
      githubDefaultBranch: resolved.githubDefaultBranch,
      buildConfig: toCloudflareBuildConfig(args.rootDirectory),
    },
  );
}

async function prepareConvexDeployKeyRotation(
  ctx: ActionCtx,
  args: {
    authority: RepositoryActionAuthority;
    workerId: Id<"repositoryCloudflareWorkers">;
    convexProjectId: Id<"repositoryConvexProjects">;
  },
  buildPreparation: CloudflareWorkerBuildPreparation,
): Promise<{
  context: WorkerConvexProjectConfigurationContext;
  convexConnection: Awaited<ReturnType<typeof resolveConvexProvisioningConnection>>;
  deployment: NonNullable<Awaited<ReturnType<typeof readConvexProductionDeployment>>>;
  connection: CloudflareActionConnection;
  githubAccess: GitHubAppAccess;
  repository: Awaited<ReturnType<typeof fetchGitHubRepoIdentity>>;
  build: PreparedCloudflareWorkerBuilds;
  deployKeyNames: ReturnType<typeof buildWorkersBuildsConvexDeployKeyNames>;
}> {
  const { repositoryId } = args.authority;
  let context: WorkerConvexProjectConfigurationContext;
  switch (args.authority.kind) {
    case "user":
    case "manual_provider_write":
      context = await readWorkerConvexProjectConfigurationContext(ctx, {
        repositoryId,
        userId: args.authority.userId,
        workerId: args.workerId,
        convexProjectId: args.convexProjectId,
      });
      break;
    case "provisioning":
      context = await ctx.runQuery(
        internal.repository.cloudflareMutations.readManagedWorkerConvexProjectConfigurationContext,
        {
          repositoryId,
          runId: args.authority.runId,
          userId: args.authority.userId,
          workerId: args.workerId,
          convexProjectId: args.convexProjectId,
        },
      );
      break;
    default:
      args.authority satisfies never;
      throw new Error("Repository action authority is invalid.");
  }
  const project = context.convexProject;
  const [convexConnection, connection, githubAccess] = await Promise.all([
    resolveConvexConnectionForAuthority(ctx, args.authority, {
      organizationId: context.organizationId,
      teamId: project.teamId,
    }),
    resolveCloudflareConnectionForAuthority(ctx, args.authority, context.organizationId),
    resolveGitHubAppAccessForAuthority(ctx, args.authority),
  ]);
  if (convexConnection.convexTeamId !== project.teamId) {
    throw new Error("The attached Convex project does not match its saved connection.");
  }
  const deployment = await readConvexProductionDeployment({
    token: convexConnection.convexToken,
    projectId: project.projectId,
  });
  if (!deployment) {
    throw new ConvexError(
      "Deploy the Convex project to production first. Samebase installs its deploy key after the production deployment exists.",
    );
  }
  const repository = await fetchGitHubRepoIdentity({
    octokit: githubAccess.octokit,
    owner: context.githubOwnerLogin,
    repo: context.githubRepositoryName,
    expectedRepoId: context.githubRepositoryDatabaseId,
  });
  requireCloudflareAccountTarget(connection, context.accountId);
  await resolveAccount({
    token: connection.token,
    transport: connection.transport,
    accountId: context.accountId,
  });
  let build: PreparedCloudflareWorkerBuilds;
  if (buildPreparation.state === "discover") {
    const discovery = await readCloudflareWorkerRepositoryDiscoveryForIdentity({
      token: connection.token,
      transport: connection.transport,
      accountId: context.accountId,
      workerTag: context.workerTag,
      expectedRepoId: context.githubRepositoryDatabaseId,
      defaultBranch: repository.defaultBranch,
    });
    if (discovery.state === "ready" && discovery.builds.state === "legacy_previews") {
      throw new Error(WORKER_PREVIEWS_MIGRATION_REQUIRED_MESSAGE);
    }
    if (discovery.state !== "ready" || discovery.builds.state !== "available") {
      throw new ConvexError(
        "Configure this Worker's native GitHub Builds settings before rotating Convex deploy keys.",
      );
    }
    build = {
      rootDirectory: discovery.rootDirectory,
    };
  } else {
    build = buildPreparation.build;
  }

  return {
    context,
    convexConnection,
    deployment,
    connection,
    githubAccess,
    repository,
    build,
    deployKeyNames: buildWorkersBuildsConvexDeployKeyNames({
      repositoryId,
      workerId: args.workerId,
    }),
  };
}

async function rotatePreparedConvexDeployKeys(
  args: {
    repositoryId: Id<"repositories">;
    beforeProviderWrite?: () => void | Promise<void>;
  },
  prepared: Awaited<ReturnType<typeof prepareConvexDeployKeyRotation>>,
): Promise<void> {
  const {
    context,
    convexConnection,
    deployment,
    connection,
    githubAccess,
    repository,
    build,
    deployKeyNames,
  } = prepared;
  const project = context.convexProject;
  await Promise.all([
    (async () => {
      await args.beforeProviderWrite?.();
      await deleteConvexDeployKeyByName({
        convexToken: convexConnection.convexToken,
        deploymentName: deployment.name,
        name: deployKeyNames.production,
      });
    })(),
    (async () => {
      await args.beforeProviderWrite?.();
      await deleteConvexPreviewDeployKeyByName({
        convexToken: convexConnection.convexToken,
        projectId: project.projectId,
        name: deployKeyNames.preview,
      });
    })(),
  ]);
  await args.beforeProviderWrite?.();
  const production = await createConvexDeployKey({
    convexToken: convexConnection.convexToken,
    convexAuthMethod: convexConnection.convexAuth.method,
    deploymentName: deployment.name,
    name: deployKeyNames.production,
  });
  let preview: Awaited<ReturnType<typeof createConvexPreviewDeployKey>>;
  try {
    await args.beforeProviderWrite?.();
    preview = await createConvexPreviewDeployKey({
      convexToken: convexConnection.convexToken,
      projectId: project.projectId,
      name: deployKeyNames.preview,
    });
  } catch (error) {
    try {
      await args.beforeProviderWrite?.();
      await deleteConvexDeployKeyByName({
        convexToken: convexConnection.convexToken,
        deploymentName: deployment.name,
        name: deployKeyNames.production,
      });
    } catch {
      // Keep the original provider error when cleanup is no longer safe.
    }
    throw error;
  }

  try {
    await rotateConvexDeployKeysForCloudflareWorkerBuilds({
      defaultBranch: repository.defaultBranch,
      readInitialBuildCommitHash: async () =>
        await readInitialBuildCommitHash({
          octokit: githubAccess.octokit,
          owner: context.githubOwnerLogin,
          repo: context.githubRepositoryName,
          expectedRepoId: context.githubRepositoryDatabaseId,
          expectedDefaultBranch: repository.defaultBranch,
        }),
      expectedRepoId: context.githubRepositoryDatabaseId,
      githubRepositoryFullName: `${context.githubOwnerLogin}/${context.githubRepositoryName}`,
      rootDirectory: build.rootDirectory,
      repositoryId: args.repositoryId,
      workerName: context.workerName,
      workerTag: context.workerTag,
      cloudflareToken: connection.token,
      cloudflareAuthMethod: connection.auth.method,
      accountId: context.accountId,
      convex: {
        production: { deployKey: production.deployKey },
        preview: { deployKey: preview.deployKey },
      },
      convexProject: {
        teamId: project.teamId,
        projectId: project.projectId,
      },
      beforeProviderWrite: args.beforeProviderWrite,
    });
  } catch (error) {
    await Promise.allSettled([
      (async () => {
        await args.beforeProviderWrite?.();
        await deleteConvexDeployKeyByName({
          convexToken: convexConnection.convexToken,
          deploymentName: deployment.name,
          name: deployKeyNames.production,
        });
      })(),
      (async () => {
        await args.beforeProviderWrite?.();
        await deleteConvexPreviewDeployKeyByName({
          convexToken: convexConnection.convexToken,
          projectId: project.projectId,
          name: deployKeyNames.preview,
        });
      })(),
    ]);
    throw error;
  }
}

export async function rotateConvexDeployKeysForWorkersBuildsForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    workerId: Id<"repositoryCloudflareWorkers">;
    convexProjectId: Id<"repositoryConvexProjects">;
  },
): Promise<void> {
  const actionId = crypto.randomUUID();
  const claim = await ctx.runMutation(
    internal.repository.infrastructureOperation.claimManualProviderWrite,
    {
      repositoryId: args.repositoryId,
      userId: args.userId,
      actionId,
      action: "rotate_convex_deploy_keys_for_workers_builds",
    },
  );
  try {
    const prepared = await prepareConvexDeployKeyRotation(
      ctx,
      {
        authority: {
          kind: "manual_provider_write",
          userId: args.userId,
          repositoryId: args.repositoryId,
          actionId,
        },
        workerId: args.workerId,
        convexProjectId: args.convexProjectId,
      },
      { state: "discover" },
    );
    requireManualProviderActionDeadline(claim.deadlineAt);
    await rotatePreparedConvexDeployKeys(
      {
        repositoryId: args.repositoryId,
        beforeProviderWrite: () => {
          requireManualProviderActionDeadline(claim.deadlineAt);
        },
      },
      prepared,
    );
  } catch (error) {
    await attemptManualProviderWriteFailureRecord(ctx, {
      repositoryId: args.repositoryId,
      actionId,
    });
    throw error;
  }
  await ctx.runMutation(
    internal.repository.infrastructureOperation.finishManualProviderWriteResult,
    {
      repositoryId: args.repositoryId,
      actionId,
      result: "succeeded",
    },
  );
}

/**
The gated deploy-key repair that the dashboard and MCP call. The key installation after a Worker
connect or create runs rotateConvexDeployKeysForWorkersBuildsForUser directly: the connect
confirmation covers it, and create is not gated.
*/
export async function rotateConvexDeployKeysWithConfirmation(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    workerId: Id<"repositoryCloudflareWorkers">;
    convexProjectId: Id<"repositoryConvexProjects">;
    surface: ConfirmationSurface;
    confirmation: ActionConfirmation | undefined;
  },
): Promise<ActionConfirmationRequest | null> {
  const confirmation = await ctx.runMutation(internal.repository.confirmations.check, {
    userId: args.userId,
    surface: args.surface,
    request: {
      action: "rotate_convex_deploy_keys",
      repositoryId: args.repositoryId,
      workerId: args.workerId,
      convexProjectId: args.convexProjectId,
      convexProjectSlug: await readAttachedConvexProjectSlug(ctx, args),
    },
    confirmation: args.confirmation,
  });
  if (confirmation.state === "needs_confirmation") {
    return confirmation;
  }

  await rotateConvexDeployKeysForWorkersBuildsForUser(ctx, {
    userId: args.userId,
    repositoryId: args.repositoryId,
    workerId: args.workerId,
    convexProjectId: args.convexProjectId,
  });
  return null;
}

async function recordManualWorkersBuildsTokenUse(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    repositoryId: Id<"repositories">;
    actionId: string;
    buildTokenUuid: string;
  },
): Promise<void> {
  await ctx.runMutation(
    internal.repository.infrastructureOperation.recordManualWorkersBuildsTokenUse,
    {
      repositoryId: args.repositoryId,
      actionId: args.actionId,
      buildTokenUuid: args.buildTokenUuid,
    },
  );
}

export async function configureWorkersBuildsForGitHubForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    workerId: Id<"repositoryCloudflareWorkers">;
    rootDirectory: string;
    buildTokenUuid: string;
  },
): Promise<void> {
  const actionId = crypto.randomUUID();
  const claim = await ctx.runMutation(
    internal.repository.infrastructureOperation.claimManualProviderWrite,
    {
      repositoryId: args.repositoryId,
      userId: args.userId,
      actionId,
      action: "configure_workers_builds_for_github",
    },
  );
  try {
    const context = await readWorkerConfigurationContext(ctx, args);
    const buildConfig = requireStoredWorkerBuildConfig(context, args.rootDirectory);
    const prepared = await prepareWorkersBuildsForGitHub(
      ctx,
      {
        authority: {
          kind: "manual_provider_write",
          userId: args.userId,
          repositoryId: args.repositoryId,
          actionId,
        },
        rootDirectory: buildConfig.rootDir,
      },
      context,
    );
    requireManualProviderActionDeadline(claim.deadlineAt);
    await configurePreparedWorkersBuildsForGitHub(
      {
        repositoryId: args.repositoryId,
        buildTokenUuid: args.buildTokenUuid,
        initialBuild: "requested",
        existingBuilds: "preserve_repository",
        beforeProviderWrite: () => {
          requireManualProviderActionDeadline(claim.deadlineAt);
        },
        afterBuildsConfigured: async () => {
          await recordManualWorkersBuildsTokenUse(ctx, {
            repositoryId: args.repositoryId,
            actionId,
            buildTokenUuid: args.buildTokenUuid,
          });
        },
      },
      prepared,
    );
  } catch (error) {
    await attemptManualProviderWriteFailureRecord(ctx, {
      repositoryId: args.repositoryId,
      actionId,
    });
    throw error;
  }
  await ctx.runMutation(
    internal.repository.infrastructureOperation.finishManualProviderWriteResult,
    {
      repositoryId: args.repositoryId,
      actionId,
      result: "succeeded",
    },
  );
}

export async function discoverCloudflareWorkersForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
  },
): Promise<Infer<typeof cloudflareDiscoverWorkersContract.returns>> {
  const resolved = await resolveCloudflareRepositoryContext(ctx, args);
  const discovery = await discoverCloudflareWorkersForRepository({
    token: resolved.connection.token,
    transport: resolved.connection.transport,
    accountId: resolved.account.accountId,
    expectedRepoId: resolved.context.githubRepositoryDatabaseId,
    defaultBranch: resolved.githubDefaultBranch,
  });
  const recordedAttachments: CloudflareWorkerRecordedAttachment[] = await ctx.runQuery(
    internal.repository.providerObservationQueries.readCloudflareWorkerRecordedAttachments,
    {
      repositoryId: args.repositoryId,
      userId: args.userId,
      accountId: resolved.account.accountId,
      workers: discovery.workers.map((worker) => ({
        workerName: worker.workerName,
        workerTag: worker.workerTag,
      })),
    },
  );

  const recordedAttachmentByWorkerTag = new Map(
    recordedAttachments.map((worker) => [worker.workerTag, worker.attachment]),
  );
  return {
    inventoryState: discovery.inventoryState,
    workers: discovery.workers
      .map((worker) =>
        toCloudflareWorkerDiscovery(worker, recordedAttachmentByWorkerTag.get(worker.workerTag)),
      )
      .sort(
        (left, right) =>
          left.workerName.localeCompare(right.workerName) ||
          left.workerTag.localeCompare(right.workerTag),
      ),
  };
}

type ConvexDeployKeyTarget =
  | { state: "selected"; convexProjectId: Id<"repositoryConvexProjects"> }
  | { state: "none" };

/**
The one rule that chooses the Convex project whose deploy key a Worker gets: the chosen attached
project, else the repository's only attached project. Several projects without a choice fail before
any provider change and list the projects, so a Worker never builds with a guessed key. The
dashboard actions and the MCP Worker tools all call it.
*/
export async function selectConvexDeployKeyTarget(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    convexProjectId: Id<"repositoryConvexProjects"> | undefined;
  },
): Promise<ConvexDeployKeyTarget> {
  const context: RepositoryProviderObservationContext = await ctx.runQuery(
    internal.repository.providerObservationQueries.readRepositoryProviderObservationContext,
    { repositoryId: args.repositoryId, userId: args.userId },
  );
  const { convexProjects } = context;
  if (args.convexProjectId !== undefined) {
    const chosenProjectId = args.convexProjectId;
    if (!convexProjects.some((project) => project.convexProjectId === chosenProjectId)) {
      throw new ConvexError("The chosen Convex project is not attached to this repository.");
    }
    return { state: "selected", convexProjectId: chosenProjectId };
  }

  if (convexProjects.length === 0) {
    return { state: "none" };
  }
  if (!exactly(1, convexProjects)) {
    const projects = nameAttachedConvexProjects(
      convexProjects,
      await readRepositoryConvexTeamProjectNames(ctx, {
        userId: args.userId,
        repository: context,
      }),
    );
    throw new ConvexError(
      `${context.githubOwnerLogin}/${context.githubRepositoryName} has several attached Convex projects: ${formatAttachedConvexProjects(projects)}. Choose the project whose deploy key the Worker gets.`,
    );
  }
  return { state: "selected", convexProjectId: convexProjects[0].convexProjectId };
}

/**
The live slug of an attached Convex project for a confirmation sentence, so the sentence tells apart
projects at one code location. Null when Convex cannot be read.
*/
async function readAttachedConvexProjectSlug(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    convexProjectId: Id<"repositoryConvexProjects">;
  },
): Promise<string | null> {
  const context: RepositoryProviderObservationContext = await ctx.runQuery(
    internal.repository.providerObservationQueries.readRepositoryProviderObservationContext,
    { repositoryId: args.repositoryId, userId: args.userId },
  );
  const project = context.convexProjects.find(
    (candidate) => candidate.convexProjectId === args.convexProjectId,
  );
  if (!project) {
    return null;
  }
  const teamProjectNames = await readRepositoryConvexTeamProjectNames(ctx, {
    userId: args.userId,
    repository: context,
  });
  return teamProjectNames?.get(project.projectId)?.projectSlug ?? null;
}

/**
The deploy-key result of a new Worker before the dashboard or MCP projection. `error` is the raw
failure: the dashboard shows its text, and MCP passes it through publicMcpErrorMessage.
*/
export type ConvexDeployKeyOutcome =
  | { state: "installed"; convexProjectId: Id<"repositoryConvexProjects"> }
  | { state: "no_convex_project" }
  | { state: "failed"; convexProjectId: Id<"repositoryConvexProjects">; error: unknown };

function toDashboardConvexDeployKeyInstallation(
  outcome: ConvexDeployKeyOutcome,
): ConvexDeployKeyInstallation {
  return outcome.state === "failed"
    ? {
        state: "failed",
        convexProjectId: outcome.convexProjectId,
        message: `Samebase did not install the Convex deploy key, so no production build started: ${toErrorMessage(outcome.error)} Repair the Convex deploy keys for this Worker to install the key and start the build.`,
      }
    : outcome;
}

/**
Installs the Convex deploy key for a Worker whose Builds settings were just configured with a
deferred first build. The deploy-key step starts that production build. A failure leaves the Worker
attached and reports the reason instead of failing the Worker write that already happened.
*/
async function installConvexDeployKeyForNewWorker(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    workerId: Id<"repositoryCloudflareWorkers">;
    target: ConvexDeployKeyTarget;
  },
): Promise<ConvexDeployKeyOutcome> {
  if (args.target.state === "none") {
    return { state: "no_convex_project" };
  }

  const { convexProjectId } = args.target;
  try {
    await rotateConvexDeployKeysForWorkersBuildsForUser(ctx, {
      userId: args.userId,
      repositoryId: args.repositoryId,
      workerId: args.workerId,
      convexProjectId,
    });
    return { state: "installed", convexProjectId };
  } catch (error) {
    return { state: "failed", convexProjectId, error };
  }
}

/**
The next step after a Worker was attached but its Builds setup did not complete.

configure_builds = Builds is not connected to this repository at the requested root; the configure
repair writes it.

start_build = Builds is connected to this repository at the requested root, but Cloudflare reported
an error after setup, so no production build may be running.

review_in_cloudflare = Samebase could not verify the Builds settings, or they build another root or
another repository; only a change in Cloudflare fixes them.
*/
type ConnectWorkerNoticeNextStep = "configure_builds" | "start_build" | "review_in_cloudflare";

type ConnectWorkerBuildsNotice = {
  state: "added_with_notice";
  workerId: Id<"repositoryCloudflareWorkers">;
  message: string;
  error: unknown;
  nextStep: ConnectWorkerNoticeNextStep;
};

/**
`added_with_notice.message` is the dashboard notice and can hold raw provider text. MCP reads only
`error` through publicMcpErrorMessage and `nextStep`. `deployKeyPending` is true when a Convex
project was selected but its key was not installed.
*/
type ConnectWorkerOutcome =
  | {
      state: "ready";
      workerId: Id<"repositoryCloudflareWorkers">;
      convexDeployKey: ConvexDeployKeyOutcome;
    }
  | (ConnectWorkerBuildsNotice & { deployKeyPending: boolean });

/**
The gated Worker connection that the dashboard and MCP share. It resolves the deploy-key project and
reads whether Cloudflare still lets the Worker connect before each confirmation check, so a request
that cannot run fails before a challenge, and a second call that cannot run leaves its token unused.
The first call then returns the confirmation request and changes nothing.
*/
export async function connectWorkerForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    workerName: string;
    workerTag: string;
    rootDirectory: string;
    buildTokenUuid: string;
    convexProjectId: Id<"repositoryConvexProjects"> | undefined;
    surface: ConfirmationSurface;
    confirmation: ActionConfirmation | undefined;
  },
): Promise<ConnectWorkerOutcome | ActionConfirmationRequest> {
  const target = await selectConvexDeployKeyTarget(ctx, args);
  await readConnectableWorkerIdentity(
    await resolveCloudflareRepositoryContext(ctx, {
      userId: args.userId,
      repositoryId: args.repositoryId,
    }),
    {
      workerName: args.workerName.trim(),
      workerTag: args.workerTag.trim(),
      buildTokenUuid: args.buildTokenUuid,
    },
  );
  const confirmation = await ctx.runMutation(internal.repository.confirmations.check, {
    userId: args.userId,
    surface: args.surface,
    request: {
      action: "connect_cloudflare_worker",
      repositoryId: args.repositoryId,
      workerName: args.workerName.trim(),
      workerTag: args.workerTag.trim(),
      rootDirectory: normalizeRepositoryRootDirectory(args.rootDirectory),
      buildTokenUuid: args.buildTokenUuid,
      convexProjectId: target.state === "selected" ? target.convexProjectId : null,
      convexProjectSlug:
        target.state === "selected"
          ? await readAttachedConvexProjectSlug(ctx, {
              userId: args.userId,
              repositoryId: args.repositoryId,
              convexProjectId: target.convexProjectId,
            })
          : null,
    },
    confirmation: args.confirmation,
  });
  if (confirmation.state === "needs_confirmation") {
    return confirmation;
  }

  const connection = await connectWorkerBuildsForUser(ctx, {
    userId: args.userId,
    repositoryId: args.repositoryId,
    workerName: args.workerName,
    workerTag: args.workerTag,
    rootDirectory: args.rootDirectory,
    buildTokenUuid: args.buildTokenUuid,
    initialBuild: target.state === "selected" ? "deferred" : "requested",
  });
  if (connection.state === "added_with_notice") {
    return target.state === "selected"
      ? {
          ...connection,
          message: `${connection.message} Samebase did not install the Convex deploy key. Repair the Convex deploy keys for this Worker after its Builds settings are complete.`,
          deployKeyPending: true,
        }
      : { ...connection, deployKeyPending: false };
  }

  return {
    state: "ready",
    workerId: connection.workerId,
    convexDeployKey: await installConvexDeployKeyForNewWorker(ctx, {
      userId: args.userId,
      repositoryId: args.repositoryId,
      workerId: connection.workerId,
      target,
    }),
  };
}

/**
The connect preconditions that Cloudflare reads can check: the build token is in the account, the
Worker still has its tag, and it has no Workers Builds connection.
*/
async function readConnectableWorkerIdentity(
  resolved: Awaited<ReturnType<typeof resolveCloudflareRepositoryContext>>,
  args: { workerName: string; workerTag: string; buildTokenUuid: string },
) {
  await requireCloudflareBuildTokenUuid({
    token: resolved.connection.token,
    transport: resolved.connection.transport,
    accountId: resolved.account.accountId,
    buildTokenUuid: args.buildTokenUuid,
  });
  const identity = await readCloudflareWorkerIdentityByTag({
    token: resolved.connection.token,
    transport: resolved.connection.transport,
    accountId: resolved.account.accountId,
    workerTag: args.workerTag,
  });
  if (!identity || identity.workerTag !== args.workerTag) {
    throw new Error(`Cloudflare Worker ${args.workerName} changed after discovery.`);
  }
  const discovery = await readCloudflareWorkerRepositoryDiscoveryForIdentity({
    token: resolved.connection.token,
    transport: resolved.connection.transport,
    accountId: resolved.account.accountId,
    workerTag: identity.workerTag,
    expectedRepoId: resolved.context.githubRepositoryDatabaseId,
    defaultBranch: resolved.githubDefaultBranch,
  });
  if (discovery.state !== "not_connected") {
    throw new ConvexError(
      `Cloudflare Worker ${args.workerName} already has a Workers Builds connection, so it cannot be connected. Find Workers again to see its status.`,
    );
  }
  return identity;
}

async function connectWorkerBuildsForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    workerName: string;
    workerTag: string;
    rootDirectory: string;
    buildTokenUuid: string;
    initialBuild: "deferred" | "requested";
  },
): Promise<
  { state: "ready"; workerId: Id<"repositoryCloudflareWorkers"> } | ConnectWorkerBuildsNotice
> {
  const workerName = args.workerName.trim();
  const workerTag = args.workerTag.trim();
  if (!workerName || !workerTag) {
    throw new Error("Cloudflare Worker identity is required.");
  }
  const buildConfig = toCloudflareBuildConfig(args.rootDirectory);
  const actionId = crypto.randomUUID();
  const claim = await ctx.runMutation(
    internal.repository.infrastructureOperation.claimManualProviderWrite,
    {
      repositoryId: args.repositoryId,
      userId: args.userId,
      actionId,
      action: "connect_cloudflare_worker",
    },
  );
  let resolved: Awaited<ReturnType<typeof resolveCloudflareRepositoryContext>>;
  let identity: NonNullable<Awaited<ReturnType<typeof readCloudflareWorkerIdentityByTag>>>;
  let workerId: Id<"repositoryCloudflareWorkers">;
  try {
    resolved = await resolveCloudflareRepositoryContext(ctx, {
      userId: args.userId,
      repositoryId: args.repositoryId,
      actionId,
    });
    identity = await readConnectableWorkerIdentity(resolved, {
      workerName,
      workerTag,
      buildTokenUuid: args.buildTokenUuid,
    });
    workerId = await ctx.runMutation(
      internal.repository.cloudflareMutations.recordManualConnectedWorker,
      {
        repositoryId: args.repositoryId,
        userId: args.userId,
        actionId,
        accountId: resolved.account.accountId,
        workerName: identity.workerName,
        workerTag: identity.workerTag,
        rootDirectory: buildConfig.rootDir,
      },
    );
  } catch (error) {
    await attemptManualProviderWriteFailureRecord(ctx, {
      repositoryId: args.repositoryId,
      actionId,
    });
    throw error;
  }

  let didConfigureBuilds = false;
  const providerWrite = { started: false };
  try {
    requireManualProviderActionDeadline(claim.deadlineAt);
    await configureResolvedWorkersBuildsForGitHub(
      {
        repositoryId: args.repositoryId,
        rootDirectory: buildConfig.rootDir,
        buildTokenUuid: args.buildTokenUuid,
        initialBuild: args.initialBuild,
        existingBuilds: "require_unconnected",
        beforeProviderWrite: () => {
          requireManualProviderActionDeadline(claim.deadlineAt);
          providerWrite.started = true;
        },
        afterBuildsConfigured: async () => {
          await recordManualWorkersBuildsTokenUse(ctx, {
            repositoryId: args.repositoryId,
            actionId,
            buildTokenUuid: args.buildTokenUuid,
          });
        },
      },
      resolved,
      identity,
    );
    didConfigureBuilds = true;
    const configured = await readCloudflareWorkerRepositoryDiscoveryForIdentity({
      token: resolved.connection.token,
      transport: resolved.connection.transport,
      accountId: resolved.account.accountId,
      workerTag: identity.workerTag,
      expectedRepoId: resolved.context.githubRepositoryDatabaseId,
      defaultBranch: resolved.githubDefaultBranch,
    });
    if (configured.state !== "ready" || configured.rootDirectory !== buildConfig.rootDir) {
      throw new Error("Cloudflare did not report the configured repository root.");
    }
  } catch (error) {
    if (!providerWrite.started) {
      await attemptManualProviderWriteFailureRecord(ctx, {
        repositoryId: args.repositoryId,
        actionId,
      });
      throw error;
    }
    let observed: Awaited<ReturnType<typeof readCloudflareWorkerRepositoryDiscoveryForIdentity>>;
    try {
      observed = await readCloudflareWorkerRepositoryDiscoveryForIdentity({
        token: resolved.connection.token,
        transport: resolved.connection.transport,
        accountId: resolved.account.accountId,
        workerTag: identity.workerTag,
        expectedRepoId: resolved.context.githubRepositoryDatabaseId,
        defaultBranch: resolved.githubDefaultBranch,
      });
    } catch (observationError) {
      await attemptManualProviderWriteFailureRecord(ctx, {
        repositoryId: args.repositoryId,
        actionId,
      });
      return {
        state: "added_with_notice",
        workerId,
        message: `Cloudflare Worker ${workerName} was added, but Samebase could not verify its GitHub Builds state. Refresh the repository after checking the Worker in Cloudflare. Setup error: ${toErrorMessage(error)} Verification error: ${toErrorMessage(observationError)}`,
        error,
        nextStep: "review_in_cloudflare",
      };
    }
    if (
      observed.state === "ready" &&
      observed.rootDirectory === buildConfig.rootDir &&
      observed.builds.state === "available"
    ) {
      if (didConfigureBuilds) {
        await ctx.runMutation(
          internal.repository.infrastructureOperation.finishManualProviderWriteResult,
          {
            repositoryId: args.repositoryId,
            actionId,
            result: "succeeded",
          },
        );
        return { state: "ready", workerId };
      }
      await ctx.runMutation(
        internal.repository.infrastructureOperation.finishManualProviderWriteResult,
        {
          repositoryId: args.repositoryId,
          actionId,
          result: "failed",
        },
      );
      return {
        state: "added_with_notice",
        workerId,
        message: `Cloudflare Worker ${workerName} was added and GitHub Builds is connected, but Cloudflare reported an error after setup. Start a build from Cloudflare if one is not running. Reason: ${toErrorMessage(error)}`,
        error,
        nextStep: "start_build",
      };
    }
    await attemptManualProviderWriteFailureRecord(ctx, {
      repositoryId: args.repositoryId,
      actionId,
    });
    if (observed.state === "ready") {
      const rootMessage =
        observed.rootDirectory === buildConfig.rootDir
          ? `at ${observed.rootDirectory}, but its Builds setup is incomplete. Use Configure Workers Builds on the Worker.`
          : `at ${observed.rootDirectory}, not the requested root ${buildConfig.rootDir}. Review its Builds settings in Cloudflare.`;
      return {
        state: "added_with_notice",
        workerId,
        message: `Cloudflare Worker ${workerName} was added ${rootMessage} Reason: ${toErrorMessage(error)}`,
        error,
        nextStep:
          observed.rootDirectory === buildConfig.rootDir
            ? "configure_builds"
            : "review_in_cloudflare",
      };
    }
    const nextActionMessage =
      observed.state === "not_connected"
        ? "Use Configure Workers Builds under Needs attention."
        : "Review the Worker in Cloudflare, then refresh the repository.";
    return {
      state: "added_with_notice",
      workerId,
      message: `Cloudflare Worker ${workerName} was added, but GitHub Builds setup did not complete. ${nextActionMessage} Reason: ${toErrorMessage(error)}`,
      error,
      nextStep: observed.state === "not_connected" ? "configure_builds" : "review_in_cloudflare",
    };
  }
  await ctx.runMutation(
    internal.repository.infrastructureOperation.finishManualProviderWriteResult,
    {
      repositoryId: args.repositoryId,
      actionId,
      result: "succeeded",
    },
  );
  return { state: "ready", workerId };
}

export async function createWorkerForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    workerName: string;
    rootDirectory: string;
    buildTokenUuid: string;
    convexProjectId: Id<"repositoryConvexProjects"> | undefined;
  },
): Promise<{
  workerId: Id<"repositoryCloudflareWorkers">;
  convexDeployKey: ConvexDeployKeyOutcome;
}> {
  const workerName = validateAppResourceName(args.workerName, "cloudflare");
  if (!workerName.valid) {
    throw new ConvexError(workerName.message);
  }
  const target = await selectConvexDeployKeyTarget(ctx, args);
  const workerId = await createWorkerBuildsForUser(ctx, {
    userId: args.userId,
    repositoryId: args.repositoryId,
    workerName: workerName.value,
    rootDirectory: args.rootDirectory,
    buildTokenUuid: args.buildTokenUuid,
    initialBuild: target.state === "selected" ? "deferred" : "requested",
  });
  return {
    workerId,
    convexDeployKey: await installConvexDeployKeyForNewWorker(ctx, {
      userId: args.userId,
      repositoryId: args.repositoryId,
      workerId,
      target,
    }),
  };
}

/** `workerName` is already validated. */
async function createWorkerBuildsForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    workerName: string;
    rootDirectory: string;
    buildTokenUuid: string;
    initialBuild: "deferred" | "requested";
  },
): Promise<Id<"repositoryCloudflareWorkers">> {
  const buildConfig = toCloudflareBuildConfig(args.rootDirectory);
  const actionId = crypto.randomUUID();
  const claim = await ctx.runMutation(
    internal.repository.infrastructureOperation.claimManualProviderWrite,
    {
      repositoryId: args.repositoryId,
      userId: args.userId,
      actionId,
      action: "create_cloudflare_worker",
    },
  );
  const providerCreate = { started: false };
  let workerRecorded = false;
  try {
    const resolved = await resolveCloudflareRepositoryContext(ctx, {
      userId: args.userId,
      repositoryId: args.repositoryId,
      actionId,
    });
    await requireCloudflareBuildTokenUuid({
      token: resolved.connection.token,
      transport: resolved.connection.transport,
      accountId: resolved.account.accountId,
      buildTokenUuid: args.buildTokenUuid,
    });
    const existing = await readCloudflareWorkerIdentity({
      token: resolved.connection.token,
      transport: resolved.connection.transport,
      accountId: resolved.account.accountId,
      workerName: args.workerName,
    });
    if (existing) {
      throw new AppResourceNameConflictError({
        provider: "cloudflare",
        name: args.workerName,
      });
    }
    await ctx.runQuery(
      internal.billingResourceQuotas.requireBillingResourceCapacityForProviderCreate,
      {
        userId: args.userId,
        organizationId: resolved.context.organizationId,
      },
    );
    requireManualProviderActionDeadline(claim.deadlineAt);
    const worker = await createCloudflareWorker({
      token: resolved.connection.token,
      transport: resolved.connection.transport,
      accountId: resolved.account.accountId,
      workerName: args.workerName,
      beforeProviderWrite: () => {
        requireManualProviderActionDeadline(claim.deadlineAt);
        providerCreate.started = true;
      },
    });
    const workerId = await ctx.runMutation(
      internal.repository.cloudflareMutations.recordManualWorkerCreated,
      {
        repositoryId: args.repositoryId,
        userId: args.userId,
        actionId,
        accountId: resolved.account.accountId,
        workerName: args.workerName,
        workerTag: worker.workerTag,
        rootDirectory: buildConfig.rootDir,
      },
    );
    workerRecorded = true;
    requireManualProviderActionDeadline(claim.deadlineAt);
    await configureResolvedWorkersBuildsForGitHub(
      {
        repositoryId: args.repositoryId,
        rootDirectory: buildConfig.rootDir,
        buildTokenUuid: args.buildTokenUuid,
        initialBuild: args.initialBuild,
        existingBuilds: "require_unconnected",
        beforeProviderWrite: () => requireManualProviderActionDeadline(claim.deadlineAt),
        afterBuildsConfigured: async () => {
          await recordManualWorkersBuildsTokenUse(ctx, {
            repositoryId: args.repositoryId,
            actionId,
            buildTokenUuid: args.buildTokenUuid,
          });
        },
      },
      resolved,
      worker,
    );
    await ctx.runMutation(
      internal.repository.infrastructureOperation.finishManualProviderWriteResult,
      {
        repositoryId: args.repositoryId,
        actionId,
        result: "succeeded",
      },
    );
    return workerId;
  } catch (error) {
    const reportedError =
      error instanceof AppResourceNameConflictError
        ? new ConvexError(error.message)
        : providerCreate.started && !workerRecorded
          ? new ConvexError(
              `The Cloudflare Worker ${args.workerName} can exist, but Samebase could not record it. If it exists, delete it in the Cloudflare dashboard, then retry.`,
            )
          : error;
    await attemptManualProviderWriteFailureRecord(ctx, {
      repositoryId: args.repositoryId,
      actionId,
    });
    throw reportedError;
  }
}

export const findWorkers = action({
  access: cloudflareDiscoverWorkersContract.access,
  args: cloudflareDiscoverWorkersContract.args,
  returns: cloudflareDiscoverWorkersContract.returns,
  mcp: cloudflareDiscoverWorkersContract.mcp,
  handler: async (ctx, args) =>
    await discoverCloudflareWorkersForUser(ctx, { ...args, userId: ctx.viewer.userId }),
});

export const attachWorkers = action({
  access: cloudflareAttachWorkersContract.access,
  args: cloudflareAttachWorkersContract.args,
  returns: cloudflareAttachWorkersContract.returns,
  mcp: cloudflareAttachWorkersContract.mcp,
  handler: async (ctx, args): Promise<Array<Id<"repositoryCloudflareWorkers">>> =>
    await attachExistingCloudflareWorkersForUser(ctx, {
      ...args,
      userId: ctx.viewer.userId,
    }),
});

export const connectWorker = action({
  access: cloudflareConnectWorkerContract.access,
  args: cloudflareConnectWorkerContract.args,
  returns: cloudflareConnectWorkerContract.returns,
  mcp: cloudflareConnectWorkerContract.mcp,
  handler: async (ctx, args): Promise<CloudflareConnectWorkerResult> => {
    const result = await connectWorkerForUser(ctx, {
      userId: ctx.viewer.userId,
      repositoryId: args.repositoryId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      rootDirectory: args.rootDirectory,
      buildTokenUuid: args.buildTokenUuid,
      convexProjectId: args.convexProjectId,
      surface: { kind: "dashboard" },
      confirmation: args.confirmation,
    });
    switch (result.state) {
      case "needs_confirmation":
        return result;
      case "ready":
        return {
          state: "ready",
          workerId: result.workerId,
          convexDeployKey: toDashboardConvexDeployKeyInstallation(result.convexDeployKey),
        };
      case "added_with_notice":
        return { state: "added_with_notice", workerId: result.workerId, message: result.message };
      default:
        result satisfies never;
        throw new Error("Unsupported Worker connection result.");
    }
  },
});

export const createWorker = action({
  access: cloudflareCreateWorkerContract.access,
  args: cloudflareCreateWorkerContract.args,
  returns: cloudflareCreateWorkerContract.returns,
  mcp: cloudflareCreateWorkerContract.mcp,
  handler: async (ctx, args): Promise<CloudflareCreateWorkerResult> => {
    const result = await createWorkerForUser(ctx, {
      userId: ctx.viewer.userId,
      repositoryId: args.repositoryId,
      workerName: args.workerName,
      rootDirectory: args.rootDirectory,
      buildTokenUuid: args.buildTokenUuid,
      convexProjectId: args.convexProjectId,
    });
    return {
      workerId: result.workerId,
      convexDeployKey: toDashboardConvexDeployKeyInstallation(result.convexDeployKey),
    };
  },
});

export const updateWorkerName = action({
  access: "access_dashboard",
  args: {
    repositoryId: id("repositories"),
    workerId: id("repositoryCloudflareWorkers"),
    expectedWorkerName: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await readWorkerConfigurationContext(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
      workerId: args.workerId,
    });
    const connection = await resolveCloudflareConnection(ctx, {
      userId: ctx.viewer.userId,
      organizationId: context.organizationId,
    });
    requireCloudflareAccountTarget(connection, context.accountId);
    const identity = await readCloudflareWorkerIdentityByTag({
      token: connection.token,
      transport: connection.transport,
      accountId: context.accountId,
      workerTag: context.workerTag,
    });
    if (!identity || identity.workerTag !== context.workerTag) {
      throw new Error("Cloudflare Worker is no longer available.");
    }
    if (identity.workerName !== args.expectedWorkerName) {
      throw new Error("Cloudflare Worker name changed before the update was approved.");
    }
    await ctx.runMutation(internal.repository.cloudflareMutations.updateWorkerName, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
      workerId: args.workerId,
      accountId: context.accountId,
      workerTag: context.workerTag,
      expectedStoredWorkerName: context.workerName,
      workerName: identity.workerName,
    });
    return null;
  },
});

export const updateWorkerRootDirectory = action({
  access: "access_dashboard",
  args: {
    repositoryId: id("repositories"),
    workerId: id("repositoryCloudflareWorkers"),
    expectedRootDirectory: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await readWorkerConfigurationContext(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
      workerId: args.workerId,
    });
    const resolved = await resolveCloudflareRepositoryContext(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    const repository = await readCloudflareWorkerRepositoryDiscoveryForIdentity({
      token: resolved.connection.token,
      transport: resolved.connection.transport,
      accountId: context.accountId,
      workerTag: context.workerTag,
      expectedRepoId: resolved.context.githubRepositoryDatabaseId,
      defaultBranch: resolved.githubDefaultBranch,
    });
    if (repository.state !== "ready") {
      throw new Error("Cloudflare Worker does not have one verified root for this repository.");
    }
    const expectedRootDirectory = toCloudflareBuildConfig(args.expectedRootDirectory).rootDir;
    if (repository.rootDirectory !== expectedRootDirectory) {
      throw new Error("Cloudflare Worker root changed before the update was approved.");
    }
    await ctx.runMutation(internal.repository.cloudflareMutations.updateWorkerRootDirectory, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
      workerId: args.workerId,
      accountId: context.accountId,
      workerTag: context.workerTag,
      expectedStoredRootDirectory: context.rootDirectory,
      rootDirectory: repository.rootDirectory,
    });
    return null;
  },
});

export const configureBuilds = action({
  access: cloudflareConfigureWorkersBuildsForGitHubContract.access,
  args: cloudflareConfigureWorkersBuildsForGitHubContract.args,
  returns: cloudflareConfigureWorkersBuildsForGitHubContract.returns,
  mcp: cloudflareConfigureWorkersBuildsForGitHubContract.mcp,
  handler: async (ctx, args): Promise<null> => {
    await configureWorkersBuildsForGitHubForUser(ctx, { ...args, userId: ctx.viewer.userId });
    return null;
  },
});

export const rotateConvexDeployKeys = action({
  access: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.access,
  args: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.args,
  returns: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.returns,
  mcp: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcp,
  handler: async (ctx, args): Promise<ActionConfirmationRequest | null> =>
    await rotateConvexDeployKeysWithConfirmation(ctx, {
      userId: ctx.viewer.userId,
      repositoryId: args.repositoryId,
      workerId: args.workerId,
      convexProjectId: args.convexProjectId,
      surface: { kind: "dashboard" },
      confirmation: args.confirmation,
    }),
});

/** Used only by the explicit create-app workflow. Manual attachment actions run directly. */
export const ensureCloudflareWorkerConnection = internalAction({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    accountId: string(),
    workerName: string(),
  },
  returns: id("repositoryCloudflareWorkers"),
  handler: async (
    ctx,
    { repositoryId, runId, userId, accountId, workerName },
  ): Promise<Id<"repositoryCloudflareWorkers">> => {
    return await createWorkerForManagedWorkflow(ctx, {
      repositoryId,
      runId,
      userId,
      accountId,
      workerName,
    });
  },
});

export const configureWorkersBuildsForGitHubForWorkflow = internalAction({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    workerId: id("repositoryCloudflareWorkers"),
  },
  returns: vPreparedCloudflareWorkerBuilds,
  handler: async (
    ctx,
    { repositoryId, runId, userId, workerId },
  ): Promise<PreparedCloudflareWorkerBuilds> => {
    const context = await ctx.runQuery(
      internal.repository.cloudflareMutations.readManagedWorkerConfigurationContext,
      { repositoryId, runId, userId, workerId },
    );
    await ctx.runMutation(
      internal.repositoryWorkflowAuthority.assertRepositoryProviderWorkflowContinuation,
      {
        authority: { kind: "provisioning", repositoryId, runId, userId },
      },
    );
    const prepared = await prepareWorkersBuildsForGitHub(
      ctx,
      {
        authority: { kind: "provisioning", repositoryId, runId, userId },
        rootDirectory: context.rootDirectory,
      },
      context,
    );
    const build = await configurePreparedWorkersBuildsForGitHub(
      {
        repositoryId,
        buildTokenUuid: context.buildTokenUuid,
        initialBuild: "deferred",
        existingBuilds: "initialize_created_worker",
      },
      prepared,
    );
    await ctx.runMutation(internal.repository.infrastructureOperation.recordManagedProviderWrites, {
      repositoryId,
      runId,
      providers: ["cloudflare"],
      lastUsedBuildTokenUuid: context.buildTokenUuid,
    });
    return {
      rootDirectory: build.rootDirectory,
    };
  },
});

export const rotateConvexDeployKeysForWorkersBuildsForWorkflow = internalAction({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    workerId: id("repositoryCloudflareWorkers"),
    convexProjectId: id("repositoryConvexProjects"),
    build: vPreparedCloudflareWorkerBuilds,
  },
  returns: v.null(),
  handler: async (
    ctx,
    { repositoryId, runId, userId, workerId, convexProjectId, build },
  ): Promise<null> => {
    const context = await ctx.runQuery(
      internal.repository.cloudflareMutations.readManagedWorkerConvexProjectConfigurationContext,
      { repositoryId, runId, userId, workerId, convexProjectId },
    );
    if (build.rootDirectory !== context.rootDirectory) {
      throw new Error("Managed Cloudflare Builds root changed before deploy-key rotation.");
    }
    await ctx.runMutation(
      internal.repositoryWorkflowAuthority.assertRepositoryProviderWorkflowContinuation,
      {
        authority: { kind: "provisioning", repositoryId, runId, userId },
      },
    );
    const args = {
      authority: { kind: "provisioning" as const, repositoryId, runId, userId },
      workerId,
      convexProjectId,
    };
    const prepared = await prepareConvexDeployKeyRotation(ctx, args, {
      state: "prepared",
      build,
    });
    await rotatePreparedConvexDeployKeys({ repositoryId }, prepared);
    await ctx.runMutation(internal.repository.infrastructureOperation.recordManagedProviderWrites, {
      repositoryId,
      runId,
      providers: ["convex", "cloudflare"],
    });
    return null;
  },
});
