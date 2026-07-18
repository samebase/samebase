import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { clamp } from "./jsonUtils";

export const vAllowedInfraReadTable = v.union(
  v.literal("vaults"),
  v.literal("vaultConvexDeployments"),
  v.literal("vaultCloudflareWorkers"),
  v.literal("vaultDomains"),
  v.literal("codespaces"),
  v.literal("operations_fileStaging"),
  v.literal("operations_aiProdAccessRequests"),
  v.literal("audit_aiProdAccessEvents"),
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

    if (args.table === "vaultConvexDeployments") {
      const vaultId = args.vaultId;
      if (vaultId) {
        return await ctx.db
          .query("vaultConvexDeployments")
          .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
          .take(limit);
      }
      return await ctx.db.query("vaultConvexDeployments").take(limit);
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

    if (args.table === "vaultDomains") {
      const vaultId = args.vaultId;
      if (vaultId) {
        return await ctx.db
          .query("vaultDomains")
          .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
          .take(limit);
      }
      return await ctx.db.query("vaultDomains").take(limit);
    }

    if (args.table === "codespaces") {
      const vaultId = args.vaultId;
      if (vaultId) {
        return await ctx.db
          .query("codespaces")
          .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
          .take(limit);
      }
      return await ctx.db.query("codespaces").take(limit);
    }

    if (args.table === "operations_fileStaging") {
      const vaultId = args.vaultId;
      if (vaultId) {
        return await ctx.db
          .query("operations_fileStaging")
          .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
          .take(limit);
      }
      return await ctx.db.query("operations_fileStaging").take(limit);
    }

    if (args.table === "operations_aiProdAccessRequests") {
      const vaultId = args.vaultId;
      if (vaultId) {
        return await ctx.db
          .query("operations_aiProdAccessRequests")
          .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
          .take(limit);
      }
      return await ctx.db.query("operations_aiProdAccessRequests").take(limit);
    }

    return await ctx.db.query("audit_aiProdAccessEvents").take(limit);
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
        .query("vaultConvexDeployments")
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
