// @ts-nocheck - Temporary bypass for Convex type inference circular dependency issues

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

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
