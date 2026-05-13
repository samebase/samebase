import type { api } from "../../../convex/_generated/api";

type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];
export type VaultDashboardProviderSetup = VaultDashboardVault["providerSetup"];
export type VaultDashboardProviderSetupProvider = Extract<
  VaultDashboardProviderSetup,
  { status: "failed" | "running" }
>["provider"];

export type VaultProviderSetupStatus =
  | {
      status: "running";
      label: string;
    }
  | {
      status: "failed";
      label: string;
      message: string;
    };

export function formatVaultProviderSetupProvider(
  provider: VaultDashboardProviderSetupProvider,
): string {
  switch (provider) {
    case "convex":
      return "Convex";
    case "cloudflare":
      return "Cloudflare";
  }
  provider satisfies never;
  return provider;
}

export function resolveVaultProviderSetupStatus(
  providerSetup: VaultDashboardProviderSetup,
): VaultProviderSetupStatus | null {
  switch (providerSetup.status) {
    case "not_applicable":
    case "ready":
      return null;
    case "running":
      return {
        status: "running",
        label: `${formatVaultProviderSetupProvider(providerSetup.provider)}: provisioning`,
      };
    case "failed":
      return {
        status: "failed",
        label: `${formatVaultProviderSetupProvider(providerSetup.provider)}: failed`,
        message: `${formatVaultProviderSetupProvider(providerSetup.provider)} setup failed.`,
      };
  }

  providerSetup satisfies never;
  return null;
}
