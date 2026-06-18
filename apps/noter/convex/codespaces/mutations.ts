import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { vCodespaceState } from "./model";
import { query } from "../functions";
import { assertConnectedVault, isLiveConnectedVault } from "../vault/state";
import { CODESPACES_ENABLED } from "../../shared/featureFlags";

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
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== args.userId) {
      throw new Error("Vault not found");
    }
    assertConnectedVault(vault);

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
    state: vCodespaceState,
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
    state: vCodespaceState,
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
 * Internal mutation: Clear active Codespace for a vault if it matches
 */
export const clearActiveCodespace = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    codespaceId: v.id("codespaces"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      return null;
    }

    if (vault.activeCodespaceId !== args.codespaceId) {
      return null;
    }

    await ctx.db.patch(args.vaultId, {
      activeCodespaceId: undefined,
    });
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
 * Internal mutation: Update port visibility reconciliation status
 */
export const updatePortsVisibilityStatus = internalMutation({
  args: {
    codespaceId: v.id("codespaces"),
    ensured: v.boolean(),
    ensuredAt: v.number(),
    lastError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.codespaceId, {
      portsVisibilityEnsured: args.ensured,
      portsVisibilityEnsuredAt: args.ensuredAt,
      portsVisibilityLastError: args.lastError,
    });
    return null;
  },
});

/**
 * Get active Codespace for a vault (public query)
 */
export const getActiveCodespace = query({
  access: "access_machines",
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
      portsVisibilityEnsured: v.optional(v.boolean()),
      portsVisibilityEnsuredAt: v.optional(v.number()),
      portsVisibilityLastError: v.optional(v.string()),
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
    if (!CODESPACES_ENABLED) {
      return null;
    }

    const userId = ctx.viewer.userId;
    const vault = await ctx.db.get(args.vaultId);

    if (!vault?.activeCodespaceId || vault.userId !== userId || !isLiveConnectedVault(vault)) {
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
      portsVisibilityEnsured: codespace.portsVisibilityEnsured,
      portsVisibilityEnsuredAt: codespace.portsVisibilityEnsuredAt,
      portsVisibilityLastError: codespace.portsVisibilityLastError,
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

const connectedCodespaceSummary = v.object({
  _id: v.id("codespaces"),
  ghCodespaceName: v.string(),
  state: v.string(),
});

export const listConnectedCodespacesForVault = internalQuery({
  args: {
    vaultId: v.id("vaults"),
    userId: v.id("users"),
  },
  returns: v.array(connectedCodespaceSummary),
  handler: async (ctx, args) => {
    const codespaces = await ctx.db
      .query("codespaces")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .filter((q) =>
        q.and(q.eq(q.field("userId"), args.userId), q.neq(q.field("state"), "deleted")),
      )
      .collect();

    return codespaces.map((codespace) => ({
      _id: codespace._id,
      ghCodespaceName: codespace.ghCodespaceName,
      state: codespace.state,
    }));
  },
});

export const getConnectedCodespacesCount = query({
  access: "access_machines",
  args: { vaultId: v.id("vaults") },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (!CODESPACES_ENABLED) {
      return 0;
    }

    const userId = ctx.viewer.userId;
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== userId) {
      return 0;
    }

    const codespaces = await ctx.db
      .query("codespaces")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .filter((q) => q.and(q.eq(q.field("userId"), userId), q.neq(q.field("state"), "deleted")))
      .collect();

    return codespaces.length;
  },
});
