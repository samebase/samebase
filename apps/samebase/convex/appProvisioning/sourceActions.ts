"use node";

import { Octokit } from "@octokit/rest";
import { v } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { toErrorMessage } from "../jsonUtils";
import { toSafeRepoName } from "../../shared/repoName";
import type {
  AppProvisioningEventLevel,
  AppProvisioningRunState,
  AppProvisioningStep,
} from "./model";
import { createStarterSeedGitClient, seedRepositoryWithStarter } from "../starterSeed";
import {
  formatProviderApiCallLogMessage,
  type ProviderApiCall,
  type ProviderApiCallRecorder,
} from "../providerApiLog";

const { boolean, id, literal, object, string, union } = v;

const descriptionValidator = union(string(), v.null());
const githubRepositoryResult = object({
  ghRepoId: string(),
  ownerName: string(),
  repoName: string(),
  defaultBranch: string(),
  visibility: union(literal("private"), literal("public")),
});
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

function readRepositoryCoordinates(args: { ownerName: string; repoName: string }): {
  ownerName: string;
  repoName: string;
} {
  const ownerName = args.ownerName.trim();
  const repoName = args.repoName.trim();
  if (!ownerName || !repoName || ownerName.includes("/") || repoName.includes("/")) {
    throw new Error("Invalid repository full name.");
  }
  return { ownerName, repoName };
}

async function getProvisioningRun(
  ctx: Pick<ActionCtx, "runQuery">,
  runId: Id<"appProvisioningRuns">,
): Promise<Doc<"appProvisioningRuns">> {
  const run = await ctx.runQuery(internal.appProvisioning.runs.getById, {
    runId,
  });
  if (!run) {
    throw new Error("Provisioning run not found.");
  }
  return run;
}

async function resolveGitHubOctokit(
  ctx: Pick<ActionCtx, "runQuery">,
  userId: Id<"users">,
): Promise<Octokit> {
  const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
    userId,
    kind: "github",
  });
  if (githubConnection?.kind !== "github") {
    throw new Error("GitHub is not connected.");
  }

  return new Octokit({
    auth: githubConnection.auth.credential,
  });
}

async function appendRunEvent(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"appProvisioningRuns">;
    step: AppProvisioningStep;
    level: AppProvisioningEventLevel;
    message: string;
    state: "unchanged" | AppProvisioningRunState;
  },
): Promise<void> {
  await ctx.runMutation(internal.appProvisioning.runs.appendRunEvent, args);
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

async function assertCreateRun(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
  },
): Promise<Doc<"appProvisioningRuns">> {
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
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
  },
): Promise<Doc<"appProvisioningRuns">> {
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
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
  },
): Promise<Doc<"appProvisioningRuns">> {
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

export const validateCreateAppConnections = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    repositoryName: string(),
    repositoryOwner: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertCreateRun(ctx, args);

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
    if (!args.repositoryOwner.trim()) {
      throw new Error("GitHub owner is required.");
    }

    const [currentUser, githubConnection, convexConnection, cloudflareConnection] =
      await Promise.all([
        ctx.runQuery(internal.users.getById, { userId: args.userId }),
        ctx.runQuery(internal.providerConnections.getByUserAndKind, {
          userId: args.userId,
          kind: "github",
        }),
        ctx.runQuery(internal.providerConnections.getByUserAndKind, {
          userId: args.userId,
          kind: "convex",
        }),
        ctx.runQuery(internal.providerConnections.getByUserAndKind, {
          userId: args.userId,
          kind: "cloudflare",
        }),
      ]);

    if (!currentUser) {
      throw new Error("User not found.");
    }
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected.");
    }
    if (convexConnection?.kind !== "convex") {
      throw new Error("Convex connection is required to create a project.");
    }
    if (cloudflareConnection?.kind !== "cloudflare") {
      throw new Error("Cloudflare connection is required to create a Worker-backed app.");
    }

    return null;
  },
});

export const createGitHubRepository = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    repositoryName: string(),
    repositoryOwner: string(),
    description: descriptionValidator,
    private: boolean(),
  },
  returns: githubRepositoryResult,
  handler: async (ctx, args) => {
    await assertCreateRun(ctx, args);

    const repoName = toSafeRepoName(args.repositoryName);
    if (!repoName) {
      throw new Error("Repository name is required.");
    }
    const repositoryOwner = args.repositoryOwner.trim();
    if (!repositoryOwner) {
      throw new Error("GitHub owner is required.");
    }

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "create_github_repo",
      level: "info",
      message: "Creating GitHub repository.",
      state: "running",
    });

    const octokit = await resolveGitHubOctokit(ctx, args.userId);
    const description = args.description?.trim();
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "create_github_repo",
    });
    await recordApiCall({
      provider: "GitHub",
      method: "GET",
      endpoint: "/user",
    });
    const viewer = await octokit.rest.users.getAuthenticated();
    const repositoryBody = {
      name: repoName,
      auto_init: false,
      private: args.private,
      ...(description ? { description } : {}),
    };
    const repo = await (async () => {
      if (viewer.data.login === repositoryOwner) {
        await recordApiCall({
          provider: "GitHub",
          method: "POST",
          endpoint: "/user/repos",
          values: { body: repositoryBody },
        });
        return await octokit.rest.repos.createForAuthenticatedUser(repositoryBody);
      }

      await recordApiCall({
        provider: "GitHub",
        method: "POST",
        endpoint: "/orgs/{org}/repos",
        values: {
          body: repositoryBody,
          params: { path: { org: repositoryOwner } },
        },
      });
      return await octokit.rest.repos.createInOrg({
        ...repositoryBody,
        org: repositoryOwner,
      });
    })();

    const ownerName = repo.data.owner.login;
    const repoFinalName = repo.data.name;
    const repositoryFullName = `${ownerName}/${repoFinalName}`;
    await ctx.runMutation(internal.appProvisioning.runs.recordRepositoryFullName, {
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

export const validateExistingRepositoryConnection = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    ownerName: string(),
    repoName: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertConnectExistingRepositoryRun(ctx, args);

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "validate_connections",
      level: "info",
      message: "Checking provider connections.",
      state: "running",
    });

    readRepositoryCoordinates(args);

    const [currentUser, githubConnection] = await Promise.all([
      ctx.runQuery(internal.users.getById, { userId: args.userId }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId: args.userId,
        kind: "github",
      }),
    ]);

    if (!currentUser) {
      throw new Error("User not found.");
    }
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected.");
    }

    return null;
  },
});

export const fetchExistingGitHubRepository = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    ownerName: string(),
    repoName: string(),
  },
  returns: githubRepositoryResult,
  handler: async (ctx, args) => {
    await assertConnectExistingRepositoryRun(ctx, args);
    const requestedRepository = readRepositoryCoordinates(args);

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "fetch_github_repo",
      level: "info",
      message: "Checking existing GitHub repository.",
      state: "running",
    });

    const octokit = await resolveGitHubOctokit(ctx, args.userId);
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
          path: requestedRepository,
        },
      },
    });
    const repo = await octokit.rest.repos.get({
      owner: requestedRepository.ownerName,
      repo: requestedRepository.repoName,
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
    await ctx.runMutation(internal.appProvisioning.runs.recordRepositoryFullName, {
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
      ghRepoId: repo.data.id.toString(),
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
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    ownerName: string(),
    repoName: string(),
    defaultBranch: string(),
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

    const octokit = await resolveGitHubOctokit(ctx, args.userId);
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "seed_starter",
    });
    try {
      await seedRepositoryWithStarter({
        client: createStarterSeedGitClient(octokit, { recordApiCall }),
        owner: args.ownerName,
        repo: args.repoName,
        defaultBranch: args.defaultBranch,
      });
    } catch (error) {
      const seedErrorMessage = toErrorMessage(error);

      console.error("seed:failed", {
        repo: `${args.ownerName}/${args.repoName}`,
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
    runId: id("appProvisioningRuns"),
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
    runId: id("appProvisioningRuns"),
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
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    ownerName: string(),
    repoName: string(),
    defaultBranch: string(),
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

    const octokit = await resolveGitHubOctokit(ctx, args.userId);
    const recordApiCall = createProviderApiCallRecorder(ctx, {
      runId: args.runId,
      step: "sync_tree",
    });
    await recordApiCall({
      provider: "GitHub",
      method: "GET",
      endpoint: "/repos/{owner}/{repo}/git/trees/{tree_sha}",
      values: {
        params: {
          path: {
            ownerName: args.ownerName,
            repoName: args.repoName,
            tree_sha: args.defaultBranch,
          },
          query: {
            recursive: "1",
          },
        },
      },
    });
    const tree = await octokit.rest.git.getTree({
      owner: args.ownerName,
      repo: args.repoName,
      tree_sha: args.defaultBranch,
      recursive: "1",
    });
    await recordApiCall({
      provider: "GitHub",
      method: "GET",
      endpoint: "/repos/{owner}/{repo}/branches/{branch}",
      values: {
        params: {
          path: {
            ownerName: args.ownerName,
            repoName: args.repoName,
            branch: args.defaultBranch,
          },
        },
      },
    });
    const branchData = await octokit.rest.repos.getBranch({
      owner: args.ownerName,
      repo: args.repoName,
      branch: args.defaultBranch,
    });

    await ctx.runMutation(internal.vault.branches.upsertVaultBranchTree, {
      vaultId: args.vaultId,
      branch: args.defaultBranch,
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

export const finishExistingRepositoryConnection = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await assertConnectExistingRepositoryRun(ctx, args);

    const result = await ctx.runMutation(
      internal.repositoryRefresh.completeExistingRepositoryConnectionAndEnqueueRefresh,
      {
        userId: args.userId,
        vaultId: args.vaultId,
        runId: args.runId,
      },
    );
    if (result.kind === "blocked") {
      throw new Error(
        `Existing repository refresh enqueue was blocked: reason=${result.reason}, runId=${args.runId}, userId=${args.userId}, vaultId=${args.vaultId}.`,
      );
    }

    return null;
  },
});
