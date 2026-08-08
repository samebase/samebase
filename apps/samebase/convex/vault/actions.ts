"use node";

import { v, type Infer } from "convex/values";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";
import { action } from "../functions";
import { toErrorMessage } from "../jsonUtils";
import {
  requireGitHubRepositoryOwnerId,
  resolveGitHubAppAccess,
  type GitHubAppAccessTarget,
} from "../githubAppAccess";
import { resolveGitHubUserOctokit } from "../githubUserAuthorizations";
import { parseRepositoryFullName } from "./model";
import { isLiveConnectedVault, isSamebaseManagedVault } from "./state";
import { toSafeRepoName } from "../../shared/repoName";
import { canAccess } from "../../shared/accessModel";
import { listConvexManagementProjects } from "../convexManagementApi/client";
import { resolveCloudflareApiTransport } from "../cloudflareApi/client";
import {
  isCloudflareMcpInvalidAccessTokenError,
  isCloudflareWorkerNameAvailable,
} from "../cloudflareResources";
import {
  buildNumberedAppResourceNameSuggestion,
  validateAppResourceName,
  type AppResourceNameProvider,
} from "../../shared/appResourceNames";
import { createRepositoryContract, type CreateRepositoryArgs } from "./contracts/createRepository";
import { connectRepositoryContract } from "./contracts/connectRepository";
import { retryInfrastructureProvisioningContract } from "./contracts/retryInfrastructureProvisioning";

const { id, literal, null: nullValue, object, string, union } = v;
const appResourceNameAvailability = object({
  status: union(literal("available"), literal("taken"), literal("invalid"), literal("unknown")),
  message: union(string(), nullValue()),
  suggestion: union(string(), nullValue()),
});

type AppResourceNameAvailability = Infer<typeof appResourceNameAvailability>;
export type CreateRepositoryResult = Infer<typeof createRepositoryContract.returns>;

function buildAvailableResult(): AppResourceNameAvailability {
  return {
    status: "available",
    message: null,
    suggestion: null,
  };
}

function buildInvalidResult(args: {
  message: string;
  suggestion: string | null;
}): AppResourceNameAvailability {
  return {
    status: "invalid",
    message: args.message,
    suggestion: args.suggestion,
  };
}

function buildTakenResult(args: {
  providerLabel: string;
  suggestion: string | null;
}): AppResourceNameAvailability {
  return {
    status: "taken",
    message: `${args.providerLabel} already exists.`,
    suggestion: args.suggestion,
  };
}

function buildUnknownResult(message: string): AppResourceNameAvailability {
  return {
    status: "unknown",
    message,
    suggestion: null,
  };
}

function assertResourceNameAvailable(
  providerLabel: string,
  availability: AppResourceNameAvailability,
): void {
  if (availability.status === "available") {
    return;
  }
  if (availability.message) {
    throw new Error(availability.message);
  }
  throw new Error(`Could not verify ${providerLabel}.`);
}

function validateCreateResourceName(
  provider: AppResourceNameProvider,
  name: string,
): { valid: true; value: string } | { valid: false; availability: AppResourceNameAvailability } {
  const validation = validateAppResourceName(name, provider);
  if (validation.valid) {
    return validation;
  }
  return {
    valid: false,
    availability: buildInvalidResult({
      message: validation.message,
      suggestion: validation.suggestion,
    }),
  };
}

function buildNumberedSuggestionFromUnavailableNames(args: {
  provider: AppResourceNameProvider;
  baseName: string;
  unavailableNames: ReadonlySet<string>;
}): string | null {
  for (let number = 2; number <= 20; number += 1) {
    const candidate = buildNumberedAppResourceNameSuggestion({
      provider: args.provider,
      baseName: args.baseName,
      number,
    });
    if (!args.unavailableNames.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function isGitHubRepositoryNameAvailable(args: {
  octokit: Octokit;
  owner: string;
  repositoryName: string;
}): Promise<boolean> {
  try {
    await args.octokit.rest.repos.get({
      owner: args.owner,
      repo: args.repositoryName,
    });
    return false;
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) {
      return true;
    }
    throw error;
  }
}

async function buildAvailableGitHubRepositoryNameSuggestion(args: {
  octokit: Octokit;
  owner: string;
  baseName: string;
}): Promise<string | null> {
  for (let number = 2; number <= 20; number += 1) {
    const candidate = toSafeRepoName(`${args.baseName}-${number}`);
    if (
      candidate &&
      (await isGitHubRepositoryNameAvailable({
        octokit: args.octokit,
        owner: args.owner,
        repositoryName: candidate,
      }))
    ) {
      return candidate;
    }
  }
  return null;
}

async function markProvisioningStartupFailed(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
    logName: string;
    error: unknown;
    vaultId: Id<"vaults">;
  },
): Promise<void> {
  const message = toErrorMessage(args.error);
  try {
    await ctx.runMutation(internal.infraProvisioning.markWorkflowStartupFailed, {
      runId: args.runId,
      message,
    });
  } catch (markError) {
    console.error(args.logName, {
      runId: args.runId,
      vaultId: args.vaultId,
      message: toErrorMessage(markError),
    });
  }
}

async function markDeletionStartupFailed(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"workflow_vaultDeletion_runs">;
    logName: string;
    error: unknown;
    vaultId: Id<"vaults">;
  },
): Promise<void> {
  const message = toErrorMessage(args.error);
  try {
    await ctx.runMutation(internal.vault.deletion.runs.markWorkflowFailed, {
      runId: args.runId,
      message,
    });
  } catch (markError) {
    console.error(args.logName, {
      runId: args.runId,
      vaultId: args.vaultId,
      message: toErrorMessage(markError),
    });
  }
}

async function startVaultDeletionOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultDeletion_runs">;
    userId: Id<"users">;
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.vault.deletion.workflow.startVaultDeletion, {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
    });
  } catch (error) {
    await markDeletionStartupFailed(ctx, {
      runId: args.runId,
      vaultId: args.vaultId,
      logName: "vault:delete:workflow_start_failure_mark_failed",
      error,
    });
    throw error;
  }
}

async function retryVaultDeletionForUser(
  ctx: Pick<ActionCtx, "runMutation" | "runQuery">,
  args: {
    failedRunId: Id<"workflow_vaultDeletion_runs">;
    mode: "same_plan" | "keep_upstream_resources";
    userId: Id<"users">;
  },
): Promise<{ deletionRunId: Id<"workflow_vaultDeletion_runs"> }> {
  const result: { deletionRunId: Id<"workflow_vaultDeletion_runs"> } = await ctx.runMutation(
    internal.vault.deletion.runs.createRetryRun,
    {
      userId: args.userId,
      failedRunId: args.failedRunId,
      mode: args.mode,
    },
  );
  const retryRun = await ctx.runQuery(internal.vault.deletion.runs.getById, {
    runId: result.deletionRunId,
  });
  if (!retryRun) {
    throw new Error("Deletion retry run not found.");
  }
  await startVaultDeletionOrFail(ctx, {
    vaultId: retryRun.vaultId,
    runId: result.deletionRunId,
    userId: args.userId,
  });

  return result;
}

async function startConnectExistingRepositoryProvisioningOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    ghRepoId: string;
    githubOwnerId: string;
    expectedGithubOwnerLogin: string;
    expectedRepositoryName: string;
  },
): Promise<void> {
  try {
    await ctx.runMutation(
      internal.appProvisioningWorkflow.startConnectExistingRepositoryProvisioning,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        repositoryName: args.repositoryName,
        repositoryOwner: args.repositoryOwner,
      },
    );
  } catch (error) {
    await markProvisioningStartupFailed(ctx, {
      runId: args.runId,
      vaultId: args.vaultId,
      logName: "vault:connect:provisioning_start_failure_mark_failed",
      error,
    });
    throw error;
  }
}

async function checkGitHubRepositoryNameAvailability(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    repositoryName: string;
  },
): Promise<AppResourceNameAvailability> {
  const repositoryName = toSafeRepoName(args.repositoryName);
  if (!repositoryName) {
    return buildInvalidResult({
      message: "GitHub repository name is required.",
      suggestion: null,
    });
  }
  try {
    const access = await resolveGitHubAppAccess(ctx, {
      userId: args.userId,
      target: { kind: "organization", organizationId: args.organizationId },
    });
    if (
      await isGitHubRepositoryNameAvailable({
        octokit: access.octokit,
        owner: access.githubOwnerLogin,
        repositoryName,
      })
    ) {
      return buildAvailableResult();
    }

    return buildTakenResult({
      providerLabel: "GitHub repository",
      suggestion: await buildAvailableGitHubRepositoryNameSuggestion({
        octokit: access.octokit,
        owner: access.githubOwnerLogin,
        baseName: repositoryName,
      }),
    });
  } catch (error) {
    console.warn("vault:create:github_repo_name_check_failed", {
      message: toErrorMessage(error),
    });
    return buildUnknownResult("Could not check GitHub repository name.");
  }
}

async function resolveOrganizationConvexProvisioningConnection(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
  },
) {
  const configuration = await ctx.runQuery(
    internal.organizationProviderCredentials.loadForOrganization,
    {
      userId: args.userId,
      organizationId: args.organizationId,
    },
  );
  const credential = configuration.convexCredential;
  const convexTeamId = configuration.convexTeam?.teamId.trim();
  const convexToken = credential?.auth.credential.trim();
  if (!credential || !convexToken || !convexTeamId) {
    throw new Error(
      "Convex connection is required to provision infrastructure. Connect Convex and retry.",
    );
  }

  return {
    convexToken,
    convexAuthMethod: credential.auth.method,
    convexTeamId,
  };
}

async function resolveOrganizationCloudflareProvisioningConnection(
  ctx: Pick<ActionCtx, "runAction" | "runQuery">,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    forceRefresh?: true;
  },
) {
  const resolved = await ctx.runAction(internal.cloudflareOAuth.resolveConnectionForOrganization, {
    userId: args.userId,
    organizationId: args.organizationId,
    forceRefresh: args.forceRefresh,
  });
  if (resolved === null) {
    throw new Error(
      "Cloudflare connection is required to provision infrastructure. Connect Cloudflare and retry.",
    );
  }

  const cloudflareToken = resolved.auth.credential.trim();
  if (!cloudflareToken) {
    throw new Error(
      "Cloudflare connection is required to provision infrastructure. Connect Cloudflare and retry.",
    );
  }
  const cloudflareAccountId = resolved.account.accountId.trim();
  if (!cloudflareAccountId) {
    throw new Error(
      "Cloudflare connection is required to provision infrastructure. Connect Cloudflare and retry.",
    );
  }

  return {
    cloudflareToken,
    cloudflareAuthMethod: resolved.auth.method,
    cloudflareAccountId,
  };
}

async function checkConvexProjectNameAvailabilityForConnection(args: {
  connection: Awaited<ReturnType<typeof resolveOrganizationConvexProvisioningConnection>>;
  projectName: string;
}): Promise<AppResourceNameAvailability> {
  const validation = validateCreateResourceName("convex", args.projectName);
  if (!validation.valid) {
    return validation.availability;
  }
  const projectName = validation.value;

  try {
    const projects = await listConvexManagementProjects({
      token: args.connection.convexToken,
      teamId: args.connection.convexTeamId,
    });
    const unavailableNames = new Set<string>();
    for (const project of projects) {
      unavailableNames.add(project.name);
      unavailableNames.add(project.slug);
    }

    if (!unavailableNames.has(projectName)) {
      return buildAvailableResult();
    }

    return buildTakenResult({
      providerLabel: "Convex project",
      suggestion: buildNumberedSuggestionFromUnavailableNames({
        provider: "convex",
        baseName: projectName,
        unavailableNames,
      }),
    });
  } catch (error) {
    console.warn("vault:create:convex_name_check_failed", {
      message: toErrorMessage(error),
    });
    return buildUnknownResult("Could not check Convex project name.");
  }
}

async function checkConvexProjectNameAvailability(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    projectName: string;
  },
): Promise<AppResourceNameAvailability> {
  const validation = validateCreateResourceName("convex", args.projectName);
  if (!validation.valid) {
    return validation.availability;
  }

  try {
    return await checkConvexProjectNameAvailabilityForConnection({
      connection: await resolveOrganizationConvexProvisioningConnection(ctx, {
        userId: args.userId,
        organizationId: args.organizationId,
      }),
      projectName: args.projectName,
    });
  } catch (error) {
    console.warn("vault:create:convex_name_check_failed", {
      message: toErrorMessage(error),
    });
    return buildUnknownResult("Could not check Convex project name.");
  }
}

async function buildAvailableCloudflareWorkerNameSuggestion(args: {
  token: string;
  transport: "mcp" | "direct";
  accountId: string;
  baseName: string;
}): Promise<string | null> {
  for (let number = 2; number <= 20; number += 1) {
    const candidate = buildNumberedAppResourceNameSuggestion({
      provider: "cloudflare",
      baseName: args.baseName,
      number,
    });
    if (
      await isCloudflareWorkerNameAvailable({
        token: args.token,
        transport: args.transport,
        accountId: args.accountId,
        workerName: candidate,
      })
    ) {
      return candidate;
    }
  }
  return null;
}

async function readCloudflareWorkerNameAvailability(args: {
  connection: Awaited<ReturnType<typeof resolveOrganizationCloudflareProvisioningConnection>>;
  workerName: string;
}): Promise<AppResourceNameAvailability> {
  const available = await isCloudflareWorkerNameAvailable({
    token: args.connection.cloudflareToken,
    transport: resolveCloudflareApiTransport(args.connection.cloudflareAuthMethod),
    accountId: args.connection.cloudflareAccountId,
    workerName: args.workerName,
  });
  if (available) {
    return buildAvailableResult();
  }

  return buildTakenResult({
    providerLabel: "Cloudflare Worker",
    suggestion: await buildAvailableCloudflareWorkerNameSuggestion({
      token: args.connection.cloudflareToken,
      transport: resolveCloudflareApiTransport(args.connection.cloudflareAuthMethod),
      accountId: args.connection.cloudflareAccountId,
      baseName: args.workerName,
    }),
  });
}

async function checkCloudflareWorkerNameAvailability(
  ctx: Pick<ActionCtx, "runAction" | "runQuery">,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    workerName: string;
  },
): Promise<AppResourceNameAvailability> {
  const validation = validateCreateResourceName("cloudflare", args.workerName);
  if (!validation.valid) {
    return validation.availability;
  }

  try {
    const connection = await resolveOrganizationCloudflareProvisioningConnection(ctx, args);
    return await checkCloudflareWorkerNameAvailabilityForConnection(ctx, {
      userId: args.userId,
      organizationId: args.organizationId,
      workerName: args.workerName,
      connection,
    });
  } catch (error) {
    console.warn("vault:create:cloudflare_name_check_failed", {
      message: toErrorMessage(error),
    });
    return buildUnknownResult("Could not check Cloudflare Worker name.");
  }
}

async function checkCloudflareWorkerNameAvailabilityForConnection(
  ctx: Pick<ActionCtx, "runAction" | "runQuery">,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    workerName: string;
    connection: Awaited<ReturnType<typeof resolveOrganizationCloudflareProvisioningConnection>>;
  },
): Promise<AppResourceNameAvailability> {
  const validation = validateCreateResourceName("cloudflare", args.workerName);
  if (!validation.valid) {
    return validation.availability;
  }

  try {
    try {
      return await readCloudflareWorkerNameAvailability({
        connection: args.connection,
        workerName: validation.value,
      });
    } catch (error) {
      if (
        args.connection.cloudflareAuthMethod !== "api_key" &&
        isCloudflareMcpInvalidAccessTokenError(error)
      ) {
        const connection = await resolveOrganizationCloudflareProvisioningConnection(ctx, {
          userId: args.userId,
          organizationId: args.organizationId,
          forceRefresh: true,
        });
        return await readCloudflareWorkerNameAvailability({
          connection: {
            ...connection,
            cloudflareAccountId: args.connection.cloudflareAccountId,
          },
          workerName: validation.value,
        });
      }
      throw error;
    }
  } catch (error) {
    console.warn("vault:create:cloudflare_name_check_failed", {
      message: toErrorMessage(error),
    });
    return buildUnknownResult("Could not check Cloudflare Worker name.");
  }
}

async function checkCreateResourceNameAvailabilityForUser(
  ctx: Pick<ActionCtx, "runAction" | "runQuery">,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    githubRepositoryName: string;
    convexProjectName: string;
    cloudflareWorkerName: string;
  },
): Promise<{
  github: AppResourceNameAvailability;
  convex: AppResourceNameAvailability;
  cloudflare: AppResourceNameAvailability;
}> {
  const [github, convex, cloudflare] = await Promise.all([
    checkGitHubRepositoryNameAvailability(ctx, {
      userId: args.userId,
      organizationId: args.organizationId,
      repositoryName: args.githubRepositoryName,
    }),
    checkConvexProjectNameAvailability(ctx, {
      userId: args.userId,
      organizationId: args.organizationId,
      projectName: args.convexProjectName,
    }),
    checkCloudflareWorkerNameAvailability(ctx, {
      userId: args.userId,
      organizationId: args.organizationId,
      workerName: args.cloudflareWorkerName,
    }),
  ]);

  return { github, convex, cloudflare };
}

export type ConnectRepositoryResult = Infer<typeof connectRepositoryContract.returns>;

export async function connectRepositoryForUser(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: {
    userId: Id<"users">;
    target: GitHubAppAccessTarget;
    repositoryFullName: string;
  },
): Promise<ConnectRepositoryResult> {
  const userId = args.userId;
  const requestedRepository = parseRepositoryFullName(args.repositoryFullName);
  const access = await resolveGitHubAppAccess(ctx, {
    userId,
    target: args.target,
  });
  const repository = await access.octokit.rest.repos.get({
    owner: requestedRepository.owner,
    repo: requestedRepository.name,
  });
  requireGitHubRepositoryOwnerId({
    expectedOwnerId: access.githubOwnerId,
    repositoryOwnerId: repository.data.owner.id,
  });
  const ghRepoId = String(repository.data.id);
  const owner = repository.data.owner.login;
  const name = repository.data.name;

  const { vaultId, runId } = await ctx.runMutation(
    internal.vault.records.createInitializingExistingRepositoryVaultForUser,
    {
      userId,
      organizationId: access.organizationId,
      ghRepoOwner: owner,
      ghRepoName: name,
    },
  );
  await startConnectExistingRepositoryProvisioningOrFail(ctx, {
    vaultId,
    runId,
    userId,
    ghRepoId,
    githubOwnerId: access.githubOwnerId,
    expectedGithubOwnerLogin: access.githubOwnerLogin,
    expectedRepositoryName: name,
  });

  return { vaultId, runId };
}

export const connectRepository = action({
  access: connectRepositoryContract.access,
  args: connectRepositoryContract.args,
  returns: connectRepositoryContract.returns,
  mcp: connectRepositoryContract.mcp,
  handler: async (ctx, args): Promise<ConnectRepositoryResult> => {
    return await connectRepositoryForUser(ctx, {
      userId: ctx.viewer.userId,
      target: { kind: "organization", organizationId: args.organizationId },
      repositoryFullName: args.repositoryFullName,
    });
  },
});

export async function createAppForUser(
  ctx: Pick<ActionCtx, "runAction" | "runQuery" | "runMutation">,
  args: Omit<CreateRepositoryArgs, "organizationId"> & {
    userId: Id<"users">;
    target: GitHubAppAccessTarget;
  },
): Promise<CreateRepositoryResult> {
  const viewer = await ctx.runQuery(internal.functions.resolveViewerForUserId, {
    userId: args.userId,
  });
  if (viewer.user === null || !canAccess(createRepositoryContract.access, viewer.accessKeys)) {
    throw new Error("Access denied");
  }

  const repoName = toSafeRepoName(args.name);
  if (!repoName) {
    throw new Error("Repository name is required.");
  }
  const githubAccess = await resolveGitHubAppAccess(ctx, {
    userId: args.userId,
    target: args.target,
  });
  if (githubAccess.githubOwnerType === "user") {
    await resolveGitHubUserOctokit(ctx, {
      userId: args.userId,
      githubUserId: githubAccess.githubOwnerId,
    });
  }

  const convexNameValidation = validateCreateResourceName("convex", args.convexProjectName);
  if (!convexNameValidation.valid) {
    throw new Error(convexNameValidation.availability.message ?? "Invalid Convex project name.");
  }
  const cloudflareNameValidation = validateCreateResourceName(
    "cloudflare",
    args.cloudflareWorkerName,
  );
  if (!cloudflareNameValidation.valid) {
    throw new Error(
      cloudflareNameValidation.availability.message ?? "Invalid Cloudflare Worker name.",
    );
  }

  const [convexConnection, cloudflareConnection] = await Promise.all([
    resolveOrganizationConvexProvisioningConnection(ctx, {
      userId: args.userId,
      organizationId: githubAccess.organizationId,
    }),
    resolveOrganizationCloudflareProvisioningConnection(ctx, {
      userId: args.userId,
      organizationId: githubAccess.organizationId,
    }),
  ]);
  const [githubNameAvailability, convexNameAvailability, cloudflareNameAvailability] =
    await Promise.all([
      checkGitHubRepositoryNameAvailability(ctx, {
        userId: args.userId,
        organizationId: githubAccess.organizationId,
        repositoryName: repoName,
      }),
      checkConvexProjectNameAvailabilityForConnection({
        connection: convexConnection,
        projectName: convexNameValidation.value,
      }),
      checkCloudflareWorkerNameAvailabilityForConnection(ctx, {
        userId: args.userId,
        organizationId: githubAccess.organizationId,
        workerName: cloudflareNameValidation.value,
        connection: cloudflareConnection,
      }),
    ]);
  assertResourceNameAvailable("GitHub repository name", githubNameAvailability);
  assertResourceNameAvailable("Convex project name", convexNameAvailability);
  assertResourceNameAvailable("Cloudflare Worker name", cloudflareNameAvailability);

  const visibility = args.private === false ? "public" : "private";
  const { vaultId, runId } = await ctx.runMutation(
    internal.vault.records.createInitializingSamebaseManagedVaultForUser,
    {
      userId: args.userId,
      organizationId: githubAccess.organizationId,
      ghRepoOwner: githubAccess.githubOwnerLogin,
      ghRepoName: repoName,
      visibility,
      description: args.description ?? null,
      convexProjectName: convexNameValidation.value,
      convexTeamId: convexConnection.convexTeamId,
      cloudflareAccountId: cloudflareConnection.cloudflareAccountId,
      cloudflareWorkerName: cloudflareNameValidation.value,
    },
  );

  return { vaultId, runId };
}

// TODO: rename to createApp since we don't just create a repository
export const createRepository = action({
  access: createRepositoryContract.access,
  args: createRepositoryContract.args,
  returns: createRepositoryContract.returns,
  mcp: createRepositoryContract.mcp,
  handler: async (ctx, args): Promise<CreateRepositoryResult> => {
    return await createAppForUser(ctx, {
      userId: ctx.viewer.userId,
      target: { kind: "organization", organizationId: args.organizationId },
      name: args.name,
      convexProjectName: args.convexProjectName,
      cloudflareWorkerName: args.cloudflareWorkerName,
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.private !== undefined ? { private: args.private } : {}),
    });
  },
});

export const checkCreateRepositoryResourceNames = action({
  access: "access_app_create",
  args: {
    organizationId: id("organizations"),
    githubRepositoryName: string(),
    convexProjectName: string(),
    cloudflareWorkerName: string(),
  },
  returns: object({
    github: appResourceNameAvailability,
    convex: appResourceNameAvailability,
    cloudflare: appResourceNameAvailability,
  }),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    return await checkCreateResourceNameAvailabilityForUser(ctx, {
      userId,
      organizationId: args.organizationId,
      githubRepositoryName: args.githubRepositoryName,
      convexProjectName: args.convexProjectName,
      cloudflareWorkerName: args.cloudflareWorkerName,
    });
  },
});

export async function retryInfrastructureProvisioningForUser(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: { userId: Id<"users">; vaultId: Id<"vaults"> },
): Promise<null> {
  const userId = args.userId;
  const vault = await ctx.runQuery(internal.vault.records.getByIdForUser, {
    userId,
    vaultId: args.vaultId,
  });
  if (!vault) {
    throw new Error("Vault not found");
  }
  if (!isLiveConnectedVault(vault) || !isSamebaseManagedVault(vault)) {
    throw new Error("Infrastructure retry is available only for live Samebase-managed vaults");
  }
  await ctx.runMutation(internal.appProvisioningRuns.createRetryForVault, {
    userId,
    vaultId: args.vaultId,
  });

  return null;
}

export const retryInfrastructureProvisioning = action({
  access: retryInfrastructureProvisioningContract.access,
  args: retryInfrastructureProvisioningContract.args,
  returns: retryInfrastructureProvisioningContract.returns,
  mcp: retryInfrastructureProvisioningContract.mcp,
  handler: async (ctx, args): Promise<null> => {
    return await retryInfrastructureProvisioningForUser(ctx, {
      ...args,
      userId: ctx.viewer.userId,
    });
  },
});

export const deleteVault = action({
  access: "access_app_create",
  args: {
    vaultId: v.id("vaults"),
    removeGithubRepo: v.optional(v.boolean()),
    removeConvexProvision: v.optional(v.boolean()),
    removeCloudflareProvision: v.optional(v.boolean()),
  },
  returns: v.object({
    deletionRunId: v.id("workflow_vaultDeletion_runs"),
  }),
  handler: async (ctx, args): Promise<{ deletionRunId: Id<"workflow_vaultDeletion_runs"> }> => {
    const userId = ctx.viewer.userId;
    const result: { deletionRunId: Id<"workflow_vaultDeletion_runs"> } = await ctx.runMutation(
      internal.vault.deletion.runs.createInitialRun,
      {
        userId,
        vaultId: args.vaultId,
        options: {
          removeGithubRepo: args.removeGithubRepo ?? false,
          removeConvexProvision: args.removeConvexProvision ?? false,
          removeCloudflareProvision: args.removeCloudflareProvision ?? false,
        },
      },
    );
    const { deletionRunId } = result;
    await startVaultDeletionOrFail(ctx, {
      vaultId: args.vaultId,
      runId: deletionRunId,
      userId,
    });

    return { deletionRunId };
  },
});

export const retryDeleteVault = action({
  access: "access_app_create",
  args: {
    runId: v.id("workflow_vaultDeletion_runs"),
  },
  returns: v.object({
    deletionRunId: v.id("workflow_vaultDeletion_runs"),
  }),
  handler: async (ctx, args): Promise<{ deletionRunId: Id<"workflow_vaultDeletion_runs"> }> => {
    return await retryVaultDeletionForUser(ctx, {
      failedRunId: args.runId,
      mode: "same_plan",
      userId: ctx.viewer.userId,
    });
  },
});

export const removeFailedVaultFromSamebase = action({
  access: "access_app_create",
  args: {
    runId: v.id("workflow_vaultDeletion_runs"),
  },
  returns: v.object({
    deletionRunId: v.id("workflow_vaultDeletion_runs"),
  }),
  handler: async (ctx, args): Promise<{ deletionRunId: Id<"workflow_vaultDeletion_runs"> }> => {
    return await retryVaultDeletionForUser(ctx, {
      failedRunId: args.runId,
      mode: "keep_upstream_resources",
      userId: ctx.viewer.userId,
    });
  },
});
