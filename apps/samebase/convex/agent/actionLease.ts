import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

const { id, null: vNull, union } = v;

// Convex actions have a hard 10-minute execution limit. Keep a small margin
// so lease reaping cannot race timeout enforcement at the boundary.
export const AGENT_ACTION_LEASE_DURATION_MS = 10 * 60 * 1_000 + 30_000;

export const acquire = internalMutation({
  args: { userId: id("users") },
  returns: union(id("operations_agentActionLeases"), vNull()),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user === null || user.accountDeletion) {
      return null;
    }
    return await ctx.db.insert("operations_agentActionLeases", {
      userId: args.userId,
      expiresAt: Date.now() + AGENT_ACTION_LEASE_DURATION_MS,
    });
  },
});

export const release = internalMutation({
  args: { leaseId: id("operations_agentActionLeases") },
  returns: vNull(),
  handler: async (ctx, args) => {
    const lease = await ctx.db.get(args.leaseId);
    if (lease !== null) {
      await ctx.db.delete(lease._id);
    }
    return null;
  },
});
