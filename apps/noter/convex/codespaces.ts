"use node";
// @ts-nocheck - Temporary bypass for Convex type inference circular dependency issues

import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
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
    const vault = await ctx.runQuery(internal.codespaces.getVault, {
      vaultId: args.vaultId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    // Get user GitHub access token
    const user = await ctx.runQuery(internal.codespaces.getUser, { userId });

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
      internal.codespaces.createCodespaceRecord,
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
    await ctx.runMutation(internal.codespaces.updateCodespaceConnection, {
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
    const codespace = await ctx.runQuery(internal.codespaces.getCodespace, {
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

    const user = await ctx.runQuery(internal.codespaces.getUser, { userId });

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
    await ctx.runMutation(internal.codespaces.updateCodespaceState, {
      codespaceId: args.codespaceId,
      state: "starting",
    });

    // Poll for start completion
    await pollCodespaceState(octokit, codespace.ghCodespaceName, "Available");

    // Update state to running
    await ctx.runMutation(internal.codespaces.updateCodespaceState, {
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

    const user = await ctx.runQuery(internal.codespaces.getUser, { userId });

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
    await ctx.runMutation(internal.codespaces.updateCodespaceState, {
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

    const user = await ctx.runQuery(internal.codespaces.getUser, { userId });

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
    await ctx.runMutation(internal.codespaces.updateCodespaceState, {
      codespaceId: args.codespaceId,
      state: "deleted",
      deletedAt: Date.now(),
    });

    return null;
  },
});

/**
 * Get active Codespace for a vault (public query)
 */
export const getActiveCodespace = query({
  args: { vaultId: v.id("vaults") },
  returns: v.union(
    v.object({
      _id: v.id("codespaces"),
      vaultId: v.id("vaults"),
      userId: v.id("users"),
      ghCodespaceId: v.string(),
      ghCodespaceName: v.string(),
      state: v.string(),
      webUrl: v.optional(v.string()),
      agentUrl: v.optional(v.string()),
      agentHealthy: v.optional(v.boolean()),
      createdAt: v.number(),
      lastStartedAt: v.optional(v.number()),
      lastStoppedAt: v.optional(v.number()),
      deletedAt: v.optional(v.number()),
      lastHealthCheckAt: v.optional(v.number()),
      commitSha: v.string(),
      branch: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);

    if (!vault?.activeCodespaceId) {
      return null;
    }

    const codespace = await ctx.db.get(vault.activeCodespaceId);

    if (!codespace) {
      return null;
    }

    // Return without agentToken (security - don't expose to frontend)
    const { agentToken: _agentToken, ...safeCodespace } = codespace;
    return safeCodespace as any;
  },
});

/**
 * Internal: Get Codespace by ID
 */
export const getCodespace = internalQuery({
  args: { codespaceId: v.id("codespaces") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.codespaceId);
  },
});

/**
 * Internal: Get vault by ID
 */
export const getVault = internalQuery({
  args: { vaultId: v.id("vaults") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.vaultId);
  },
});

/**
 * Internal: Get user by ID
 */
export const getUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

/**
 * Internal mutation: Create Codespace record in database
 */
export const createCodespaceRecord = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    userId: v.id("users"),
    ghCodespaceId: v.string(),
    ghCodespaceName: v.string(),
    commitSha: v.string(),
    branch: v.string(),
    agentToken: v.string(),
  },
  returns: v.id("codespaces"),
  handler: async (ctx, args) => {
    const codespaceId = await ctx.db.insert("codespaces", {
      vaultId: args.vaultId,
      userId: args.userId,
      ghCodespaceId: args.ghCodespaceId,
      ghCodespaceName: args.ghCodespaceName,
      state: "creating",
      commitSha: args.commitSha,
      branch: args.branch,
      agentToken: args.agentToken,
      createdAt: Date.now(),
    });

    // Update vault to point to this codespace
    await ctx.db.patch(args.vaultId, {
      activeCodespaceId: codespaceId,
    });

    return codespaceId;
  },
});

/**
 * Internal mutation: Update Codespace connection details
 */
export const updateCodespaceConnection = internalMutation({
  args: {
    codespaceId: v.id("codespaces"),
    webUrl: v.string(),
    agentUrl: v.string(),
    state: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.codespaceId, {
      webUrl: args.webUrl,
      agentUrl: args.agentUrl,
      state: args.state,
    });
    return null;
  },
});

/**
 * Internal mutation: Update Codespace state
 */
export const updateCodespaceState = internalMutation({
  args: {
    codespaceId: v.id("codespaces"),
    state: v.string(),
    lastStartedAt: v.optional(v.number()),
    lastStoppedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const updates: Record<string, any> = { state: args.state as any };

    if (args.lastStartedAt !== undefined) {
      updates.lastStartedAt = args.lastStartedAt;
    }
    if (args.lastStoppedAt !== undefined) {
      updates.lastStoppedAt = args.lastStoppedAt;
    }
    if (args.deletedAt !== undefined) {
      updates.deletedAt = args.deletedAt;
    }

    await ctx.db.patch(args.codespaceId, updates);
    return null;
  },
});

/**
 * Internal mutation: Update agent health status
 */
export const updateAgentHealth = internalMutation({
  args: {
    codespaceId: v.id("codespaces"),
    healthy: v.boolean(),
    lastHealthCheckAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.codespaceId, {
      agentHealthy: args.healthy,
      lastHealthCheckAt: args.lastHealthCheckAt,
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
