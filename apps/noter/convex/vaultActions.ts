"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { Daytona } from "@daytonaio/sdk";
import { getUserId } from "./common";
import {
  DAYTONA_COMMIT_PINNED_BRANCH,
  inferCommitPinnedSnapshotPrefix,
} from "./daytona/snapshotPolicy";
import { createInfraProviders } from "./infraProviders";
import { deleteHostingResources } from "./hostingProviders";
import { toErrorMessage } from "./jsonUtils";
import { toSafeRepoName } from "./repoName";
import { isAdminUser } from "./users";
import { resolveCloudflareMcpServerUrl } from "./cloudflareMcp";
import {
  createStarterSeedGitClient,
  seedRepositoryWithStarter,
} from "./starterSeed";
import {
  buildRemoteBranchDeleteRef,
  getRemoteBranchDeleteEligibility,
} from "../shared/remoteBranchDelete";

const { optional } = v;

function isProviderNotFoundError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const status = Reflect.get(error, "status");
    if (typeof status === "number" && status === 404) {
      return true;
    }
    const response = Reflect.get(error, "response");
    if (typeof response === "object" && response !== null) {
      const responseStatus = Reflect.get(response, "status");
      if (typeof responseStatus === "number" && responseStatus === 404) {
        return true;
      }
    }
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("(404)") ||
    message.includes("not found") ||
    message.includes("404")
  );
}

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

function getRemoteBranchDeleteErrorMessage(
  reason:
    | "deleted_upstream"
    | "default_branch"
    | "protected_branch"
    | "has_staged_files"
    | "ahead_behind_unavailable"
    | "ahead_of_default",
): string {
  if (reason === "deleted_upstream") {
    return "Branch is already deleted upstream.";
  }
  if (reason === "default_branch") {
    return "The repository default branch cannot be deleted here.";
  }
  if (reason === "protected_branch") {
    return "Protected branches cannot be deleted here.";
  }
  if (reason === "has_staged_files") {
    return "Branch cannot be deleted while it has staged files in Noter.";
  }
  if (reason === "ahead_of_default") {
    return "Branch cannot be deleted while it has commits ahead of the default branch.";
  }
  return "Branch delete is unavailable until ahead/behind data is synced.";
}

async function resolveAheadByAgainstDefaultBranch(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branchName: string;
}): Promise<{
  defaultBranch: string;
  aheadBy?: number;
}> {
  const repository = await args.octokit.rest.repos.get({
    owner: args.owner,
    repo: args.repo,
  });
  const defaultBranch = readDefaultBranch(repository.data);
  if (args.branchName === defaultBranch) {
    return {
      defaultBranch,
      aheadBy: 0,
    };
  }

  const comparison = await args.octokit.rest.repos.compareCommitsWithBasehead({
    owner: args.owner,
    repo: args.repo,
    basehead: `${defaultBranch}...${args.branchName}`,
  });
  const aheadBy = comparison.data.ahead_by;
  return {
    defaultBranch,
    aheadBy: typeof aheadBy === "number" ? aheadBy : undefined,
  };
}

const DAYTONA_API_URL_ENV = "DAYTONA_API_URL";
const DAYTONA_API_TOKEN_ENV = "DAYTONA_API_TOKEN";
const DAYTONA_API_KEY_ENV = "DAYTONA_API_KEY";
const DAYTONA_SANDBOX_LIST_LIMIT = 100;
const DAYTONA_SNAPSHOT_LIST_LIMIT = 100;

type DaytonaSandbox = Awaited<ReturnType<Daytona["list"]>>["items"][number];
type SnapshotService = Daytona["snapshot"];
type DaytonaSnapshot = Awaited<
  ReturnType<SnapshotService["list"]>
>["items"][number];

function resolveDaytonaApiConfig():
  | { ok: true; baseUrl: string; token: string }
  | { ok: false; message: string } {
  const baseUrl = process.env[DAYTONA_API_URL_ENV]?.trim() ?? "";
  const token =
    process.env[DAYTONA_API_TOKEN_ENV] ??
    process.env[DAYTONA_API_KEY_ENV] ??
    "";
  const missing = [
    baseUrl.length === 0 ? DAYTONA_API_URL_ENV : null,
    token.length === 0
      ? `${DAYTONA_API_TOKEN_ENV} (or ${DAYTONA_API_KEY_ENV})`
      : null,
  ].filter((value): value is string => value !== null);

  if (missing.length > 0) {
    return {
      ok: false,
      message:
        missing.length === 0
          ? "Daytona is not configured."
          : `Daytona is not configured. Missing ${missing.join(", ")}.`,
    };
  }

  const isHttp =
    baseUrl.startsWith("http://") || baseUrl.startsWith("https://");
  if (!isHttp) {
    return {
      ok: false,
      message: `DAYTONA_API_URL must start with http:// or https:// (received "${baseUrl}").`,
    };
  }

  return { ok: true, baseUrl, token };
}

function inferDaytonaSnapshotPrefix(args: {
  owner: string;
  repo: string;
}): string | null {
  try {
    const base = inferCommitPinnedSnapshotPrefix(args);
    return base.length > 0 ? base : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("daytona:delete:prefix:failed", { message });
    return null;
  }
}

async function listDaytonaSandboxes(
  daytona: Daytona,
  labels: Record<string, string>,
): Promise<DaytonaSandbox[]> {
  const sandboxes: DaytonaSandbox[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await daytona.list(labels, page, DAYTONA_SANDBOX_LIST_LIMIT);
    sandboxes.push(...result.items);
    totalPages = result.totalPages;
    page += 1;
  } while (page <= totalPages);

  return sandboxes;
}

async function listDaytonaSnapshots(
  daytona: Daytona,
): Promise<DaytonaSnapshot[]> {
  const snapshots: DaytonaSnapshot[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await daytona.snapshot.list(
      page,
      DAYTONA_SNAPSHOT_LIST_LIMIT,
    );
    snapshots.push(...result.items);
    totalPages = result.totalPages;
    page += 1;
  } while (page <= totalPages);

  return snapshots;
}

export const connectRepository = action({
  args: {
    repositoryFullName: v.string(),
  },
  returns: v.object({
    vaultId: v.string(),
    repositoryFullName: v.string(),
    defaultBranch: v.string(),
    filesDownloaded: v.optional(v.number()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    vaultId: string;
    repositoryFullName: string;
    defaultBranch: string;
    filesDownloaded?: number;
  }> => {
    const userId = await getUserId(ctx);
    const githubConnection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId,
        kind: "github",
      },
    );
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });

    const ownerName = args.repositoryFullName.split("/")[0];
    const repoName = args.repositoryFullName.split("/")[1];

    if (!ownerName || !repoName) {
      throw new Error("Invalid repository full name");
    }

    const repo = await octokit.rest.repos.get({
      owner: ownerName,
      repo: repoName,
    });

    const defaultBranch = repo.data.default_branch;
    const branchData = await octokit.rest.repos.getBranch({
      owner: ownerName,
      repo: repoName,
      branch: defaultBranch,
    });

    const tree = await octokit.rest.git.getTree({
      owner: ownerName,
      repo: repoName,
      tree_sha: defaultBranch,
      recursive: "1",
    });

    const vaultId = await ctx.runMutation(internal.vault.addVault, {
      ghRepoId: repo.data.id.toString(),
      ghRepoOwner: repo.data.owner.login,
      ghRepoName: repo.data.name,
      treeSHA: tree.data.sha,
      commitSHA: branchData.data.commit.sha,
      treeData: tree.data,
      state: "ready",
      isNoterManaged: false,
    });

    // await ctx.scheduler.runAfter(
    //   0,
    //   internal.gitOperationsActions.downloadGitRepositoryAndMarkReady,
    //   {
    //     userId: currentUser._id,
    //     vaultId,
    //     repositoryUrl: repo.data.clone_url,
    //     branch: repo.data.default_branch,
    //   },
    // );

    return {
      vaultId,
      repositoryFullName: `${repo.data.owner.login}/${repo.data.name}`,
      defaultBranch,
    };
  },
});

export const createRepository = action({
  args: {
    name: v.string(),
    description: optional(v.string()),
    private: optional(v.boolean()),
  },
  returns: v.object({
    vaultId: v.string(),
  }),
  handler: async (ctx, args): Promise<{ vaultId: string }> => {
    const userId = await getUserId(ctx);

    const [
      currentUser,
      githubConnection,
      convexConnection,
      cloudflareConnection,
    ] = await Promise.all([
      ctx.runQuery(internal.users.getById, { userId }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId,
        kind: "github",
      }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId,
        kind: "convex",
      }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId,
        kind: "cloudflare",
      }),
    ]);

    if (!currentUser) {
      throw new Error("User not found.");
    }

    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
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

    const repoName = toSafeRepoName(args.name);
    if (!repoName) {
      throw new Error("Repository name is required");
    }

    const octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });

    const repo = await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      auto_init: false,
      private: args.private ?? true,
      description: args.description ?? undefined,
    });

    const ownerName = repo.data.owner.login;
    const repoFinalName = repo.data.name;
    const defaultBranch = readDefaultBranch(repo.data);

    try {
      await seedRepositoryWithStarter({
        client: createStarterSeedGitClient(octokit),
        owner: ownerName,
        repo: repoFinalName,
        defaultBranch,
      });
    } catch (error) {
      const seedErrorMessage = toErrorMessage(error);
      let cleanupErrorMessage: string | undefined;

      console.error("seed:failed", {
        repo: `${ownerName}/${repoFinalName}`,
        message: seedErrorMessage,
      });

      try {
        await octokit.rest.repos.delete({
          owner: ownerName,
          repo: repoFinalName,
        });
      } catch (cleanupError) {
        cleanupErrorMessage = toErrorMessage(cleanupError);
        console.error("seed:cleanup_failed", {
          repo: `${ownerName}/${repoFinalName}`,
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

    const tree = await octokit.rest.git.getTree({
      owner: ownerName,
      repo: repoFinalName,
      tree_sha: defaultBranch,
      recursive: "1",
    });
    const branchData = await octokit.rest.repos.getBranch({
      owner: ownerName,
      repo: repoFinalName,
      branch: defaultBranch,
    });

    const vaultId = await ctx.runMutation(internal.vault.addVault, {
      ghRepoId: repo.data.id.toString(),
      ghRepoOwner: ownerName,
      ghRepoName: repoFinalName,
      treeSHA: tree.data.sha,
      commitSHA: branchData.data.commit.sha,
      treeData: tree.data,
      state: "ready",
      isNoterManaged: true,
      hostingProvider: "cloudflare",
    });

    await ctx.scheduler.runAfter(
      0,
      internal.infraProvisioning.provisionVaultInfrastructure,
      {
        vaultId,
      },
    );

    return { vaultId };
  },
});

export const retryInfrastructureProvisioning = action({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });
    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }
    if (vault.isNoterManaged !== true) {
      throw new Error(
        "Infrastructure retry is available only for Noter-managed vaults",
      );
    }

    await ctx.scheduler.runAfter(
      0,
      internal.infraProvisioning.provisionVaultInfrastructure,
      {
        vaultId: args.vaultId,
        force: true,
      },
    );

    return null;
  },
});

export const deleteVault = action({
  args: {
    vaultId: v.id("vaults"),
    removeCodespaces: v.optional(v.boolean()),
    removeGithubRepo: v.optional(v.boolean()),
    removeConvexProvision: v.optional(v.boolean()),
    removeHostingProvision: v.optional(v.boolean()),
    removeDaytonaResources: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const [githubConnection, convexConnection, cloudflareConnection] =
      await Promise.all([
        ctx.runQuery(internal.providerConnections.getByUserAndKind, {
          userId,
          kind: "github",
        }),
        ctx.runQuery(internal.providerConnections.getByUserAndKind, {
          userId,
          kind: "convex",
        }),
        ctx.runQuery(internal.providerConnections.getByUserAndKind, {
          userId,
          kind: "cloudflare",
        }),
      ]);
    let octokit: Octokit | null = null;
    const getOctokit = async (): Promise<Octokit> => {
      if (octokit) {
        return octokit;
      }

      if (githubConnection?.kind !== "github") {
        throw new Error("GitHub is not connected");
      }

      octokit = new Octokit({
        auth: githubConnection.auth.credential,
      });
      return octokit;
    };

    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    const infrastructure = await ctx.runQuery(
      internal.vault.getInfrastructureByVaultId,
      {
        vaultId: args.vaultId,
      },
    );

    const cloudflareProjectName =
      infrastructure?.hosting?.provider === "cloudflare"
        ? infrastructure.hosting.projectName
        : undefined;
    const cloudflareAccountId =
      infrastructure?.hosting?.provider === "cloudflare"
        ? infrastructure.hosting.accountId
        : undefined;
    const shouldRemoveHostingProvision =
      args.removeHostingProvision === true &&
      vault.isNoterManaged === true &&
      typeof cloudflareProjectName === "string" &&
      typeof cloudflareAccountId === "string";
    const shouldRemoveConvexProvision =
      args.removeConvexProvision === true &&
      vault.isNoterManaged === true &&
      (typeof infrastructure?.convexProjectId === "string" ||
        typeof infrastructure?.convexDeploymentName === "string");
    const shouldRemoveRepo =
      args.removeGithubRepo === true && vault.isNoterManaged === true;
    const shouldRemoveCodespaces = args.removeCodespaces === true;
    const shouldRemoveDaytonaResources = args.removeDaytonaResources === true;

    if (shouldRemoveHostingProvision || shouldRemoveConvexProvision) {
      const convexToken = shouldRemoveConvexProvision
        ? convexConnection?.kind === "convex"
          ? convexConnection.auth.credential
          : undefined
        : undefined;
      if (shouldRemoveConvexProvision && !convexToken) {
        throw new Error("Convex connection is required to remove resources.");
      }
      const cloudflareToken = shouldRemoveHostingProvision
        ? cloudflareConnection?.kind === "cloudflare"
          ? cloudflareConnection.auth.credential
          : undefined
        : undefined;
      if (shouldRemoveHostingProvision && !cloudflareToken) {
        throw new Error(
          "Cloudflare connection is required to remove resources.",
        );
      }
      const cloudflareServerUrl =
        shouldRemoveHostingProvision &&
        cloudflareConnection?.kind === "cloudflare"
          ? resolveCloudflareMcpServerUrl(cloudflareConnection)
          : resolveCloudflareMcpServerUrl(null);

      const providers = createInfraProviders({
        convexToken,
      });

      if (shouldRemoveHostingProvision) {
        if (
          typeof cloudflareProjectName === "string" &&
          typeof cloudflareAccountId === "string" &&
          cloudflareToken
        ) {
          try {
            await deleteHostingResources({
              provider: "cloudflare",
              accountId: cloudflareAccountId,
              projectName: cloudflareProjectName,
              cloudflareToken,
              cloudflareServerUrl,
            });
          } catch (error) {
            if (!isProviderNotFoundError(error)) {
              throw error;
            }
          }
        }
      }

      if (shouldRemoveConvexProvision) {
        const convexProjectId = infrastructure.convexProjectId;
        const convexDeploymentName = infrastructure.convexDeploymentName;
        try {
          if (typeof convexProjectId === "string") {
            await providers.convex.request(
              `/projects/${encodeURIComponent(convexProjectId)}/delete`,
              "POST",
            );
          } else if (typeof convexDeploymentName === "string") {
            await providers.convex.request(
              `/deployments/${encodeURIComponent(convexDeploymentName)}/delete`,
              "POST",
            );
          }
        } catch (error) {
          if (!isProviderNotFoundError(error)) {
            throw error;
          }
        }
      }
    }

    if (shouldRemoveDaytonaResources) {
      const apiConfig = resolveDaytonaApiConfig();
      if (!apiConfig.ok) {
        throw new Error(apiConfig.message);
      }

      const config: { apiKey: string; apiUrl?: string; target?: string } = {
        apiKey: apiConfig.token,
      };
      if (apiConfig.baseUrl) {
        config.apiUrl = apiConfig.baseUrl;
      }

      const daytona = new Daytona(config);
      const vaultIdLabel = String(args.vaultId);
      const sandboxIds = new Set<string>();
      if (vault.daytonaSandboxId) {
        sandboxIds.add(vault.daytonaSandboxId);
      }

      const sandboxes = await listDaytonaSandboxes(daytona, {
        "noter.vault_id": vaultIdLabel,
      });
      for (const sandbox of sandboxes) {
        if (sandbox.id) {
          sandboxIds.add(sandbox.id);
        }
      }

      for (const sandboxId of sandboxIds) {
        try {
          const sandbox = await daytona.get(sandboxId);
          await sandbox.delete();
        } catch (error) {
          if (!isProviderNotFoundError(error)) {
            throw error;
          }
        }
      }

      const hasOtherVaultsForRepository = await ctx.runQuery(
        internal.vault.hasOtherVaultsForRepository,
        {
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          excludeVaultId: vault._id,
        },
      );
      if (!hasOtherVaultsForRepository) {
        const snapshotPrefix = inferDaytonaSnapshotPrefix({
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
        });

        const snapshotNames = new Set<string>();
        if (vault.daytonaSnapshotName) {
          snapshotNames.add(vault.daytonaSnapshotName);
        }
        if (vault.daytonaPrebuildLogsSnapshot) {
          snapshotNames.add(vault.daytonaPrebuildLogsSnapshot);
        }

        const snapshotRecords = await ctx.runQuery(
          internal.daytona.snapshotRecords.listByRepoBranch,
          {
            owner: vault.ghRepoOwner,
            repo: vault.ghRepoName,
            branch: DAYTONA_COMMIT_PINNED_BRANCH,
          },
        );
        for (const snapshotRecord of snapshotRecords) {
          if (snapshotRecord.snapshotName) {
            snapshotNames.add(snapshotRecord.snapshotName);
          }
        }

        const snapshotsByName = new Map<string, DaytonaSnapshot>();
        if (snapshotPrefix) {
          const snapshots = await listDaytonaSnapshots(daytona);
          for (const snapshot of snapshots) {
            if (snapshot.name.startsWith(snapshotPrefix)) {
              snapshotsByName.set(snapshot.name, snapshot);
              snapshotNames.add(snapshot.name);
            }
          }
        }

        const hasOtherVaultsBeforeSnapshotDeletion = await ctx.runQuery(
          internal.vault.hasOtherVaultsForRepository,
          {
            owner: vault.ghRepoOwner,
            repo: vault.ghRepoName,
            excludeVaultId: vault._id,
          },
        );
        if (!hasOtherVaultsBeforeSnapshotDeletion) {
          for (const snapshotName of snapshotNames) {
            try {
              const snapshot =
                snapshotsByName.get(snapshotName) ??
                (await daytona.snapshot.get(snapshotName));
              await daytona.snapshot.delete(snapshot);
            } catch (error) {
              if (!isProviderNotFoundError(error)) {
                throw error;
              }
            }
          }
        }
      }
    }

    if (shouldRemoveCodespaces) {
      const codespaces = await ctx.runQuery(
        internal.codespacesMutations.listConnectedCodespacesForVault,
        { vaultId: args.vaultId, userId },
      );

      if (codespaces.length > 0) {
        const octokit = await getOctokit();

        for (const codespace of codespaces) {
          await ctx.runMutation(
            internal.codespacesMutations.updateCodespaceState,
            {
              codespaceId: codespace._id,
              state: "deleting",
            },
          );

          try {
            await octokit.rest.codespaces.deleteForAuthenticatedUser({
              codespace_name: codespace.ghCodespaceName,
            });
          } catch (error) {
            if (!isProviderNotFoundError(error)) {
              await ctx.runMutation(
                internal.codespacesMutations.updateCodespaceState,
                {
                  codespaceId: codespace._id,
                  state: "failed",
                },
              );
              throw error;
            }
          }

          await ctx.runMutation(
            internal.codespacesMutations.updateCodespaceState,
            {
              codespaceId: codespace._id,
              state: "deleted",
              deletedAt: Date.now(),
            },
          );
          await ctx.runMutation(
            internal.codespacesMutations.clearActiveCodespace,
            {
              vaultId: args.vaultId,
              codespaceId: codespace._id,
            },
          );
        }
      }
    }

    if (shouldRemoveRepo) {
      const octokit = await getOctokit();

      await octokit.rest.repos.delete({
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
      });
    }

    await ctx.runMutation(api.vault.removeVault, {
      vaultId: args.vaultId,
    });

    return null;
  },
});

export const deleteRemoteBranch = action({
  args: {
    vaultId: v.id("vaults"),
    branchName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const [vault, githubConnection] = await Promise.all([
      ctx.runQuery(internal.vault.getById, {
        id: args.vaultId,
      }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId,
        kind: "github",
      }),
    ]);

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const [cachedBranch, hasStagedFiles] = await Promise.all([
      ctx.runQuery(internal.vault.getVaultRemoteBranch, {
        vaultId: args.vaultId,
        branchName: args.branchName,
      }),
      ctx.runQuery(internal.fileStaging.hasStagedFilesForBranch, {
        vaultId: args.vaultId,
        branch: args.branchName,
      }),
    ]);

    if (!cachedBranch) {
      throw new Error("Branch not found");
    }

    const cachedEligibility = getRemoteBranchDeleteEligibility({
      remoteState: cachedBranch.remoteState,
      isDefault: cachedBranch.isDefault,
      isProtected: cachedBranch.isProtected,
      stagedFilesCount: hasStagedFiles ? 1 : 0,
      aheadBy: cachedBranch.aheadBy,
    });
    if (
      cachedEligibility.reason === "deleted_upstream" ||
      cachedEligibility.reason === "default_branch" ||
      cachedEligibility.reason === "protected_branch" ||
      cachedEligibility.reason === "has_staged_files"
    ) {
      throw new Error(
        getRemoteBranchDeleteErrorMessage(cachedEligibility.reason),
      );
    }

    const octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });
    const syncRepositoryState = async () => {
      await ctx.runMutation(internal.vault.pruneVaultRemoteBranchCache, {
        vaultId: args.vaultId,
        branchName: args.branchName,
      });
      await ctx.runMutation(
        internal.fileStaging.deleteCollaborativeUpdatesBatch,
        {
          vaultId: args.vaultId,
          branch: args.branchName,
        },
      );
      await ctx.runAction(internal.github.updateRepositoryTree, {
        userId,
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        includeAheadBehind: true,
        includePullRequestLinks: true,
      });
    };

    let freshDefaultBranch: string;
    let freshAheadBy: number | undefined;
    try {
      const freshComparison = await resolveAheadByAgainstDefaultBranch({
        octokit,
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        branchName: args.branchName,
      });
      freshDefaultBranch = freshComparison.defaultBranch;
      freshAheadBy = freshComparison.aheadBy;
    } catch (error) {
      if (isProviderNotFoundError(error)) {
        await syncRepositoryState();
        return null;
      }
      throw error;
    }

    const freshEligibility = getRemoteBranchDeleteEligibility({
      remoteState: "active",
      isDefault: args.branchName === freshDefaultBranch,
      isProtected: cachedBranch.isProtected,
      stagedFilesCount: hasStagedFiles ? 1 : 0,
      aheadBy: freshAheadBy,
    });
    if (!freshEligibility.canDelete) {
      throw new Error(
        getRemoteBranchDeleteErrorMessage(freshEligibility.reason),
      );
    }

    try {
      await octokit.rest.git.deleteRef({
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        ref: buildRemoteBranchDeleteRef(args.branchName),
      });
    } catch (error) {
      if (isProviderNotFoundError(error)) {
        await syncRepositoryState();
        return null;
      }
      throw error;
    }

    await syncRepositoryState();
    return null;
  },
});
