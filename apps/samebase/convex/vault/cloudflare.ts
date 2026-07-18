"use node";

import { randomUUID } from "node:crypto";
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
import {
  formatProviderApiCallLogMessage,
  type ProviderApiCall,
  type ProviderApiCallRecorder,
} from "../providerApiLog";
import { validateAppResourceName } from "../../shared/appResourceNames";
import {
  CloudflareApiError,
  type CloudflareBuildConfig,
  type CloudflareWorkersBuildConnection,
  createOrRecoverCloudflareWorker,
  isCloudflareWorkerNameAvailable,
  isCloudflareWorkerNotFoundError,
  listCloudflareWorkersWithRepositoryDiscovery,
  readConfirmedCloudflareWorker,
  readCloudflareWorkerBuildConnectionDiscovery,
  readWorkersDevAvailability,
  type CloudflareWorkerRepositoryDiscovery,
  verifyCloudflareWorkerInfrastructure,
  type CloudflareWorkerInfrastructureVerificationResult,
  wireCloudflareWorkerBuilds,
  wireCloudflareWorkerConvexBuildAccess,
} from "../cloudflareResources";
import { fetchGitHubRepoIdentity } from "../githubRepoApi";
import {
  createConvexDeployKey,
  createConvexPreviewDeployKey,
  deleteConvexDeployKey,
  deleteConvexPreviewDeployKey,
  ConvexProvisioningConnectionRequiredError,
  resolveConvexProvisioningConnection,
} from "../infraProvisioning";
import { isConvexCloudDeployment, requestConvexManagementApi } from "../convexManagementApi/client";
import {
  ConvexManagementApiError,
  isConvexManagementNotFoundError,
} from "../convexManagementApi/errors";
import {
  vVaultCloudflareOrigin,
  type VaultCloudflareBuildConfig,
  type VaultCloudflareConnectedBuilds,
  type VaultCloudflareOrigin,
} from "./model";
import type { AppProvisioningStep } from "../schema";
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
import { cloudflareVerifyInfrastructureContract } from "./contracts/cloudflareVerifyInfrastructure";

const { id, null: nullValue, string } = v;

type CloudflareAccountResult = Infer<typeof vCloudflareAccountResult>;
type CloudflareWorkerResult = Infer<typeof vCloudflareWorkerResult>;
type CloudflareWorkerAttachment =
  | { state: "not_attached" }
  | { state: "attached"; workerId: Id<"vaultCloudflareWorkers"> };
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

class CloudflareConnectionRequiredError extends Error {
  constructor() {
    super("Cloudflare connection is required.");
    this.name = "CloudflareConnectionRequiredError";
  }
}

class CloudflareAccountUnavailableError extends Error {
  constructor() {
    super("Cloudflare account is not available for this connection.");
    this.name = "CloudflareAccountUnavailableError";
  }
}

async function resolveCloudflareConnection(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<CloudflareActionConnection> {
  const connection = await ctx.runAction(internal.cloudflareOAuth.resolveConnectionForUser, {
    userId,
  });
  const token = connection?.auth.credential.trim();
  if (!connection || !token) {
    throw new CloudflareConnectionRequiredError();
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

function toVaultCloudflareConnectedBuilds(
  builds: CloudflareWorkersBuildConnection,
): VaultCloudflareConnectedBuilds {
  return {
    state: "connected",
    production: builds.production,
    preview: builds.preview,
  };
}

async function deleteConvexBuildAccessDeployKey(args: {
  convexDeployKeyName: string;
  convexToken: string;
  deploymentName: string;
}): Promise<void> {
  try {
    await deleteConvexDeployKey({
      convexToken: args.convexToken,
      deploymentName: args.deploymentName,
      convexDeployKeyName: args.convexDeployKeyName,
    });
  } catch (error) {
    if (isConvexManagementNotFoundError(error)) {
      return;
    }
    throw error;
  }
}

async function deleteConvexBuildAccessPreviewDeployKey(args: {
  convexDeployKeyName: string;
  convexToken: string;
  projectId: string;
}): Promise<void> {
  try {
    await deleteConvexPreviewDeployKey({
      convexToken: args.convexToken,
      projectId: args.projectId,
      convexDeployKeyName: args.convexDeployKeyName,
    });
  } catch (error) {
    if (isConvexManagementNotFoundError(error)) {
      return;
    }
    throw error;
  }
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
    throw new CloudflareAccountUnavailableError();
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
  expectedRootDirectory: string;
  defaultBranch: string;
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
      if (evidence.state === "same_repo_different_root") {
        return `Cannot connect Cloudflare Worker ${args.workerName} to ${args.repositoryFullName}: its existing Workers Builds trigger${formatCloudflareWorkerDiscoveryTriggerName(evidence.triggerName)} is connected to the same GitHub repository but root directory ${evidence.rootDirectory}. Expected ${evidence.expectedRootDirectory}. Disconnect Builds in Cloudflare or choose another Worker.`;
      }
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
        case "missing_root_directory":
          return `Cannot connect Cloudflare Worker ${args.workerName} to ${args.repositoryFullName}: Cloudflare did not return a root directory for its existing Workers Builds trigger${formatCloudflareWorkerDiscoveryTriggerName(evidence.triggerName)}. Disconnect Builds in Cloudflare or choose another Worker.`;
        case "trigger_read_failed":
          return `Cannot connect Cloudflare Worker ${args.workerName} to ${args.repositoryFullName}: Samebase could not inspect its Workers Builds triggers: ${evidence.message}. Disconnect Builds in Cloudflare or choose another Worker.`;
        case "none":
        case "matching_repo":
        case "same_repo_different_root":
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
    appId: Id<"vaultApps">;
  },
): Promise<CloudflareWorkerDiscoveryContext> {
  return await ctx.runQuery(
    internal.vault.cloudflareMutations.readCloudflareWorkerDiscoveryContext,
    {
      vaultId: args.vaultId,
      userId: args.userId,
      appId: args.appId,
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
  expectedRootDirectory: string;
  defaultBranch: string;
}) {
  const worker = await readCloudflareWorkerBuildConnectionDiscovery({
    token: args.token,
    transport: args.transport,
    accountId: args.accountId,
    workerName: args.workerName,
    expectedRepoId: args.expectedRepoId,
    expectedRootDirectory: args.expectedRootDirectory,
    defaultBranch: args.defaultBranch,
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
    workersDev: await readWorkersDevAvailability({
      token: args.token,
      transport: args.transport,
      accountId: args.accountId,
      workerName: worker.workerName,
    }),
    builds: worker.builds,
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

async function appendProviderApiCallEvent(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"appProvisioningRuns">;
    step: AppProvisioningStep;
    call: ProviderApiCall;
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
      runId: args.runId,
      step: args.step,
      level: "info",
      message: formatProviderApiCallLogMessage(args.call),
      state: "running",
    });
  } catch {
    console.warn("vault:cloudflare:api_call_event_append_failed", {
      runId: args.runId,
      step: args.step,
      provider: args.call.provider,
      endpoint: args.call.endpoint,
    });
  }
}

function createProviderApiCallRecorder(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"appProvisioningRuns">;
    step: AppProvisioningStep;
  },
): ProviderApiCallRecorder {
  return async (call) => {
    await appendProviderApiCallEvent(ctx, {
      runId: args.runId,
      step: args.step,
      call,
    });
  };
}

async function startCloudflareWorkerConnectionOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    appId: Id<"vaultApps">;
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
    workerId: Id<"vaultCloudflareWorkers">;
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
    workerId: Id<"vaultCloudflareWorkers">;
    convexDeploymentId: Id<"vaultConvexDeployments">;
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

async function startCloudflareInfrastructureVerificationOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    workerId: Id<"vaultCloudflareWorkers">;
  },
): Promise<void> {
  try {
    await ctx.runMutation(
      internal.appProvisioningWorkflow.startCloudflareInfrastructureVerification,
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
    appId: Id<"vaultApps">;
  },
): Promise<boolean> {
  const result = await ctx.runQuery(
    internal.vault.cloudflareMutations.readActiveCloudflareWorkerConnection,
    {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
      appId: args.appId,
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
    workerId: Id<"vaultCloudflareWorkers">;
  },
) {
  return await ctx.runQuery(internal.vault.cloudflareMutations.readActiveCloudflareBuildsWiring, {
    vaultId: args.vaultId,
    runId: args.runId,
    userId: args.userId,
    workerId: args.workerId,
  });
}

async function readActiveCloudflareConvexBuildAccessWiring(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    workerId: Id<"vaultCloudflareWorkers">;
    convexDeploymentId: Id<"vaultConvexDeployments">;
  },
) {
  return await ctx.runQuery(
    internal.vault.cloudflareMutations.readActiveCloudflareConvexBuildAccessWiring,
    {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
      workerId: args.workerId,
      convexDeploymentId: args.convexDeploymentId,
    },
  );
}

async function readActiveCloudflareInfrastructureVerification(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    workerId: Id<"vaultCloudflareWorkers">;
  },
) {
  return await ctx.runQuery(
    internal.vault.cloudflareMutations.readActiveCloudflareInfrastructureVerification,
    {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
      workerId: args.workerId,
    },
  );
}

type ConvexDeploymentInfrastructureVerificationResult =
  | "confirmed"
  | "missing_upstream"
  | "not_checked";

async function verifyConvexDeploymentExistence(args: {
  convexToken: string;
  teamId: string;
  projectId: string;
  deploymentName: string;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<
  Extract<ConvexDeploymentInfrastructureVerificationResult, "confirmed" | "missing_upstream">
> {
  try {
    const project = await requestConvexManagementApi(
      args.convexToken,
      "GET",
      "/projects/{project_id}",
      {
        params: { path: { project_id: args.projectId } },
        recordApiCall: args.recordApiCall,
      },
    );
    if (project.teamId !== args.teamId) {
      return "missing_upstream";
    }

    const deployment = await requestConvexManagementApi(
      args.convexToken,
      "GET",
      "/deployments/{deployment_name}",
      {
        params: { path: { deployment_name: args.deploymentName } },
        recordApiCall: args.recordApiCall,
      },
    );
    if (!isConvexCloudDeployment(deployment)) {
      return "missing_upstream";
    }
    if (deployment.projectId !== args.projectId) {
      return "missing_upstream";
    }
    if (deployment.name !== args.deploymentName) {
      return "missing_upstream";
    }
    return deployment.deploymentType === "prod" ? "confirmed" : "missing_upstream";
  } catch (error) {
    if (isConvexManagementNotFoundError(error)) {
      return "missing_upstream";
    }
    throw error;
  }
}

async function verifyActiveConvexDeploymentInfrastructure(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    userId: Id<"users">;
    teamId: string;
    projectId: string;
    deploymentName: string;
    recordApiCall?: ProviderApiCallRecorder;
  },
): Promise<ConvexDeploymentInfrastructureVerificationResult> {
  const convexConnection = await resolveConvexProvisioningConnection(ctx, args.userId);
  if (convexConnection.convexTeamId !== args.teamId) {
    return "not_checked";
  }
  return await verifyConvexDeploymentExistence({
    convexToken: convexConnection.convexToken,
    teamId: args.teamId,
    projectId: args.projectId,
    deploymentName: args.deploymentName,
    recordApiCall: args.recordApiCall,
  });
}

function resolveInfrastructureVerificationUnverifiableMessage(error: unknown): string | null {
  if (isCloudflareWorkerNotFoundError(error)) {
    return "Cloudflare Worker could not be verified because Cloudflare did not return the recorded Worker.";
  }
  if (error instanceof CloudflareApiError) {
    return "Cloudflare infrastructure could not be verified because Cloudflare did not return a verifiable response.";
  }
  if (error instanceof CloudflareConnectionRequiredError) {
    return "Cloudflare infrastructure could not be verified because the Cloudflare connection is missing.";
  }
  if (error instanceof CloudflareAccountUnavailableError) {
    return "Cloudflare infrastructure could not be verified because the recorded Cloudflare account is unavailable.";
  }
  if (error instanceof ConvexProvisioningConnectionRequiredError) {
    return "Convex deployment could not be verified because the Convex connection is missing.";
  }
  if (error instanceof ConvexManagementApiError) {
    return "Convex deployment could not be verified because Convex did not return a verifiable response.";
  }
  return null;
}

export async function listCloudflareAccountsForUser(
  ctx: ActionCtx,
  args: { userId: Id<"users"> },
): Promise<CloudflareAccountResult[]> {
  const connection = await resolveCloudflareConnection(ctx, args.userId);
  return await listAccountsForConnection({
    token: connection.token,
    transport: connection.transport,
  });
}

export const listAccounts = action({
  access: cloudflareListAccountsContract.access,
  args: cloudflareListAccountsContract.args,
  returns: cloudflareListAccountsContract.returns,
  mcp: cloudflareListAccountsContract.mcp,
  handler: async (ctx): Promise<CloudflareAccountResult[]> => {
    return await listCloudflareAccountsForUser(ctx, { userId: ctx.viewer.userId });
  },
});

export const selectDefaultAccount = action({
  access: "access_app_create",
  args: {
    accountId: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
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

export async function listCloudflareWorkersForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    appId: Id<"vaultApps">;
    accountId: string;
  },
): Promise<CloudflareWorkerResult[]> {
  const userId = args.userId;
  const connection = await resolveCloudflareConnection(ctx, userId);
  const discoveryContext = await readCloudflareWorkerDiscoveryContext(ctx, {
    vaultId: args.vaultId,
    userId,
    appId: args.appId,
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
    expectedRootDirectory: discoveryContext.expectedRootDirectory,
  });
}

export const listWorkers = action({
  access: cloudflareListWorkersContract.access,
  args: cloudflareListWorkersContract.args,
  returns: cloudflareListWorkersContract.returns,
  mcp: cloudflareListWorkersContract.mcp,
  handler: async (ctx, args): Promise<CloudflareWorkerResult[]> => {
    return await listCloudflareWorkersForUser(ctx, {
      ...args,
      userId: ctx.viewer.userId,
    });
  },
});

export async function connectExistingCloudflareWorkerForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    appId: Id<"vaultApps">;
    accountId: string;
    workerName: string;
  },
): Promise<null> {
  const userId = args.userId;
  const accountId = args.accountId.trim();
  const workerName = args.workerName.trim();
  if (!accountId) {
    throw new Error("Cloudflare account is required.");
  }
  if (!workerName) {
    throw new Error("Cloudflare Worker is required.");
  }
  const discoveryContext = await readCloudflareWorkerDiscoveryContext(ctx, {
    vaultId: args.vaultId,
    userId,
    appId: args.appId,
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
    expectedRootDirectory: discoveryContext.expectedRootDirectory,
    defaultBranch: discoveryContext.defaultBranch,
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
    appId: args.appId,
    accountId: account.accountId,
    workerName,
    origin: "selected_existing",
  });

  return null;
}

export const connectExistingWorker = action({
  access: cloudflareConnectExistingWorkerContract.access,
  args: cloudflareConnectExistingWorkerContract.args,
  returns: cloudflareConnectExistingWorkerContract.returns,
  mcp: cloudflareConnectExistingWorkerContract.mcp,
  handler: async (ctx, args): Promise<null> => {
    return await connectExistingCloudflareWorkerForUser(ctx, {
      ...args,
      userId: ctx.viewer.userId,
    });
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
  handler: async (ctx, args) => {
    const validation = validateAppResourceName(args.workerName, "cloudflare");
    if (!validation.valid) {
      throw new Error(validation.message);
    }
    const accountId = args.accountId.trim();
    if (!accountId) {
      throw new Error("Cloudflare account is required.");
    }
    const userId = ctx.viewer.userId;
    await ctx.runQuery(internal.vault.cloudflareMutations.requireCloudflareWorkerConnectionVault, {
      vaultId: args.vaultId,
      userId,
      appId: args.appId,
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
      appId: args.appId,
      accountId,
      workerName: validation.value,
      origin: "provisioned",
    });

    return null;
  },
});

export async function wireCloudflareBuildsForUser(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    workerId: Id<"vaultCloudflareWorkers">;
  },
): Promise<null> {
  const userId = args.userId;
  const runId = await ctx.runMutation(internal.appProvisioningRuns.createForVault, {
    userId,
    vaultId: args.vaultId,
    trigger: "wire_builds",
  });
  await startCloudflareBuildsWiringOrFail(ctx, {
    vaultId: args.vaultId,
    runId,
    userId,
    workerId: args.workerId,
  });

  return null;
}

export const wireBuilds = action({
  access: cloudflareWireBuildsContract.access,
  args: cloudflareWireBuildsContract.args,
  returns: cloudflareWireBuildsContract.returns,
  mcp: cloudflareWireBuildsContract.mcp,
  handler: async (ctx, args): Promise<null> => {
    return await wireCloudflareBuildsForUser(ctx, {
      ...args,
      userId: ctx.viewer.userId,
    });
  },
});

export async function wireCloudflareConvexBuildAccessForUser(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    workerId: Id<"vaultCloudflareWorkers">;
    convexDeploymentId: Id<"vaultConvexDeployments">;
  },
): Promise<null> {
  const userId = args.userId;
  const runId = await ctx.runMutation(internal.appProvisioningRuns.createForVault, {
    userId,
    vaultId: args.vaultId,
    trigger: "wire_convex_build_access",
  });
  await startCloudflareConvexBuildAccessWiringOrFail(ctx, {
    vaultId: args.vaultId,
    runId,
    userId,
    workerId: args.workerId,
    convexDeploymentId: args.convexDeploymentId,
  });

  return null;
}

export const wireConvexBuildAccess = action({
  access: cloudflareWireConvexBuildAccessContract.access,
  args: cloudflareWireConvexBuildAccessContract.args,
  returns: cloudflareWireConvexBuildAccessContract.returns,
  mcp: cloudflareWireConvexBuildAccessContract.mcp,
  handler: async (ctx, args): Promise<null> => {
    return await wireCloudflareConvexBuildAccessForUser(ctx, {
      ...args,
      userId: ctx.viewer.userId,
    });
  },
});

export async function verifyCloudflareInfrastructureForUser(
  ctx: Pick<ActionCtx, "runMutation" | "runQuery">,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    workerId: Id<"vaultCloudflareWorkers">;
  },
): Promise<null> {
  const userId = args.userId;
  await ctx.runQuery(
    internal.vault.cloudflareMutations.requireCloudflareInfrastructureVerificationVault,
    {
      vaultId: args.vaultId,
      userId,
      workerId: args.workerId,
    },
  );
  const runId = await ctx.runMutation(internal.appProvisioningRuns.createForVault, {
    userId,
    vaultId: args.vaultId,
    trigger: "verify_infrastructure",
  });
  await startCloudflareInfrastructureVerificationOrFail(ctx, {
    vaultId: args.vaultId,
    runId,
    userId,
    workerId: args.workerId,
  });

  return null;
}

export const verifyInfrastructure = action({
  access: cloudflareVerifyInfrastructureContract.access,
  args: cloudflareVerifyInfrastructureContract.args,
  returns: cloudflareVerifyInfrastructureContract.returns,
  mcp: cloudflareVerifyInfrastructureContract.mcp,
  handler: async (ctx, args): Promise<null> => {
    return await verifyCloudflareInfrastructureForUser(ctx, {
      ...args,
      userId: ctx.viewer.userId,
    });
  },
});

export const ensureCloudflareWorkerConnection = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
    accountId: string(),
    workerName: string(),
    origin: vVaultCloudflareOrigin,
  },
  returns: v.union(id("vaultCloudflareWorkers"), nullValue()),
  handler: async (ctx, args): Promise<Id<"vaultCloudflareWorkers"> | null> => {
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
          appId: args.appId,
        });
        const worker = await resolveSelectableExistingWorker({
          token: connection.token,
          transport: connection.transport,
          accountId: account.accountId,
          workerName: args.workerName,
          repositoryFullName: discoveryContext.repositoryFullName,
          expectedRepoId: discoveryContext.ghRepoId,
          expectedRootDirectory: discoveryContext.expectedRootDirectory,
          defaultBranch: discoveryContext.defaultBranch,
        });
        await rememberDefaultAccount(ctx, {
          userId: args.userId,
          auth: connection.auth,
          account,
          tokenHealth: connection.tokenHealth,
        });
        const attachment: CloudflareWorkerAttachment = await ctx.runMutation(
          internal.vault.cloudflareMutations.attachWorkerForRun,
          {
            vaultId: args.vaultId,
            runId: args.runId,
            userId: args.userId,
            appId: args.appId,
            accountId: account.accountId,
            workerName: worker.workerName,
            workerTag: worker.workerTag,
            workersDev: worker.workersDev,
            provenance: { state: "selected_existing", builds: worker.builds },
          },
        );
        if (attachment.state === "not_attached") {
          return null;
        }
        return attachment.workerId;
      }
      case "provisioned": {
        const validation = validateAppResourceName(args.workerName, "cloudflare");
        if (!validation.valid) {
          throw new Error(validation.message);
        }
        if (!(await isCloudflareWorkerConnectionRunActive(ctx, args))) {
          return null;
        }

        const existingCreationClaim = await ctx.runQuery(
          internal.vault.cloudflareMutations.readCloudflareWorkerCreationClaimForRun,
          {
            vaultId: args.vaultId,
            runId: args.runId,
            userId: args.userId,
            appId: args.appId,
          },
        );
        const available = existingCreationClaim
          ? true
          : await isCloudflareWorkerNameAvailable({
              token: connection.token,
              transport: connection.transport,
              accountId: account.accountId,
              workerName: validation.value,
            });
        if (!available) {
          throw new Error(
            `Cloudflare Worker name ${validation.value} already exists. Choose another Worker name and try again.`,
          );
        }
        let creationClaim =
          existingCreationClaim ??
          (await ctx.runMutation(internal.vault.cloudflareMutations.beginCloudflareWorkerCreation, {
            vaultId: args.vaultId,
            runId: args.runId,
            userId: args.userId,
            appId: args.appId,
            accountId: account.accountId,
            workerName: validation.value,
          }));
        if (
          creationClaim.accountId !== account.accountId ||
          creationClaim.workerName !== validation.value
        ) {
          throw new Error("Cloudflare Worker creation claim does not match this connection.");
        }
        let worker =
          creationClaim.lifecycle.state === "created"
            ? await readConfirmedCloudflareWorker({
                token: connection.token,
                transport: connection.transport,
                accountId: creationClaim.accountId,
                workerName: creationClaim.workerName,
                workerTag: creationClaim.lifecycle.workerTag,
              })
            : null;
        if (creationClaim.lifecycle.state === "created" && !worker) {
          creationClaim = await ctx.runMutation(
            internal.vault.cloudflareMutations.resetMissingCloudflareWorkerCreation,
            {
              vaultId: args.vaultId,
              runId: args.runId,
              userId: args.userId,
              appId: args.appId,
              creationClaimId: creationClaim.claimId,
              accountId: creationClaim.accountId,
              workerTag: creationClaim.lifecycle.workerTag,
            },
          );
        }
        worker ??= await createOrRecoverCloudflareWorker({
          token: connection.token,
          transport: connection.transport,
          accountId: creationClaim.accountId,
          workerName: creationClaim.workerName,
        }).catch((error: unknown) => {
          throw new Error(toErrorMessage(error));
        });
        if (worker.outcome === "confirmed_created") {
          await ctx.runMutation(internal.vault.cloudflareMutations.recordCreatedCloudflareWorker, {
            vaultId: args.vaultId,
            runId: args.runId,
            userId: args.userId,
            appId: args.appId,
            creationClaimId: creationClaim.claimId,
            accountId: creationClaim.accountId,
            workerName: creationClaim.workerName,
            workerTag: worker.workerTag,
          });
        }
        const attachmentInput =
          worker.outcome === "recovered_existing"
            ? await (async () => {
                const discoveryContext = await readCloudflareWorkerDiscoveryContext(ctx, {
                  vaultId: args.vaultId,
                  userId: args.userId,
                  appId: args.appId,
                });
                const recoveredWorker = await resolveSelectableExistingWorker({
                  token: connection.token,
                  transport: connection.transport,
                  accountId: account.accountId,
                  workerName: worker.workerName,
                  repositoryFullName: discoveryContext.repositoryFullName,
                  expectedRepoId: discoveryContext.ghRepoId,
                  expectedRootDirectory: discoveryContext.expectedRootDirectory,
                  defaultBranch: discoveryContext.defaultBranch,
                });
                return {
                  worker: recoveredWorker,
                  provenance: {
                    state: "recovered_existing" as const,
                    creationClaimId: creationClaim.claimId,
                    builds: recoveredWorker.builds,
                  },
                };
              })()
            : {
                worker,
                provenance: {
                  state: "provisioned" as const,
                  creationClaimId: creationClaim.claimId,
                },
              };
        await rememberDefaultAccount(ctx, {
          userId: args.userId,
          auth: connection.auth,
          account,
          tokenHealth: connection.tokenHealth,
        });
        const attachment: CloudflareWorkerAttachment = await ctx.runMutation(
          internal.vault.cloudflareMutations.attachWorkerForRun,
          {
            vaultId: args.vaultId,
            runId: args.runId,
            userId: args.userId,
            appId: args.appId,
            accountId: account.accountId,
            workerName: attachmentInput.worker.workerName,
            workerTag: attachmentInput.worker.workerTag,
            workersDev: attachmentInput.worker.workersDev,
            provenance: attachmentInput.provenance,
          },
        );
        if (attachment.state === "not_attached") {
          return null;
        }
        return attachment.workerId;
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
    workerId: id("vaultCloudflareWorkers"),
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
      recordApiCall: createProviderApiCallRecorder(ctx, {
        runId: args.runId,
        step: "wire_builds",
      }),
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
        workerId: args.workerId,
        builds: toVaultCloudflareConnectedBuilds(build),
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
    workerId: id("vaultCloudflareWorkers"),
    convexDeploymentId: id("vaultConvexDeployments"),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const active = await readActiveCloudflareConvexBuildAccessWiring(ctx, args);
    if (!active.active) {
      return null;
    }
    const { production: recordedProduction, preview: recordedPreview } =
      active.dependency.wiring.deployKeys;
    if (
      (recordedProduction.state !== "not_created" &&
        recordedProduction.teamId !== active.convex.teamId) ||
      (recordedPreview.state !== "not_created" && recordedPreview.teamId !== active.convex.teamId)
    ) {
      throw new Error(
        "Reconnect the Convex team that owns the recorded deploy keys and remove them before rewiring access.",
      );
    }

    const [cloudflareConnection, convexConnection, githubConnection] = await Promise.all([
      resolveCloudflareConnection(ctx, args.userId),
      resolveConvexProvisioningConnection(ctx, args.userId),
      resolveGitHubConnection(ctx, args.userId),
    ]);
    if (convexConnection.convexTeamId !== active.convex.teamId) {
      throw new Error("Reconnect the Convex team that owns this deployment before wiring access.");
    }
    const account = await resolveAccount(ctx, {
      token: cloudflareConnection.token,
      transport: cloudflareConnection.transport,
      accountId: active.worker.accountId,
    });
    const repositoryIdentity = await fetchGitHubRepoIdentity({
      githubAccessToken: githubConnection.githubAccessToken,
      owner: active.owner,
      repo: active.repo,
      expectedRepoId: active.ghRepoId,
    });
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "wire_convex_build_access",
    });
    const convexDeploymentVerification = await verifyConvexDeploymentExistence({
      convexToken: convexConnection.convexToken,
      teamId: active.convex.teamId,
      projectId: active.convex.projectId,
      deploymentName: active.convex.deploymentName,
      recordApiCall,
    });
    if (convexDeploymentVerification !== "confirmed") {
      throw new Error("Selected Convex production deployment is unavailable.");
    }
    const builds = await wireCloudflareWorkerBuilds({
      owner: active.owner,
      repo: active.repo,
      ghRepoId: active.ghRepoId,
      ghRepoOwnerId: repositoryIdentity.ownerId,
      defaultBranch: active.defaultBranch,
      triggerInitialBuild: false,
      vaultId: args.vaultId,
      workerName: active.worker.workerName,
      workerTag: active.worker.workerTag,
      cloudflareToken: cloudflareConnection.token,
      cloudflareAuthMethod: cloudflareConnection.auth.method,
      accountId: account.accountId,
      buildConfig: toCloudflareBuildConfig(active.buildConfig),
      recordApiCall,
    });
    const vaultBuilds = toVaultCloudflareConnectedBuilds(builds);
    const dependencyArgs = {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
      workerId: args.workerId,
      convexDeploymentId: args.convexDeploymentId,
    };
    // Convex deletes keys by name, so a superseded action must not share a name with a newer run.
    const deployKeyAttemptId = randomUUID();
    const productionDeployKeyName = `samebase-${deployKeyAttemptId}`;
    const previewDeployKeyName = `samebase-preview-${deployKeyAttemptId}`;
    const productionDeployKeyIdentity = {
      deployment: "production" as const,
      value: {
        teamId: active.convex.teamId,
        name: productionDeployKeyName,
        deploymentName: active.convex.deploymentName,
      },
    };
    const previewDeployKeyIdentity = {
      deployment: "preview" as const,
      value: {
        teamId: active.convex.teamId,
        name: previewDeployKeyName,
        projectId: active.convex.projectId,
      },
    };
    let productionDeployKeyMayExist = false;
    let previewDeployKeyMayExist = false;
    let productionDeployKey: Awaited<ReturnType<typeof createConvexDeployKey>> | null = null;
    let previewDeployKey: Awaited<ReturnType<typeof createConvexPreviewDeployKey>> | null = null;
    try {
      const recordedProductionDeployKey = active.dependency.wiring.deployKeys.production;
      if (recordedProductionDeployKey.state !== "not_created") {
        if (recordedProductionDeployKey.teamId !== convexConnection.convexTeamId) {
          throw new Error(
            "Reconnect the Convex team that owns the recorded production deploy key before rewiring access.",
          );
        }
        await deleteConvexBuildAccessDeployKey({
          convexToken: convexConnection.convexToken,
          deploymentName: recordedProductionDeployKey.deploymentName,
          convexDeployKeyName: recordedProductionDeployKey.name,
        });
        const { applied } = await ctx.runMutation(
          internal.vault.cloudflareMutations.clearCloudflareConvexBuildAccessDeployKey,
          {
            ...dependencyArgs,
            deployKey: {
              deployment: "production",
              value: {
                teamId: recordedProductionDeployKey.teamId,
                name: recordedProductionDeployKey.name,
                deploymentName: recordedProductionDeployKey.deploymentName,
              },
            },
          },
        );
        if (!applied) {
          throw new Error("Convex build access wiring was superseded.");
        }
      }

      const recordedPreviewDeployKey = active.dependency.wiring.deployKeys.preview;
      if (recordedPreviewDeployKey.state !== "not_created") {
        if (recordedPreviewDeployKey.teamId !== convexConnection.convexTeamId) {
          throw new Error(
            "Reconnect the Convex team that owns the recorded preview deploy key before rewiring access.",
          );
        }
        await deleteConvexBuildAccessPreviewDeployKey({
          convexToken: convexConnection.convexToken,
          projectId: recordedPreviewDeployKey.projectId,
          convexDeployKeyName: recordedPreviewDeployKey.name,
        });
        const { applied } = await ctx.runMutation(
          internal.vault.cloudflareMutations.clearCloudflareConvexBuildAccessDeployKey,
          {
            ...dependencyArgs,
            deployKey: {
              deployment: "preview",
              value: {
                teamId: recordedPreviewDeployKey.teamId,
                name: recordedPreviewDeployKey.name,
                projectId: recordedPreviewDeployKey.projectId,
              },
            },
          },
        );
        if (!applied) {
          throw new Error("Convex build access wiring was superseded.");
        }
      }

      const productionDeployKeyCreation = await ctx.runMutation(
        internal.vault.cloudflareMutations.beginCloudflareConvexBuildAccessDeployKeyCreation,
        {
          ...dependencyArgs,
          deployment: "production",
          convexDeployKeyName: productionDeployKeyName,
        },
      );
      if (!productionDeployKeyCreation.applied) {
        throw new Error("Convex build access wiring was superseded.");
      }
      productionDeployKeyMayExist = true;
      productionDeployKey = await createConvexDeployKey({
        convexToken: convexConnection.convexToken,
        convexAuthMethod: convexConnection.convexAuthMethod,
        deploymentName: active.convex.deploymentName,
        name: productionDeployKeyName,
      });
      const productionDeployKeyRecord = await ctx.runMutation(
        internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessDeployKey,
        {
          vaultId: args.vaultId,
          runId: args.runId,
          userId: args.userId,
          workerId: args.workerId,
          convexDeploymentId: args.convexDeploymentId,
          deployment: "production",
          convexDeployKeyName: productionDeployKeyName,
        },
      );
      if (!productionDeployKeyRecord.applied) {
        throw new Error("Convex build access wiring was superseded.");
      }

      const previewDeployKeyCreation = await ctx.runMutation(
        internal.vault.cloudflareMutations.beginCloudflareConvexBuildAccessDeployKeyCreation,
        {
          ...dependencyArgs,
          deployment: "preview",
          convexDeployKeyName: previewDeployKeyName,
        },
      );
      if (!previewDeployKeyCreation.applied) {
        throw new Error("Convex build access wiring was superseded.");
      }
      previewDeployKeyMayExist = true;
      previewDeployKey = await createConvexPreviewDeployKey({
        convexToken: convexConnection.convexToken,
        projectId: active.convex.projectId,
        name: previewDeployKeyName,
      });
      const previewDeployKeyRecord = await ctx.runMutation(
        internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessDeployKey,
        {
          vaultId: args.vaultId,
          runId: args.runId,
          userId: args.userId,
          workerId: args.workerId,
          convexDeploymentId: args.convexDeploymentId,
          deployment: "preview",
          convexDeployKeyName: previewDeployKeyName,
        },
      );
      if (!previewDeployKeyRecord.applied) {
        throw new Error("Convex build access wiring was superseded.");
      }

      await wireCloudflareWorkerConvexBuildAccess({
        defaultBranch: active.defaultBranch,
        expectedRepoId: active.ghRepoId,
        repositoryFullName: active.repositoryFullName,
        vaultId: args.vaultId,
        workerName: active.worker.workerName,
        workerTag: active.worker.workerTag,
        cloudflareToken: cloudflareConnection.token,
        cloudflareAuthMethod: cloudflareConnection.auth.method,
        accountId: account.accountId,
        build: builds,
        convex: {
          production: {
            deployKey: productionDeployKey.deployKey,
          },
          preview: {
            deployKey: previewDeployKey.deployKey,
          },
        },
        recordApiCall: createProviderApiCallRecorder(ctx, {
          runId: args.runId,
          step: "wire_convex_build_access",
        }),
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
          workerId: args.workerId,
          convexDeploymentId: args.convexDeploymentId,
          builds: vaultBuilds,
          buildConfig: {
            rootDirectory: builds.rootDirectory,
            buildCommand: builds.buildCommand,
            deployCommand: builds.deployCommand,
            previewDeployCommand: builds.previewDeployCommand,
            pathIncludes: builds.pathIncludes,
            pathExcludes: builds.pathExcludes,
          },
        },
      );
      if (!applied) {
        throw new Error("Convex build access wiring was superseded.");
      }
    } catch (error) {
      if (productionDeployKeyMayExist) {
        try {
          await deleteConvexBuildAccessDeployKey({
            convexToken: convexConnection.convexToken,
            deploymentName: productionDeployKeyIdentity.value.deploymentName,
            convexDeployKeyName: productionDeployKeyIdentity.value.name,
          });
          await ctx.runMutation(
            internal.vault.cloudflareMutations.clearCloudflareConvexBuildAccessDeployKey,
            {
              ...dependencyArgs,
              deployKey: productionDeployKeyIdentity,
            },
          );
        } catch (cleanupError) {
          console.warn("cloudflare:convex_build_access:production_key_cleanup_failed", {
            vaultId: args.vaultId,
            error: toErrorMessage(cleanupError),
          });
        }
      }
      if (previewDeployKeyMayExist) {
        try {
          await deleteConvexBuildAccessPreviewDeployKey({
            convexToken: convexConnection.convexToken,
            projectId: previewDeployKeyIdentity.value.projectId,
            convexDeployKeyName: previewDeployKeyIdentity.value.name,
          });
          await ctx.runMutation(
            internal.vault.cloudflareMutations.clearCloudflareConvexBuildAccessDeployKey,
            {
              ...dependencyArgs,
              deployKey: previewDeployKeyIdentity,
            },
          );
        } catch (cleanupError) {
          console.warn("cloudflare:convex_build_access:preview_key_cleanup_failed", {
            vaultId: args.vaultId,
            error: toErrorMessage(cleanupError),
          });
        }
      }
      throw error;
    }

    return null;
  },
});

export const ensureCloudflareInfrastructureVerification = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const active = await readActiveCloudflareInfrastructureVerification(ctx, args);
    if (!active.active) {
      return null;
    }

    let providerResult: CloudflareWorkerInfrastructureVerificationResult & {
      convexDeployment: ConvexDeploymentInfrastructureVerificationResult;
    };
    try {
      const cloudflareConnection = await resolveCloudflareConnection(ctx, args.userId);
      const account = await resolveAccount(ctx, {
        token: cloudflareConnection.token,
        transport: cloudflareConnection.transport,
        accountId: active.worker.accountId,
      });
      const recordApiCall = createProviderApiCallRecorder(ctx, {
        runId: args.runId,
        step: "verify_infrastructure",
      });
      const convexDeploymentVerification: Promise<ConvexDeploymentInfrastructureVerificationResult> =
        active.dependency
          ? verifyActiveConvexDeploymentInfrastructure(ctx, {
              userId: args.userId,
              teamId: active.dependency.convexDeployment.teamId,
              projectId: active.dependency.convexDeployment.projectId,
              deploymentName: active.dependency.convexDeployment.deploymentName,
              recordApiCall,
            })
          : Promise.resolve("not_checked");
      const [cloudflareVerification, convexDeploymentVerificationResult] = await Promise.allSettled(
        [
          verifyCloudflareWorkerInfrastructure({
            vaultId: args.vaultId,
            workerName: active.worker.workerName,
            workerTag: active.worker.workerTag,
            cloudflareToken: cloudflareConnection.token,
            cloudflareAuthMethod: cloudflareConnection.auth.method,
            accountId: account.accountId,
            defaultBranch: active.defaultBranch,
            expectedRepoId: active.ghRepoId,
            build: active.worker.builds,
            buildConfig: toCloudflareBuildConfig(active.buildConfig),
            verifyConvexBuildAccess: active.dependency !== null && active.dependency.currentlyWired,
            recordApiCall,
          }),
          convexDeploymentVerification,
        ],
      );
      if (cloudflareVerification.status === "rejected") {
        throw cloudflareVerification.reason;
      }
      if (convexDeploymentVerificationResult.status === "rejected") {
        throw convexDeploymentVerificationResult.reason;
      }
      providerResult = {
        ...cloudflareVerification.value,
        convexDeployment: convexDeploymentVerificationResult.value,
      };
    } catch (error) {
      const message = resolveInfrastructureVerificationUnverifiableMessage(error);
      if (!message) {
        throw error;
      }
      const { applied } = await ctx.runMutation(
        internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerificationUnverifiable,
        {
          vaultId: args.vaultId,
          runId: args.runId,
          userId: args.userId,
          workerId: args.workerId,
          message,
        },
      );
      if (!applied) {
        throw new Error("Infrastructure verification was superseded.");
      }
      return null;
    }

    const { applied } = await ctx.runMutation(
      internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        workerId: args.workerId,
        providerResult,
      },
    );
    if (!applied) {
      throw new Error("Infrastructure verification was superseded.");
    }

    return null;
  },
});
