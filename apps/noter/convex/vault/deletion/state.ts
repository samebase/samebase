import type { Doc } from "../../_generated/dataModel";
import type { VaultDeletionState } from "./model";

export function readVaultDeletionState(
  vault: Doc<"vaults">,
): VaultDeletionState {
  return vault.deletion;
}

export function isVaultDeletingOrDeleteFailed(vault: Doc<"vaults">): boolean {
  return readVaultDeletionState(vault).state !== "not_deleting";
}
