import type { Doc } from "./_generated/dataModel";
import type { VaultDeletionState } from "./vaultDeletionModel";

export function readVaultDeletionState(
  vault: Doc<"vaults">,
): VaultDeletionState {
  return vault.deletion ?? { state: "not_deleting" };
}

export function isVaultDeletingOrDeleteFailed(vault: Doc<"vaults">): boolean {
  return readVaultDeletionState(vault).state !== "not_deleting";
}
