import type { api } from "../../../convex/_generated/api";
import {
  type VaultResourceRailAction,
  type VaultResourceRailRowState,
  type VaultResourceRailState,
} from "./VaultResourceRail";
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

function compareAppRoots(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  if (left === ".") {
    return -1;
  }
  if (right === ".") {
    return 1;
  }
  return left.localeCompare(right);
}

export function buildVaultDashboardResourceRailState({
  buildAddCloudflareWorkerHref,
  addCloudflareWorkerOnClick,
  buildAddConvexHref,
  addConvexOnClick,
  githubRepositoryUrl,
  vault,
}: {
  buildAddCloudflareWorkerHref?: (appRoot: string) => string;
  addCloudflareWorkerOnClick?: (appRoot: string) => void;
  buildAddConvexHref?: (appRoot: string) => string;
  addConvexOnClick?: (appRoot: string) => void;
  githubRepositoryUrl: string;
  vault: VaultDashboardVault;
}): VaultResourceRailState {
  const canConfigureMissingResources =
    vault.state === "ready" && !isVaultResourceSetupBlockingManualActions(vault);
  const providerSetup = resolveVaultProviderSetupStatus(vault.providerSetup);
  const providerSetupProvider = resolveVaultProviderSetupStepProvider(vault.providerSetup);
  const sourceSetupProvider = resolveSourceSetupResourceProvider(vault.sourceSetup);
  const hasNonRootAppRoot =
    vault.convexDeployments.some((deployment) => deployment.appRoot !== ".") ||
    vault.cloudflareWorkers.some((worker) => worker.appRoot !== ".");
  // When a non-root app exists, "." is no longer a generic add-provider target.
  const canConfigureRootAppRoot = !hasNonRootAppRoot;
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

  function buildAddConvexAction(appRoot: string): VaultResourceRailAction {
    return {
      kind: "add",
      label: "?add-convex",
      disabled: !buildAddConvexHref && !addConvexOnClick,
      href: buildAddConvexHref?.(appRoot),
      onClick: addConvexOnClick ? () => addConvexOnClick(appRoot) : undefined,
    };
  }

  function buildAddCloudflareWorkerAction(appRoot: string): VaultResourceRailAction {
    return {
      kind: "add",
      label: "?add-cloudflare",
      disabled: !buildAddCloudflareWorkerHref && !addCloudflareWorkerOnClick,
      href: buildAddCloudflareWorkerHref?.(appRoot),
      onClick: addCloudflareWorkerOnClick ? () => addCloudflareWorkerOnClick(appRoot) : undefined,
    };
  }

  const convexRowsByAppRoot = new Map<string, VaultResourceRailRowState<"convex">>();
  if (vault.sourceSetup.status === "failed" && sourceSetupProvider === "convex") {
    convexRowsByAppRoot.set(".", {
      provider: "convex",
      status: "failed",
      value: vault.ghRepoName,
      actions: [{ kind: "retry", label: "Retry" }],
    });
  } else if (vault.sourceSetup.status === "running" && sourceSetupProvider === "convex") {
    convexRowsByAppRoot.set(".", {
      provider: "convex",
      status: "running",
      value: vault.ghRepoName,
    });
  } else if (
    vault.providerSetup.status === "failed" &&
    providerSetupProvider === "convex" &&
    providerSetup?.status === "failed"
  ) {
    const rootConvexDeployment = vault.convexDeployments.find(
      (deployment) => deployment.appRoot === ".",
    );
    convexRowsByAppRoot.set(".", {
      provider: "convex",
      status: "failed",
      value: rootConvexDeployment?.projectSlug ?? vault.ghRepoName,
      scope: normalizeResourceScope(rootConvexDeployment?.teamSlug),
      actions: canConfigureRootAppRoot
        ? [buildAddConvexAction(".")]
        : [{ kind: "retry", label: "Retry" }],
    });
  } else if (
    vault.providerSetup.status === "running" &&
    providerSetupProvider === "convex" &&
    providerSetup?.status === "running"
  ) {
    const rootConvexDeployment = vault.convexDeployments.find(
      (deployment) => deployment.appRoot === ".",
    );
    convexRowsByAppRoot.set(".", {
      provider: "convex",
      status: "running",
      value: rootConvexDeployment?.projectSlug ?? vault.ghRepoName,
      scope: normalizeResourceScope(rootConvexDeployment?.teamSlug),
    });
  } else {
    const sortedConvexDeployments = [...vault.convexDeployments].sort(
      (left, right) =>
        compareAppRoots(left.appRoot, right.appRoot) ||
        left.projectSlug.localeCompare(right.projectSlug) ||
        left.projectId.localeCompare(right.projectId),
    );
    for (const deployment of sortedConvexDeployments) {
      convexRowsByAppRoot.set(deployment.appRoot, {
        provider: "convex",
        status: "ready",
        value: deployment.projectSlug,
        scope: normalizeResourceScope(deployment.teamSlug),
        href: deployment.projectSettingsDashboardUrl,
        actions:
          deployment.appRoot === "." && canConfigureRootAppRoot && canConfigureMissingResources
            ? [buildAddConvexAction(deployment.appRoot)]
            : undefined,
      });
    }
  }

  const cloudflareRowsByAppRoot = new Map<string, VaultResourceRailRowState<"cloudflare">>();
  if (vault.sourceSetup.status === "failed" && sourceSetupProvider === "cloudflare") {
    cloudflareRowsByAppRoot.set(".", {
      provider: "cloudflare",
      status: "failed",
      value: vault.ghRepoName,
      actions: [{ kind: "retry", label: "Retry" }],
    });
  } else if (vault.sourceSetup.status === "running" && sourceSetupProvider === "cloudflare") {
    cloudflareRowsByAppRoot.set(".", {
      provider: "cloudflare",
      status: "running",
      value: vault.ghRepoName,
    });
  } else if (
    vault.providerSetup.status === "failed" &&
    providerSetupProvider === "cloudflare" &&
    providerSetup?.status === "failed"
  ) {
    cloudflareRowsByAppRoot.set(".", {
      provider: "cloudflare",
      status: "failed",
      value: vault.ghRepoName,
      actions: canConfigureRootAppRoot
        ? [buildAddCloudflareWorkerAction(".")]
        : [{ kind: "retry", label: "Retry" }],
    });
  } else if (
    vault.providerSetup.status === "running" &&
    providerSetupProvider === "cloudflare" &&
    providerSetup?.status === "running"
  ) {
    cloudflareRowsByAppRoot.set(".", {
      provider: "cloudflare",
      status: "running",
      value: vault.ghRepoName,
    });
  } else {
    const sortedCloudflareWorkers = [...vault.cloudflareWorkers].sort(
      (left, right) =>
        compareAppRoots(left.appRoot, right.appRoot) ||
        left.workerName.localeCompare(right.workerName),
    );
    for (const worker of sortedCloudflareWorkers) {
      cloudflareRowsByAppRoot.set(worker.appRoot, {
        provider: "cloudflare",
        status: "ready",
        value: worker.workerName,
        scope: resolveCloudflareWorkersSubdomain({
          workersDevUrl: worker.workersDevUrl,
          workerName: worker.workerName,
        }),
        href: worker.projectDashboardUrl,
        actions:
          worker.appRoot === "." && canConfigureRootAppRoot && canConfigureMissingResources
            ? [buildAddCloudflareWorkerAction(worker.appRoot)]
            : undefined,
      });
    }
    if (!cloudflareRowsByAppRoot.has(".") && canConfigureRootAppRoot) {
      if (!canConfigureMissingResources) {
        cloudflareRowsByAppRoot.set(".", {
          provider: "cloudflare",
          status: "pending",
          value: vault.ghRepoName,
        });
      } else {
        cloudflareRowsByAppRoot.set(".", {
          provider: "cloudflare",
          status: "action_required",
          actions: [buildAddCloudflareWorkerAction(".")],
        });
      }
    } else if (canConfigureRootAppRoot && canConfigureMissingResources) {
      const rootCloudflareRow = cloudflareRowsByAppRoot.get(".");
      if (rootCloudflareRow?.status === "ready") {
        cloudflareRowsByAppRoot.set(".", {
          ...rootCloudflareRow,
          actions: [buildAddCloudflareWorkerAction(".")],
        });
      }
    }
  }

  const shouldRenderRootAppRoot =
    canConfigureRootAppRoot || convexRowsByAppRoot.has(".") || cloudflareRowsByAppRoot.has(".");
  const appRoots = Array.from(
    new Set([
      ...(shouldRenderRootAppRoot ? ["."] : []),
      ...vault.convexDeployments.map((deployment) => deployment.appRoot),
      ...vault.cloudflareWorkers.map((worker) => worker.appRoot),
    ]),
  ).sort(compareAppRoots);
  const apps = appRoots.flatMap((appRoot) => {
    const rows: VaultResourceRailRowState<"cloudflare" | "convex">[] = [];
    const convexRow = convexRowsByAppRoot.get(appRoot);
    if (convexRow) {
      rows.push(convexRow);
    } else if (canConfigureMissingResources && (appRoot !== "." || canConfigureRootAppRoot)) {
      rows.push({
        provider: "convex",
        status: "action_required",
        actions: [buildAddConvexAction(appRoot)],
      });
    } else if (appRoot !== "." || canConfigureRootAppRoot) {
      rows.push({
        provider: "convex",
        status: "pending",
        value: appRoot === "." ? vault.ghRepoName : appRoot,
      });
    }

    const cloudflareRow = cloudflareRowsByAppRoot.get(appRoot);
    if (cloudflareRow) {
      rows.push(cloudflareRow);
    }

    return rows.length > 0 ? [{ appRoot, rows }] : [];
  });

  return {
    apps,
    githubRow,
  } satisfies VaultResourceRailState;
}
