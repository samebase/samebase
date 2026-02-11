import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { CodespaceState } from "./schema";
import { getUserId } from "./common";

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
    state: CodespaceState,
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
    state: CodespaceState,
    lastStartedAt: v.optional(v.number()),
    lastStoppedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const updates: {
      state: typeof args.state;
      lastStartedAt?: number;
      lastStoppedAt?: number;
      deletedAt?: number;
    } = { state: args.state };

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
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const vault = await ctx.db.get(args.vaultId);

    if (!vault?.activeCodespaceId || vault.userId !== userId) {
      return null;
    }

    const codespace = await ctx.db.get(vault.activeCodespaceId);

    if (!codespace || codespace.userId !== userId) {
      return null;
    }

    return {
      _id: codespace._id,
      vaultId: codespace.vaultId,
      userId: codespace.userId,
      ghCodespaceId: codespace.ghCodespaceId,
      ghCodespaceName: codespace.ghCodespaceName,
      state: codespace.state,
      webUrl: codespace.webUrl,
      agentUrl: codespace.agentUrl,
      agentHealthy: codespace.agentHealthy,
      createdAt: codespace.createdAt,
      lastStartedAt: codespace.lastStartedAt,
      lastStoppedAt: codespace.lastStoppedAt,
      deletedAt: codespace.deletedAt,
      lastHealthCheckAt: codespace.lastHealthCheckAt,
      commitSha: codespace.commitSha,
      branch: codespace.branch,
    };
  },
});
