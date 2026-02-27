"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { Daytona } from "@daytonaio/sdk";
import { getUserId } from "./common";
import { getEnvLabel } from "./env";
import { createInfraProviders } from "./infraProviders";
import { deleteHostingResources } from "./hostingProviders";
import { resolveNetlifySiteId } from "./hostingStateHelpers";
import { toErrorMessage } from "./jsonUtils";
import { toSafeRepoName } from "./repoName";
import {
  createStarterSeedGitClient,
  seedRepositoryWithStarter,
} from "./starterSeed";
import { agentTemplateManifest } from "./agentSeedManifest.generated";

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
    const envLabel = getEnvLabel();
    const base = toSafeRepoName(
      `noter-prebuild-${envLabel}-${args.owner}-${args.repo}-`,
    );
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
    filesDownloaded: v.optional(v.number()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ vaultId: string; filesDownloaded?: number }> => {
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

    let filesDownloaded: number | undefined;

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
      filesDownloaded,
    };
  },
});

export const createRepository = action({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    private: v.optional(v.boolean()),
    templateType: v.optional(v.union(v.literal("app"), v.literal("agent"))),
  },
  returns: v.object({
    vaultId: v.string(),
  }),
  handler: async (ctx, args): Promise<{ vaultId: string }> => {
    const userId = await getUserId(ctx);
    const [githubConnection, convexConnection, netlifyConnection] =
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
          kind: "netlify",
        }),
      ]);

    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }
    if (convexConnection?.kind !== "convex") {
      throw new Error("Convex connection is required to create a project.");
    }
    if (netlifyConnection?.kind !== "netlify") {
      throw new Error("Netlify connection is required to create a project.");
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
    const templateType = args.templateType ?? "app";

    try {
      await seedRepositoryWithStarter({
        client: createStarterSeedGitClient(octokit),
        owner: ownerName,
        repo: repoFinalName,
        defaultBranch,
        manifest: templateType === "agent" ? agentTemplateManifest : undefined,
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
      hostingProvider: "netlify",
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
    const [
      githubConnection,
      convexConnection,
      netlifyConnection,
      railwayConnection,
    ] = await Promise.all([
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
        kind: "netlify",
      }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId,
        kind: "railway",
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

    const netlifySiteId = resolveNetlifySiteId(infrastructure);
    const railwayProjectId =
      infrastructure?.hosting?.provider === "railway"
        ? infrastructure.hosting.projectId
        : undefined;
    const hostingProvider =
      infrastructure?.hosting?.provider ??
      (typeof netlifySiteId === "string" ? "netlify" : undefined);
    const shouldRemoveHostingProvision =
      args.removeHostingProvision === true &&
      vault.isNoterManaged === true &&
      ((hostingProvider === "netlify" && typeof netlifySiteId === "string") ||
        (hostingProvider === "railway" &&
          typeof railwayProjectId === "string"));
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
      const netlifyToken =
        shouldRemoveHostingProvision && hostingProvider === "netlify"
          ? netlifyConnection?.kind === "netlify"
            ? netlifyConnection.auth.credential
            : undefined
          : undefined;
      if (
        shouldRemoveHostingProvision &&
        hostingProvider === "netlify" &&
        !netlifyToken
      ) {
        throw new Error("Netlify connection is required to remove resources.");
      }
      const railwayToken =
        shouldRemoveHostingProvision && hostingProvider === "railway"
          ? railwayConnection?.kind === "railway"
            ? railwayConnection.auth.credential
            : undefined
          : undefined;
      if (
        shouldRemoveHostingProvision &&
        hostingProvider === "railway" &&
        !railwayToken
      ) {
        throw new Error("Railway connection is required to remove resources.");
      }

      const providers = createInfraProviders({
        convexToken,
        netlifyToken,
        railwayToken,
      });

      if (shouldRemoveHostingProvision && hostingProvider === "netlify") {
        if (typeof netlifySiteId === "string") {
          try {
            await deleteHostingResources({
              provider: "netlify",
              netlifyProvider: providers.netlify,
              siteId: netlifySiteId,
            });
          } catch (error) {
            if (!isProviderNotFoundError(error)) {
              throw error;
            }
          }
        }
      }
      if (shouldRemoveHostingProvision && hostingProvider === "railway") {
        if (typeof railwayProjectId === "string") {
          try {
            await deleteHostingResources({
              provider: "railway",
              railwayProvider: providers.railway,
              projectId: railwayProjectId,
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

      const snapshotNames = new Set<string>();
      if (vault.daytonaSnapshotName) {
        snapshotNames.add(vault.daytonaSnapshotName);
      }
      if (vault.daytonaPrebuildLogsSnapshot) {
        snapshotNames.add(vault.daytonaPrebuildLogsSnapshot);
      }

      const snapshotPrefix = inferDaytonaSnapshotPrefix({
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
      });

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
