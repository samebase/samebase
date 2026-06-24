"use node";

import { v, type Infer } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";
import { action } from "../functions";
import { toErrorMessage } from "../jsonUtils";
import { parseRepositoryFullName } from "./model";
import { isLiveConnectedVault, isSamebaseManagedVault } from "./state";
import { toSafeRepoName } from "../../shared/repoName";
import { requestConvexManagementApi } from "../convexManagementApi/client";
import { resolveCloudflareApiTransport } from "../cloudflareApi/client";
import {
  resolveCloudflareProvisioningConnection,
  resolveConvexProvisioningConnection,
} from "../infraProvisioning";
import {
  isCloudflareMcpInvalidAccessTokenError,
  isCloudflareWorkerNameAvailable,
} from "../cloudflareResources";
import {
  buildNumberedAppResourceNameSuggestion,
  validateAppResourceName,
  type AppResourceNameProvider,
} from "../../shared/appResourceNames";

const { array, boolean, literal, null: nullValue, object, optional, string, union } = v;
const githubRepositoryOwnerKind = union(literal("user"), literal("organization"));
const githubRepositoryOwnerOption = object({
  login: string(),
  kind: githubRepositoryOwnerKind,
  canCreateRepository: boolean(),
});
const appResourceNameAvailability = object({
  status: union(literal("available"), literal("taken"), literal("invalid"), literal("unknown")),
  message: union(string(), nullValue()),
  suggestion: union(string(), nullValue()),
});

type AppResourceNameAvailability = Infer<typeof appResourceNameAvailability>;
type GitHubRepositoryOwnerOption = Infer<typeof githubRepositoryOwnerOption>;
type CreateAppArgs = {
  name: string;
  owner: string;
  convexProjectName: string;
  cloudflareWorkerName: string;
  description?: string;
  private?: boolean;
};
type CreateAppResult = { vaultId: Id<"vaults">; runId: Id<"appProvisioningRuns"> };

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

async function listGitHubRepositoryOwnerOptions(args: {
  octokit: Octokit;
  username: string;
}): Promise<GitHubRepositoryOwnerOption[]> {
  const memberships = await args.octokit.rest.orgs.listMembershipsForAuthenticatedUser({
    state: "active",
    per_page: 100,
  });
  const organizationOwners = memberships.data
    .map((membership) => ({
      login: membership.organization.login,
      kind: "organization" as const,
      canCreateRepository:
        membership.permissions?.can_create_repository ?? membership.role === "admin",
    }))
    .filter((owner) => owner.login.length > 0)
    .sort((left, right) => left.login.localeCompare(right.login));

  return [
    {
      login: args.username,
      kind: "user",
      canCreateRepository: true,
    },
    ...organizationOwners,
  ];
}

function resolveGitHubRepositoryCreateOwner(args: {
  owner: string;
  ownerOptions: GitHubRepositoryOwnerOption[];
}): string {
  const selectedOwner = args.owner.trim();
  const ownerOption = args.ownerOptions.find(
    (option) => option.login.toLowerCase() === selectedOwner.toLowerCase(),
  );
  if (!ownerOption) {
    throw new Error(`GitHub owner ${selectedOwner} is not available to this account.`);
  }
  if (!ownerOption.canCreateRepository) {
    throw new Error(
      `Your GitHub account cannot create repositories under ${ownerOption.login}. Choose your user account or an organization where you can create repositories.`,
    );
  }
  return ownerOption.login;
}

async function markProvisioningStartupFailed(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"appProvisioningRuns">;
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

async function startVaultInfrastructureProvisioningOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    force: boolean;
  },
): Promise<void> {
  try {
    await ctx.runMutation(
      internal.appProvisioningWorkflow.startVaultInfrastructureProvisioning,
      args,
    );
  } catch (error) {
    await markProvisioningStartupFailed(ctx, {
      runId: args.runId,
      vaultId: args.vaultId,
      logName: "vault:provisioning_start_failure_mark_failed",
      error,
    });
    throw error;
  }
}

async function markDeletionStartupFailed(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"vaultDeletionRuns">;
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
    runId: Id<"vaultDeletionRuns">;
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

async function startCreateAppProvisioningOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    repositoryName: string;
    repositoryOwner: string;
    description: string | null;
    private: boolean;
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.appProvisioningWorkflow.startCreateAppProvisioning, args);
  } catch (error) {
    await markProvisioningStartupFailed(ctx, {
      runId: args.runId,
      vaultId: args.vaultId,
      logName: "vault:create:provisioning_start_failure_mark_failed",
      error,
    });
    throw error;
  }
}

async function startConnectExistingRepositoryProvisioningOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    repositoryName: string;
    repositoryOwner: string;
  },
): Promise<void> {
  try {
    await ctx.runMutation(
      internal.appProvisioningWorkflow.startConnectExistingRepositoryProvisioning,
      args,
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
    owner: string;
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
  const owner = args.owner.trim();
  if (!owner) {
    return buildInvalidResult({
      message: "Choose a GitHub owner before checking repository names.",
      suggestion: null,
    });
  }

  try {
    const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: args.userId,
      kind: "github",
    });
    if (githubConnection?.kind !== "github") {
      return buildUnknownResult("Could not check GitHub repository name.");
    }

    const octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });
    if (
      await isGitHubRepositoryNameAvailable({
        octokit,
        owner,
        repositoryName,
      })
    ) {
      return buildAvailableResult();
    }

    return buildTakenResult({
      providerLabel: "GitHub repository",
      suggestion: await buildAvailableGitHubRepositoryNameSuggestion({
        octokit,
        owner,
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

async function checkConvexProjectNameAvailability(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    userId: Id<"users">;
    projectName: string;
  },
): Promise<AppResourceNameAvailability> {
  const validation = validateCreateResourceName("convex", args.projectName);
  if (!validation.valid) {
    return validation.availability;
  }
  const projectName = validation.value;

  try {
    const { convexToken, convexTeamId } = await resolveConvexProvisioningConnection(
      ctx,
      args.userId,
    );
    const projects = await requestConvexManagementApi(
      convexToken,
      "GET",
      "/teams/{team_id}/list_projects",
      { params: { path: { team_id: convexTeamId } } },
    );
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
  connection: Awaited<ReturnType<typeof resolveCloudflareProvisioningConnection>>;
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
  ctx: Pick<ActionCtx, "runAction">,
  args: {
    userId: Id<"users">;
    workerName: string;
  },
): Promise<AppResourceNameAvailability> {
  const validation = validateCreateResourceName("cloudflare", args.workerName);
  if (!validation.valid) {
    return validation.availability;
  }
  const workerName = validation.value;

  try {
    const connection = await resolveCloudflareProvisioningConnection(ctx, args.userId);
    try {
      return await readCloudflareWorkerNameAvailability({
        connection,
        workerName,
      });
    } catch (error) {
      if (
        connection.cloudflareAuthMethod !== "api_key" &&
        isCloudflareMcpInvalidAccessTokenError(error)
      ) {
        const refreshedConnection = await resolveCloudflareProvisioningConnection(
          ctx,
          args.userId,
          {
            forceRefresh: true,
          },
        );
        return await readCloudflareWorkerNameAvailability({
          connection: refreshedConnection,
          workerName,
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
    githubRepositoryOwner: string;
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
      owner: args.githubRepositoryOwner,
      repositoryName: args.githubRepositoryName,
    }),
    checkConvexProjectNameAvailability(ctx, {
      userId: args.userId,
      projectName: args.convexProjectName,
    }),
    checkCloudflareWorkerNameAvailability(ctx, {
      userId: args.userId,
      workerName: args.cloudflareWorkerName,
    }),
  ]);

  return { github, convex, cloudflare };
}

async function resolveGithubConnectionUsername(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    connection: Extract<Doc<"providerConnections">, { kind: "github" }>;
    userId: Id<"users">;
  },
): Promise<string> {
  if (args.connection.username) {
    return args.connection.username;
  }

  const octokit = new Octokit({
    auth: args.connection.auth.credential,
  });
  const { data } = await octokit.rest.users.getAuthenticated();
  const username = data.login;
  if (!username) {
    throw new Error("GitHub connection is missing an account login.");
  }

  await ctx.runMutation(internal.providerConnections.upsertGithub, {
    userId: args.userId,
    auth: args.connection.auth,
    username,
  });

  return username;
}

export const listRepositoryOwners = action({
  access: "access_repo_connect",
  args: {},
  returns: array(githubRepositoryOwnerOption),
  handler: async (ctx): Promise<GitHubRepositoryOwnerOption[]> => {
    const userId = ctx.viewer.userId;
    const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId,
      kind: "github",
    });
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected.");
    }

    const username = await resolveGithubConnectionUsername(ctx, {
      connection: githubConnection,
      userId,
    });
    const octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });
    return await listGitHubRepositoryOwnerOptions({ octokit, username });
  },
});

export const connectRepository = action({
  access: "access_repo_connect",
  args: {
    repositoryFullName: v.string(),
  },
  returns: v.object({
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
  }> => {
    const userId = ctx.viewer.userId;
    const { owner, name } = parseRepositoryFullName(args.repositoryFullName);
    const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId,
      kind: "github",
    });
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const { vaultId, runId } = await ctx.runMutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        userId,
        ghRepoOwner: owner,
        ghRepoName: name,
      },
    );
    await startConnectExistingRepositoryProvisioningOrFail(ctx, {
      vaultId,
      runId,
      userId,
      repositoryOwner: owner,
      repositoryName: name,
    });

    return { vaultId, runId };
  },
});

async function createAppForUser(
  ctx: Pick<ActionCtx, "runAction" | "runQuery" | "runMutation">,
  args: CreateAppArgs & { userId: Id<"users"> },
): Promise<CreateAppResult> {
  const repoName = toSafeRepoName(args.name);
  if (!repoName) {
    throw new Error("Repository name is required.");
  }
  const ghRepoOwnerInput = args.owner.trim();
  if (!ghRepoOwnerInput) {
    throw new Error("GitHub owner is required.");
  }

  const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
    userId: args.userId,
    kind: "github",
  });
  if (githubConnection?.kind !== "github") {
    throw new Error("GitHub is not connected.");
  }
  const githubUsername = await resolveGithubConnectionUsername(ctx, {
    connection: githubConnection,
    userId: args.userId,
  });
  const githubOctokit = new Octokit({
    auth: githubConnection.auth.credential,
  });
  const ghRepoOwner = resolveGitHubRepositoryCreateOwner({
    owner: ghRepoOwnerInput,
    ownerOptions: await listGitHubRepositoryOwnerOptions({
      octokit: githubOctokit,
      username: githubUsername,
    }),
  });

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

  const resourceNameAvailability = await checkCreateResourceNameAvailabilityForUser(ctx, {
    userId: args.userId,
    githubRepositoryOwner: ghRepoOwner,
    githubRepositoryName: repoName,
    convexProjectName: convexNameValidation.value,
    cloudflareWorkerName: cloudflareNameValidation.value,
  });
  assertResourceNameAvailable("GitHub repository name", resourceNameAvailability.github);
  assertResourceNameAvailable("Convex project name", resourceNameAvailability.convex);
  assertResourceNameAvailable("Cloudflare Worker name", resourceNameAvailability.cloudflare);
  const { cloudflareAccountId } = await resolveCloudflareProvisioningConnection(ctx, args.userId);

  const visibility = args.private === false ? "public" : "private";
  const { vaultId, runId } = await ctx.runMutation(
    internal.vault.records.createInitializingSamebaseManagedVaultForUser,
    {
      userId: args.userId,
      ghRepoOwner,
      ghRepoName: repoName,
      visibility,
      convexProjectName: convexNameValidation.value,
      cloudflareAccountId,
      cloudflareWorkerName: cloudflareNameValidation.value,
    },
  );
  await startCreateAppProvisioningOrFail(ctx, {
    vaultId,
    runId,
    userId: args.userId,
    repositoryName: repoName,
    repositoryOwner: ghRepoOwner,
    description: args.description ?? null,
    private: args.private ?? true,
  });

  return { vaultId, runId };
}

export const createRepository = action({
  access: "access_app_create",
  args: {
    name: v.string(),
    owner: string(),
    convexProjectName: string(),
    cloudflareWorkerName: string(),
    description: optional(v.string()),
    private: optional(v.boolean()),
  },
  returns: v.object({
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ vaultId: Id<"vaults">; runId: Id<"appProvisioningRuns"> }> => {
    return await createAppForUser(ctx, {
      ...args,
      userId: ctx.viewer.userId,
    });
  },
});

export const createAppForUserInternal = internalAction({
  args: {
    userId: v.id("users"),
    name: v.string(),
    owner: string(),
    convexProjectName: string(),
    cloudflareWorkerName: string(),
    description: optional(v.string()),
    private: optional(v.boolean()),
  },
  returns: v.object({
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
  }),
  handler: async (ctx, args): Promise<CreateAppResult> => {
    return await createAppForUser(ctx, args);
  },
});

export const checkCreateRepositoryResourceNames = action({
  access: "access_app_create",
  args: {
    githubRepositoryOwner: string(),
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
      githubRepositoryOwner: args.githubRepositoryOwner,
      githubRepositoryName: args.githubRepositoryName,
      convexProjectName: args.convexProjectName,
      cloudflareWorkerName: args.cloudflareWorkerName,
    });
  },
});

export const retryInfrastructureProvisioning = action({
  access: "access_app_create",
  args: {
    vaultId: v.id("vaults"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const vault = await ctx.runQuery(internal.vault.records.getById, {
      id: args.vaultId,
    });
    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }
    if (!isLiveConnectedVault(vault) || !isSamebaseManagedVault(vault)) {
      throw new Error("Infrastructure retry is available only for live Samebase-managed vaults");
    }
    const runId = await ctx.runMutation(internal.appProvisioningRuns.createForVault, {
      userId,
      vaultId: args.vaultId,
      trigger: "retry",
    });
    await startVaultInfrastructureProvisioningOrFail(ctx, {
      vaultId: args.vaultId,
      runId,
      force: true,
    });

    return null;
  },
});

export const deleteVault = action({
  access: "access_app_create",
  args: {
    vaultId: v.id("vaults"),
    removeCodespaces: v.optional(v.boolean()),
    removeGithubRepo: v.optional(v.boolean()),
    removeConvexProvision: v.optional(v.boolean()),
    removeCloudflareProvision: v.optional(v.boolean()),
  },
  returns: v.object({
    deletionRunId: v.id("vaultDeletionRuns"),
  }),
  handler: async (ctx, args): Promise<{ deletionRunId: Id<"vaultDeletionRuns"> }> => {
    const userId = ctx.viewer.userId;
    const result: { deletionRunId: Id<"vaultDeletionRuns"> } = await ctx.runMutation(
      internal.vault.deletion.runs.createInitialRun,
      {
        userId,
        vaultId: args.vaultId,
        options: {
          removeCodespaces: args.removeCodespaces ?? false,
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
    runId: v.id("vaultDeletionRuns"),
  },
  returns: v.object({
    deletionRunId: v.id("vaultDeletionRuns"),
  }),
  handler: async (ctx, args): Promise<{ deletionRunId: Id<"vaultDeletionRuns"> }> => {
    const userId = ctx.viewer.userId;
    const result: { deletionRunId: Id<"vaultDeletionRuns"> } = await ctx.runMutation(
      internal.vault.deletion.runs.createRetryRun,
      {
        userId,
        failedRunId: args.runId,
      },
    );
    const { deletionRunId } = result;
    const retryRun = await ctx.runQuery(internal.vault.deletion.runs.getById, {
      runId: deletionRunId,
    });
    if (!retryRun) {
      throw new Error("Deletion retry run not found.");
    }
    await startVaultDeletionOrFail(ctx, {
      vaultId: retryRun.vaultId,
      runId: deletionRunId,
      userId,
    });

    return { deletionRunId };
  },
});
