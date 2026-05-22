import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import { isLiveConnectedVault } from "./state";

const { id, literal, null: nullValue, optional, string, union } = v;

const attachCloudflareOrigin = union(literal("provisioned"), literal("selected_existing"));

async function assertNoActiveCloudflareProvisioning(
  ctx: Pick<QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<void> {
  const ownership = await ctx.db
    .query("vaultInfrastructureOwnership")
    .withIndex("by_vault_and_state", (q) => q.eq("vaultId", vaultId).eq("state", "active"))
    .first();
  if (ownership) {
    throw new Error("Cloudflare provisioning is already running.");
  }
}

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
    await assertNoActiveCloudflareProvisioning(ctx, args.vaultId);

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
    await assertNoActiveCloudflareProvisioning(ctx, args.vaultId);

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
