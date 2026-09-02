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

async function requireProvisioningContinuation(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
  },
): Promise<void> {
  await ctx.runMutation(internal.vaultWorkflowAuthority.assertVaultProviderWorkflowContinuation, {
    authority: {
      kind: "provisioning",
      runId: args.runId,
      userId: args.userId,
      vaultId: args.vaultId,
    },
  });
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
    throw new Error("GitHub repository owner does not match the vault organization.");
  }
  return args.expectedOwnerLogin;
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
    ghRepoId: string;
  },
): Promise<Doc<"workflow_vaultProvisioning_runs">> {
  const [run, vault] = await Promise.all([
    getProvisioningRun(ctx, args.runId),
    ctx.runQuery(internal.vault.records.getById, { id: args.vaultId }),
  ]);
  if (
    run.userId !== args.userId ||
    run.trigger !== "connect_existing_repository" ||
    run.vaultId !== args.vaultId
  ) {
    throw new Error("Provisioning run does not match existing repository workflow.");
  }
  if (
    !vault ||
    (vault.state !== "provisioning" && vault.state !== "connected") ||
    vault.githubMode !== "connect_existing_repository" ||
    vault.runId !== args.runId ||
    vault.ghRepoId !== args.ghRepoId
  ) {
    throw new Error("Provisioning vault repository identity cannot be changed.");
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

async function requireConnectedVaultRepositoryIdentity(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
    ghRepoId: string;
  },
): Promise<void> {
  const vault = await ctx.runQuery(internal.vault.records.getById, { id: args.vaultId });
  if (
    !vault ||
    vault.state !== "connected" ||
    vault.runId !== args.runId ||
    vault.ghRepoId !== args.ghRepoId
  ) {
    throw new Error("Connected vault repository identity cannot be changed.");
  }
}

export const validateCreateAppConnections = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    repositoryName: string(),
    repositoryOwner: string(),
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

    const repoName = toSafeRepoName(args.repositoryName);
    if (!repoName) {
      throw new Error("Repository name is required.");
    }
    const access = await resolveGitHubAppAccessForProvisioningRun(ctx, {
      runId: args.runId,
      userId: args.userId,
      vaultId: args.vaultId,
    });
    requireMatchingGitHubOwnerLogin({
      expectedOwnerLogin: access.githubOwnerLogin,
      repositoryOwner: args.repositoryOwner,
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
    repositoryOwner: string(),
    description: descriptionValidator,
    private: boolean(),
  },
  returns: githubRepositoryResult,
  handler: async (ctx, args): Promise<GitHubRepositoryResult> => {
    await assertCreateRun(ctx, args);
    await requireProvisioningContinuation(ctx, args);

    const repoName = toSafeRepoName(args.repositoryName);
    if (!repoName) {
      throw new Error("Repository name is required.");
    }
    const access = await resolveGitHubAppAccessForProvisioningRun(ctx, {
      runId: args.runId,
      userId: args.userId,
      vaultId: args.vaultId,
    });
    const repositoryOwner = requireMatchingGitHubOwnerLogin({
      expectedOwnerLogin: access.githubOwnerLogin,
      repositoryOwner: args.repositoryOwner,
    });

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
  },
  returns: githubRepositoryResult,
  handler: async (ctx, args): Promise<GitHubRepositoryResult> => {
    await assertConnectExistingRepositoryRun(ctx, args);
    await requireProvisioningContinuation(ctx, args);

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "fetch_github_repo",
      level: "info",
      message: "Checking existing GitHub repository.",
      state: "running",
    });

    const access = await resolveGitHubAppAccessForProvisioningRun(ctx, {
      runId: args.runId,
      userId: args.userId,
      vaultId: args.vaultId,
    });
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "fetch_github_repo",
    });
    const octokit = await createGitHubRepositoryInstallationOctokit(
      access.githubInstallationId,
      args.ghRepoId,
    );
    const repo = await resolveGitHubRepositoryById({
      octokit,
      ghRepoId: args.ghRepoId,
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

    const ownerName = repo.data.owner.login;
    const repoFinalName = repo.data.name;
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
      ghRepoId: args.ghRepoId,
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
    ghRepoId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertCreateRun(ctx, args);
    await requireConnectedVaultRepositoryIdentity(ctx, args);
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
      vaultId: args.vaultId,
    });
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "seed_starter",
    });
    const octokit = await createGitHubRepositoryInstallationOctokit(
      access.githubInstallationId,
      args.ghRepoId,
    );
    const repositoryResponse = await resolveGitHubRepositoryById({
      octokit,
      ghRepoId: args.ghRepoId,
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

export const createVaultForRepository = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    ghRepoId: string(),
    ownerName: string(),
    repoName: string(),
    defaultBranch: string(),
    visibility: union(literal("private"), literal("public")),
  },
  returns: vaultCreatedResult,
  handler: async (ctx, args): Promise<{ vaultId: Id<"vaults"> }> => {
    await assertCreateRun(ctx, args);
    await requireProvisioningContinuation(ctx, args);

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
    ownerName: string(),
    repoName: string(),
    defaultBranch: string(),
    visibility: union(literal("private"), literal("public")),
  },
  returns: vaultCreatedResult,
  handler: async (ctx, args): Promise<{ vaultId: Id<"vaults"> }> => {
    await assertConnectExistingRepositoryRun(ctx, args);
    await requireProvisioningContinuation(ctx, args);

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
    ghRepoId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await assertSourceSetupRun(ctx, args);
    await requireConnectedVaultRepositoryIdentity(ctx, args);
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
      vaultId: args.vaultId,
    });
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "sync_tree",
    });
    const octokit = await createGitHubRepositoryInstallationOctokit(
      access.githubInstallationId,
      args.ghRepoId,
    );
    const repositoryResponse = await resolveGitHubRepositoryById({
      octokit,
      ghRepoId: args.ghRepoId,
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

    await ctx.runMutation(internal.vault.branches.upsertVaultBranchTree, {
      vaultId: args.vaultId,
      branch: defaultBranch,
      treeData: tree.data,
      commitSHA: branchData.data.commit.sha,
      authority: {
        kind: "provisioning",
        runId: args.runId,
        userId: args.userId,
        vaultId: args.vaultId,
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
