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
      return "run created";
    case "initialize_vault":
      return "initialize vault";
    case "validate_connections":
      return "validate connections";
    case "create_github_repo":
      return "create GitHub repo";
    case "fetch_github_repo":
      return "fetch GitHub repo";
    case "connect_github":
      return "connect GitHub";
    case "seed_starter":
      return "seed starter";
    case "sync_tree":
      return "sync tree";
  }
  step satisfies never;
  return step;
}
