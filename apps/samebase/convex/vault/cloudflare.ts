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
  listCloudflareWorkersWithRepositoryDiscovery,
  readCloudflareWorkerIdentity,
  readCloudflareWorkerRepositoryDiscoveryForIdentity,
  wireCloudflareWorkerBuilds,
  wireCloudflareWorkerConvexBuildAccess,
  type CloudflareBuildConfig,
  type CloudflareConnectedWorkersBuilds,
} from "../cloudflareResources";
import { fetchGitHubRepoIdentity } from "../githubRepoApi";
import {
  createConvexDeployKey,
  createConvexPreviewDeployKey,
  deleteConvexDeployKeysByName,
  deleteConvexPreviewDeployKeysByName,
  resolveConvexProvisioningConnection,
} from "../infraProvisioning";
import { action } from "../functions";
import type { McpTokenHealth } from "../mcpTokenHealth";
import { vaultSuffix } from "../slugUtils";
import { validateAppResourceName } from "../../shared/appResourceNames";
import { buildVaultCloudflareBuildConfigForRootDirectory } from "./model";
import type { WorkerConfigurationContext } from "./cloudflareMutations";
import { readConvexProductionDeployment } from "./convexProjectResources";
import {
  cloudflareListAccountsContract,
  vCloudflareAccountResult,
} from "./contracts/cloudflareListAccounts";
import {
  cloudflareListWorkersContract,
  vCloudflareWorkerResult,
} from "./contracts/cloudflareListWorkers";
import { cloudflareConnectExistingWorkerContract } from "./contracts/cloudflareConnectExistingWorker";
import { cloudflareWireBuildsContract } from "./contracts/cloudflareWireBuilds";
import { cloudflareWireConvexBuildAccessContract } from "./contracts/cloudflareWireConvexBuildAccess";

const { id, null: nullValue, string } = v;

type CloudflareAccountResult = Infer<typeof vCloudflareAccountResult>;
type CloudflareWorkerResult = Infer<typeof vCloudflareWorkerResult>;
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
  tokenHealth?: McpTokenHealth;
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
    throw new Error("Cloudflare account is not available for this connection.");
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

async function readWorkerAttachmentContext(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { vaultId: Id<"vaults">; userId: Id<"users">; appId: Id<"vaultApps"> },
) {
  return await ctx.runQuery(internal.vault.cloudflareMutations.readWorkerAttachmentContext, args);
}

async function attachWorker(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    appId: Id<"vaultApps">;
    accountId: string;
    workerName: string;
    workerTag: string;
    origin: "provisioned" | "selected_existing";
  },
): Promise<Id<"vaultCloudflareWorkers">> {
  return await ctx.runMutation(internal.vault.cloudflareMutations.attachWorker, args);
}

async function readWorkerConfigurationContext(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    workerId: Id<"vaultCloudflareWorkers">;
  },
) {
  return await ctx.runQuery(
    internal.vault.cloudflareMutations.readWorkerConfigurationContext,
    args,
  );
}

export async function connectExistingCloudflareWorkerForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    appId: Id<"vaultApps">;
    accountId: string;
    workerName: string;
  },
): Promise<Id<"vaultCloudflareWorkers">> {
  const accountId = args.accountId.trim();
  const workerName = args.workerName.trim();
  if (!accountId || !workerName) {
    throw new Error("Cloudflare account and Worker are required.");
  }
  const [context, connection] = await Promise.all([
    readWorkerAttachmentContext(ctx, args),
    resolveCloudflareConnection(ctx, args.userId),
  ]);
  const account = await resolveAccount({
    token: connection.token,
    transport: connection.transport,
    accountId,
  });
  const identity = await readCloudflareWorkerIdentity({
    token: connection.token,
    transport: connection.transport,
    accountId: account.accountId,
    workerName,
  });
  if (!identity) {
    throw new Error("Cloudflare Worker was not found.");
  }
  const discovery = await readCloudflareWorkerRepositoryDiscoveryForIdentity({
    token: connection.token,
    transport: connection.transport,
    accountId: account.accountId,
    workerName: identity.workerName,
    workerTag: identity.workerTag,
    expectedRepoId: context.ghRepoId,
    expectedRootDirectory: context.rootDirectory,
  });
  if (discovery.classification !== "recommended" && discovery.classification !== "available") {
    throw new Error(
      `Cloudflare Worker ${workerName} has an ambiguous or conflicting repository connection. Inspect it in Cloudflare before attaching it.`,
    );
  }
  await rememberDefaultAccount(ctx, { userId: args.userId, connection, account });
  return await attachWorker(ctx, {
    ...args,
    accountId: account.accountId,
    workerName: identity.workerName,
    workerTag: identity.workerTag,
    origin: "selected_existing",
  });
}

async function createWorkerForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    appId: Id<"vaultApps">;
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
  const [connection] = await Promise.all([
    resolveCloudflareConnection(ctx, args.userId),
    readWorkerAttachmentContext(ctx, args),
  ]);
  const account = await resolveAccount({
    token: connection.token,
    transport: connection.transport,
    accountId,
  });
  const worker = await createCloudflareWorker({
    token: connection.token,
    transport: connection.transport,
    accountId: account.accountId,
    workerName: validation.value,
  });
  await rememberDefaultAccount(ctx, { userId: args.userId, connection, account });
  return await attachWorker(ctx, {
    ...args,
    accountId: account.accountId,
    workerName: worker.workerName,
    workerTag: worker.workerTag,
    origin: "provisioned",
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

async function wireBuildsForWorker(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    workerId: Id<"vaultCloudflareWorkers">;
    triggerInitialBuild: boolean;
  },
): Promise<{
  build: CloudflareConnectedWorkersBuilds;
  connection: CloudflareActionConnection;
  context: WorkerConfigurationContext;
}> {
  const context = await readWorkerConfigurationContext(ctx, args);
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
  const build = await wireCloudflareWorkerBuilds({
    owner: context.owner,
    repo: context.name,
    ghRepoId: context.ghRepoId,
    ghRepoOwnerId: repository.ownerId,
    defaultBranch: context.defaultBranch,
    triggerInitialBuild: args.triggerInitialBuild,
    vaultId: args.vaultId,
    workerName: context.workerName,
    workerTag: context.workerTag,
    cloudflareToken: connection.token,
    cloudflareAuthMethod: connection.auth.method,
    accountId: context.accountId,
    buildConfig: toCloudflareBuildConfig(context.rootDirectory),
  });
  return { build, connection, context };
}

export async function wireCloudflareConvexBuildAccessForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    workerId: Id<"vaultCloudflareWorkers">;
    convexProjectId: Id<"vaultConvexProjects">;
  },
): Promise<void> {
  const { build, connection, context } = await wireBuildsForWorker(ctx, {
    ...args,
    triggerInitialBuild: false,
  });
  const project = context.convexProjects.find(
    (candidate) => candidate.convexProjectId === args.convexProjectId,
  );
  if (!project) {
    throw new Error("The Worker does not have an explicit dependency on this Convex project.");
  }
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

  const keyName = `samebase-${vaultSuffix(args.vaultId)}-${vaultSuffix(args.workerId)}`;
  const productionKeyName = `${keyName}-production`;
  const previewKeyName = `${keyName}-preview`;
  await Promise.all([
    deleteConvexDeployKeysByName({
      convexToken: convexConnection.convexToken,
      deploymentName: deployment.name,
      name: productionKeyName,
    }),
    deleteConvexPreviewDeployKeysByName({
      convexToken: convexConnection.convexToken,
      projectId: project.projectId,
      name: previewKeyName,
    }),
  ]);
  const production = await createConvexDeployKey({
    convexToken: convexConnection.convexToken,
    convexAuthMethod: convexConnection.convexAuthMethod,
    deploymentName: deployment.name,
    name: productionKeyName,
  });
  let preview: Awaited<ReturnType<typeof createConvexPreviewDeployKey>>;
  try {
    preview = await createConvexPreviewDeployKey({
      convexToken: convexConnection.convexToken,
      projectId: project.projectId,
      name: previewKeyName,
    });
  } catch (error) {
    await deleteConvexDeployKeysByName({
      convexToken: convexConnection.convexToken,
      deploymentName: deployment.name,
      name: productionKeyName,
    });
    throw error;
  }

  try {
    await wireCloudflareWorkerConvexBuildAccess({
      defaultBranch: context.defaultBranch,
      expectedRepoId: context.ghRepoId,
      repositoryFullName: `${context.owner}/${context.name}`,
      rootDirectory: context.rootDirectory,
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
    });
  } catch (error) {
    await Promise.allSettled([
      deleteConvexDeployKeysByName({
        convexToken: convexConnection.convexToken,
        deploymentName: deployment.name,
        name: productionKeyName,
      }),
      deleteConvexPreviewDeployKeysByName({
        convexToken: convexConnection.convexToken,
        projectId: project.projectId,
        name: previewKeyName,
      }),
    ]);
    throw error;
  }
}

export async function listCloudflareAccountsForUser(
  ctx: ActionCtx,
  args: { userId: Id<"users"> },
): Promise<CloudflareAccountResult[]> {
  const connection = await resolveCloudflareConnection(ctx, args.userId);
  return await listAccountsForConnection(connection);
}

export async function wireCloudflareBuildsForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    workerId: Id<"vaultCloudflareWorkers">;
  },
): Promise<void> {
  await wireBuildsForWorker(ctx, { ...args, triggerInitialBuild: true });
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
  access: "access_app_create",
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

export async function listCloudflareWorkersForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    appId: Id<"vaultApps">;
    accountId: string;
  },
): Promise<CloudflareWorkerResult[]> {
  const [context, connection] = await Promise.all([
    readWorkerAttachmentContext(ctx, args),
    resolveCloudflareConnection(ctx, args.userId),
  ]);
  const account = await resolveAccount({
    token: connection.token,
    transport: connection.transport,
    accountId: args.accountId,
  });
  return await listCloudflareWorkersWithRepositoryDiscovery({
    token: connection.token,
    transport: connection.transport,
    accountId: account.accountId,
    limit: 100,
    expectedRepoId: context.ghRepoId,
    expectedRootDirectory: context.rootDirectory,
  });
}

export const listWorkers = action({
  access: cloudflareListWorkersContract.access,
  args: cloudflareListWorkersContract.args,
  returns: cloudflareListWorkersContract.returns,
  mcp: cloudflareListWorkersContract.mcp,
  handler: async (ctx, args): Promise<CloudflareWorkerResult[]> =>
    await listCloudflareWorkersForUser(ctx, { ...args, userId: ctx.viewer.userId }),
});

export const connectExistingWorker = action({
  access: cloudflareConnectExistingWorkerContract.access,
  args: cloudflareConnectExistingWorkerContract.args,
  returns: cloudflareConnectExistingWorkerContract.returns,
  mcp: cloudflareConnectExistingWorkerContract.mcp,
  handler: async (ctx, args): Promise<null> => {
    await connectExistingCloudflareWorkerForUser(ctx, { ...args, userId: ctx.viewer.userId });
    return null;
  },
});

export const createWorker = action({
  access: "access_app_create",
  args: {
    vaultId: id("vaults"),
    appId: id("vaultApps"),
    accountId: string(),
    workerName: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    await createWorkerForUser(ctx, { ...args, userId: ctx.viewer.userId });
    return null;
  },
});

export const attachConvexProjectDependency = action({
  access: "access_app_create",
  args: {
    vaultId: id("vaults"),
    workerId: id("vaultCloudflareWorkers"),
    convexProjectId: id("vaultConvexProjects"),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.vault.cloudflareMutations.attachWorkerConvexProjectDependency, {
      ...args,
      userId: ctx.viewer.userId,
    });
    return null;
  },
});

export const removeConvexProjectDependency = action({
  access: "access_app_create",
  args: {
    vaultId: id("vaults"),
    dependencyId: id("vaultWorkerConvexProjectDependencies"),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.vault.cloudflareMutations.removeWorkerConvexProjectDependency, {
      ...args,
      userId: ctx.viewer.userId,
    });
    return null;
  },
});

export const wireBuilds = action({
  access: cloudflareWireBuildsContract.access,
  args: cloudflareWireBuildsContract.args,
  returns: cloudflareWireBuildsContract.returns,
  mcp: cloudflareWireBuildsContract.mcp,
  handler: async (ctx, args): Promise<null> => {
    await wireCloudflareBuildsForUser(ctx, { ...args, userId: ctx.viewer.userId });
    return null;
  },
});

export const wireConvexBuildAccess = action({
  access: cloudflareWireConvexBuildAccessContract.access,
  args: cloudflareWireConvexBuildAccessContract.args,
  returns: cloudflareWireConvexBuildAccessContract.returns,
  mcp: cloudflareWireConvexBuildAccessContract.mcp,
  handler: async (ctx, args): Promise<null> => {
    await wireCloudflareConvexBuildAccessForUser(ctx, {
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
    appId: id("vaultApps"),
    accountId: string(),
    workerName: string(),
  },
  returns: nullValue(),
  handler: async (ctx, { vaultId, userId, appId, accountId, workerName }): Promise<null> => {
    await createWorkerForUser(ctx, { vaultId, userId, appId, accountId, workerName });
    return null;
  },
});
