"use node";

import { v, type Infer } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  requireGitHubRepositoryOwnerId,
  resolveGitHubAppAccessForProvisioningRun,
} from "./githubAppAccess";
import { createGitHubRepositoryInstallationOctokit } from "./githubApp";
import { resolveGitHubRepositoryById } from "./githubRepoApi";
import { resolveGitHubUserOctokitForProvisioningRun } from "./githubUserAuthorizations";
import { toErrorMessage } from "./jsonUtils";
import { toSafeGitHubRepositoryName } from "../shared/githubRepositoryName";
import type {
  RepositoryProvisioningEventLevel,
  RepositoryProvisioningRunState,
  RepositoryProvisioningStep,
} from "./repository/provisioningModel";
import { createStarterSeedGitClient, seedRepositoryWithStarter } from "./starterSeed";
import {
  formatProviderApiCallLogMessage,
  type ProviderApiCall,
  type ProviderApiCallRecorder,
} from "./providerApiLog";

const { boolean, id, literal, object, string, union } = v;

const descriptionValidator = union(string(), v.null());
const githubRepositoryResult = object({
  githubRepositoryDatabaseId: string(),
  githubOwnerLogin: string(),
  githubRepositoryName: string(),
  defaultBranch: string(),
  visibility: union(literal("private"), literal("public")),
});
type GitHubRepositoryResult = Infer<typeof githubRepositoryResult>;
const repositoryCreatedResult = object({
  repositoryId: id("repositories"),
});

function readRepositoryDefaultBranch(repoData: unknown): string | null {
  if (typeof repoData !== "object" || repoData === null) {
    return null;
  }

  if (!("default_branch" in repoData)) {
    return null;
  }

  const value = repoData.default_branch;
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return null;
}

function readDefaultBranch(repoData: unknown): string {
  return readRepositoryDefaultBranch(repoData) ?? "main";
}

function readRequiredDefaultBranch(repoData: unknown): string {
  const defaultBranch = readRepositoryDefaultBranch(repoData);
  if (defaultBranch) {
    return defaultBranch;
  }
  throw new Error("GitHub repository does not have a default branch.");
}

async function getProvisioningRun(
  ctx: Pick<ActionCtx, "runQuery">,
  runId: Id<"workflow_repositoryProvisioning_runs">,
): Promise<Doc<"workflow_repositoryProvisioning_runs">> {
  const run = await ctx.runQuery(internal.repositoryProvisioningRuns.getById, {
    runId,
  });
  if (!run) {
    throw new Error("Provisioning run not found.");
  }
  return run;
}

async function requireProvisioningContinuation(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
  },
): Promise<void> {
  await ctx.runMutation(
    internal.repositoryWorkflowAuthority.assertRepositoryProviderWorkflowContinuation,
    {
      authority: {
        kind: "provisioning",
        runId: args.runId,
        userId: args.userId,
        repositoryId: args.repositoryId,
      },
    },
  );
}

function requireMatchingGitHubOwnerLogin(args: {
  expectedOwnerLogin: string;
  repositoryOwner: string;
}): string {
  const repositoryOwner = args.repositoryOwner.trim();
  if (
    repositoryOwner.length === 0 ||
    repositoryOwner.toLowerCase() !== args.expectedOwnerLogin.toLowerCase()
  ) {
    throw new Error("GitHub repository owner does not match the repository organization.");
  }
  return args.expectedOwnerLogin;
}

async function appendRunEvent(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"workflow_repositoryProvisioning_runs">;
    step: RepositoryProvisioningStep;
    level: RepositoryProvisioningEventLevel;
    message: string;
    state: "unchanged" | RepositoryProvisioningRunState;
  },
): Promise<void> {
  await ctx.runMutation(internal.repositoryProvisioningRuns.appendRunEvent, {
    runId: args.runId,
    step: args.step,
    level: args.level,
    message: args.message,
    state: args.state,
  });
}

async function appendProviderApiCallEvent(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"workflow_repositoryProvisioning_runs">;
    step: RepositoryProvisioningStep;
    call: ProviderApiCall;
  },
): Promise<void> {
  try {
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: args.step,
      level: "info",
      message: formatProviderApiCallLogMessage(args.call),
      state: "running",
    });
  } catch {
    console.warn("app:provision:api_call_event_append_failed", {
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
    runId: Id<"workflow_repositoryProvisioning_runs">;
    step: RepositoryProvisioningStep;
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

async function assertCreateRun(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
  },
): Promise<Doc<"workflow_repositoryProvisioning_runs">> {
  const run = await getProvisioningRun(ctx, args.runId);
  if (
    run.userId !== args.userId ||
    run.trigger !== "create" ||
    run.repositoryId !== args.repositoryId
  ) {
    throw new Error("Provisioning run does not match create workflow.");
  }
  return run;
}

async function assertConnectExistingRepositoryRun(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    githubRepositoryDatabaseId: string;
  },
): Promise<Doc<"workflow_repositoryProvisioning_runs">> {
  const [run, repository] = await Promise.all([
    getProvisioningRun(ctx, args.runId),
    ctx.runQuery(internal.repository.records.getById, { id: args.repositoryId }),
  ]);
  if (
    run.userId !== args.userId ||
    run.trigger !== "connect_existing_repository" ||
    run.repositoryId !== args.repositoryId
  ) {
    throw new Error("Provisioning run does not match existing repository workflow.");
  }
  if (
    !repository ||
    (repository.state !== "provisioning" && repository.state !== "connected") ||
    repository.githubMode !== "connect_existing_repository" ||
    repository.runId !== args.runId ||
    repository.githubRepositoryDatabaseId !== args.githubRepositoryDatabaseId
  ) {
    throw new Error("Provisioning GitHub repository identity cannot be changed.");
  }
  return run;
}

async function assertSourceSetupRun(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
  },
): Promise<Doc<"workflow_repositoryProvisioning_runs">> {
  const run = await getProvisioningRun(ctx, args.runId);
  if (
    run.userId !== args.userId ||
    run.repositoryId !== args.repositoryId ||
    (run.trigger !== "create" && run.trigger !== "connect_existing_repository")
  ) {
    throw new Error("Provisioning run does not match source setup workflow.");
  }
  return run;
}

async function requireConnectedRepositoryIdentity(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    githubRepositoryDatabaseId: string;
  },
): Promise<void> {
  const repository = await ctx.runQuery(internal.repository.records.getById, {
    id: args.repositoryId,
  });
  if (
    !repository ||
    repository.state !== "connected" ||
    repository.runId !== args.runId ||
    repository.githubRepositoryDatabaseId !== args.githubRepositoryDatabaseId
  ) {
    throw new Error("Connected GitHub repository identity cannot be changed.");
  }
}

export const validateCreateAppConnections = internalAction({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    githubRepositoryName: string(),
    githubOwnerLogin: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await assertCreateRun(ctx, args);
    await requireProvisioningContinuation(ctx, args);

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "validate_connections",
      level: "info",
      message: "Checking provider connections.",
      state: "running",
    });

    const githubRepositoryName = toSafeGitHubRepositoryName(args.githubRepositoryName);
    if (!githubRepositoryName) {
      throw new Error("Repository name is required.");
    }
    const access = await resolveGitHubAppAccessForProvisioningRun(ctx, {
      runId: args.runId,
      userId: args.userId,
      repositoryId: args.repositoryId,
    });
    requireMatchingGitHubOwnerLogin({
      expectedOwnerLogin: access.githubOwnerLogin,
      repositoryOwner: args.githubOwnerLogin,
    });
    const repository = await ctx.runQuery(
      internal.repository.records.getProviderTargetsForProvisioningRun,
      {
        repositoryId: args.repositoryId,
        userId: args.userId,
        runId: args.runId,
      },
    );
    const provider = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForRepositoryProviderWorkflow,
      {
        authority: {
          kind: "provisioning",
          runId: args.runId,
          userId: args.userId,
          repositoryId: args.repositoryId,
        },
      },
    );
    const providerConfiguration = provider.configuration;

    if (
      providerConfiguration.convexTeam?.teamId !== repository.convexTeamId ||
      providerConfiguration.convexCredential === undefined
    ) {
      throw new Error("Convex connection is required to create a project.");
    }
    if (
      providerConfiguration.cloudflareAccount?.accountId !== repository.cloudflareAccountId ||
      providerConfiguration.cloudflareCredential === undefined
    ) {
      throw new Error("Cloudflare connection is required to create a Worker-backed app.");
    }

    return null;
  },
});

export const createGitHubRepository = internalAction({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    githubRepositoryName: string(),
    githubOwnerLogin: string(),
    description: descriptionValidator,
    private: boolean(),
  },
  returns: githubRepositoryResult,
  handler: async (ctx, args): Promise<GitHubRepositoryResult> => {
    await assertCreateRun(ctx, args);
    await requireProvisioningContinuation(ctx, args);

    const githubRepositoryName = toSafeGitHubRepositoryName(args.githubRepositoryName);
    if (!githubRepositoryName) {
      throw new Error("Repository name is required.");
    }
    const access = await resolveGitHubAppAccessForProvisioningRun(ctx, {
      runId: args.runId,
      userId: args.userId,
      repositoryId: args.repositoryId,
    });
    const repositoryOwner = requireMatchingGitHubOwnerLogin({
      expectedOwnerLogin: access.githubOwnerLogin,
      repositoryOwner: args.githubOwnerLogin,
    });

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "create_github_repository",
      level: "info",
      message: "Creating GitHub repository.",
      state: "running",
    });

    const description = args.description?.trim();
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "create_github_repository",
    });
    const repositoryBody = {
      name: githubRepositoryName,
      auto_init: false,
      private: args.private,
      ...(description ? { description } : {}),
    };
    const repo = await (async () => {
      switch (access.githubOwnerType) {
        case "user": {
          const octokit = await resolveGitHubUserOctokitForProvisioningRun(ctx, {
            runId: args.runId,
            userId: args.userId,
            repositoryId: args.repositoryId,
            githubUserId: access.githubOwnerId,
          });
          await recordApiCall({
            provider: "GitHub",
            method: "POST",
            endpoint: "/user/repos",
            values: { body: repositoryBody },
          });
          return await octokit.rest.repos.createForAuthenticatedUser(repositoryBody);
        }
        case "organization":
          await recordApiCall({
            provider: "GitHub",
            method: "POST",
            endpoint: "/orgs/{org}/repos",
            values: {
              body: repositoryBody,
              params: { path: { org: repositoryOwner } },
            },
          });
          return await access.octokit.rest.repos.createInOrg({
            ...repositoryBody,
            org: repositoryOwner,
          });
      }
    })();

    requireGitHubRepositoryOwnerId({
      expectedOwnerId: access.githubOwnerId,
      repositoryOwnerId: repo.data.owner.id,
    });
    const githubOwnerLogin = repo.data.owner.login;
    const finalGitHubRepositoryName = repo.data.name;
    const githubRepositoryFullName = `${githubOwnerLogin}/${finalGitHubRepositoryName}`;
    await ctx.runMutation(internal.repositoryProvisioningRuns.recordRepositoryFullName, {
      runId: args.runId,
      githubRepositoryFullName,
    });
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "create_github_repository",
      level: "info",
      message: `Created GitHub repository ${githubRepositoryFullName}.`,
      state: "running",
    });
    const visibility: "private" | "public" = repo.data.private ? "private" : "public";

    return {
      githubRepositoryDatabaseId: repo.data.id.toString(),
      githubOwnerLogin,
      githubRepositoryName: finalGitHubRepositoryName,
      defaultBranch: readDefaultBranch(repo.data),
      visibility,
    };
  },
});

export const fetchExistingGitHubRepository = internalAction({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    githubRepositoryDatabaseId: string(),
  },
  returns: githubRepositoryResult,
  handler: async (ctx, args): Promise<GitHubRepositoryResult> => {
    await assertConnectExistingRepositoryRun(ctx, args);
    await requireProvisioningContinuation(ctx, args);

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "fetch_github_repository",
      level: "info",
      message: "Checking existing GitHub repository.",
      state: "running",
    });

    const access = await resolveGitHubAppAccessForProvisioningRun(ctx, {
      runId: args.runId,
      userId: args.userId,
      repositoryId: args.repositoryId,
    });
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "fetch_github_repository",
    });
    const octokit = await createGitHubRepositoryInstallationOctokit(
      access.githubInstallationId,
      args.githubRepositoryDatabaseId,
    );
    const repo = await resolveGitHubRepositoryById({
      octokit,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      recordApiCall,
    });
    requireGitHubRepositoryOwnerId({
      expectedOwnerId: access.githubOwnerId,
      repositoryOwnerId: repo.data.owner.id,
    });
    const defaultBranch = readRequiredDefaultBranch(repo.data);
    await recordApiCall({
      provider: "GitHub",
      method: "GET",
      endpoint: "/repos/{owner}/{repo}/branches/{branch}",
      values: {
        params: {
          path: {
            ownerName: repo.data.owner.login,
            repoName: repo.data.name,
            branch: defaultBranch,
          },
        },
      },
    });
    await octokit.rest.repos.getBranch({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      branch: defaultBranch,
    });

    const githubOwnerLogin = repo.data.owner.login;
    const githubRepositoryName = repo.data.name;
    const githubRepositoryFullName = `${githubOwnerLogin}/${githubRepositoryName}`;
    const visibility: "private" | "public" = repo.data.private ? "private" : "public";
    await ctx.runMutation(internal.repositoryProvisioningRuns.recordRepositoryFullName, {
      runId: args.runId,
      githubRepositoryFullName,
    });

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "fetch_github_repository",
      level: "info",
      message: `Checked existing GitHub repository ${githubRepositoryFullName}.`,
      state: "running",
    });

    return {
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      githubOwnerLogin,
      githubRepositoryName,
      defaultBranch,
      visibility,
    };
  },
});

export const seedStarterRepository = internalAction({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    githubRepositoryDatabaseId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertCreateRun(ctx, args);
    await requireConnectedRepositoryIdentity(ctx, args);
    await requireProvisioningContinuation(ctx, args);

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "seed_starter",
      level: "info",
      message: "Seeding starter app.",
      state: "running",
    });

    const access = await resolveGitHubAppAccessForProvisioningRun(ctx, {
      runId: args.runId,
      userId: args.userId,
      repositoryId: args.repositoryId,
    });
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "seed_starter",
    });
    const octokit = await createGitHubRepositoryInstallationOctokit(
      access.githubInstallationId,
      args.githubRepositoryDatabaseId,
    );
    const repositoryResponse = await resolveGitHubRepositoryById({
      octokit,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      recordApiCall,
    });
    const repository = repositoryResponse.data;
    requireGitHubRepositoryOwnerId({
      expectedOwnerId: access.githubOwnerId,
      repositoryOwnerId: repository.owner.id,
    });
    const ownerName = repository.owner.login;
    const repoName = repository.name;
    const defaultBranch = readDefaultBranch(repository);
    try {
      await seedRepositoryWithStarter({
        client: createStarterSeedGitClient(octokit, { recordApiCall }),
        owner: ownerName,
        repo: repoName,
        defaultBranch,
      });
    } catch (error) {
      const seedErrorMessage = toErrorMessage(error);

      console.error("seed:failed", {
        repo: `${ownerName}/${repoName}`,
        message: seedErrorMessage,
      });

      throw new Error(`Failed to seed starter repository: ${seedErrorMessage}`);
    }

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "seed_starter",
      level: "info",
      message: "Seeded the starter app.",
      state: "running",
    });

    return null;
  },
});

export const createRepositoryForRepository = internalAction({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    githubRepositoryDatabaseId: string(),
    githubOwnerLogin: string(),
    githubRepositoryName: string(),
    defaultBranch: string(),
    visibility: union(literal("private"), literal("public")),
  },
  returns: repositoryCreatedResult,
  handler: async (ctx, args): Promise<{ repositoryId: Id<"repositories"> }> => {
    await assertCreateRun(ctx, args);
    await requireProvisioningContinuation(ctx, args);

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "connect_github_repository",
      level: "info",
      message: "Connecting the Samebase repository to GitHub.",
      state: "running",
    });

    await ctx.runMutation(internal.repository.records.connectSamebaseManagedRepositoryGitHub, {
      repositoryId: args.repositoryId,
      userId: args.userId,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      githubOwnerLogin: args.githubOwnerLogin,
      githubRepositoryName: args.githubRepositoryName,
      defaultBranch: args.defaultBranch,
      visibility: args.visibility,
      runId: args.runId,
    });
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "connect_github_repository",
      level: "info",
      message: "Connected the Samebase repository to GitHub.",
      state: "running",
    });

    return { repositoryId: args.repositoryId };
  },
});

export const connectExistingRepository = internalAction({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    githubRepositoryDatabaseId: string(),
    githubOwnerLogin: string(),
    githubRepositoryName: string(),
    defaultBranch: string(),
    visibility: union(literal("private"), literal("public")),
  },
  returns: repositoryCreatedResult,
  handler: async (ctx, args): Promise<{ repositoryId: Id<"repositories"> }> => {
    await assertConnectExistingRepositoryRun(ctx, args);
    await requireProvisioningContinuation(ctx, args);

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "connect_github_repository",
      level: "info",
      message: "Connecting the Samebase repository to GitHub.",
      state: "running",
    });

    await ctx.runMutation(internal.repository.records.connectExistingRepositoryGitHub, {
      repositoryId: args.repositoryId,
      userId: args.userId,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      githubOwnerLogin: args.githubOwnerLogin,
      githubRepositoryName: args.githubRepositoryName,
      defaultBranch: args.defaultBranch,
      visibility: args.visibility,
      runId: args.runId,
    });
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "connect_github_repository",
      level: "info",
      message: "Connected the Samebase repository to GitHub.",
      state: "running",
    });

    return { repositoryId: args.repositoryId };
  },
});

export const syncRepositoryTreeForRepository = internalAction({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    githubRepositoryDatabaseId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await assertSourceSetupRun(ctx, args);
    await requireConnectedRepositoryIdentity(ctx, args);
    await requireProvisioningContinuation(ctx, args);

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "sync_tree",
      level: "info",
      message: "Syncing the default branch tree.",
      state: "running",
    });

    const access = await resolveGitHubAppAccessForProvisioningRun(ctx, {
      runId: args.runId,
      userId: args.userId,
      repositoryId: args.repositoryId,
    });
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "sync_tree",
    });
    const octokit = await createGitHubRepositoryInstallationOctokit(
      access.githubInstallationId,
      args.githubRepositoryDatabaseId,
    );
    const repositoryResponse = await resolveGitHubRepositoryById({
      octokit,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      recordApiCall,
    });
    const repository = repositoryResponse.data;
    requireGitHubRepositoryOwnerId({
      expectedOwnerId: access.githubOwnerId,
      repositoryOwnerId: repository.owner.id,
    });
    const ownerName = repository.owner.login;
    const repoName = repository.name;
    const defaultBranch = readRequiredDefaultBranch(repository);
    await recordApiCall({
      provider: "GitHub",
      method: "GET",
      endpoint: "/repos/{owner}/{repo}/branches/{branch}",
      values: {
        params: {
          path: {
            ownerName,
            repoName,
            branch: defaultBranch,
          },
        },
      },
    });
    const branchData = await octokit.rest.repos.getBranch({
      owner: ownerName,
      repo: repoName,
      branch: defaultBranch,
    });
    const treeSha = branchData.data.commit.commit.tree.sha;
    await recordApiCall({
      provider: "GitHub",
      method: "GET",
      endpoint: "/repos/{owner}/{repo}/git/trees/{tree_sha}",
      values: {
        params: {
          path: {
            ownerName,
            repoName,
            tree_sha: treeSha,
          },
          query: {
            recursive: "1",
          },
        },
      },
    });
    const tree = await octokit.rest.git.getTree({
      owner: ownerName,
      repo: repoName,
      tree_sha: treeSha,
      recursive: "1",
    });

    await ctx.runMutation(internal.repository.branches.upsertRepositoryBranchTree, {
      repositoryId: args.repositoryId,
      branch: defaultBranch,
      treeData: tree.data,
      commitSHA: branchData.data.commit.sha,
      authority: {
        kind: "provisioning",
        runId: args.runId,
        userId: args.userId,
        repositoryId: args.repositoryId,
      },
    });

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "sync_tree",
      level: "info",
      message: "Synced the default branch tree.",
      state: "running",
    });

    return null;
  },
});
