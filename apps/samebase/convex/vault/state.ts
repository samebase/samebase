import { guard } from "@noter-md/dependent/main";
import type { Doc } from "../_generated/dataModel";
import { isVaultDeletingOrDeleteFailed, readVaultDeletionState } from "./deletion/state";

export type ConnectedVault = Extract<Doc<"vaults">, { state: "connected" }>;
export type SamebaseManagedConnectedVault = Extract<
  ConnectedVault,
  { githubMode: "create_repository" }
>;

export const isConnectedVault = guard<Doc<"vaults"> | null | undefined, ConnectedVault>((vault) =>
  vault?.state === "connected" ? vault : null,
);

export const isLiveConnectedVault = guard<Doc<"vaults"> | null | undefined, ConnectedVault>(
  (vault) => (isConnectedVault(vault) && !isVaultDeletingOrDeleteFailed(vault) ? vault : null),
);

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

export const isSamebaseManagedVault = guard<ConnectedVault, SamebaseManagedConnectedVault>(
  (vault) => (vault.githubMode === "create_repository" ? vault : null),
);
