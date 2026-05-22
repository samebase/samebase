import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { readVaultDeletionState } from "./state";

export type VaultDeletionEligibility =
  | {
      state: "eligible";
    }
  | {
      state: "blocked";
      reason: string;
    };

async function hasActiveProvisioningRun(
  ctx: Pick<QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<"queued" | "running" | null> {
  const queuedRun = await ctx.db
    .query("appProvisioningRuns")
    .withIndex("by_vault_and_state", (q) => q.eq("vaultId", vaultId).eq("state", "queued"))
    .first();
  if (queuedRun) {
    return "queued";
  }

  const runningRun = await ctx.db
    .query("appProvisioningRuns")
    .withIndex("by_vault_and_state", (q) => q.eq("vaultId", vaultId).eq("state", "running"))
    .first();
  return runningRun ? "running" : null;
}

export async function readVaultDeletionEligibility(
  ctx: Pick<QueryCtx, "db">,
  vault: Doc<"vaults">,
): Promise<VaultDeletionEligibility> {
  const deletion = readVaultDeletionState(vault);
  if (deletion.state !== "not_deleting") {
    return {
      state: "blocked",
      reason: "Vault deletion is already in progress.",
    };
  }
  if (vault.state === "not_connected") {
    return {
      state: "blocked",
      reason: "Vault is not ready to delete yet.",
    };
  }
  if (vault.state === "provisioning") {
    return {
      state: "blocked",
      reason: "Vault source setup is still running.",
    };
  }
  if (vault.state === "connected") {
    if (vault.convex.state === "provisioning") {
      return {
        state: "blocked",
        reason: "Vault Convex provisioning is still running.",
      };
    }
  }

  const activeProvisioningRun = await hasActiveProvisioningRun(ctx, vault._id);
  if (activeProvisioningRun === "queued") {
    return {
      state: "blocked",
      reason: "Vault setup is still queued.",
    };
  }
  if (activeProvisioningRun === "running") {
    return {
      state: "blocked",
      reason: "Vault setup is still running.",
    };
  }

  const activeOwner = await ctx.db
    .query("vaultInfrastructureOwnership")
    .withIndex("by_vault_and_state", (q) => q.eq("vaultId", vault._id).eq("state", "active"))
    .first();
  if (activeOwner) {
    return {
      state: "blocked",
      reason: "Vault infrastructure provisioning is still running.",
    };
  }

  return { state: "eligible" };
}
