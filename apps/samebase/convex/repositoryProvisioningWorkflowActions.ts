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
import type { ConnectedRepository } from "./repository/state";
import {
  buildRepositoryActionsConvexAccessTokenName,
  REPOSITORY_ACTIONS_DEFAULT_BRANCH,
  vRepositoryProvisioningMode,
  type RepositoryProvisioningEventLevel,
  type RepositoryProvisioningMode,
  type RepositoryProvisioningRunState,
  type RepositoryProvisioningStep,
} from "./repository/provisioningModel";
import {
  requireCloudflareCiCredential,
  requireConvexMintingToken,
} from "./organization/ciCredentials";
import {
  createConvexTeamAccessToken,
  deleteConvexTeamAccessToken,
} from "./convexManagementApi/client";
import { writeGitHubActionsSecrets } from "./githubActionsSecrets";
import { createStarterSeedGitClient, seedRepositoryWithStarter } from "./starterSeed";
import { starterTemplateManifest } from "./starterSeedManifest.generated";
import { actionsStarterTemplateManifest } from "./starterSeedManifest.actions.generated";
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

/**
The runs that may seed the starter or sync the tree: the run that created or connected the
repository, and a repository_actions retry that resumes the seed after the Actions secrets.
*/
async function assertSourceSetupRun(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
  },
  triggers: ReadonlyArray<"create" | "connect_existing_repository">,
): Promise<Doc<"workflow_repositoryProvisioning_runs">> {
  const run = await getProvisioningRun(ctx, args.runId);
  if (run.userId !== args.userId || run.repositoryId !== args.repositoryId) {
    throw new Error("Provisioning run does not match source setup workflow.");
  }
  if (run.trigger === "retry") {
    const provisioning = await ctx.runQuery(
      internal.repositoryProvisioningWorkflow.readProvisioningModeForRun,
      { repositoryId: args.repositoryId, runId: args.runId, userId: args.userId },
    );
    if (provisioning !== "repository_actions") {
      throw new Error("Provisioning run does not match source setup workflow.");
    }
    return run;
  }
  if (!triggers.some((trigger) => trigger === run.trigger)) {
    throw new Error("Provisioning run does not match source setup workflow.");
  }
  return run;
}

async function requireConnectedRepositoryIdentity(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    repositoryId: Id<"repositories">;
    run: Doc<"workflow_repositoryProvisioning_runs">;
    githubRepositoryDatabaseId: string;
  },
): Promise<ConnectedRepository> {
  const repository = await ctx.runQuery(internal.repository.records.getById, {
    id: args.repositoryId,
  });
  if (
    !repository ||
    repository.state !== "connected" ||
    (repository.runId !== args.run._id && args.run.trigger !== "retry") ||
    repository.githubRepositoryDatabaseId !== args.githubRepositoryDatabaseId
  ) {
    throw new Error("Connected GitHub repository identity cannot be changed.");
  }
  return repository;
}

export const validateCreateAppConnections = internalAction({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    githubRepositoryName: string(),
    githubOwnerLogin: string(),
  },
  returns: vRepositoryProvisioningMode,
  handler: async (ctx, args): Promise<RepositoryProvisioningMode> => {
    await assertCreateRun(ctx, args);
    await requireProvisioningContinuation(ctx, args);

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "validate_connections",
      level: "info",
      message: "Checking provider connections.",
      state: "running",
    });
    const provisioning = await ctx.runQuery(
      internal.repositoryProvisioningWorkflow.readProvisioningModeForRun,
      { repositoryId: args.repositoryId, runId: args.runId, userId: args.userId },
    );

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
    if (provisioning === "repository_actions") {
      requireCloudflareCiCredential({
        ci: await ctx.runQuery(
          internal.organizationProviderCredentials.loadCiCredentialsForRepositoryProviderWorkflow,
          {
            authority: {
              kind: "provisioning",
              runId: args.runId,
              userId: args.userId,
              repositoryId: args.repositoryId,
            },
          },
        ),
        cloudflareAccountId: repository.cloudflareAccountId,
        githubOwnerLogin: access.githubOwnerLogin,
      });
      requireConvexMintingToken({
        configuration: providerConfiguration,
        convexTeamId: repository.convexTeamId,
        githubOwnerLogin: access.githubOwnerLogin,
      });
    }

    return provisioning;
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
    const run = await assertSourceSetupRun(ctx, args, ["create"]);
    const connectedRepository = await requireConnectedRepositoryIdentity(ctx, {
      repositoryId: args.repositoryId,
      run,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
    });
    await requireProvisioningContinuation(ctx, args);
    const provisioning = await ctx.runQuery(
      internal.repositoryProvisioningWorkflow.readProvisioningModeForRun,
      { repositoryId: args.repositoryId, runId: args.runId, userId: args.userId },
    );
    const repositoryActions = provisioning === "repository_actions";
    // The seed force-updates the seeded branch, so a recorded seed is never repeated: a repeat would
    // drop every commit pushed since. A retry or a step retry after the record finds it here.
    const alreadySeeded =
      repositoryActions &&
      (
        await ctx.runQuery(
          internal.repositoryProvisioningWorkflow.readRepositoryActionsSeedForRun,
          { repositoryId: args.repositoryId, runId: args.runId, userId: args.userId },
        )
      ).state === "seeded";

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "seed_starter",
      level: "info",
      message: alreadySeeded ? "The starter app is already seeded." : "Seeding starter app.",
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
    const githubDefaultBranch = readDefaultBranch(repository);

    if (!alreadySeeded) {
      const manifest = repositoryActions ? actionsStarterTemplateManifest : starterTemplateManifest;
      try {
        await seedRepositoryWithStarter({
          client: createStarterSeedGitClient(octokit, { recordApiCall }),
          owner: ownerName,
          repo: repoName,
          defaultBranch: repositoryActions
            ? REPOSITORY_ACTIONS_DEFAULT_BRANCH
            : githubDefaultBranch,
          manifest,
        });
      } catch (error) {
        const seedErrorMessage = toErrorMessage(error);

        console.error("seed:failed", {
          repo: `${ownerName}/${repoName}`,
          message: seedErrorMessage,
        });

        throw new Error(`Failed to seed starter repository: ${seedErrorMessage}`);
      }
      if (repositoryActions) {
        await ctx.runMutation(internal.repositoryProvisioningWorkflow.markStarterSeeded, {
          repositoryId: args.repositoryId,
          runId: args.runId,
          userId: args.userId,
          manifestVersion: manifest.version,
        });
      }

      await appendRunEvent(ctx, {
        runId: args.runId,
        step: "seed_starter",
        level: "info",
        message: "Seeded the starter app.",
        state: "running",
      });
    }

    // The template deploys from main, but GitHub creates a repository with the owner's default
    // branch, which can be another name. Once the record says main, the switch is done: a branch
    // that the user chose later is never changed.
    if (
      repositoryActions &&
      connectedRepository.defaultBranch !== REPOSITORY_ACTIONS_DEFAULT_BRANCH
    ) {
      if (githubDefaultBranch !== REPOSITORY_ACTIONS_DEFAULT_BRANCH) {
        await recordApiCall({
          provider: "GitHub",
          method: "PATCH",
          endpoint: "/repos/{owner}/{repo}",
          values: {
            body: { default_branch: REPOSITORY_ACTIONS_DEFAULT_BRANCH },
            params: { path: { owner: ownerName, repo: repoName } },
          },
        });
        await octokit.rest.repos.update({
          owner: ownerName,
          repo: repoName,
          default_branch: REPOSITORY_ACTIONS_DEFAULT_BRANCH,
        });
        await appendRunEvent(ctx, {
          runId: args.runId,
          step: "seed_starter",
          level: "info",
          message: `Set the default branch of ${ownerName}/${repoName} to ${REPOSITORY_ACTIONS_DEFAULT_BRANCH}. GitHub created it with ${githubDefaultBranch}.`,
          state: "running",
        });
      }
      await ctx.runMutation(
        internal.repositoryProvisioningWorkflow.recordRepositoryActionsDefaultBranch,
        { repositoryId: args.repositoryId, runId: args.runId, userId: args.userId },
      );
    }

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

/**
write_actions_secrets of the repository_actions mode: the Cloudflare CI token, the account id, and a
Convex team access token minted for this repository become the secrets and the variable that the
template's alchemy workflow reads. GitHub is written with the same Octokit that created the
repository for this owner type. Every GitHub write is an upsert and the token is minted again, so a
retry resumes safely.
*/
export const writeActionsSecrets = internalAction({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    githubRepositoryDatabaseId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const run = await getProvisioningRun(ctx, args.runId);
    if (
      run.userId !== args.userId ||
      run.repositoryId !== args.repositoryId ||
      (run.trigger !== "create" && run.trigger !== "retry")
    ) {
      throw new Error("Provisioning run does not match repository_actions setup.");
    }
    await requireConnectedRepositoryIdentity(ctx, {
      repositoryId: args.repositoryId,
      run,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
    });
    await requireProvisioningContinuation(ctx, args);

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "write_actions_secrets",
      level: "info",
      message: "Writing the GitHub Actions secrets.",
      state: "running",
    });
    const target = await ctx.runQuery(
      internal.repositoryProvisioningWorkflow.readActionsSecretsTarget,
      { repositoryId: args.repositoryId, runId: args.runId, userId: args.userId },
    );
    const access = await resolveGitHubAppAccessForProvisioningRun(ctx, {
      runId: args.runId,
      userId: args.userId,
      repositoryId: args.repositoryId,
    });
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "write_actions_secrets",
    });
    const repositoryResponse = await resolveGitHubRepositoryById({
      octokit: await createGitHubRepositoryInstallationOctokit(
        access.githubInstallationId,
        args.githubRepositoryDatabaseId,
      ),
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      recordApiCall,
    });
    const repository = repositoryResponse.data;
    requireGitHubRepositoryOwnerId({
      expectedOwnerId: access.githubOwnerId,
      repositoryOwnerId: repository.owner.id,
    });
    const octokit =
      access.githubOwnerType === "user"
        ? await resolveGitHubUserOctokitForProvisioningRun(ctx, {
            runId: args.runId,
            userId: args.userId,
            repositoryId: args.repositoryId,
            githubUserId: access.githubOwnerId,
          })
        : access.octokit;

    // The repository gets its own Convex team access token. The previous one of a retry goes first,
    // so the team holds one token per repository; Samebase keeps only the name.
    const convexToken = { token: target.convexMintingToken, teamId: target.convexTeamId };
    if (target.convexAccessToken.state === "minted") {
      await deleteConvexTeamAccessToken({
        ...convexToken,
        name: target.convexAccessToken.name,
        recordApiCall,
      });
      await appendRunEvent(ctx, {
        runId: args.runId,
        step: "write_actions_secrets",
        level: "info",
        message: `Deleted the previous Convex access token ${target.convexAccessToken.name}.`,
        state: "running",
      });
    }
    const convexAccessTokenName = buildRepositoryActionsConvexAccessTokenName(
      `${repository.owner.login}/${repository.name}`,
    );
    const convexAccessToken = await createConvexTeamAccessToken({
      ...convexToken,
      name: convexAccessTokenName,
      recordApiCall,
    });
    await ctx.runMutation(internal.repositoryProvisioningWorkflow.recordConvexAccessTokenMinted, {
      repositoryId: args.repositoryId,
      runId: args.runId,
      userId: args.userId,
      name: convexAccessTokenName,
    });
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "write_actions_secrets",
      level: "info",
      message: `Minted the Convex access token ${convexAccessTokenName}.`,
      state: "running",
    });

    await writeGitHubActionsSecrets({
      octokit,
      owner: repository.owner.login,
      repo: repository.name,
      secrets: [
        { name: "CLOUDFLARE_API_TOKEN", value: target.cloudflareApiToken },
        { name: "CLOUDFLARE_ACCOUNT_ID", value: target.cloudflareAccountId },
        { name: "CONVEX_ACCESS_TOKEN", value: convexAccessToken },
      ],
      variables: [{ name: "CONVEX_TEAM_ID", value: target.convexTeamId }],
      recordApiCall,
    });
    await ctx.runMutation(internal.repositoryProvisioningWorkflow.markActionsSecretsWritten, {
      repositoryId: args.repositoryId,
      runId: args.runId,
      userId: args.userId,
      credentialRevision: target.credentialRevision,
    });

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "write_actions_secrets",
      level: "info",
      message: "Wrote the GitHub Actions secrets.",
      state: "running",
    });
    return null;
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
    const run = await assertSourceSetupRun(ctx, args, ["create", "connect_existing_repository"]);
    await requireConnectedRepositoryIdentity(ctx, {
      repositoryId: args.repositoryId,
      run,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
    });
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
