"use node";

import { ConvexError, v, type Infer } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";
import { action } from "../functions";
import { toErrorMessage } from "../jsonUtils";
import {
  requireGitHubRepositoryOwnerId,
  resolveGitHubAppAccess,
  type GitHubAppAccess,
  type GitHubAppAccessTarget,
} from "../githubAppAccess";
import { createGitHubRepositoryInstallationOctokit, readGitHubAppInstallation } from "../githubApp";
import { resolveGitHubRepositoryById } from "../githubRepoApi";
import { organizationProviderCredentialAad } from "../organization/providerCredentialModel";
import { openSecret } from "../sealedSecret";
import { resolveGitHubUserOctokit } from "../githubUserAuthorizations";
import {
  toSafeGitHubRepositoryName,
  tryParseGitHubRepositoryFullName,
} from "../../shared/githubRepositoryName";
import { canAccess } from "../../shared/accessModel";
import { listConvexManagementProjects } from "../convexManagementApi/client";
import {
  buildAvailableAppResourceNameSuggestion,
  buildDefaultAppResourceName,
  validateAppResourceName,
  type AppResourceNameProvider,
} from "../../shared/appResourceNames";
import { createRepositoryContract, type CreateRepositoryArgs } from "./contracts/createRepository";
import { connectRepositoryContract } from "./contracts/connectRepository";

const { id, literal, object, string, union } = v;
const appResourceNameAvailability = object({
  status: union(literal("available"), literal("taken"), literal("invalid"), literal("unknown")),
  message: union(string(), v.null()),
  suggestion: union(string(), v.null()),
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
    throw new ConvexError(availability.message);
  }
  throw new ConvexError(`Could not verify ${providerLabel}.`);
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
    const candidate = toSafeGitHubRepositoryName(`${args.baseName}-${number}`);
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
    runId: Id<"workflow_repositoryProvisioning_runs">;
    logName: string;
    error: unknown;
    repositoryId: Id<"repositories">;
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
      repositoryId: args.repositoryId,
      message: toErrorMessage(markError),
    });
  }
}

async function markDeletionStartupFailed(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"workflow_repositoryDeletion_runs">;
    logName: string;
    error: unknown;
    repositoryId: Id<"repositories">;
  },
): Promise<void> {
  const message = toErrorMessage(args.error);
  try {
    await ctx.runMutation(internal.repository.deletion.runs.markWorkflowFailed, {
      runId: args.runId,
      message,
    });
  } catch (markError) {
    console.error(args.logName, {
      runId: args.runId,
      repositoryId: args.repositoryId,
      message: toErrorMessage(markError),
    });
  }
}

async function startRepositoryDeletionOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryDeletion_runs">;
    userId: Id<"users">;
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.repository.deletion.workflow.startRepositoryDeletion, {
      repositoryId: args.repositoryId,
      runId: args.runId,
      userId: args.userId,
    });
  } catch (error) {
    await markDeletionStartupFailed(ctx, {
      runId: args.runId,
      repositoryId: args.repositoryId,
      logName: "repository:delete:workflow_start_failure_mark_failed",
      error,
    });
    throw error;
  }
}

async function startConnectExistingRepositoryProvisioningOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    githubRepositoryDatabaseId: string;
  },
): Promise<void> {
  try {
    await ctx.runMutation(
      internal.repositoryProvisioningWorkflow.startConnectExistingRepositoryProvisioning,
      {
        repositoryId: args.repositoryId,
        runId: args.runId,
        userId: args.userId,
        githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      },
    );
  } catch (error) {
    await markProvisioningStartupFailed(ctx, {
      runId: args.runId,
      repositoryId: args.repositoryId,
      logName: "repository:connect:provisioning_start_failure_mark_failed",
      error,
    });
    throw error;
  }
}

async function checkGitHubRepositoryNameAvailability(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    repositoryName: string;
  },
): Promise<AppResourceNameAvailability> {
  const repositoryName = toSafeGitHubRepositoryName(args.repositoryName);
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
    console.warn("repository:create:github_repo_name_check_failed", {
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
  const convexToken =
    credential &&
    (
      await openSecret({
        sealed: credential.auth.credential,
        aad: organizationProviderCredentialAad(args.organizationId, "convex.auth.credential"),
      })
    ).trim();
  if (!credential || !convexToken || !convexTeamId) {
    throw new ConvexError(
      "Convex connection is required to provision infrastructure. Connect Convex and retry.",
    );
  }

  return {
    convexToken,
    convexAuthMethod: credential.auth.method,
    convexTeamId,
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
      suggestion: buildAvailableAppResourceNameSuggestion({
        provider: "convex",
        baseName: projectName,
        unavailableNames,
      }),
    });
  } catch (error) {
    console.warn("repository:create:convex_name_check_failed", {
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
    console.warn("repository:create:convex_name_check_failed", {
      message: toErrorMessage(error),
    });
    return buildUnknownResult("Could not check Convex project name.");
  }
}

async function checkCreateResourceNameAvailabilityForUser(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    githubRepositoryName: string;
    convexProjectName: string;
  },
): Promise<{
  github: AppResourceNameAvailability;
  convex: AppResourceNameAvailability;
}> {
  const [github, convex] = await Promise.all([
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
  ]);

  return { github, convex };
}

export type ConnectRepositoryResult = Infer<typeof connectRepositoryContract.returns>;

export async function connectRepositoryForUser(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: {
    userId: Id<"users">;
    target: GitHubAppAccessTarget;
    githubRepositoryDatabaseId: string;
  },
): Promise<ConnectRepositoryResult> {
  const userId = args.userId;
  const access = await resolveGitHubAppAccess(ctx, {
    userId,
    target: args.target,
  });
  const octokit = await createGitHubRepositoryInstallationOctokit(
    access.githubInstallationId,
    args.githubRepositoryDatabaseId,
  );
  const repository = await resolveGitHubRepositoryById({
    octokit,
    githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
  });
  requireGitHubRepositoryOwnerId({
    expectedOwnerId: access.githubOwnerId,
    repositoryOwnerId: repository.data.owner.id,
  });
  const owner = repository.data.owner.login;
  const name = repository.data.name;

  const { repositoryId, runId } = await ctx.runMutation(
    internal.repository.records.createInitializingExistingRepositoryForUser,
    {
      userId,
      organizationId: access.organizationId,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      githubOwnerLogin: owner,
      githubRepositoryName: name,
    },
  );
  await startConnectExistingRepositoryProvisioningOrFail(ctx, {
    repositoryId,
    runId,
    userId,
    githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
  });

  return {
    repositoryId,
    runId,
    githubRepositoryFullName: `${owner}/${name}`,
  };
}

/**
MCP callers name the GitHub repository as owner/name. The owner selects the Samebase organization,
and its GitHub App installation reads the repository's stable database ID.
*/
export async function connectRepositoryByFullNameForUser(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: { userId: Id<"users">; githubRepositoryFullName: string },
): Promise<ConnectRepositoryResult> {
  const fullName = tryParseGitHubRepositoryFullName(args.githubRepositoryFullName);
  if (fullName === null) {
    throw new ConvexError("Pass the GitHub repository as owner/name.");
  }
  const target: GitHubAppAccessTarget = { kind: "owner", githubOwnerLogin: fullName.owner };
  const access = await resolveGitHubAppAccess(ctx, { userId: args.userId, target });
  let githubRepositoryDatabaseId: string;
  try {
    const repository = await access.octokit.rest.repos.get({
      owner: fullName.owner,
      repo: fullName.name,
    });
    githubRepositoryDatabaseId = String(repository.data.id);
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) {
      throw new ConvexError(
        `The Samebase GitHub App cannot read ${fullName.owner}/${fullName.name}. Check the name, or give the app access to this repository in GitHub, then retry.`,
      );
    }
    throw error;
  }

  return await connectRepositoryForUser(ctx, {
    userId: args.userId,
    target,
    githubRepositoryDatabaseId,
  });
}

/** The Node half of `repository:connect`, which checks the viewer before it calls this action. */
export const connect = internalAction({
  args: {
    userId: id("users"),
    ...connectRepositoryContract.args,
  },
  returns: connectRepositoryContract.returns,
  handler: async (ctx, args): Promise<ConnectRepositoryResult> => {
    return await connectRepositoryForUser(ctx, {
      userId: args.userId,
      target: { kind: "organization", organizationId: args.organizationId },
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
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

  const githubRepositoryName = toSafeGitHubRepositoryName(args.githubRepositoryName);
  if (!githubRepositoryName) {
    throw new ConvexError("Repository name is required.");
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
  return await createRepositoryActionsAppForUser(ctx, {
    userId: args.userId,
    githubAccess,
    githubRepositoryName,
    description: args.description ?? null,
    visibility: args.private === false ? "public" : "private",
  });
}

/** GitHub's permission keys for the Secrets and Variables repository permissions. */
const REPOSITORY_ACTIONS_GITHUB_PERMISSIONS = [
  { key: "secrets", label: "Secrets" },
  { key: "actions_variables", label: "Variables" },
] as const;

/**
The creation of a repository: every check runs before anything is created. It needs the GitHub and
Convex connections and nothing else. The repository's GitHub Actions later create the Convex project
under the repository's name, so the name is fixed, its availability is checked now, and Samebase
writes no provider resource itself. The name check also proves that the Convex connection reads its
team, and that credential is what the repository's GitHub Actions later deploy with.
*/
async function createRepositoryActionsAppForUser(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: {
    userId: Id<"users">;
    githubAccess: GitHubAppAccess;
    githubRepositoryName: string;
    description: string | null;
    visibility: "private" | "public";
  },
): Promise<CreateRepositoryResult> {
  const { githubAccess } = args;
  const convexProjectName = buildDefaultAppResourceName({
    repositoryName: args.githubRepositoryName,
    provider: "convex",
  });

  const [installation, convexConnection] = await Promise.all([
    readGitHubAppInstallation(githubAccess.githubInstallationId),
    resolveOrganizationConvexProvisioningConnection(ctx, {
      userId: args.userId,
      organizationId: githubAccess.organizationId,
    }),
  ]);
  const missingPermissions = REPOSITORY_ACTIONS_GITHUB_PERMISSIONS.filter(
    (required) =>
      !installation.permissions.some(
        (permission) => permission.key === required.key && permission.access === "write",
      ),
  );
  if (missingPermissions.length > 0) {
    const installationsUrl =
      githubAccess.githubOwnerType === "organization"
        ? `https://github.com/organizations/${encodeURIComponent(githubAccess.githubOwnerLogin)}/settings/installations`
        : "https://github.com/settings/installations";
    throw new ConvexError(
      `The Samebase GitHub App installation for ${githubAccess.githubOwnerLogin} has not granted the ${missingPermissions.map((permission) => permission.label).join(" and ")} repository ${missingPermissions.length > 1 ? "permissions" : "permission"} (read and write). Accept the new permissions on the installation (${installationsUrl}), then create the repository again.`,
    );
  }

  const [githubNameAvailability, convexNameAvailability] = await Promise.all([
    checkGitHubRepositoryNameAvailability(ctx, {
      userId: args.userId,
      organizationId: githubAccess.organizationId,
      repositoryName: args.githubRepositoryName,
    }),
    checkConvexProjectNameAvailabilityForConnection({
      connection: convexConnection,
      projectName: convexProjectName,
    }),
  ]);
  assertResourceNameAvailable("GitHub repository name", githubNameAvailability);
  if (convexNameAvailability.status === "taken") {
    throw new ConvexError(
      `A Convex project named ${convexProjectName} already exists, and the GitHub Actions of the repository would use that name. Choose another repository name.`,
    );
  }
  assertResourceNameAvailable("Convex project name", convexNameAvailability);

  return await ctx.runMutation(
    internal.repository.records.createInitializingSamebaseManagedRepositoryForUser,
    {
      userId: args.userId,
      organizationId: githubAccess.organizationId,
      githubOwnerLogin: githubAccess.githubOwnerLogin,
      githubRepositoryName: args.githubRepositoryName,
      visibility: args.visibility,
      description: args.description,
      convexTeamId: convexConnection.convexTeamId,
    },
  );
}

/** The Node half of `repository:create`, which checks the viewer before it calls this action. */
export const create = internalAction({
  args: {
    userId: id("users"),
    ...createRepositoryContract.args,
  },
  returns: createRepositoryContract.returns,
  handler: async (ctx, args): Promise<CreateRepositoryResult> => {
    return await createAppForUser(ctx, {
      userId: args.userId,
      target: { kind: "organization", organizationId: args.organizationId },
      githubRepositoryName: args.githubRepositoryName,
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
  },
  returns: object({
    github: appResourceNameAvailability,
    convex: appResourceNameAvailability,
  }),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    return await checkCreateResourceNameAvailabilityForUser(ctx, {
      userId,
      organizationId: args.organizationId,
      githubRepositoryName: args.githubRepositoryName,
      convexProjectName: args.convexProjectName,
    });
  },
});

export const deleteRepository = action({
  access: "access_app_create",
  args: {
    repositoryId: v.id("repositories"),
    removeGithubRepo: v.optional(v.boolean()),
  },
  returns: v.object({
    deletionRunId: v.id("workflow_repositoryDeletion_runs"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ deletionRunId: Id<"workflow_repositoryDeletion_runs"> }> => {
    const userId = ctx.viewer.userId;
    const result: { deletionRunId: Id<"workflow_repositoryDeletion_runs"> } = await ctx.runMutation(
      internal.repository.deletion.runs.createInitialRun,
      {
        userId,
        repositoryId: args.repositoryId,
        options: {
          removeGithubRepo: args.removeGithubRepo ?? false,
        },
      },
    );
    const { deletionRunId } = result;
    await startRepositoryDeletionOrFail(ctx, {
      repositoryId: args.repositoryId,
      runId: deletionRunId,
      userId,
    });

    return { deletionRunId };
  },
});

export const retryDeleteRepository = action({
  access: "access_app_create",
  args: {
    runId: v.id("workflow_repositoryDeletion_runs"),
  },
  returns: v.object({
    deletionRunId: v.id("workflow_repositoryDeletion_runs"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ deletionRunId: Id<"workflow_repositoryDeletion_runs"> }> => {
    const userId = ctx.viewer.userId;
    const result: { deletionRunId: Id<"workflow_repositoryDeletion_runs"> } = await ctx.runMutation(
      internal.repository.deletion.runs.createRetryRun,
      {
        userId,
        failedRunId: args.runId,
      },
    );
    const { deletionRunId } = result;
    const retryRun = await ctx.runQuery(internal.repository.deletion.runs.getById, {
      runId: deletionRunId,
    });
    if (!retryRun) {
      throw new Error("Deletion retry run not found.");
    }
    await startRepositoryDeletionOrFail(ctx, {
      repositoryId: retryRun.repositoryId,
      runId: deletionRunId,
      userId,
    });

    return { deletionRunId };
  },
});
