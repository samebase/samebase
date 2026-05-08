import type { Doc } from "./_generated/dataModel";
import type { VaultCloudflareState } from "./vaultModel";

export type ConnectedVault = Extract<Doc<"vaults">, { state: "connected" }>;
export type NoterManagedConnectedVault = Extract<
  ConnectedVault,
  { githubMode: "create_repository" }
>;

export function isConnectedVault(
  vault: Doc<"vaults"> | null | undefined,
): vault is ConnectedVault {
  return vault?.state === "connected";
}

/**
 * Asserts both that the vault row exists and that repo-backed code can use it.
 * Callers that need different errors for missing vs. pre-GitHub vaults should
 * split those checks before calling this helper.
 */
export function assertConnectedVault(
  vault: Doc<"vaults"> | null | undefined,
): ConnectedVault {
  if (!isConnectedVault(vault)) {
    throw new Error("Vault is not connected to a GitHub repository.");
  }
  return vault;
}

export function isNoterManagedVault(
  vault: ConnectedVault,
): vault is NoterManagedConnectedVault {
  return vault.githubMode === "create_repository";
}

export function getConnectedVaultCloudflareState(
  vault: ConnectedVault,
): VaultCloudflareState {
  return vault.cloudflare;
}
