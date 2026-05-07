import type { Doc } from "./_generated/dataModel";
import type { HostingProvider } from "./hostingState";

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
 * Repo-backed code must go through this guard so pre-GitHub vault states fail
 * closed instead of accidentally using missing repository fields.
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

export function getConnectedVaultHostingProvider(
  vault: ConnectedVault,
): HostingProvider | undefined {
  if (vault.hosting.state !== "not_configured") {
    return vault.hosting.provider;
  }
  if (isNoterManagedVault(vault)) {
    return "cloudflare";
  }
  return undefined;
}
