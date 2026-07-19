import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { vVaultProviderResourceOrigin, type VaultProviderResourceOrigin } from "./model";
import { isLiveConnectedVault } from "./state";

const { id, null: nullValue, string } = v;

type ConvexProjectGraphReadCtx = Pick<QueryCtx, "db">;

async function requireVaultApp(
  ctx: ConvexProjectGraphReadCtx,
  args: { vaultId: Id<"vaults">; userId: Id<"users">; appId: Id<"vaultApps"> },
) {
  const app = await ctx.db.get(args.appId);
  if (!app || app.vaultId !== args.vaultId || app.userId !== args.userId) {
    throw new Error("Vault app not found.");
  }
  return app;
}

async function requireConnectedVault(
  ctx: ConvexProjectGraphReadCtx,
  args: { vaultId: Id<"vaults">; userId: Id<"users"> },
): Promise<void> {
  const vault = await ctx.db.get(args.vaultId);
  if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
    throw new Error("Vault not found.");
  }
}

async function readProjectByProviderIdentity(
  ctx: ConvexProjectGraphReadCtx,
  args: { userId: Id<"users">; teamId: string; projectId: string },
) {
  return await ctx.db
    .query("vaultConvexProjects")
    .withIndex("by_user_and_team_and_project", (q) =>
      q.eq("userId", args.userId).eq("teamId", args.teamId).eq("projectId", args.projectId),
    )
    .unique();
}

async function insertProject(
  ctx: Pick<MutationCtx, "db">,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    appId: Id<"vaultApps">;
    teamId: string;
    projectId: string;
    origin: VaultProviderResourceOrigin;
  },
): Promise<Id<"vaultConvexProjects">> {
  const existing = await readProjectByProviderIdentity(ctx, args);
  if (existing) {
    if (existing.vaultId === args.vaultId && existing.appId === args.appId) {
      return existing._id;
    }
    throw new Error("Convex project is already attached.");
  }
  return await ctx.db.insert("vaultConvexProjects", {
    vaultId: args.vaultId,
    userId: args.userId,
    appId: args.appId,
    teamId: args.teamId,
    projectId: args.projectId,
    origin: args.origin,
    createdAt: Date.now(),
  });
}

export const requireConvexProjectConnectionVault = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    appId: id("vaultApps"),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    await requireConnectedVault(ctx, args);
    await requireVaultApp(ctx, args);
    return null;
  },
});

export const attachProject = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    appId: id("vaultApps"),
    teamId: string(),
    projectId: string(),
    origin: vVaultProviderResourceOrigin,
  },
  returns: id("vaultConvexProjects"),
  handler: async (ctx, args): Promise<Id<"vaultConvexProjects">> => {
    await requireConnectedVault(ctx, args);
    await requireVaultApp(ctx, args);
    return await insertProject(ctx, args);
  },
});
