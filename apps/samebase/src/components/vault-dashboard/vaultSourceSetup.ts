import type { api } from "../../../convex/_generated/api";

type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];
export type VaultDashboardSourceSetup = VaultDashboardVault["sourceSetup"];
export type VaultDashboardSourceSetupStep = Extract<
  VaultDashboardSourceSetup,
  { status: "failed" | "running" }
>["step"];

export function formatVaultSourceSetupStep(step: VaultDashboardSourceSetupStep): string {
  switch (step) {
    case "run_created":
      return "Starting setup";
    case "initialize_vault":
      return "Preparing vault";
    case "validate_connections":
      return "Checking provider connections";
    case "create_github_repo":
      return "Creating GitHub repository";
    case "fetch_github_repo":
      return "Reading GitHub repository";
    case "connect_github":
      return "Connecting GitHub repository";
    case "seed_starter":
      return "Adding starter files";
    case "sync_tree":
      return "Syncing repository files";
    default:
      return step satisfies never;
  }
}
