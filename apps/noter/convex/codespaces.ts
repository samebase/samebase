"use node";

import { Infer, v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { getUserId } from "./common";
import { Id } from "./_generated/dataModel";
import { getDaytonaEnvLabel } from "./daytonaEnv";

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

function inferCodespaceDisplayEnvLabel(): "prod" | "dev" {
  try {
    return getDaytonaEnvLabel();
  } catch {
    const deploymentPrefix =
      process.env.CONVEX_DEPLOYMENT?.split(":")[0]?.trim().toLowerCase() ?? "";
    return deploymentPrefix === "prod" ? "prod" : "dev";
  }
}

/**
 * Create a new GitHub Codespace for a vault
 */
export const createCodespace = action({
  args: {
    vaultId: v.id("vaults"),
    branch: v.string(),
    commitSha: v.string(),
  },
  returns: v.object({
    codespaceId: v.id("codespaces"),
    ghCodespaceId: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ codespaceId: Id<"codespaces">; ghCodespaceId: string }> => {
    console.log("codespaces:createCodespace:start", {
      vaultId: args.vaultId,
      branch: args.branch,
      commitSha: args.commitSha,
    });
    const userId = await getUserId(ctx);

    // Get vault details
    const vault = await ctx.runQuery(internal.codespacesMutations.getVault, {
      vaultId: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }
    console.log("codespaces:createCodespace:vault", {
      vaultId: vault._id,
      repo: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
      ghRepoId: vault.ghRepoId,
    });

    const githubAccessToken = await getGithubAccessToken(ctx, userId);

    const octokit = new Octokit({
      auth: githubAccessToken,
    });

    // Generate random token for HTTP agent authentication
    const agentToken = crypto.randomUUID();

    const repositoryId = Number.parseInt(vault.ghRepoId, 10);
    if (!Number.isFinite(repositoryId)) {
      throw new Error(`Invalid repository id: ${vault.ghRepoId}`);
    }

    const displayName = buildCodespaceDisplayName(
      inferCodespaceDisplayEnvLabel(),
      vault.ghRepoOwner,
      vault.ghRepoName,
    );

    // Create Codespace via GitHub API
    console.log("codespaces:createCodespace:github:create", {
      repositoryId,
      branch: args.branch,
      displayName,
    });
    const { data: codespace } =
      await octokit.rest.codespaces.createForAuthenticatedUser({
        repository_id: repositoryId,
        ref: args.branch,
        machine: "basicLinux32gb",
        display_name: displayName,
        idle_timeout_minutes: 30,
      });
    console.log("codespaces:createCodespace:github:created", {
      ghCodespaceId: codespace.id,
      ghCodespaceName: codespace.name,
      state: codespace.state,
    });

    // Store codespace record in database
    const codespaceId = await ctx.runMutation(
      internal.codespacesMutations.createCodespaceRecord,
      {
        vaultId: args.vaultId,
        userId,
        ghCodespaceId: codespace.id.toString(),
        ghCodespaceName: codespace.name,
        commitSha: args.commitSha,
        branch: args.branch,
        agentToken,
      },
    );
    console.log("codespaces:createCodespace:db:created", {
      codespaceId,
      ghCodespaceId: codespace.id,
      ghCodespaceName: codespace.name,
    });

    try {
      // Poll for creation completion
      const pollStart = Date.now();
      await pollCodespaceState(
        octokit,
        codespace.name,
        "Available",
        300000, // 5 minute timeout
      );
      console.log("codespaces:createCodespace:poll:available", {
        ghCodespaceName: codespace.name,
        elapsedMs: Date.now() - pollStart,
      });

      // Get updated connection details (retrying eventual consistency)
      const detailsStart = Date.now();
      const updatedCodespace = await getCodespaceWithRetry(
        octokit,
        codespace.name,
        60000,
      );
      console.log("codespaces:createCodespace:details:ready", {
        ghCodespaceName: codespace.name,
        elapsedMs: Date.now() - detailsStart,
      });

      // Construct agent URL from port forwarding pattern
      const agentUrl = `https://${codespace.name}-3000.app.github.dev`;

      // Update codespace with connection details
      await ctx.runMutation(
        internal.codespacesMutations.updateCodespaceConnection,
        {
          codespaceId,
          webUrl: updatedCodespace.web_url,
          agentUrl,
          state: "running",
        },
      );
      console.log("codespaces:createCodespace:db:connected", {
        codespaceId,
        webUrl: updatedCodespace.web_url,
      });

      try {
        const portEnsured = await ctx.runAction(
          api.codespacesPorts.ensureCodespacePortsVisibility,
          { codespaceId },
        );
        if (!portEnsured.ensured) {
          console.log("codespaces:createCodespace:ports:ensure:failed", {
            codespaceId,
            results: portEnsured.results,
          });
        } else {
          console.log("codespaces:createCodespace:ports:ensure:ok", {
            codespaceId,
          });
        }
      } catch (error) {
        console.log("codespaces:createCodespace:ports:ensure:error", {
          codespaceId,
          message: formatError(error),
        });
      }
    } catch (error) {
      console.log("codespaces:createCodespace:error", {
        codespaceId,
        ghCodespaceName: codespace.name,
        message: formatError(error),
      });
      await ctx.runMutation(internal.codespacesMutations.updateCodespaceState, {
        codespaceId,
        state: "failed",
      });
      throw error;
    }

    return {
      codespaceId,
      ghCodespaceId: codespace.id.toString(),
    };
  },
});

const getCodespaceConnectionResult = v.object({
  webUrl: v.string(),
  agentUrl: v.string(),
  agentToken: v.string(),
  state: v.string(),
});
/**
 * Get connection details for a Codespace
 */
export const getCodespaceConnection = action({
  args: { codespaceId: v.id("codespaces") },
  returns: getCodespaceConnectionResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof getCodespaceConnectionResult>> => {
    const userId = await getUserId(ctx);
    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace || codespace.userId !== userId) {
      throw new Error("Codespace not found");
    }

    if (!codespace.webUrl || !codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace connection details not available");
    }

    return {
      webUrl: codespace.webUrl,
      agentUrl: codespace.agentUrl,
      agentToken: codespace.agentToken,
      state: codespace.state,
    };
  },
});

/**
 * Start a stopped Codespace
 */
export const startCodespace = action({
  args: { codespaceId: v.id("codespaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace || codespace.userId !== userId) {
      throw new Error("Codespace not found");
    }

    const githubAccessToken = await getGithubAccessToken(ctx, userId);

    const octokit = new Octokit({
      auth: githubAccessToken,
    });

    // Start the Codespace
    await octokit.rest.codespaces.startForAuthenticatedUser({
      codespace_name: codespace.ghCodespaceName,
    });

    // Update state to starting
    await ctx.runMutation(internal.codespacesMutations.updateCodespaceState, {
      codespaceId: args.codespaceId,
      state: "starting",
    });

    // Poll for start completion
    await pollCodespaceState(octokit, codespace.ghCodespaceName, "Available");

    // Update state to running
    await ctx.runMutation(internal.codespacesMutations.updateCodespaceState, {
      codespaceId: args.codespaceId,
      state: "running",
      lastStartedAt: Date.now(),
    });

    try {
      const portEnsured = await ctx.runAction(
        api.codespacesPorts.ensureCodespacePortsVisibility,
        { codespaceId: args.codespaceId },
      );
      if (!portEnsured.ensured) {
        console.log("codespaces:startCodespace:ports:ensure:failed", {
          codespaceId: args.codespaceId,
          results: portEnsured.results,
        });
      }
    } catch (error) {
      console.log("codespaces:startCodespace:ports:ensure:error", {
        codespaceId: args.codespaceId,
        message: formatError(error),
      });
    }

    return null;
  },
});

/**
 * Stop a running Codespace
 */
export const stopCodespace = action({
  args: { codespaceId: v.id("codespaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace || codespace.userId !== userId) {
      throw new Error("Codespace not found");
    }

    const githubAccessToken = await getGithubAccessToken(ctx, userId);

    const octokit = new Octokit({
      auth: githubAccessToken,
    });

    // Stop the Codespace
    await octokit.rest.codespaces.stopForAuthenticatedUser({
      codespace_name: codespace.ghCodespaceName,
    });

    // Update state
    await ctx.runMutation(internal.codespacesMutations.updateCodespaceState, {
      codespaceId: args.codespaceId,
      state: "stopped",
      lastStoppedAt: Date.now(),
    });

    return null;
  },
});

/**
 * Delete a Codespace
 */
export const deleteCodespace = action({
  args: { codespaceId: v.id("codespaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace || codespace.userId !== userId) {
      throw new Error("Codespace not found");
    }

    const githubAccessToken = await getGithubAccessToken(ctx, userId);

    const octokit = new Octokit({
      auth: githubAccessToken,
    });

    await ctx.runMutation(internal.codespacesMutations.updateCodespaceState, {
      codespaceId: args.codespaceId,
      state: "deleting",
    });

    try {
      // Delete the Codespace
      await octokit.rest.codespaces.deleteForAuthenticatedUser({
        codespace_name: codespace.ghCodespaceName,
      });

      // Mark as deleted in database
      await ctx.runMutation(internal.codespacesMutations.updateCodespaceState, {
        codespaceId: args.codespaceId,
        state: "deleted",
        deletedAt: Date.now(),
      });

      await ctx.runMutation(internal.codespacesMutations.clearActiveCodespace, {
        vaultId: codespace.vaultId,
        codespaceId: codespace._id,
      });
    } catch (error) {
      await ctx.runMutation(internal.codespacesMutations.updateCodespaceState, {
        codespaceId: args.codespaceId,
        state: "failed",
      });
      throw error;
    }

    return null;
  },
});

/**
 * Helper: Poll Codespace state until it reaches target state
 */
async function pollCodespaceState(
  octokit: Octokit,
  codespaceName: string,
  targetState: Awaited<
    ReturnType<typeof octokit.rest.codespaces.getForAuthenticatedUser>
  >["data"]["state"],
  timeoutMs: number = 120000,
): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds
  let notFoundCount = 0;

  while (Date.now() - startTime < timeoutMs) {
    try {
      console.log("codespaces:pollCodespaceState:get", {
        codespaceName,
        targetState,
      });
      const { data: codespace } =
        await octokit.rest.codespaces.getForAuthenticatedUser({
          codespace_name: codespaceName,
        });

      console.log("codespaces:pollCodespaceState:get:result", {
        codespaceName,
        targetState,
        codespace,
      });

      console.log("codespaces:pollCodespaceState:get:result:state", {
        codespaceName,
        targetState,
        codespaceState: codespace.state,
      });

      if (codespace.state === targetState) {
        return;
      }
    } catch (error) {
      console.log("codespaces:pollCodespaceState:get:error", {
        codespaceName,
        targetState,
        error,
      });
      // GitHub may return 404 immediately after creation; keep polling.
      if (isNotFoundError(error)) {
        notFoundCount += 1;
        await delay(pollInterval);
        continue;
      }
      throw error;
    }

    // Wait before polling again
    await delay(pollInterval);
  }

  if (notFoundCount > 0) {
    console.log("codespaces:poll:timeout_not_found", {
      ghCodespaceName: codespaceName,
      targetState,
      notFoundCount,
      elapsedMs: Date.now() - startTime,
    });
  }
  throw new Error(
    `Timeout waiting for Codespace to reach state: ${targetState}`,
  );
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isNotFoundError = (error: unknown): error is Error => {
  if (!(error instanceof Error) || typeof error.message !== "string") {
    return false;
  }
  const status =
    typeof (error as { status?: number }).status === "number"
      ? (error as { status?: number }).status
      : undefined;
  return status === 404 || error.message.includes("Not Found");
};

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

async function getCodespaceWithRetry(
  octokit: Octokit,
  codespaceName: string,
  timeoutMs: number,
): Promise<{ web_url: string }> {
  const startTime = Date.now();
  const pollInterval = 5000;
  let notFoundCount = 0;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const { data: codespace } =
        await octokit.rest.codespaces.getForAuthenticatedUser({
          codespace_name: codespaceName,
        });
      return codespace;
    } catch (error) {
      if (isNotFoundError(error)) {
        notFoundCount += 1;
        await delay(pollInterval);
        continue;
      }
      throw error;
    }
  }

  if (notFoundCount > 0) {
    console.log("codespaces:details:timeout_not_found", {
      ghCodespaceName: codespaceName,
      notFoundCount,
      elapsedMs: Date.now() - startTime,
    });
  }
  throw new Error(`Timeout waiting for Codespace details: ${codespaceName}`);
}

const MAX_CODESPACE_DISPLAY_NAME_LENGTH = 48;

function buildCodespaceDisplayName(
  envLabel: string,
  owner: string,
  repo: string,
): string {
  const rawName = `Noter ${envLabel} ${owner}-${repo}`;
  const cleanedName = rawName
    .replace(/[^a-zA-Z0-9 _-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const safeName = cleanedName.length > 0 ? cleanedName : "Noter Codespace";
  if (safeName.length <= MAX_CODESPACE_DISPLAY_NAME_LENGTH) {
    return safeName;
  }
  const truncatedName = safeName
    .slice(0, MAX_CODESPACE_DISPLAY_NAME_LENGTH)
    .trim();
  return truncatedName.length > 0 ? truncatedName : "Noter Codespace";
}
