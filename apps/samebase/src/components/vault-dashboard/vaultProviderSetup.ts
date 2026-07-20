import type { api } from "../../../convex/_generated/api";

type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];
export type VaultDashboardProviderSetup = VaultDashboardVault["providerSetup"];
export type VaultDashboardProviderSetupProvider = Extract<
  VaultDashboardProviderSetup,
  { status: "failed" | "running" }
>["provider"];
export type VaultDashboardProviderSetupStep = Extract<
  VaultDashboardProviderSetup,
  { status: "failed" | "running" }
>["step"];

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

export function resolveVaultProviderSetupStepProvider(
  providerSetup: VaultDashboardProviderSetup,
): VaultDashboardProviderSetupProvider | null {
  if (providerSetup.status !== "failed" && providerSetup.status !== "running") {
    return null;
  }

  switch (providerSetup.step) {
    case "validate_connections":
    case "claim_infra":
      return providerSetup.provider;
    case "attach_convex":
      return "convex";
    case "attach_worker":
    case "configure_workers_builds_for_github":
    case "rotate_convex_deploy_keys_for_workers_builds":
      return "cloudflare";
    case "run_created":
    case "initialize_vault":
    case "create_github_repo":
    case "fetch_github_repo":
    case "connect_github":
    case "create_vault":
    case "seed_starter":
    case "sync_tree":
    case "finish":
      return null;
  }
  providerSetup.step satisfies never;
  return null;
}

export function resolveVaultProviderSetupStatus(
  providerSetup: VaultDashboardProviderSetup,
): VaultProviderSetupStatus | null {
  switch (providerSetup.status) {
    case "not_applicable":
    case "ready":
      return null;
    case "running": {
      const provider =
        resolveVaultProviderSetupStepProvider(providerSetup) ?? providerSetup.provider;
      return {
        status: "running",
        label: `${formatVaultProviderSetupProvider(provider)}: provisioning`,
      };
    }
    case "failed": {
      const provider =
        resolveVaultProviderSetupStepProvider(providerSetup) ?? providerSetup.provider;
      return {
        status: "failed",
        label: `${formatVaultProviderSetupProvider(provider)}: failed`,
        message: `${formatVaultProviderSetupProvider(provider)} setup failed.`,
      };
    }
  }

  providerSetup satisfies never;
  return null;
}
