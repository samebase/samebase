"use node";

import { action, type ActionCtx } from "../_generated/server";
import { Infer, v } from "convex/values";
import { api, internal } from "../_generated/api";
import { Octokit } from "@octokit/rest";
import { getUserId } from "../common";
import type { Id } from "../_generated/dataModel";
import { assertConnectedVault } from "../vault/state";
import { toErrorMessage } from "../jsonUtils";

async function getGithubAccessToken(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<string> {
  const connection = await ctx.runQuery(
    internal.providerConnections.getByUserAndKind,
    {
      userId,
      kind: "github",
    },
  );
  if (connection?.kind !== "github") {
    throw new Error("GitHub is not connected");
  }
  return connection.auth.credential;
}

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
    branch: v.optional(v.string()),
  },
  returns: createVaultWithCodespaceResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof createVaultWithCodespaceResult>> => {
    const userId = await getUserId(ctx);
    const { vaultId, runId } = await ctx.runMutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        userId,
        ghRepoOwner: args.repoOwner,
        ghRepoName: args.repoName,
      },
    );

    try {
      await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
        runId,
        step: "validate_connections",
        level: "info",
        message: "Checking provider connections.",
        state: "running",
      });
      const githubAccessToken = await getGithubAccessToken(ctx, userId);

      const octokit = new Octokit({
        auth: githubAccessToken,
      });

      await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
        runId,
        step: "fetch_github_repo",
        level: "info",
        message: "Checking existing GitHub repository.",
        state: "running",
      });
      const repo = await octokit.rest.repos.get({
        owner: args.repoOwner,
        repo: args.repoName,
      });
      // TODO(Codespaces): move this legacy codespace-first path onto the
      // connect-existing Workflow if it becomes an active entrypoint again.
      const defaultBranch = repo.data.default_branch;
      if (typeof defaultBranch !== "string" || defaultBranch.length === 0) {
        throw new Error("Repository default branch is required");
      }
      const requestedBranch = args.branch?.trim();
      const branch = requestedBranch || defaultBranch;

      const { data: branchData } = await octokit.rest.repos.getBranch({
        owner: repo.data.owner.login,
        repo: repo.data.name,
        branch,
      });
      const commitSha = branchData.commit.sha;
      const repositoryFullName = `${repo.data.owner.login}/${repo.data.name}`;
      await ctx.runMutation(
        internal.appProvisioningRuns.recordRepositoryFullName,
        {
          runId,
          repositoryFullName,
        },
      );
      await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
        runId,
        step: "fetch_github_repo",
        level: "info",
        message: `Checked existing GitHub repository ${repositoryFullName}.`,
        state: "running",
      });

      await ctx.runMutation(
        internal.vault.records.connectExistingRepositoryVaultGitHub,
        {
          vaultId,
          runId,
          userId,
          ghRepoId: repo.data.id.toString(),
          ghRepoOwner: repo.data.owner.login,
          ghRepoName: repo.data.name,
          defaultBranch,
          visibility: repo.data.private ? "private" : "public",
        },
      );
      await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
        runId,
        step: "connect_github",
        level: "info",
        message: "Connected the Noter vault to GitHub.",
        state: "running",
      });

      // TODO(Codespaces/workpool): this is deliberately a placeholder, not a
      // real tree sync. The codespace-first reload path is currently broken;
      // until the work-pool refresh owns it, this path only records the branch
      // tree SHA with an empty tree to avoid blocking legacy Codespace creation.
      // Do not treat the following `sync_tree` event as proof that repository
      // files are hydrated.
      await ctx.runMutation(internal.vault.branches.upsertVaultBranchTree, {
        vaultId,
        branch,
        treeData: {
          sha: branchData.commit.commit.tree.sha,
          url: branchData.commit.commit.tree.url,
          truncated: false,
          tree: [],
        },
        commitSHA: commitSha,
      });
      await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
        runId,
        step: "sync_tree",
        level: "info",
        message: "Synced the default branch tree.",
        state: "running",
      });

      await ctx.runMutation(
        internal.vault.records.updateVaultDevcontainerConfig,
        {
          vaultId,
          devcontainerConfig: generateDevcontainerConfig(),
        },
      );

      const { codespaceId } = await ctx.runAction(
        api.codespaces.index.createCodespace,
        {
          vaultId,
          branch,
          commitSha,
        },
      );
      await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
        runId,
        step: "finish",
        level: "info",
        message: "Connected existing repository.",
        state: "succeeded",
      });

      return {
        vaultId,
        codespaceId,
      };
    } catch (error) {
      try {
        await ctx.runMutation(
          internal.infraProvisioning.markWorkflowProvisioningFailed,
          {
            runId,
            workflowId: "codespace-first",
            message: toErrorMessage(error),
          },
        );
      } catch (markError) {
        console.error("codespaces:vault:create_mark_failed_error", {
          runId,
          workflowId: "codespace-first",
          message: toErrorMessage(markError),
        });
      }
      throw error;
    }
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
    const vault = await ctx.runQuery(internal.codespaces.mutations.getVault, {
      vaultId: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }
    const connectedVault = assertConnectedVault(vault);

    const activeCodespace = vault.activeCodespaceId
      ? await ctx.runQuery(internal.codespaces.mutations.getCodespace, {
          codespaceId: vault.activeCodespaceId,
        })
      : null;

    const githubAccessToken = await getGithubAccessToken(ctx, userId);

    const octokit = new Octokit({
      auth: githubAccessToken,
    });

    // TODO(Codespaces): default to connectedVault.defaultBranch when this path
    // becomes active again; hardcoded main breaks repos that use another branch.
    const branch = activeCodespace?.branch || "main";
    const { data: branchData } = await octokit.rest.repos.getBranch({
      owner: connectedVault.owner,
      repo: connectedVault.name,
      branch,
    });

    const latestCommitSha = branchData.commit.sha;

    // Check if codespace is stale
    if (activeCodespace && activeCodespace.commitSha === latestCommitSha) {
      return {
        rebuilt: false,
        codespaceId: activeCodespace._id,
        reason: "Codespace is up to date",
      };
    }

    // Delete old codespace if it exists
    if (activeCodespace) {
      await ctx.runAction(api.codespaces.index.deleteCodespace, {
        codespaceId: activeCodespace._id,
      });
    }

    // Create new codespace with latest commit
    const { codespaceId } = await ctx.runAction(
      api.codespaces.index.createCodespace,
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
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.codespaces.mutations.getVault, {
      vaultId: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    // Check if codespace needs rebuild
    const { codespaceId } = await ctx.runAction(
      api.codespaces.vaultIntegration.rebuildCodespaceIfStale,
      { vaultId: args.vaultId },
    );

    if (!codespaceId) {
      throw new Error("No codespace available");
    }

    // Get codespace state
    const codespace = await ctx.runQuery(
      internal.codespaces.mutations.getCodespace,
      {
        codespaceId,
      },
    );

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    // Start if stopped
    if (codespace.state === "stopped") {
      await ctx.runAction(api.codespaces.index.startCodespace, {
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
          internal.codespaces.mutations.getCodespace,
          { codespaceId },
        );

        if (currentCodespace?.state === "running") {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    // Agent health is best-effort. A running Codespace is considered usable
    // even when the custom agent endpoint is unavailable.
    try {
      const portEnsured = await ctx.runAction(
        api.codespaces.ports.ensureCodespacePortsVisibility,
        { codespaceId },
      );
      if (!portEnsured.ensured) {
        console.log(
          "codespaces:vaultIntegration:ensureCodespaceReady:ports:ensure:failed",
          {
            codespaceId,
            results: portEnsured.results,
          },
        );
      }
    } catch (error) {
      console.log(
        "codespaces:vaultIntegration:ensureCodespaceReady:ports:ensure:error",
        {
          codespaceId,
          message: error instanceof Error ? error.message : String(error),
        },
      );
    }
    await ctx.runAction(api.codespaces.executor.checkAgentHealth, {
      codespaceId,
    });

    return {
      codespaceId,
      ready: true,
    };
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
        extensions: ["oxc.oxc-vscode", "bradlc.vscode-tailwindcss"],
        settings: {
          "oxc.fmt.configPath": "./vite.config.ts",
          "editor.formatOnSave": true,
          "editor.formatOnSaveMode": "file",
          "editor.defaultFormatter": "oxc.oxc-vscode",
        },
      },
    },
    postCreateCommand:
      "pnpm install && npm install -g @openai/codex && cd .codespace-agent && npm install --no-package-lock",
    postStartCommand:
      "bash -lc 'cd .codespace-agent && if [ ! -d node_modules ]; then npm install --no-package-lock; fi && if ! pgrep -f \"node server.ts\" >/dev/null; then nohup npm start >/tmp/codespace-agent.log 2>&1 & fi'",
    forwardPorts: [5173, 3000, 1455],
    portsAttributes: {
      "5173": {
        label: "Vite Dev Server",
        onAutoForward: "notify",
      },
      "3000": {
        label: "Codespace Agent API",
        visibility: "public",
        onAutoForward: "silent",
      },
      "1455": {
        label: "Codex OAuth Callback",
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
