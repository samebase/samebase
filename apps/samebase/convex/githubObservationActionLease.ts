import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { isLiveConnectedVault } from "./vault/state";

const { array, boolean, id, literal, null: vNull, number, object, string, union } = v;

// Convex actions have a hard 10-minute execution limit. The margin prevents
// deletion from reaping a lease while the runtime is enforcing that limit.
export const GITHUB_OBSERVATION_ACTION_LEASE_DURATION_MS = 10 * 60_000 + 30_000;
const GITHUB_OBSERVATION_ACTION_MAX_VAULTS = 25;

export const acquire = internalMutation({
  args: {
    userId: id("users"),
    leaseGroupId: string(),
    vaultIds: array(id("vaults")),
  },
  returns: boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const user = await ctx.db.get(args.userId);
    if (user === null || user.accountDeletion !== undefined) {
      return false;
    }
    const uniqueVaultIds = [...new Set(args.vaultIds)];
    if (
      uniqueVaultIds.length < 1 ||
      uniqueVaultIds.length > GITHUB_OBSERVATION_ACTION_MAX_VAULTS ||
      uniqueVaultIds.length !== args.vaultIds.length
    ) {
      throw new Error("GitHub observation action lease has an invalid vault set.");
    }
    const existing = await ctx.db
      .query("githubObservationActionLeases")
      .withIndex("by_leaseGroupId", (q) => q.eq("leaseGroupId", args.leaseGroupId))
      .first();
    if (existing !== null) {
      throw new Error("GitHub observation action lease group already exists.");
    }
    const vaults = await Promise.all(
      uniqueVaultIds.map(async (vaultId) => await ctx.db.get(vaultId)),
    );
    if (vaults.some((vault) => !isLiveConnectedVault(vault) || vault.userId !== args.userId)) {
      return false;
    }
    const expiresAt = Date.now() + GITHUB_OBSERVATION_ACTION_LEASE_DURATION_MS;
    for (const vaultId of uniqueVaultIds) {
      await ctx.db.insert("githubObservationActionLeases", {
        userId: args.userId,
        vaultId,
        leaseGroupId: args.leaseGroupId,
        expiresAt,
      });
    }
    return true;
  },
});

export const release = internalMutation({
  args: { leaseGroupId: string() },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const leases = await ctx.db
      .query("githubObservationActionLeases")
      .withIndex("by_leaseGroupId", (q) => q.eq("leaseGroupId", args.leaseGroupId))
      .take(GITHUB_OBSERVATION_ACTION_MAX_VAULTS + 1);
    if (leases.length > GITHUB_OBSERVATION_ACTION_MAX_VAULTS) {
      throw new Error("GitHub observation action lease group exceeds its bound.");
    }
    for (const lease of leases) {
      await ctx.db.delete(lease._id);
    }
    return null;
  },
});

export const inspectForVaultDeletion = internalMutation({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
  },
  returns: union(
    object({ state: literal("done") }),
    object({ state: literal("waiting"), retryAfterMs: number() }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const leases = await ctx.db
      .query("githubObservationActionLeases")
      .withIndex("by_vaultId_and_expiresAt", (q) => q.eq("vaultId", args.vaultId))
      .take(GITHUB_OBSERVATION_ACTION_MAX_VAULTS);
    let retryAfterMs: number | null = null;
    for (const lease of leases) {
      if (lease.userId !== args.userId) {
        throw new Error("GitHub observation action lease belongs to another user.");
      }
      if (lease.expiresAt <= now) {
        await ctx.db.delete(lease._id);
        continue;
      }
      retryAfterMs = Math.min(retryAfterMs ?? Number.POSITIVE_INFINITY, lease.expiresAt - now);
    }
    if (retryAfterMs !== null) {
      return { state: "waiting", retryAfterMs } as const;
    }
    return leases.length === GITHUB_OBSERVATION_ACTION_MAX_VAULTS
      ? ({ state: "waiting", retryAfterMs: 0 } as const)
      : ({ state: "done" } as const);
  },
});
