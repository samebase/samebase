"use node";

import { Infer, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { listCloudflareAccountsForToken } from "../cloudflareAccountDiscovery";
import {
  resolveCloudflareApiTransport,
  type CloudflareApiTransport,
} from "../cloudflareApi/client";
import {
  createCloudflareWorker,
  discoverCloudflareWorkersForRepository,
  readCloudflareWorkerIdentity,
  readCloudflareWorkerConvexBuildAccess,
  readCloudflareWorkerRepositoryDiscoveryForIdentity,
  configureCloudflareWorkerBuildsForGitHub,
  rotateConvexDeployKeysForCloudflareWorkerBuilds,
  type CloudflareBuildConfig,
  type CloudflareConnectedWorkersBuilds,
} from "../cloudflareResources";
import { fetchGitHubDefaultBranchHead, fetchGitHubRepoIdentity } from "../githubRepoApi";
import {
  createConvexDeployKey,
  createConvexPreviewDeployKey,
  deleteConvexDeployKeyByName,
  deleteConvexPreviewDeployKeyByName,
  resolveConvexProvisioningConnection,
} from "../infraProvisioning";
import { action } from "../functions";
import { toErrorMessage } from "../jsonUtils";
import type { McpTokenHealth } from "../mcpTokenHealth";
import { validateAppResourceName } from "../../shared/appResourceNames";
import { buildVaultCloudflareBuildConfigForRootDirectory } from "./model";
import { buildWorkersBuildsConvexDeployKeyNames } from "./workersBuildsConvexDeployKeyNames";
import type {
  WorkerConfigurationContext,
  WorkerConvexProjectConfigurationContext,
} from "./cloudflareMutations";
import { readConvexProductionDeployment } from "./convexProjectResources";
import {
  cloudflareListAccountsContract,
  vCloudflareAccountResult,
} from "./contracts/cloudflareListAccounts";
import {
  cloudflareAttachWorkersContract,
  cloudflareConnectWorkerContract,
  cloudflareCreateWorkerContract,
  cloudflareDetachWorkerContract,
  cloudflareDiscoverWorkersContract,
} from "./contracts/cloudflareAttachments";
import { cloudflareConfigureWorkersBuildsForGitHubContract } from "./contracts/cloudflareConfigureWorkersBuildsForGitHub";
import { cloudflareRotateConvexDeployKeysForWorkersBuildsContract } from "./contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds";
import {
  attemptManualProviderWriteFailureRecord,
  requireManualProviderActionDeadline,
} from "./infrastructureOperation";

const { id, null: nullValue, object, string } = v;

type CloudflareAccountResult = Infer<typeof vCloudflareAccountResult>;
type CloudflareConnectWorkerResult = Infer<typeof cloudflareConnectWorkerContract.returns>;
type CloudflareActionConnection = {
  auth:
    | { method: "api_key"; credential: string }
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
  defaultAccount:
    | { state: "not_selected" }
    | { state: "selected"; accountId: string; accountName: string };
  tokenHealth?: McpTokenHealth;
};

const vPreparedCloudflareWorkerBuilds = object({
  rootDirectory: string(),
  production: object({ triggerUuid: string() }),
  preview: object({ triggerUuid: string() }),
});
type PreparedCloudflareWorkerBuilds = Infer<typeof vPreparedCloudflareWorkerBuilds>;
type CloudflareWorkerBuildPreparation =
  | { state: "discover" }
  | { state: "prepared"; build: PreparedCloudflareWorkerBuilds };

type ProviderAttachmentVaultContext = {
  ghRepoId: string;
  owner: string;
  name: string;
  defaultBranch: string;
};

async function resolveCloudflareConnection(
  ctx: Pick<ActionCtx, "runAction">,
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
    defaultAccount: connection.defaultAccount,
    ...(connection.tokenHealth ? { tokenHealth: connection.tokenHealth } : {}),
  };
}

async function resolveGitHubAccessToken(
  ctx: Pick<ActionCtx, "runQuery">,
  userId: Id<"users">,
): Promise<string> {
  const connection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
    userId,
    kind: "github",
  });
  const token = connection?.kind === "github" ? connection.auth.credential.trim() : "";
  if (!token) {
    throw new Error("GitHub connection is required.");
  }
  return token;
}

async function listAccountsForConnection(args: {
  token: string;
  transport: CloudflareApiTransport;
}): Promise<CloudflareAccountResult[]> {
  return await listCloudflareAccountsForToken({ ...args, perPage: 100 });
}

async function resolveAccount(args: {
  token: string;
  transport: CloudflareApiTransport;
  accountId: string;
}): Promise<CloudflareAccountResult> {
  const account = (await listAccountsForConnection(args)).find(
    (candidate) => candidate.accountId === args.accountId,
  );
  if (!account) {
    throw new Error(
      `The current Cloudflare credential cannot access Cloudflare account ${args.accountId}. Reconnect Cloudflare with access to this account, then retry.`,
    );
  }
  return account;
}

async function rememberDefaultAccount(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    userId: Id<"users">;
    connection: CloudflareActionConnection;
    account: CloudflareAccountResult;
  },
): Promise<void> {
  await ctx.runMutation(internal.providerConnections.upsertCloudflare, {
    userId: args.userId,
    auth: args.connection.auth,
    defaultAccount: {
      state: "selected",
      accountId: args.account.accountId,
      accountName: args.account.accountName,
    },
    ...(args.connection.tokenHealth ? { tokenHealth: args.connection.tokenHealth } : {}),
  });
}

async function readProviderAttachmentVaultContext(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { vaultId: Id<"vaults">; userId: Id<"users"> },
): Promise<ProviderAttachmentVaultContext> {
  return await ctx.runQuery(
    internal.vault.providerObservationQueries.readProviderAttachmentVaultContext,
    args,
  );
}

async function readWorkerConfigurationContext(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    workerId: Id<"vaultCloudflareWorkers">;
  },
) {
  return await ctx.runQuery(internal.vault.cloudflareMutations.readWorkerConfigurationContext, {
    vaultId: args.vaultId,
    userId: args.userId,
    workerId: args.workerId,
  });
}

async function readWorkerConvexProjectConfigurationContext(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    workerId: Id<"vaultCloudflareWorkers">;
    convexProjectId: Id<"vaultConvexProjects">;
  },
): Promise<WorkerConvexProjectConfigurationContext> {
  return await ctx.runQuery(
    internal.vault.cloudflareMutations.readWorkerConvexProjectConfigurationContext,
    args,
  );
}

async function resolveCloudflareRepositoryContext(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    accountId: string;
  },
): Promise<{
  account: CloudflareAccountResult;
  connection: CloudflareActionConnection;
  context: ProviderAttachmentVaultContext;
  githubAccessToken: string;
  githubOwnerId: string;
  githubDefaultBranch: string;
}> {
  const accountId = args.accountId.trim();
  if (!accountId) {
    throw new Error("Cloudflare account is required.");
  }
  const [context, connection, githubAccessToken] = await Promise.all([
    readProviderAttachmentVaultContext(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
    }),
    resolveCloudflareConnection(ctx, args.userId),
    resolveGitHubAccessToken(ctx, args.userId),
  ]);
  const account = await resolveAccount({
    token: connection.token,
    transport: connection.transport,
    accountId,
  });
  const repository = await fetchGitHubRepoIdentity({
    githubAccessToken,
    owner: context.owner,
    repo: context.name,
    expectedRepoId: context.ghRepoId,
  });
  return {
    account,
    connection,
    context,
    githubAccessToken,
    githubOwnerId: repository.ownerId,
    githubDefaultBranch: repository.defaultBranch,
  };
}

export async function attachExistingCloudflareWorkersForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    accountId: string;
    workers: Array<{ workerName: string; workerTag: string }>;
  },
): Promise<Array<Id<"vaultCloudflareWorkers">>> {
  if (args.workers.length === 0) {
    throw new Error("Select at least one Cloudflare Worker.");
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
    throw new Error("Each selected Cloudflare Worker must have one unique identity.");
  }
  const resolved = await resolveCloudflareRepositoryContext(ctx, args);
  await Promise.all(
    workers.map(async (worker) => {
      const identity = await readCloudflareWorkerIdentity({
        token: resolved.connection.token,
        transport: resolved.connection.transport,
        accountId: resolved.account.accountId,
        workerName: worker.workerName,
      });
      if (!identity || identity.workerTag !== worker.workerTag) {
        throw new Error(`Cloudflare Worker ${worker.workerName} changed after discovery.`);
      }
      const discovery = await readCloudflareWorkerRepositoryDiscoveryForIdentity({
        token: resolved.connection.token,
        transport: resolved.connection.transport,
        accountId: resolved.account.accountId,
        workerName: identity.workerName,
        workerTag: identity.workerTag,
        expectedRepoId: resolved.context.ghRepoId,
        defaultBranch: resolved.githubDefaultBranch,
      });
      if (discovery.state !== "ready") {
        throw new Error(
          `Cloudflare Worker ${worker.workerName} no longer has one verified root for this repository. Scan the account again.`,
        );
      }
      if (discovery.builds.state === "available") {
        await readCloudflareWorkerConvexBuildAccess({
          token: resolved.connection.token,
          transport: resolved.connection.transport,
          accountId: resolved.account.accountId,
          productionTriggerUuid: discovery.builds.productionTriggerUuid,
          previewTriggerUuid: discovery.builds.previewTriggerUuid,
        });
      }
    }),
  );
  await rememberDefaultAccount(ctx, {
    userId: args.userId,
    connection: resolved.connection,
    account: resolved.account,
  });
  return await ctx.runMutation(internal.vault.cloudflareMutations.attachWorkers, {
    vaultId: args.vaultId,
    userId: args.userId,
    workers: workers.map((worker) => ({
      accountId: resolved.account.accountId,
      ...worker,
      origin: "selected_existing" as const,
    })),
  });
}

async function createWorkerForManagedWorkflow(
  ctx: ActionCtx,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    accountId: string;
    workerName: string;
  },
): Promise<Id<"vaultCloudflareWorkers">> {
  const validation = validateAppResourceName(args.workerName, "cloudflare");
  if (!validation.valid) {
    throw new Error(validation.message);
  }
  const accountId = args.accountId.trim();
  if (!accountId) {
    throw new Error("Cloudflare account is required.");
  }
  const checkpoint = await ctx.runQuery(
    internal.vault.cloudflareMutations.readManagedWorkerCreateCheckpoint,
    {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
      accountId,
      workerName: validation.value,
    },
  );
  const connection = await resolveCloudflareConnection(ctx, args.userId);
  const account = await resolveAccount({
    token: connection.token,
    transport: connection.transport,
    accountId,
  });

  let worker: { workerName: string; workerTag: string };
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
      internal.billingResourceQuotas.requireBillingResourceCapacityForProviderCreate,
      {
        userId: args.userId,
        kind: "cloudflare_worker",
      },
    );
    if (checkpoint.state === "planned") {
      await ctx.runMutation(internal.vault.cloudflareMutations.beginManagedWorkerCreate, {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        accountId: account.accountId,
        workerName: validation.value,
      });
    }
    worker = await createCloudflareWorker({
      token: connection.token,
      transport: connection.transport,
      accountId: account.accountId,
      workerName: validation.value,
    });
  }

  return await ctx.runMutation(internal.vault.cloudflareMutations.recordManagedWorkerCreated, {
    vaultId: args.vaultId,
    runId: args.runId,
    userId: args.userId,
    accountId: account.accountId,
    workerName: worker.workerName,
    workerTag: worker.workerTag,
  });
}

function toCloudflareBuildConfig(rootDirectory: string): CloudflareBuildConfig {
  const config = buildVaultCloudflareBuildConfigForRootDirectory({ rootDirectory });
  return {
    rootDir: config.rootDirectory,
    buildCommand: config.buildCommand,
    deployCommand: config.deployCommand,
    previewDeployCommand: config.previewDeployCommand,
    pathIncludes: config.pathIncludes,
    pathExcludes: config.pathExcludes,
  };
}

async function prepareWorkersBuildsForGitHub(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    rootDirectory: string;
  },
  context: WorkerConfigurationContext,
): Promise<{
  connection: CloudflareActionConnection;
  context: WorkerConfigurationContext;
  githubAccessToken: string;
  githubOwnerId: string;
  githubDefaultBranch: string;
  buildConfig: CloudflareBuildConfig;
}> {
  const [connection, githubAccessToken] = await Promise.all([
    resolveCloudflareConnection(ctx, args.userId),
    resolveGitHubAccessToken(ctx, args.userId),
  ]);
  await resolveAccount({
    token: connection.token,
    transport: connection.transport,
    accountId: context.accountId,
  });
  const repository = await fetchGitHubRepoIdentity({
    githubAccessToken,
    owner: context.owner,
    repo: context.name,
    expectedRepoId: context.ghRepoId,
  });
  return {
    connection,
    context,
    githubAccessToken,
    githubOwnerId: repository.ownerId,
    githubDefaultBranch: repository.defaultBranch,
    buildConfig: toCloudflareBuildConfig(args.rootDirectory),
  };
}

async function readInitialBuildCommitHash(args: {
  githubAccessToken: string;
  owner: string;
  repo: string;
  expectedRepoId: string;
  expectedDefaultBranch: string;
}): Promise<string> {
  const repository = await fetchGitHubDefaultBranchHead({
    githubAccessToken: args.githubAccessToken,
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
    vaultId: Id<"vaults">;
    initialBuild: "deferred" | "requested";
    existingBuilds: "preserve_repository" | "require_unconnected";
    beforeProviderWrite?: () => void | Promise<void>;
  },
  prepared: Awaited<ReturnType<typeof prepareWorkersBuildsForGitHub>>,
): Promise<CloudflareConnectedWorkersBuilds> {
  const { connection, context } = prepared;
  const build = await configureCloudflareWorkerBuildsForGitHub({
    owner: context.owner,
    repo: context.name,
    ghRepoId: context.ghRepoId,
    ghRepoOwnerId: prepared.githubOwnerId,
    defaultBranch: prepared.githubDefaultBranch,
    initialBuild:
      args.initialBuild === "deferred"
        ? { state: "deferred" }
        : {
            state: "requested",
            readCommitHash: async () =>
              await readInitialBuildCommitHash({
                githubAccessToken: prepared.githubAccessToken,
                owner: context.owner,
                repo: context.name,
                expectedRepoId: context.ghRepoId,
                expectedDefaultBranch: prepared.githubDefaultBranch,
              }),
          },
    vaultId: args.vaultId,
    workerName: context.workerName,
    workerTag: context.workerTag,
    existingBuilds: args.existingBuilds,
    cloudflareToken: connection.token,
    cloudflareAuthMethod: connection.auth.method,
    accountId: context.accountId,
    buildConfig: prepared.buildConfig,
    beforeProviderWrite: args.beforeProviderWrite,
  });
  return build;
}

async function configureResolvedWorkersBuildsForGitHub(
  args: {
    vaultId: Id<"vaults">;
    rootDirectory: string;
    initialBuild: "deferred" | "requested";
    existingBuilds: "preserve_repository" | "require_unconnected";
    beforeProviderWrite?: () => void | Promise<void>;
  },
  resolved: Awaited<ReturnType<typeof resolveCloudflareRepositoryContext>>,
  worker: { workerName: string; workerTag: string },
): Promise<CloudflareConnectedWorkersBuilds> {
  return await configurePreparedWorkersBuildsForGitHub(
    {
      vaultId: args.vaultId,
      initialBuild: args.initialBuild,
      existingBuilds: args.existingBuilds,
      beforeProviderWrite: args.beforeProviderWrite,
    },
    {
      connection: resolved.connection,
      context: {
        ...resolved.context,
        accountId: resolved.account.accountId,
        workerName: worker.workerName,
        workerTag: worker.workerTag,
      },
      githubAccessToken: resolved.githubAccessToken,
      githubOwnerId: resolved.githubOwnerId,
      githubDefaultBranch: resolved.githubDefaultBranch,
      buildConfig: toCloudflareBuildConfig(args.rootDirectory),
    },
  );
}

async function prepareConvexDeployKeyRotation(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    workerId: Id<"vaultCloudflareWorkers">;
    convexProjectId: Id<"vaultConvexProjects">;
  },
  buildPreparation: CloudflareWorkerBuildPreparation,
): Promise<{
  context: WorkerConvexProjectConfigurationContext;
  convexConnection: Awaited<ReturnType<typeof resolveConvexProvisioningConnection>>;
  deployment: NonNullable<Awaited<ReturnType<typeof readConvexProductionDeployment>>>;
  connection: CloudflareActionConnection;
  githubAccessToken: string;
  repository: Awaited<ReturnType<typeof fetchGitHubRepoIdentity>>;
  build: PreparedCloudflareWorkerBuilds;
  deployKeyNames: ReturnType<typeof buildWorkersBuildsConvexDeployKeyNames>;
}> {
  const [context, githubAccessToken] = await Promise.all([
    readWorkerConvexProjectConfigurationContext(ctx, args),
    resolveGitHubAccessToken(ctx, args.userId),
  ]);
  const project = context.convexProject;
  const convexConnection = await resolveConvexProvisioningConnection(ctx, args.userId);
  if (convexConnection.convexTeamId !== project.teamId) {
    throw new Error("Connect the Convex team that owns the selected project and try again.");
  }
  const deployment = await readConvexProductionDeployment({
    token: convexConnection.convexToken,
    projectId: project.projectId,
  });
  if (!deployment) {
    throw new Error("The selected Convex project has no production deployment.");
  }
  const [connection, repository] = await Promise.all([
    resolveCloudflareConnection(ctx, args.userId),
    fetchGitHubRepoIdentity({
      githubAccessToken,
      owner: context.owner,
      repo: context.name,
      expectedRepoId: context.ghRepoId,
    }),
  ]);
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
      workerName: context.workerName,
      workerTag: context.workerTag,
      expectedRepoId: context.ghRepoId,
      defaultBranch: repository.defaultBranch,
    });
    if (discovery.state !== "ready" || discovery.builds.state !== "available") {
      throw new Error(
        "Configure this Worker's GitHub Builds triggers before rotating Convex deploy keys.",
      );
    }
    build = {
      rootDirectory: discovery.rootDirectory,
      production: { triggerUuid: discovery.builds.productionTriggerUuid },
      preview: { triggerUuid: discovery.builds.previewTriggerUuid },
    };
  } else {
    build = buildPreparation.build;
  }

  return {
    context,
    convexConnection,
    deployment,
    connection,
    githubAccessToken,
    repository,
    build,
    deployKeyNames: buildWorkersBuildsConvexDeployKeyNames({
      vaultId: args.vaultId,
      workerId: args.workerId,
    }),
  };
}

async function rotatePreparedConvexDeployKeys(
  args: {
    vaultId: Id<"vaults">;
    beforeProviderWrite?: () => void | Promise<void>;
  },
  prepared: Awaited<ReturnType<typeof prepareConvexDeployKeyRotation>>,
): Promise<void> {
  const {
    context,
    convexConnection,
    deployment,
    connection,
    githubAccessToken,
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
    convexAuthMethod: convexConnection.convexAuthMethod,
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
          githubAccessToken,
          owner: context.owner,
          repo: context.name,
          expectedRepoId: context.ghRepoId,
          expectedDefaultBranch: repository.defaultBranch,
        }),
      expectedRepoId: context.ghRepoId,
      repositoryFullName: `${context.owner}/${context.name}`,
      rootDirectory: build.rootDirectory,
      vaultId: args.vaultId,
      workerName: context.workerName,
      workerTag: context.workerTag,
      cloudflareToken: connection.token,
      cloudflareAuthMethod: connection.auth.method,
      accountId: context.accountId,
      build,
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
    vaultId: Id<"vaults">;
    workerId: Id<"vaultCloudflareWorkers">;
    convexProjectId: Id<"vaultConvexProjects">;
  },
): Promise<void> {
  const actionId = crypto.randomUUID();
  const claim = await ctx.runMutation(
    internal.vault.infrastructureOperation.claimManualProviderWrite,
    {
      vaultId: args.vaultId,
      userId: args.userId,
      actionId,
      action: "rotate_convex_deploy_keys_for_workers_builds",
    },
  );
  try {
    const prepared = await prepareConvexDeployKeyRotation(ctx, args, { state: "discover" });
    requireManualProviderActionDeadline(claim.deadlineAt);
    await rotatePreparedConvexDeployKeys(
      {
        vaultId: args.vaultId,
        beforeProviderWrite: () => {
          requireManualProviderActionDeadline(claim.deadlineAt);
        },
      },
      prepared,
    );
  } catch (error) {
    await attemptManualProviderWriteFailureRecord(ctx, {
      vaultId: args.vaultId,
      actionId,
    });
    throw error;
  }
  await ctx.runMutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
    vaultId: args.vaultId,
    actionId,
    result: "succeeded",
  });
}

export async function listCloudflareAccountsForUser(
  ctx: ActionCtx,
  args: { userId: Id<"users"> },
): Promise<CloudflareAccountResult[]> {
  const connection = await resolveCloudflareConnection(ctx, args.userId);
  return await listAccountsForConnection(connection);
}

export async function configureWorkersBuildsForGitHubForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    workerId: Id<"vaultCloudflareWorkers">;
    rootDirectory: string;
  },
): Promise<void> {
  const actionId = crypto.randomUUID();
  const claim = await ctx.runMutation(
    internal.vault.infrastructureOperation.claimManualProviderWrite,
    {
      vaultId: args.vaultId,
      userId: args.userId,
      actionId,
      action: "configure_workers_builds_for_github",
    },
  );
  try {
    const context = await readWorkerConfigurationContext(ctx, args);
    const prepared = await prepareWorkersBuildsForGitHub(ctx, args, context);
    requireManualProviderActionDeadline(claim.deadlineAt);
    await configurePreparedWorkersBuildsForGitHub(
      {
        vaultId: args.vaultId,
        initialBuild: "requested",
        existingBuilds: "preserve_repository",
        beforeProviderWrite: () => {
          requireManualProviderActionDeadline(claim.deadlineAt);
        },
      },
      prepared,
    );
  } catch (error) {
    await attemptManualProviderWriteFailureRecord(ctx, {
      vaultId: args.vaultId,
      actionId,
    });
    throw error;
  }
  await ctx.runMutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
    vaultId: args.vaultId,
    actionId,
    result: "succeeded",
  });
}

export const listAccounts = action({
  access: cloudflareListAccountsContract.access,
  args: cloudflareListAccountsContract.args,
  returns: cloudflareListAccountsContract.returns,
  mcp: cloudflareListAccountsContract.mcp,
  handler: async (ctx): Promise<CloudflareAccountResult[]> =>
    await listCloudflareAccountsForUser(ctx, { userId: ctx.viewer.userId }),
});

export const selectDefaultAccount = action({
  access: "access_provider_connections",
  args: { accountId: string() },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const connection = await resolveCloudflareConnection(ctx, ctx.viewer.userId);
    const account = await resolveAccount({
      token: connection.token,
      transport: connection.transport,
      accountId: args.accountId,
    });
    await rememberDefaultAccount(ctx, {
      userId: ctx.viewer.userId,
      connection,
      account,
    });
    return null;
  },
});

export async function discoverCloudflareWorkersForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    accountId: string;
  },
): Promise<Awaited<ReturnType<typeof discoverCloudflareWorkersForRepository>>> {
  const resolved = await resolveCloudflareRepositoryContext(ctx, args);
  return await discoverCloudflareWorkersForRepository({
    token: resolved.connection.token,
    transport: resolved.connection.transport,
    accountId: resolved.account.accountId,
    expectedRepoId: resolved.context.ghRepoId,
    defaultBranch: resolved.githubDefaultBranch,
  });
}

async function connectWorkerForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    accountId: string;
    workerName: string;
    workerTag: string;
    rootDirectory: string;
  },
): Promise<CloudflareConnectWorkerResult> {
  const workerName = args.workerName.trim();
  const workerTag = args.workerTag.trim();
  if (!workerName || !workerTag) {
    throw new Error("Cloudflare Worker identity is required.");
  }
  const accountId = args.accountId.trim();
  if (!accountId) {
    throw new Error("Cloudflare account is required.");
  }
  const buildConfig = toCloudflareBuildConfig(args.rootDirectory);
  const actionId = crypto.randomUUID();
  const claim = await ctx.runMutation(
    internal.vault.infrastructureOperation.claimManualProviderWrite,
    {
      vaultId: args.vaultId,
      userId: args.userId,
      actionId,
      action: "connect_cloudflare_worker",
    },
  );
  let resolved: Awaited<ReturnType<typeof resolveCloudflareRepositoryContext>>;
  let identity: NonNullable<Awaited<ReturnType<typeof readCloudflareWorkerIdentity>>>;
  let workerId: Id<"vaultCloudflareWorkers">;
  try {
    resolved = await resolveCloudflareRepositoryContext(ctx, { ...args, accountId });
    const providerIdentity = await readCloudflareWorkerIdentity({
      token: resolved.connection.token,
      transport: resolved.connection.transport,
      accountId: resolved.account.accountId,
      workerName,
    });
    if (!providerIdentity || providerIdentity.workerTag !== workerTag) {
      throw new Error(`Cloudflare Worker ${workerName} changed after discovery.`);
    }
    identity = providerIdentity;
    const discovery = await readCloudflareWorkerRepositoryDiscoveryForIdentity({
      token: resolved.connection.token,
      transport: resolved.connection.transport,
      accountId: resolved.account.accountId,
      workerName: identity.workerName,
      workerTag: identity.workerTag,
      expectedRepoId: resolved.context.ghRepoId,
      defaultBranch: resolved.githubDefaultBranch,
    });
    if (discovery.state !== "not_connected") {
      throw new Error(
        `Cloudflare Worker ${workerName} already has a Workers Builds connection. Scan the account again.`,
      );
    }
    await rememberDefaultAccount(ctx, {
      userId: args.userId,
      connection: resolved.connection,
      account: resolved.account,
    });
    workerId = await ctx.runMutation(
      internal.vault.cloudflareMutations.recordManualConnectedWorker,
      {
        vaultId: args.vaultId,
        userId: args.userId,
        actionId,
        accountId,
        workerName,
        workerTag,
      },
    );
  } catch (error) {
    await attemptManualProviderWriteFailureRecord(ctx, {
      vaultId: args.vaultId,
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
        vaultId: args.vaultId,
        rootDirectory: buildConfig.rootDir,
        initialBuild: "requested",
        existingBuilds: "require_unconnected",
        beforeProviderWrite: () => {
          requireManualProviderActionDeadline(claim.deadlineAt);
          providerWrite.started = true;
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
      workerName: identity.workerName,
      workerTag: identity.workerTag,
      expectedRepoId: resolved.context.ghRepoId,
      defaultBranch: resolved.githubDefaultBranch,
    });
    if (configured.state !== "ready" || configured.rootDirectory !== buildConfig.rootDir) {
      throw new Error("Cloudflare did not report the configured repository root.");
    }
  } catch (error) {
    if (!providerWrite.started) {
      await attemptManualProviderWriteFailureRecord(ctx, {
        vaultId: args.vaultId,
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
        workerName: identity.workerName,
        workerTag: identity.workerTag,
        expectedRepoId: resolved.context.ghRepoId,
        defaultBranch: resolved.githubDefaultBranch,
      });
    } catch (observationError) {
      await attemptManualProviderWriteFailureRecord(ctx, {
        vaultId: args.vaultId,
        actionId,
      });
      return {
        state: "added_with_notice",
        workerId,
        message: `Cloudflare Worker ${workerName} was added, but Samebase could not verify its GitHub Builds state. Refresh the vault after checking the Worker in Cloudflare. Setup error: ${toErrorMessage(error)} Verification error: ${toErrorMessage(observationError)}`,
      };
    }
    if (
      observed.state === "ready" &&
      observed.rootDirectory === buildConfig.rootDir &&
      observed.builds.state === "available"
    ) {
      await ctx.runMutation(
        internal.vault.infrastructureOperation.finishManualProviderWriteResult,
        {
          vaultId: args.vaultId,
          actionId,
          result: didConfigureBuilds ? "succeeded" : "failed",
        },
      );
      if (didConfigureBuilds) {
        return { state: "ready", workerId };
      }
      return {
        state: "added_with_notice",
        workerId,
        message: `Cloudflare Worker ${workerName} was added and GitHub Builds is connected, but Cloudflare reported an error after setup. Start a build from Cloudflare if one is not running. Reason: ${toErrorMessage(error)}`,
      };
    }
    await attemptManualProviderWriteFailureRecord(ctx, {
      vaultId: args.vaultId,
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
      };
    }
    const nextActionMessage =
      observed.state === "not_connected"
        ? "Use Configure Workers Builds under Needs attention."
        : "Review the Worker in Cloudflare, then refresh the vault.";
    return {
      state: "added_with_notice",
      workerId,
      message: `Cloudflare Worker ${workerName} was added, but GitHub Builds setup did not complete. ${nextActionMessage} Reason: ${toErrorMessage(error)}`,
    };
  }
  await ctx.runMutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
    vaultId: args.vaultId,
    actionId,
    result: "succeeded",
  });
  return { state: "ready", workerId };
}

async function createWorkerForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    accountId: string;
    workerName: string;
    rootDirectory: string;
  },
): Promise<Id<"vaultCloudflareWorkers">> {
  const validation = validateAppResourceName(args.workerName, "cloudflare");
  if (!validation.valid) {
    throw new Error(validation.message);
  }
  const accountId = args.accountId.trim();
  if (!accountId) {
    throw new Error("Cloudflare account is required.");
  }
  const buildConfig = toCloudflareBuildConfig(args.rootDirectory);
  const actionId = crypto.randomUUID();
  const claim = await ctx.runMutation(
    internal.vault.infrastructureOperation.claimManualProviderWrite,
    {
      vaultId: args.vaultId,
      userId: args.userId,
      actionId,
      action: "create_cloudflare_worker",
    },
  );
  const providerCreate = { started: false };
  let workerRecorded = false;
  try {
    const resolved = await resolveCloudflareRepositoryContext(ctx, { ...args, accountId });
    await rememberDefaultAccount(ctx, {
      userId: args.userId,
      connection: resolved.connection,
      account: resolved.account,
    });
    const existing = await readCloudflareWorkerIdentity({
      token: resolved.connection.token,
      transport: resolved.connection.transport,
      accountId: resolved.account.accountId,
      workerName: validation.value,
    });
    if (existing) {
      throw new Error(
        `Cloudflare Worker name ${validation.value} already exists. Attach that Worker or choose another name.`,
      );
    }
    await ctx.runQuery(
      internal.billingResourceQuotas.requireBillingResourceCapacityForProviderCreate,
      {
        userId: args.userId,
        kind: "cloudflare_worker",
      },
    );
    requireManualProviderActionDeadline(claim.deadlineAt);
    const worker = await createCloudflareWorker({
      token: resolved.connection.token,
      transport: resolved.connection.transport,
      accountId: resolved.account.accountId,
      workerName: validation.value,
      beforeProviderWrite: () => {
        requireManualProviderActionDeadline(claim.deadlineAt);
        providerCreate.started = true;
      },
    });
    const workerId = await ctx.runMutation(
      internal.vault.cloudflareMutations.recordManualWorkerCreated,
      {
        vaultId: args.vaultId,
        userId: args.userId,
        actionId,
        accountId: resolved.account.accountId,
        workerName: validation.value,
        workerTag: worker.workerTag,
      },
    );
    workerRecorded = true;
    requireManualProviderActionDeadline(claim.deadlineAt);
    await configureResolvedWorkersBuildsForGitHub(
      {
        vaultId: args.vaultId,
        rootDirectory: buildConfig.rootDir,
        initialBuild: "requested",
        existingBuilds: "require_unconnected",
        beforeProviderWrite: () => requireManualProviderActionDeadline(claim.deadlineAt),
      },
      resolved,
      worker,
    );
    await ctx.runMutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
      vaultId: args.vaultId,
      actionId,
      result: "succeeded",
    });
    return workerId;
  } catch (error) {
    const reportedError =
      providerCreate.started && !workerRecorded
        ? new Error(
            `The Cloudflare Worker ${validation.value} can exist, but Samebase could not record it. Check the Worker in Cloudflare. If it exists, attach it to this app. Reason: ${toErrorMessage(error)}`,
          )
        : error;
    await attemptManualProviderWriteFailureRecord(ctx, {
      vaultId: args.vaultId,
      actionId,
    });
    throw reportedError;
  }
}

export const discoverWorkers = action({
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
  handler: async (ctx, args): Promise<Array<Id<"vaultCloudflareWorkers">>> =>
    await attachExistingCloudflareWorkersForUser(ctx, {
      ...args,
      userId: ctx.viewer.userId,
    }),
});

export const connectWorker = action({
  access: cloudflareConnectWorkerContract.access,
  args: cloudflareConnectWorkerContract.args,
  returns: cloudflareConnectWorkerContract.returns,
  handler: async (ctx, args): Promise<CloudflareConnectWorkerResult> =>
    await connectWorkerForUser(ctx, { ...args, userId: ctx.viewer.userId }),
});

export const createWorker = action({
  access: cloudflareCreateWorkerContract.access,
  args: cloudflareCreateWorkerContract.args,
  returns: cloudflareCreateWorkerContract.returns,
  handler: async (ctx, args): Promise<Id<"vaultCloudflareWorkers">> =>
    await createWorkerForUser(ctx, { ...args, userId: ctx.viewer.userId }),
});

export const detachWorker = action({
  access: cloudflareDetachWorkerContract.access,
  args: cloudflareDetachWorkerContract.args,
  returns: cloudflareDetachWorkerContract.returns,
  handler: async (ctx, args): Promise<null> => {
    const context = await readWorkerConfigurationContext(ctx, {
      ...args,
      userId: ctx.viewer.userId,
    });
    await ctx.runMutation(internal.vault.cloudflareMutations.detachWorker, {
      ...args,
      userId: ctx.viewer.userId,
      accountId: context.accountId,
      workerName: context.workerName,
      workerTag: context.workerTag,
    });
    return null;
  },
});

export const configureWorkersBuildsForGitHub = action({
  access: cloudflareConfigureWorkersBuildsForGitHubContract.access,
  args: cloudflareConfigureWorkersBuildsForGitHubContract.args,
  returns: cloudflareConfigureWorkersBuildsForGitHubContract.returns,
  mcp: cloudflareConfigureWorkersBuildsForGitHubContract.mcp,
  handler: async (ctx, args): Promise<null> => {
    await configureWorkersBuildsForGitHubForUser(ctx, { ...args, userId: ctx.viewer.userId });
    return null;
  },
});

export const rotateConvexDeployKeysForWorkersBuilds = action({
  access: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.access,
  args: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.args,
  returns: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.returns,
  mcp: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcp,
  handler: async (ctx, args): Promise<null> => {
    await rotateConvexDeployKeysForWorkersBuildsForUser(ctx, {
      ...args,
      userId: ctx.viewer.userId,
    });
    return null;
  },
});

/** Used only by the explicit create-app workflow. Manual attachment actions run directly. */
export const ensureCloudflareWorkerConnection = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    accountId: string(),
    workerName: string(),
  },
  returns: id("vaultCloudflareWorkers"),
  handler: async (
    ctx,
    { vaultId, runId, userId, accountId, workerName },
  ): Promise<Id<"vaultCloudflareWorkers">> => {
    return await createWorkerForManagedWorkflow(ctx, {
      vaultId,
      runId,
      userId,
      accountId,
      workerName,
    });
  },
});

export const configureWorkersBuildsForGitHubForWorkflow = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: vPreparedCloudflareWorkerBuilds,
  handler: async (
    ctx,
    { vaultId, runId, userId, workerId },
  ): Promise<PreparedCloudflareWorkerBuilds> => {
    const context = await ctx.runQuery(
      internal.vault.cloudflareMutations.readManagedWorkerConfigurationContext,
      { vaultId, runId, userId, workerId },
    );
    const prepared = await prepareWorkersBuildsForGitHub(
      ctx,
      {
        vaultId,
        userId,
        rootDirectory: context.rootDirectory,
      },
      context,
    );
    const build = await configurePreparedWorkersBuildsForGitHub(
      {
        vaultId,
        initialBuild: "deferred",
        existingBuilds: "preserve_repository",
      },
      prepared,
    );
    await ctx.runMutation(internal.vault.infrastructureOperation.recordManagedProviderWrites, {
      vaultId,
      runId,
      providers: ["cloudflare"],
    });
    return {
      rootDirectory: build.rootDirectory,
      production: { triggerUuid: build.production.triggerUuid },
      preview: { triggerUuid: build.preview.triggerUuid },
    };
  },
});

export const rotateConvexDeployKeysForWorkersBuildsForWorkflow = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
    convexProjectId: id("vaultConvexProjects"),
    build: vPreparedCloudflareWorkerBuilds,
  },
  returns: nullValue(),
  handler: async (
    ctx,
    { vaultId, runId, userId, workerId, convexProjectId, build },
  ): Promise<null> => {
    const context = await ctx.runQuery(
      internal.vault.cloudflareMutations.readManagedWorkerConvexProjectConfigurationContext,
      { vaultId, runId, userId, workerId, convexProjectId },
    );
    if (build.rootDirectory !== context.rootDirectory) {
      throw new Error("Managed Cloudflare Builds root changed before deploy-key rotation.");
    }
    const args = {
      vaultId,
      userId,
      workerId,
      convexProjectId,
    };
    const prepared = await prepareConvexDeployKeyRotation(ctx, args, {
      state: "prepared",
      build,
    });
    await rotatePreparedConvexDeployKeys({ vaultId }, prepared);
    await ctx.runMutation(internal.vault.infrastructureOperation.recordManagedProviderWrites, {
      vaultId,
      runId,
      providers: ["convex", "cloudflare"],
    });
    return null;
  },
});
