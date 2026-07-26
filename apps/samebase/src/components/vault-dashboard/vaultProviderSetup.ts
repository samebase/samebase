import type { api } from "../../../convex/_generated/api";

type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];
export type VaultDashboardProviderSetupStep = Extract<
  VaultDashboardVault["providerSetup"],
  { status: "failed" | "running" }
>["step"];

export function formatVaultProviderSetupStep(step: VaultDashboardProviderSetupStep): string {
  switch (step) {
    case "claim_infra":
      return "Preparing provider resources";
    case "attach_convex":
      return "Connecting Convex project";
    case "attach_worker":
      return "Connecting Cloudflare Worker";
    case "configure_workers_builds_for_github":
      return "Configuring Cloudflare builds";
    case "rotate_convex_deploy_keys_for_workers_builds":
      return "Connecting Cloudflare builds to Convex";
    case "finish":
      return "Finishing setup";
  }
  step satisfies never;
  return step;
}
