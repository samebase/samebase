"use node";

import { Octokit } from "@octokit/rest";
import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { toErrorMessage } from "./jsonUtils";
import { toSafeRepoName } from "./repoName";
import { isAdminUser } from "./users";
import {
  createStarterSeedGitClient,
  seedRepositoryWithStarter,
} from "./starterSeed";

const { boolean, id, object, string, union } = v;

const descriptionValidator = union(string(), v.null());
const privateValidator = union(boolean(), v.null());
const githubRepositoryResult = object({
  ghRepoId: string(),
  ownerName: string(),
  repoName: string(),
  defaultBranch: string(),
});
const vaultCreatedResult = object({
  vaultId: id("vaults"),
});

function readDefaultBranch(repoData: unknown): string {
  if (typeof repoData !== "object" || repoData === null) {
    return "main";
  }
  const value = Reflect.get(repoData, "default_branch");
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return "main";
}

async function getProvisioningRun(
  ctx: Pick<ActionCtx, "runQuery">,
  runId: Id<"appProvisioningRuns">,
): Promise<Doc<"appProvisioningRuns">> {
  const run = await ctx.runQuery(internal.appProvisioningRuns.getById, {
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
  const githubConnection = await ctx.runQuery(
    internal.providerConnections.getByUserAndKind,
    {
      userId,
      kind: "github",
    },
  );
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
    step:
      | "validate_connections"
      | "create_github_repo"
      | "seed_starter"
      | "create_vault";
    level: "info" | "warn" | "error";
    message: string;
    state: "unchanged" | "queued" | "running" | "succeeded" | "failed";
  },
): Promise<void> {
  await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, args);
}

async function assertCreateRun(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
  },
): Promise<Doc<"appProvisioningRuns">> {
  const run = await getProvisioningRun(ctx, args.runId);
  if (run.userId !== args.userId || run.trigger !== "create") {
    throw new Error("Provisioning run does not match create workflow.");
  }
  return run;
}

export const validateCreateAppConnections = internalAction({
  args: {
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    repositoryName: string(),
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

    const [
      currentUser,
      githubConnection,
      convexConnection,
      cloudflareConnection,
    ] = await Promise.all([
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
      throw new Error(
        "Cloudflare connection is required to create a Cloudflare-hosted project.",
      );
    }

    const isAdmin = isAdminUser(githubConnection.username, currentUser.email);
    if (!isAdmin) {
      const plan = currentUser.billingPlan ?? "free";
      const status = currentUser.billingStatus ?? "inactive";
      if (!(plan === "pro" && status === "active")) {
        throw new Error("Upgrade to Pro to create a Noter-managed project.");
      }
    }

    return null;
  },
});

export const createGitHubRepository = internalAction({
  args: {
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    repositoryName: string(),
    description: descriptionValidator,
    private: privateValidator,
  },
  returns: githubRepositoryResult,
  handler: async (ctx, args) => {
    await assertCreateRun(ctx, args);

    const repoName = toSafeRepoName(args.repositoryName);
    if (!repoName) {
      throw new Error("Repository name is required.");
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
    const repo = await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      auto_init: false,
      private: args.private ?? true,
      description: description ? description : undefined,
    });

    const ownerName = repo.data.owner.login;
    const repoFinalName = repo.data.name;
    const repositoryFullName = `${ownerName}/${repoFinalName}`;
    await ctx.runMutation(
      internal.appProvisioningRuns.recordRepositoryCreated,
      {
        runId: args.runId,
        repositoryFullName,
      },
    );
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "create_github_repo",
      level: "info",
      message: `Created GitHub repository ${repositoryFullName}.`,
      state: "running",
    });

    return {
      ghRepoId: repo.data.id.toString(),
      ownerName,
      repoName: repoFinalName,
      defaultBranch: readDefaultBranch(repo.data),
    };
  },
});

export const seedStarterRepository = internalAction({
  args: {
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
    try {
      await seedRepositoryWithStarter({
        client: createStarterSeedGitClient(octokit),
        owner: args.ownerName,
        repo: args.repoName,
        defaultBranch: args.defaultBranch,
      });
    } catch (error) {
      const seedErrorMessage = toErrorMessage(error);
      let cleanupErrorMessage: string | undefined;

      console.error("seed:failed", {
        repo: `${args.ownerName}/${args.repoName}`,
        message: seedErrorMessage,
      });

      try {
        await octokit.rest.repos.delete({
          owner: args.ownerName,
          repo: args.repoName,
        });
      } catch (cleanupError) {
        cleanupErrorMessage = toErrorMessage(cleanupError);
        console.error("seed:cleanup_failed", {
          repo: `${args.ownerName}/${args.repoName}`,
          message: cleanupErrorMessage,
        });
      }

      if (cleanupErrorMessage) {
        throw new Error(
          `Failed to seed starter repository: ${seedErrorMessage}. Cleanup also failed: ${cleanupErrorMessage}`,
        );
      }

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
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    ghRepoId: string(),
    ownerName: string(),
    repoName: string(),
    defaultBranch: string(),
  },
  returns: vaultCreatedResult,
  handler: async (ctx, args): Promise<{ vaultId: Id<"vaults"> }> => {
    await assertCreateRun(ctx, args);

    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "create_vault",
      level: "info",
      message: "Creating the Noter vault.",
      state: "running",
    });

    const octokit = await resolveGitHubOctokit(ctx, args.userId);
    const tree = await octokit.rest.git.getTree({
      owner: args.ownerName,
      repo: args.repoName,
      tree_sha: args.defaultBranch,
      recursive: "1",
    });
    const branchData = await octokit.rest.repos.getBranch({
      owner: args.ownerName,
      repo: args.repoName,
      branch: args.defaultBranch,
    });

    const vaultId: Id<"vaults"> = await ctx.runMutation(
      internal.vault.addNoterManagedVaultForUser,
      {
        userId: args.userId,
        ghRepoId: args.ghRepoId,
        ghRepoOwner: args.ownerName,
        ghRepoName: args.repoName,
        treeSHA: tree.data.sha,
        commitSHA: branchData.data.commit.sha,
        treeData: tree.data,
        hostingProvider: "cloudflare",
      },
    );
    const repositoryFullName = `${args.ownerName}/${args.repoName}`;
    await ctx.runMutation(internal.appProvisioningRuns.linkVault, {
      runId: args.runId,
      vaultId,
      repositoryFullName,
    });
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "create_vault",
      level: "info",
      message: "Created the Noter vault.",
      state: "running",
    });

    return { vaultId };
  },
});
