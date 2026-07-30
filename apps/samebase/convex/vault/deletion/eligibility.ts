import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import {
  readVaultInfrastructureState,
  type VaultInfrastructureState,
} from "../infrastructureOperation";
import { readVaultDeletionState } from "./state";

export type VaultDeletionEligibility =
  | {
      state: "eligible";
    }
  | {
      state: "blocked";
      reason: string;
    };

export function resolveVaultDeletionEligibility(
  vault: Doc<"vaults">,
  infrastructure: VaultInfrastructureState,
  hasActiveProvisioningRun: boolean,
): VaultDeletionEligibility {
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

  switch (infrastructure.operation.kind) {
    case "none":
      return hasActiveProvisioningRun
        ? {
            state: "blocked",
            reason: "Vault source setup is still running.",
          }
        : { state: "eligible" };
    case "managed_run":
      return {
        state: "blocked",
        reason:
          infrastructure.operation.run?.state === "queued"
            ? "Vault setup is still queued."
            : "Vault setup is still running.",
      };
    case "manual_provider_write":
      return {
        state: "blocked",
        reason: "A provider change is still running.",
      };
    default:
      infrastructure.operation satisfies never;
      throw new Error("Unknown vault infrastructure operation.");
  }
}

export async function hasActiveVaultProvisioningRun(
  ctx: Pick<QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<boolean> {
  const [queuedRun, runningRun] = await Promise.all([
    ctx.db
      .query("workflow_vaultProvisioning_runs")
      .withIndex("by_vault_and_state", (q) => q.eq("vaultId", vaultId).eq("state", "queued"))
      .first(),
    ctx.db
      .query("workflow_vaultProvisioning_runs")
      .withIndex("by_vault_and_state", (q) => q.eq("vaultId", vaultId).eq("state", "running"))
      .first(),
  ]);
  return queuedRun !== null || runningRun !== null;
}

export async function readVaultDeletionEligibility(
  ctx: Pick<QueryCtx, "db">,
  vault: Doc<"vaults">,
): Promise<VaultDeletionEligibility> {
  const [infrastructure, hasActiveProvisioningRun] = await Promise.all([
    readVaultInfrastructureState(ctx, vault),
    hasActiveVaultProvisioningRun(ctx, vault._id),
  ]);
  return resolveVaultDeletionEligibility(vault, infrastructure, hasActiveProvisioningRun);
}
