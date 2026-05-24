import type { api } from "../../../convex/_generated/api";
import { type VaultResourceRailRowState, type VaultResourceRailState } from "./VaultResourceRail";
import { type VaultDashboardSourceSetup } from "./vaultSourceSetup";
import {
  resolveVaultProviderSetupStatus,
  resolveVaultProviderSetupStepProvider,
} from "./vaultProviderSetup";

type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];

function resolveSourceSetupResourceProvider(
  sourceSetup: VaultDashboardSourceSetup,
): "cloudflare" | "convex" | "github" | null {
  if (sourceSetup.status !== "failed" && sourceSetup.status !== "running") {
    return null;
  }

  switch (sourceSetup.step) {
    case "run_created":
    case "initialize_vault":
    case "validate_connections":
      return null;
    case "create_github_repo":
    case "fetch_github_repo":
    case "connect_github":
    case "create_vault":
    case "seed_starter":
    case "sync_tree":
    case "claim_infra":
      return "github";
    case "ensure_convex":
    case "ensure_convex_preview":
      return "convex";
    case "ensure_cloudflare":
    case "record_domains":
      return "cloudflare";
    case "finish":
      return null;
  }
  sourceSetup.step satisfies never;
  return null;
}

function isVaultResourceSetupBlockingManualActions(vault: VaultDashboardVault): boolean {
  if (vault.sourceSetup.status === "running" || vault.sourceSetup.status === "failed") {
    return true;
  }

  return vault.providerSetup.status === "running" || vault.providerSetup.status === "failed";
}

function normalizeResourceScope(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function resolveCloudflareWorkersSubdomain({
  workersDevUrl,
  workerName,
}: {
  workersDevUrl: string | undefined;
  workerName: string | undefined;
}): string | undefined {
  const normalizedWorkerName = workerName?.trim();
  if (!workersDevUrl || !normalizedWorkerName) {
    return undefined;
  }

  let hostname: string;
  try {
    hostname = new URL(workersDevUrl).hostname;
  } catch {
    return undefined;
  }

  const suffix = ".workers.dev";
  if (!hostname.endsWith(suffix)) {
    return undefined;
  }

  const prefix = hostname.slice(0, -suffix.length);
  const workerPrefix = `${normalizedWorkerName}.`;
  if (!prefix.startsWith(workerPrefix)) {
    return undefined;
  }

  return normalizeResourceScope(prefix.slice(workerPrefix.length));
}

export function buildVaultDashboardResourceRailState({
  addCloudflareWorkerHref,
  addCloudflareWorkerOnClick,
  addConvexHref,
  addConvexOnClick,
  githubRepositoryUrl,
  vault,
}: {
  addCloudflareWorkerHref?: string;
  addCloudflareWorkerOnClick?: () => void;
  addConvexHref?: string;
  addConvexOnClick?: () => void;
  githubRepositoryUrl: string;
  vault: VaultDashboardVault;
}): VaultResourceRailState {
  const canConfigureMissingResources =
    vault.state === "ready" && !isVaultResourceSetupBlockingManualActions(vault);
  const providerSetup = resolveVaultProviderSetupStatus(vault.providerSetup);
  const providerSetupProvider = resolveVaultProviderSetupStepProvider(vault.providerSetup);
  const sourceSetupProvider = resolveSourceSetupResourceProvider(vault.sourceSetup);
  const convexProjectScope = normalizeResourceScope(vault.convexTeamSlug);
  const cloudflareWorkerScope = resolveCloudflareWorkersSubdomain({
    workersDevUrl: vault.cloudflareWorkersDevUrl,
    workerName: vault.cloudflareWorkerName,
  });
  let githubRow: VaultResourceRailRowState<"github">;
  if (vault.sourceSetup.status === "failed" && sourceSetupProvider === "github") {
    githubRow = {
      provider: "github",
      status: "failed",
      value: vault.repositoryFullName,
      actions: [{ kind: "retry", label: "Retry" }],
    };
  } else if (vault.sourceSetup.status === "running" && sourceSetupProvider === "github") {
    githubRow = {
      provider: "github",
      status: "running",
      value: vault.repositoryFullName,
    };
  } else if (vault.hasConnectedGitHubRepository) {
    githubRow = {
      provider: "github",
      status: "ready",
      value: vault.repositoryFullName,
      href: githubRepositoryUrl,
    };
  } else {
    githubRow = {
      provider: "github",
      status: "pending",
      value: vault.repositoryFullName,
    };
  }

  let convexRow: VaultResourceRailRowState<"convex">;
  if (vault.sourceSetup.status === "failed" && sourceSetupProvider === "convex") {
    convexRow = {
      provider: "convex",
      status: "failed",
      value: vault.ghRepoName,
      actions: [{ kind: "retry", label: "Retry" }],
    };
  } else if (vault.sourceSetup.status === "running" && sourceSetupProvider === "convex") {
    convexRow = {
      provider: "convex",
      status: "running",
      value: vault.ghRepoName,
    };
  } else if (
    vault.providerSetup.status === "failed" &&
    providerSetupProvider === "convex" &&
    providerSetup?.status === "failed"
  ) {
    convexRow = {
      provider: "convex",
      status: "failed",
      value: vault.convexProjectSlug ?? vault.ghRepoName,
      scope: vault.convexProjectSlug ? convexProjectScope : undefined,
      actions: [
        {
          kind: "add",
          label: "?add-convex",
          disabled: !addConvexHref,
          href: addConvexHref,
          onClick: addConvexOnClick,
        },
      ],
    };
  } else if (
    vault.providerSetup.status === "running" &&
    providerSetupProvider === "convex" &&
    providerSetup?.status === "running"
  ) {
    convexRow = {
      provider: "convex",
      status: "running",
      value: vault.convexProjectSlug ?? vault.ghRepoName,
      scope: vault.convexProjectSlug ? convexProjectScope : undefined,
    };
  } else if (vault.convexProjectSlug) {
    convexRow = {
      provider: "convex",
      status: "ready",
      value: vault.convexProjectSlug,
      scope: convexProjectScope,
      href: vault.convexProjectSettingsDashboardUrl,
    };
  } else if (!canConfigureMissingResources) {
    convexRow = {
      provider: "convex",
      status: "pending",
      value: vault.ghRepoName,
    };
  } else {
    convexRow = {
      provider: "convex",
      status: "action_required",
      actions: [
        {
          kind: "add",
          label: "?add-convex",
          disabled: !addConvexHref,
          href: addConvexHref,
          onClick: addConvexOnClick,
        },
      ],
    };
  }

  let cloudflareRow: VaultResourceRailRowState<"cloudflare">;
  if (vault.sourceSetup.status === "failed" && sourceSetupProvider === "cloudflare") {
    cloudflareRow = {
      provider: "cloudflare",
      status: "failed",
      value: vault.ghRepoName,
      actions: [{ kind: "retry", label: "Retry" }],
    };
  } else if (vault.sourceSetup.status === "running" && sourceSetupProvider === "cloudflare") {
    cloudflareRow = {
      provider: "cloudflare",
      status: "running",
      value: vault.ghRepoName,
    };
  } else if (
    vault.providerSetup.status === "failed" &&
    providerSetupProvider === "cloudflare" &&
    providerSetup?.status === "failed"
  ) {
    cloudflareRow = {
      provider: "cloudflare",
      status: "failed",
      value: vault.cloudflareWorkerName ?? vault.ghRepoName,
      actions: [
        {
          kind: "add",
          label: "?add-cloudflare",
          disabled: !addCloudflareWorkerHref,
          href: addCloudflareWorkerHref,
          onClick: addCloudflareWorkerOnClick,
        },
      ],
    };
  } else if (
    vault.providerSetup.status === "running" &&
    providerSetupProvider === "cloudflare" &&
    providerSetup?.status === "running"
  ) {
    cloudflareRow = {
      provider: "cloudflare",
      status: "running",
      value: vault.cloudflareWorkerName ?? vault.ghRepoName,
    };
  } else if (vault.cloudflareWorkerName) {
    cloudflareRow = {
      provider: "cloudflare",
      status: "ready",
      value: vault.cloudflareWorkerName,
      scope: cloudflareWorkerScope,
      href: vault.cloudflareProjectDashboardUrl,
    };
  } else if (!canConfigureMissingResources) {
    cloudflareRow = {
      provider: "cloudflare",
      status: "pending",
      value: vault.ghRepoName,
    };
  } else {
    cloudflareRow = {
      provider: "cloudflare",
      status: "action_required",
      actions: [
        {
          kind: "add",
          label: "?add-cloudflare",
          disabled: !addCloudflareWorkerHref,
          href: addCloudflareWorkerHref,
          onClick: addCloudflareWorkerOnClick,
        },
      ],
    };
  }

  return {
    rows: [githubRow, convexRow, cloudflareRow],
  } satisfies VaultResourceRailState;
}
