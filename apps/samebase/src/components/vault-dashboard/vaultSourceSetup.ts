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
    case "create_vault":
      return "connect GitHub";
    case "seed_starter":
      return "seed starter";
    case "sync_tree":
      return "sync tree";
    case "claim_infra":
      return "claim infra";
    case "attach_convex":
      return "attach Convex";
    case "attach_worker":
      return "attach Worker";
    case "configure_workers_builds_for_github":
      return "configure Workers Builds for GitHub";
    case "rotate_convex_deploy_keys_for_workers_builds":
      return "rotate Convex deploy keys for Workers Builds";
    case "finish":
      return "finish";
  }
  step satisfies never;
  return step;
}
