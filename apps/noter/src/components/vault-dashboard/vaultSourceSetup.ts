import type { api } from "../../../convex/_generated/api";

type VaultDashboardVault = NonNullable<
  (typeof api.vault.getUserVaults)["_returnType"]
>[number];
export type VaultDashboardSourceSetup = VaultDashboardVault["sourceSetup"];
export type VaultDashboardSourceSetupStep = Extract<
  VaultDashboardSourceSetup,
  { status: "failed" | "running" }
>["step"];

export function formatVaultSourceSetupStep(
  step: VaultDashboardSourceSetupStep,
): string {
  switch (step) {
    case "run_created":
      return "run created";
    case "initialize_vault":
      return "initialize vault";
    case "validate_connections":
      return "validate connections";
    case "create_github_repo":
      return "create GitHub repo";
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
    case "ensure_convex":
      return "ensure Convex";
    case "ensure_convex_preview":
      return "ensure Convex preview";
    case "ensure_cloudflare":
      return "ensure Cloudflare";
    case "record_domains":
      return "record domains";
    case "finish":
      return "finish";
  }
  step satisfies never;
  return step;
}
