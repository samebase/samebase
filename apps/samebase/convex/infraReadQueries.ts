import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { clamp } from "./jsonUtils";

export const vAllowedInfraReadTable = v.union(
  v.literal("vaults"),
  v.literal("vaultConvexProjects"),
  v.literal("vaultCloudflareWorkers"),
  v.literal("vaultStagedFiles"),
  v.literal("aiProductionReadRequests"),
  v.literal("audit_aiProductionRead_events"),
);

export const readTableSample = internalQuery({
  args: {
    table: vAllowedInfraReadTable,
    limit: v.optional(v.number()),
    vaultId: v.optional(v.id("vaults")),
  },
  handler: async (ctx, args) => {
    const limit = clamp(args.limit ?? 20, 1, 100);

    if (args.table === "vaults") {
      if (args.vaultId) {
        const vault = await ctx.db.get(args.vaultId);
        return vault ? [vault] : [];
      }
      return await ctx.db.query("vaults").take(limit);
    }

    if (args.table === "vaultConvexProjects") {
      const vaultId = args.vaultId;
      if (vaultId) {
        return await ctx.db
          .query("vaultConvexProjects")
          .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
          .take(limit);
      }
      return await ctx.db.query("vaultConvexProjects").take(limit);
    }

    if (args.table === "vaultCloudflareWorkers") {
      const vaultId = args.vaultId;
      if (vaultId) {
        return await ctx.db
          .query("vaultCloudflareWorkers")
          .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
          .take(limit);
      }
      return await ctx.db.query("vaultCloudflareWorkers").take(limit);
    }

    if (args.table === "vaultStagedFiles") {
      const vaultId = args.vaultId;
      if (vaultId) {
        return await ctx.db
          .query("vaultStagedFiles")
          .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
          .take(limit);
      }
      return await ctx.db.query("vaultStagedFiles").take(limit);
    }

    if (args.table === "aiProductionReadRequests") {
      const vaultId = args.vaultId;
      if (vaultId) {
        return await ctx.db
          .query("aiProductionReadRequests")
          .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
          .take(limit);
      }
      return await ctx.db.query("aiProductionReadRequests").take(limit);
    }

    return await ctx.db.query("audit_aiProductionRead_events").take(limit);
  },
});

export const getVaultReadContext = internalQuery({
  args: {
    vaultId: v.id("vaults"),
  },
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      return {
        convexDeployments: [],
        vault: null,
        cloudflareWorkers: [],
        vaultUserId: null,
        convexConnection: null,
      };
    }

    const [convexDeployments, cloudflareWorkers, convexConnectionRaw] = await Promise.all([
      ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .collect(),
      ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .collect(),
      ctx.db
        .query("providerConnections")
        .withIndex("by_user_kind", (q) => q.eq("userId", vault.userId).eq("kind", "convex"))
        .first(),
    ]);

    return {
      convexDeployments,
      vault,
      cloudflareWorkers,
      vaultUserId: vault.userId,
      convexConnection: convexConnectionRaw?.kind === "convex" ? convexConnectionRaw : null,
    };
  },
});
