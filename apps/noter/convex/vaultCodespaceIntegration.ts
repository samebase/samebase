"use node";

import { action, internalMutation } from "./_generated/server";
import { Infer, v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { getUserId } from "./common";

/**
 * Create a vault with an associated Codespace
 */
const createVaultWithCodespaceResult = v.object({
  vaultId: v.id("vaults"),
  codespaceId: v.id("codespaces"),
});
export const createVaultWithCodespace = action({
  args: {
    repoOwner: v.string(),
    repoName: v.string(),
    ghRepoId: v.number(),
    branch: v.optional(v.string()),
  },
  returns: createVaultWithCodespaceResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof createVaultWithCodespaceResult>> => {
    const userId = await getUserId(ctx);
    const branch = args.branch || "main";

    // Get user GitHub access token
    const user = await ctx.runQuery(internal.codespacesMutations.getUser, {
      userId,
    });

    if (!user?.githubAccessToken) {
      throw new Error("GitHub access token not found");
    }

    const octokit = new Octokit({
      auth: user.githubAccessToken,
    });

    // Get latest commit SHA from GitHub
    const { data: branchData } = await octokit.rest.repos.getBranch({
      owner: args.repoOwner,
      repo: args.repoName,
      branch,
    });

    const commitSha = branchData.commit.sha;

    // Generate devcontainer config
    const devcontainerConfig = generateDevcontainerConfig();

    // Create vault record using existing addVault mutation
    const vaultId = await ctx.runMutation(internal.vault.addVault, {
      state: "copying_files",
      ghRepoId: args.ghRepoId.toString(),
      ghRepoOwner: args.repoOwner,
      ghRepoName: args.repoName,
      treeSHA: branchData.commit.commit.tree.sha,
      treeData: {
        sha: branchData.commit.commit.tree.sha,
        url: branchData.commit.commit.tree.url,
        truncated: false,
        tree: [],
      },
    });

    // Store devcontainer config in vault
    await ctx.runAction(api.vaultCodespaceIntegration.updateVaultDevcontainer, {
      vaultId,
      devcontainerConfig,
    });

    // Create Codespace
    const { codespaceId } = await ctx.runAction(
      api.codespaces.createCodespace,
      {
        vaultId,
        branch,
        commitSha,
      },
    );

    return {
      vaultId,
      codespaceId,
    };
  },
});

/**
 * Rebuild Codespace if the main branch has changed
 */
const rebuildCodespaceIfStaleResult = v.object({
  rebuilt: v.boolean(),
  codespaceId: v.optional(v.id("codespaces")),
  reason: v.optional(v.string()),
});
export const rebuildCodespaceIfStale = action({
  args: { vaultId: v.id("vaults") },
  returns: rebuildCodespaceIfStaleResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof rebuildCodespaceIfStaleResult>> => {
    const userId = await getUserId(ctx);

    // Get vault and active codespace
    const vault = await ctx.runQuery(internal.codespacesMutations.getVault, {
      vaultId: args.vaultId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    const activeCodespace = vault.activeCodespaceId
      ? await ctx.runQuery(internal.codespacesMutations.getCodespace, {
          codespaceId: vault.activeCodespaceId,
        })
      : null;

    // Get user GitHub access token
    const user = await ctx.runQuery(internal.codespacesMutations.getUser, {
      userId,
    });

    if (!user?.githubAccessToken) {
      throw new Error("GitHub access token not found");
    }

    const octokit = new Octokit({
      auth: user.githubAccessToken,
    });

    // Get latest commit SHA from main branch
    const branch = activeCodespace?.branch || "main";
    const { data: branchData } = await octokit.rest.repos.getBranch({
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
      branch,
    });

    const latestCommitSha = branchData.commit.sha;

    // Check if codespace is stale
    if (activeCodespace && activeCodespace.commitSha === latestCommitSha) {
      return {
        rebuilt: false,
        reason: "Codespace is up to date",
      };
    }

    // Delete old codespace if it exists
    if (activeCodespace) {
      await ctx.runAction(api.codespaces.deleteCodespace, {
        codespaceId: activeCodespace._id,
      });
    }

    // Create new codespace with latest commit
    const { codespaceId } = await ctx.runAction(
      api.codespaces.createCodespace,
      {
        vaultId: args.vaultId,
        branch,
        commitSha: latestCommitSha,
      },
    );

    return {
      rebuilt: true,
      codespaceId,
      reason: activeCodespace
        ? `Rebuilt due to commit change: ${activeCodespace.commitSha.substring(0, 7)} → ${latestCommitSha.substring(0, 7)}`
        : "Created initial Codespace",
    };
  },
});

/**
 * Ensure Codespace is running and healthy before use
 */
const ensureCodespaceReadyResult = v.object({
  codespaceId: v.id("codespaces"),
  ready: v.boolean(),
});
export const ensureCodespaceReady = action({
  args: { vaultId: v.id("vaults") },
  returns: ensureCodespaceReadyResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof ensureCodespaceReadyResult>> => {
    const vault = await ctx.runQuery(internal.codespacesMutations.getVault, {
      vaultId: args.vaultId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    // Check if codespace needs rebuild
    const { rebuilt, codespaceId } = await ctx.runAction(
      api.vaultCodespaceIntegration.rebuildCodespaceIfStale,
      { vaultId: args.vaultId },
    );

    if (!codespaceId) {
      throw new Error("No codespace available");
    }

    // Get codespace state
    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId,
      },
    );

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    // Start if stopped
    if (codespace.state === "stopped") {
      await ctx.runAction(api.codespaces.startCodespace, {
        codespaceId,
      });
    }

    // Wait for running state
    if (codespace.state !== "running") {
      // Poll until running (with timeout)
      const maxWaitMs = 120000; // 2 minutes
      const startTime = Date.now();
      const pollInterval = 5000; // 5 seconds

      while (Date.now() - startTime < maxWaitMs) {
        const currentCodespace = await ctx.runQuery(
          internal.codespacesMutations.getCodespace,
          { codespaceId },
        );

        if (currentCodespace?.state === "running") {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    // Check health
    const health = await ctx.runAction(
      api.codespacesExecutor.checkAgentHealth,
      {
        codespaceId,
      },
    );

    return {
      codespaceId,
      ready: health.healthy,
    };
  },
});

/**
 * Internal mutation: Update vault devcontainer config
 */
export const updateVaultDevcontainer = action({
  args: {
    vaultId: v.id("vaults"),
    devcontainerConfig: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(
      internal.vaultCodespaceIntegration.updateVaultDevcontainerMutation,
      args,
    );
    return null;
  },
});

export const updateVaultDevcontainerMutation = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    devcontainerConfig: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.vaultId, {
      devcontainerConfig: args.devcontainerConfig,
    });
    return null;
  },
});

/**
 * Helper: Generate default devcontainer configuration
 */
function generateDevcontainerConfig(): string {
  const config = {
    name: "React + Convex App",
    image: "mcr.microsoft.com/devcontainers/typescript-node:1-24-bullseye",
    features: {
      "ghcr.io/devcontainers/features/node:1": {
        version: "24",
      },
      "ghcr.io/devcontainers/features/git:1": {},
    },
    customizations: {
      vscode: {
        extensions: [
          "dbaeumer.vscode-eslint",
          "esbenp.prettier-vscode",
          "bradlc.vscode-tailwindcss",
        ],
        settings: {
          "editor.formatOnSave": true,
          "editor.defaultFormatter": "esbenp.prettier-vscode",
        },
      },
    },
    postCreateCommand: "npm install && cd .codespace-agent && npm install",
    postStartCommand:
      "cd .codespace-agent && CODESPACE_AGENT_TOKEN=${CODESPACE_AGENT_TOKEN} npm start &",
    forwardPorts: [5173, 3000],
    portsAttributes: {
      "5173": {
        label: "Vite Dev Server",
        onAutoForward: "notify",
      },
      "3000": {
        label: "Codespace Agent API",
        visibility: "private",
        onAutoForward: "silent",
      },
    },
    remoteEnv: {
      WORKSPACE_DIR: "/workspaces/${localWorkspaceFolderBasename}",
    },
  };

  return JSON.stringify(config, null, 2);
}
