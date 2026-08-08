"use node";

import { v, type Infer } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  requireGitHubRepositoryOwnerId,
  resolveGitHubAppAccessForProvisioningRun,
  resolveGitHubRepositoryAccess,
  type GitHubVaultAccess,
} from "./githubAppAccess";
import { resolveGitHubUserOctokitForProvisioningRun } from "./githubUserAuthorizations";
import { toErrorMessage } from "./jsonUtils";
import { toSafeRepoName } from "../shared/repoName";
import type {
  AppProvisioningEventLevel,
  AppProvisioningRunState,
  AppProvisioningStep,
} from "./appProvisioningModel";
import { createStarterSeedGitClient, seedRepositoryWithStarter } from "./starterSeed";
import {
  formatProviderApiCallLogMessage,
  type ProviderApiCall,
  type ProviderApiCallRecorder,
} from "./providerApiLog";

const { boolean, id, literal, object, string, union } = v;

const descriptionValidator = union(string(), v.null());
const githubRepositoryResult = object({
  ghRepoId: string(),
  ownerName: string(),
  repoName: string(),
  defaultBranch: string(),
  visibility: union(literal("private"), literal("public")),
});
type GitHubRepositoryResult = Infer<typeof githubRepositoryResult>;
const vaultCreatedResult = object({
  vaultId: id("vaults"),
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
  runId: Id<"workflow_vaultProvisioning_runs">,
): Promise<Doc<"workflow_vaultProvisioning_runs">> {
  const run = await ctx.runQuery(internal.appProvisioningRuns.getById, {
    runId,
  });
  if (!run) {
    throw new Error("Provisioning run not found.");
  }
  return run;
}

async function appendRunEvent(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
    step: AppProvisioningStep;
    level: AppProvisioningEventLevel;
    message: string;
    state: "unchanged" | AppProvisioningRunState;
  },
): Promise<void> {
  await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
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
    runId: Id<"workflow_vaultProvisioning_runs">;
    step: AppProvisioningStep;
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
    runId: Id<"workflow_vaultProvisioning_runs">;
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

async function assertCreateRun(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
  },
): Promise<Doc<"workflow_vaultProvisioning_runs">> {
  const run = await getProvisioningRun(ctx, args.runId);
  if (run.userId !== args.userId || run.trigger !== "create" || run.vaultId !== args.vaultId) {
    throw new Error("Provisioning run does not match create workflow.");
  }
  return run;
}

async function assertConnectExistingRepositoryRun(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
  },
): Promise<Doc<"workflow_vaultProvisioning_runs">> {
  const run = await getProvisioningRun(ctx, args.runId);
  if (
    run.userId !== args.userId ||
    run.trigger !== "connect_existing_repository" ||
    run.vaultId !== args.vaultId
  ) {
    throw new Error("Provisioning run does not match existing repository workflow.");
  }
  return run;
}

async function assertSourceSetupRun(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
  },
): Promise<Doc<"workflow_vaultProvisioning_runs">> {
  const run = await getProvisioningRun(ctx, args.runId);
  if (
    run.userId !== args.userId ||
    run.vaultId !== args.vaultId ||
    (run.trigger !== "create" && run.trigger !== "connect_existing_repository")
  ) {
    throw new Error("Provisioning run does not match source setup workflow.");
  }
  return run;
}

async function resolveConnectedProvisioningGitHubAccess(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
  },
): Promise<GitHubVaultAccess> {
  const [access, context] = await Promise.all([
    resolveGitHubAppAccessForProvisioningRun(ctx, {
      runId: args.runId,
      userId: args.userId,
      vaultId: args.vaultId,
    }),
    ctx.runQuery(
      internal.vault.providerObservationQueries.readProviderAttachmentVaultContextForProvisioningRun,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
      },
    ),
  ]);
  return await resolveGitHubRepositoryAccess({
    access,
    ghRepoId: context.ghRepoId,
  });
}

export const validateCreateAppConnections = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    repositoryName: string(),
    githubOwnerId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await assertCreateRun(ctx, args);
    const repoName = toSafeRepoName(args.repositoryName);
    if (!repoName) {
      throw new Error("Repository name is required.");
    }
    const access = await resolveGitHubAppAccessForProvisioningRun(ctx, {
      runId: args.runId,
      userId: args.userId,
      vaultId: args.vaultId,
    });
    if (access.githubOwnerId !== args.githubOwnerId) {
      throw new Error("Vault organization identity changed.");
    }
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "validate_connections",
      level: "info",
      message: "Checking provider connections.",
      state: "running",
    });
    const vault = await ctx.runQuery(internal.vault.records.getProviderTargetsForProvisioningRun, {
      vaultId: args.vaultId,
      userId: args.userId,
      runId: args.runId,
    });
    const provider = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForVaultProviderWorkflow,
      {
        authority: {
          kind: "provisioning",
          runId: args.runId,
          userId: args.userId,
          vaultId: args.vaultId,
        },
      },
    );
    const providerConfiguration = provider.configuration;

    if (
      providerConfiguration.convexTeam?.teamId !== vault.convexTeamId ||
      providerConfiguration.convexCredential === undefined
    ) {
      throw new Error("Convex connection is required to create a project.");
    }
    if (
      providerConfiguration.cloudflareAccount?.accountId !== vault.cloudflareAccountId ||
      providerConfiguration.cloudflareCredential === undefined
    ) {
      throw new Error("Cloudflare connection is required to create a Worker-backed app.");
    }

    return null;
  },
});

export const createGitHubRepository = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    repositoryName: string(),
    githubOwnerId: string(),
    description: descriptionValidator,
    private: boolean(),
  },
  returns: githubRepositoryResult,
  handler: async (ctx, args): Promise<GitHubRepositoryResult> => {
    await assertCreateRun(ctx, args);
    const repoName = toSafeRepoName(args.repositoryName);
    if (!repoName) {
      throw new Error("Repository name is required.");
    }
    const access = await resolveGitHubAppAccessForProvisioningRun(ctx, {
      runId: args.runId,
      userId: args.userId,
      vaultId: args.vaultId,
    });
    if (access.githubOwnerId !== args.githubOwnerId) {
      throw new Error("Vault organization identity changed.");
    }

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "create_github_repo",
      level: "info",
      message: "Creating GitHub repository.",
      state: "running",
    });

    const description = args.description?.trim();
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "create_github_repo",
    });
    const repositoryBody = {
      name: repoName,
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
            vaultId: args.vaultId,
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
              params: { path: { org: access.githubOwnerLogin } },
            },
          });
          return await access.octokit.rest.repos.createInOrg({
            ...repositoryBody,
            org: access.githubOwnerLogin,
          });
      }
    })();

    requireGitHubRepositoryOwnerId({
      expectedOwnerId: args.githubOwnerId,
      repositoryOwnerId: repo.data.owner.id,
    });
    const ownerName = repo.data.owner.login;
    const repoFinalName = repo.data.name;
    const repositoryFullName = `${ownerName}/${repoFinalName}`;
    await ctx.runMutation(internal.appProvisioningRuns.recordRepositoryFullName, {
      runId: args.runId,
      repositoryFullName,
    });
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "create_github_repo",
      level: "info",
      message: `Created GitHub repository ${repositoryFullName}.`,
      state: "running",
    });
    const visibility: "private" | "public" = repo.data.private ? "private" : "public";

    return {
      ghRepoId: repo.data.id.toString(),
      ownerName,
      repoName: repoFinalName,
      defaultBranch: readDefaultBranch(repo.data),
      visibility,
    };
  },
});

export const fetchExistingGitHubRepository = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    ghRepoId: string(),
    githubOwnerId: string(),
  },
  returns: githubRepositoryResult,
  handler: async (ctx, args): Promise<GitHubRepositoryResult> => {
    await assertConnectExistingRepositoryRun(ctx, args);
    const installationAccess = await resolveGitHubAppAccessForProvisioningRun(ctx, {
      runId: args.runId,
      userId: args.userId,
      vaultId: args.vaultId,
    });
    if (installationAccess.githubOwnerId !== args.githubOwnerId) {
      throw new Error("Vault organization identity changed.");
    }
    const access = await resolveGitHubRepositoryAccess({
      access: installationAccess,
      ghRepoId: args.ghRepoId,
    });
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "fetch_github_repo",
      level: "info",
      message: "Checking existing GitHub repository.",
      state: "running",
    });
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "fetch_github_repo",
    });
    await recordApiCall({
      provider: "GitHub",
      method: "GET",
      endpoint: "/repos/{owner}/{repo}",
      values: {
        params: {
          path: {
            ownerName: access.githubOwnerLogin,
            repoName: access.repositoryName,
          },
        },
      },
    });
    const repo = await access.octokit.rest.repos.get({
      owner: access.githubOwnerLogin,
      repo: access.repositoryName,
    });
    requireGitHubRepositoryOwnerId({
      expectedOwnerId: args.githubOwnerId,
      repositoryOwnerId: repo.data.owner.id,
    });
    if (String(repo.data.id) !== args.ghRepoId) {
      throw new Error("GitHub repository identity changed.");
    }
    const ownerName = repo.data.owner.login;
    const repoFinalName = repo.data.name;
    const defaultBranch = readRequiredDefaultBranch(repo.data);
    await recordApiCall({
      provider: "GitHub",
      method: "GET",
      endpoint: "/repos/{owner}/{repo}/branches/{branch}",
      values: {
        params: {
          path: {
            ownerName,
            repoName: repoFinalName,
            branch: defaultBranch,
          },
        },
      },
    });
    await access.octokit.rest.repos.getBranch({
      owner: ownerName,
      repo: repoFinalName,
      branch: defaultBranch,
    });

    const repositoryFullName = `${ownerName}/${repoFinalName}`;
    const visibility: "private" | "public" = repo.data.private ? "private" : "public";
    await ctx.runMutation(internal.appProvisioningRuns.recordRepositoryFullName, {
      runId: args.runId,
      repositoryFullName,
    });

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "fetch_github_repo",
      level: "info",
      message: `Checked existing GitHub repository ${repositoryFullName}.`,
      state: "running",
    });

    return {
      ghRepoId: access.ghRepoId,
      ownerName,
      repoName: repoFinalName,
      defaultBranch,
      visibility,
    };
  },
});

export const seedStarterRepository = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertCreateRun(ctx, args);

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "seed_starter",
      level: "info",
      message: "Seeding starter app.",
      state: "running",
    });

    const access = await resolveConnectedProvisioningGitHubAccess(ctx, {
      runId: args.runId,
      userId: args.userId,
      vaultId: args.vaultId,
    });
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "seed_starter",
    });
    try {
      await seedRepositoryWithStarter({
        client: createStarterSeedGitClient(access.octokit, { recordApiCall }),
        owner: access.githubOwnerLogin,
        repo: access.repositoryName,
        defaultBranch: access.repositoryDefaultBranch,
      });
    } catch (error) {
      const seedErrorMessage = toErrorMessage(error);

      console.error("seed:failed", {
        repo: `${access.githubOwnerLogin}/${access.repositoryName}`,
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

export const createVaultForRepository = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    ghRepoId: string(),
    githubOwnerId: string(),
    expectedGithubOwnerLogin: string(),
    expectedRepositoryName: string(),
    ownerName: string(),
    repoName: string(),
    defaultBranch: string(),
    visibility: union(literal("private"), literal("public")),
  },
  returns: vaultCreatedResult,
  handler: async (ctx, args): Promise<{ vaultId: Id<"vaults"> }> => {
    await assertCreateRun(ctx, args);

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "connect_github",
      level: "info",
      message: "Connecting the Samebase vault to GitHub.",
      state: "running",
    });

    await ctx.runMutation(internal.vault.records.connectSamebaseManagedVaultGitHub, {
      vaultId: args.vaultId,
      userId: args.userId,
      ghRepoId: args.ghRepoId,
      expectedGithubOwnerId: args.githubOwnerId,
      expectedGithubOwnerLogin: args.expectedGithubOwnerLogin,
      expectedRepositoryName: args.expectedRepositoryName,
      ghRepoOwner: args.ownerName,
      ghRepoName: args.repoName,
      defaultBranch: args.defaultBranch,
      visibility: args.visibility,
      runId: args.runId,
    });
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "connect_github",
      level: "info",
      message: "Connected the Samebase vault to GitHub.",
      state: "running",
    });

    return { vaultId: args.vaultId };
  },
});

export const connectExistingRepositoryVault = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    ghRepoId: string(),
    githubOwnerId: string(),
    expectedGithubOwnerLogin: string(),
    expectedRepositoryName: string(),
    ownerName: string(),
    repoName: string(),
    defaultBranch: string(),
    visibility: union(literal("private"), literal("public")),
  },
  returns: vaultCreatedResult,
  handler: async (ctx, args): Promise<{ vaultId: Id<"vaults"> }> => {
    await assertConnectExistingRepositoryRun(ctx, args);

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "connect_github",
      level: "info",
      message: "Connecting the Samebase vault to GitHub.",
      state: "running",
    });

    await ctx.runMutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
      vaultId: args.vaultId,
      userId: args.userId,
      ghRepoId: args.ghRepoId,
      expectedGithubOwnerId: args.githubOwnerId,
      expectedGithubOwnerLogin: args.expectedGithubOwnerLogin,
      expectedRepositoryName: args.expectedRepositoryName,
      ghRepoOwner: args.ownerName,
      ghRepoName: args.repoName,
      defaultBranch: args.defaultBranch,
      visibility: args.visibility,
      runId: args.runId,
    });
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "connect_github",
      level: "info",
      message: "Connected the Samebase vault to GitHub.",
      state: "running",
    });

    return { vaultId: args.vaultId };
  },
});

export const syncVaultTreeForRepository = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await assertSourceSetupRun(ctx, args);

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "sync_tree",
      level: "info",
      message: "Syncing the default branch tree.",
      state: "running",
    });

    const access = await resolveConnectedProvisioningGitHubAccess(ctx, {
      runId: args.runId,
      userId: args.userId,
      vaultId: args.vaultId,
    });
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "sync_tree",
    });
    await recordApiCall({
      provider: "GitHub",
      method: "GET",
      endpoint: "/repos/{owner}/{repo}/branches/{branch}",
      values: {
        params: {
          path: {
            ownerName: access.githubOwnerLogin,
            repoName: access.repositoryName,
            branch: access.repositoryDefaultBranch,
          },
        },
      },
    });
    const branchData = await access.octokit.rest.repos.getBranch({
      owner: access.githubOwnerLogin,
      repo: access.repositoryName,
      branch: access.repositoryDefaultBranch,
    });
    const treeSha = branchData.data.commit.commit.tree.sha;
    await recordApiCall({
      provider: "GitHub",
      method: "GET",
      endpoint: "/repos/{owner}/{repo}/git/trees/{tree_sha}",
      values: {
        params: {
          path: {
            ownerName: access.githubOwnerLogin,
            repoName: access.repositoryName,
            tree_sha: treeSha,
          },
          query: {
            recursive: "1",
          },
        },
      },
    });
    const tree = await access.octokit.rest.git.getTree({
      owner: access.githubOwnerLogin,
      repo: access.repositoryName,
      tree_sha: treeSha,
      recursive: "1",
    });

    await ctx.runMutation(internal.vault.branches.upsertVaultBranchTree, {
      vaultId: args.vaultId,
      branch: access.repositoryDefaultBranch,
      treeData: tree.data,
      commitSHA: branchData.data.commit.sha,
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
