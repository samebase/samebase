// @ts-nocheck - Temporary bypass for Convex type inference circular dependency issues
"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { getUserId } from "./common";

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
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    // Get vault details
    const vault = await ctx.runQuery(internal.codespacesMutations.getVault, {
      vaultId: args.vaultId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    // Get user GitHub access token
    const user = await ctx.runQuery(internal.codespacesMutations.getUser, { userId });

    if (!user?.githubAccessToken) {
      throw new Error("GitHub access token not found");
    }

    const octokit = new Octokit({
      auth: user.githubAccessToken,
    });

    // Generate random token for HTTP agent authentication
    const agentToken = crypto.randomUUID();

    // Create Codespace via GitHub API
    const { data: codespace } = await octokit.rest.codespaces.createForAuthenticatedUser({
      repository_id: parseInt(vault.ghRepoId),
      ref: args.branch,
      machine: "basicLinux32gb",
      devcontainer_path: ".devcontainer/devcontainer.json",
      display_name: `Noter: ${vault.ghRepoOwner}/${vault.ghRepoName}`,
      idle_timeout_minutes: 30,
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
      }
    );

    // Poll for creation completion
    await pollCodespaceState(
      octokit,
      codespace.name,
      "Available",
      60000 // 60 second timeout
    );

    // Get updated connection details
    const { data: updatedCodespace } = await octokit.rest.codespaces.get({
      codespace_name: codespace.name,
    });

    // Construct agent URL from port forwarding pattern
    const agentUrl = `https://${codespace.name}-3000.app.github.dev`;

    // Update codespace with connection details
    await ctx.runMutation(internal.codespacesMutations.updateCodespaceConnection, {
      codespaceId,
      webUrl: updatedCodespace.web_url,
      agentUrl,
      state: "running",
    });

    return {
      codespaceId,
      ghCodespaceId: codespace.id.toString(),
    };
  },
});

/**
 * Get connection details for a Codespace
 */
export const getCodespaceConnection = action({
  args: { codespaceId: v.id("codespaces") },
  returns: v.object({
    webUrl: v.string(),
    agentUrl: v.string(),
    agentToken: v.string(),
    state: v.string(),
  }),
  handler: async (ctx, args) => {
    const codespace = await ctx.runQuery(internal.codespacesMutations.getCodespace, {
      codespaceId: args.codespaceId,
    });

    if (!codespace) {
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

    const codespace = await ctx.runQuery(internal.codespaces.getCodespace, {
      codespaceId: args.codespaceId,
    });

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    const user = await ctx.runQuery(internal.codespacesMutations.getUser, { userId });

    if (!user?.githubAccessToken) {
      throw new Error("GitHub access token not found");
    }

    const octokit = new Octokit({
      auth: user.githubAccessToken,
    });

    // Start the Codespace
    // @ts-expect-error - Codespace API methods may not be in type definitions
    await octokit.rest.codespaces.start({
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

    const codespace = await ctx.runQuery(internal.codespaces.getCodespace, {
      codespaceId: args.codespaceId,
    });

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    const user = await ctx.runQuery(internal.codespacesMutations.getUser, { userId });

    if (!user?.githubAccessToken) {
      throw new Error("GitHub access token not found");
    }

    const octokit = new Octokit({
      auth: user.githubAccessToken,
    });

    // Stop the Codespace
    // @ts-expect-error - Codespace API methods may not be in type definitions
    await octokit.rest.codespaces.stop({
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

    const codespace = await ctx.runQuery(internal.codespaces.getCodespace, {
      codespaceId: args.codespaceId,
    });

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    const user = await ctx.runQuery(internal.codespacesMutations.getUser, { userId });

    if (!user?.githubAccessToken) {
      throw new Error("GitHub access token not found");
    }

    const octokit = new Octokit({
      auth: user.githubAccessToken,
    });

    // Delete the Codespace
    // @ts-expect-error - Codespace API methods may not be in type definitions
    await octokit.rest.codespaces.delete({
      codespace_name: codespace.ghCodespaceName,
    });

    // Mark as deleted in database
    await ctx.runMutation(internal.codespacesMutations.updateCodespaceState, {
      codespaceId: args.codespaceId,
      state: "deleted",
      deletedAt: Date.now(),
    });

    return null;
  },
});

/**
 * Helper: Poll Codespace state until it reaches target state
 */
async function pollCodespaceState(
  octokit: Octokit,
  codespaceName: string,
  targetState: string,
  timeoutMs: number = 120000
): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (Date.now() - startTime < timeoutMs) {
    // @ts-expect-error - Codespace API methods may not be in type definitions
    const { data: codespace } = await octokit.rest.codespaces.get({
      codespace_name: codespaceName,
    });

    if (codespace.state === targetState) {
      return;
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(
    `Timeout waiting for Codespace to reach state: ${targetState}`
  );
}
