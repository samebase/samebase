import type { Doc } from "../_generated/dataModel";
import { isVaultDeletingOrDeleteFailed, readVaultDeletionState } from "./deletion/state";

export type ConnectedVault = Extract<Doc<"vaults">, { state: "connected" }>;
export type NoterManagedConnectedVault = Extract<
  ConnectedVault,
  { githubMode: "create_repository" }
>;

export function isConnectedVault(vault: Doc<"vaults"> | null | undefined) {
  return vault?.state === "connected";
}

export function isLiveConnectedVault(
  vault: Doc<"vaults"> | null | undefined,
): vault is ConnectedVault {
  return isConnectedVault(vault) && !isVaultDeletingOrDeleteFailed(vault);
}

/**
 * Asserts both that the vault row exists and that repo-backed code can use it.
 * Callers that need different errors for missing vs. pre-GitHub vaults should
 * split those checks before calling this helper.
 */
export function assertConnectedVault(vault: Doc<"vaults"> | null | undefined): ConnectedVault {
  if (!isLiveConnectedVault(vault)) {
    if (vault && isVaultDeletingOrDeleteFailed(vault)) {
      const deletion = readVaultDeletionState(vault);
      throw new Error(
        deletion.state === "delete_failed"
          ? "Vault deletion failed. Retry deletion to continue."
          : "Vault deletion is in progress.",
      );
    }
    throw new Error("Vault is not connected to a GitHub repository.");
  }
  return vault;
}

export function isNoterManagedVault(vault: ConnectedVault) {
  return vault.githubMode === "create_repository";
}
