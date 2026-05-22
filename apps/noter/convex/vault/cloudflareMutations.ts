import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { isLiveConnectedVault } from "./state";

const { id, literal, null: nullValue, optional, string, union } = v;

const attachCloudflareOrigin = union(literal("provisioned"), literal("selected_existing"));

export const requireAttachableVault = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    if (vault.cloudflare.state !== "not_configured") {
      throw new Error("Vault already has a Cloudflare Worker attached.");
    }

    return null;
  },
});

export const attachWorker = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    workersDevUrl: optional(string()),
    origin: attachCloudflareOrigin,
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    if (vault.cloudflare.state !== "not_configured") {
      throw new Error("Vault already has a Cloudflare Worker attached.");
    }

    const now = Date.now();
    await ctx.db.patch(args.vaultId, {
      cloudflare: {
        state: "connected",
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        workersDevUrl: args.workersDevUrl,
        origin: args.origin,
        connectedAt: now,
        lastObservedAt: now,
      },
    });

    return null;
  },
});
