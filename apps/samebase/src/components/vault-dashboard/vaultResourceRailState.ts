import type { api } from "../../../convex/_generated/api";
import {
  type VaultResourceRailActionList,
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
type VaultDashboardProviderSetupStep = Extract<
  VaultDashboardVault["providerSetup"],
  { status: "failed" | "running" }
>["step"];

export function canOpenVaultProviderConnectionDialog({
  appRoot,
  provider,
  vault,
}: {
  appRoot: string | null;
  provider: "cloudflare" | "convex";
  vault: VaultDashboardVault | null;
}): boolean {
  if (
    !vault ||
    vault.state !== "ready" ||
    appRoot === null ||
    !vault.appRoots.some((app) => app.appRoot === appRoot) ||
    vault.sourceSetup.status === "running" ||
    vault.sourceSetup.status === "failed" ||
    vault.providerSetup.status === "running" ||
    (vault.providerSetup.status === "failed" && vault.providerSetup.source !== "manual")
  ) {
    return false;
  }

  switch (provider) {
    case "convex": {
      const deployment = vault.convexDeployments.find((item) => item.appRoot === appRoot);
      return !deployment || deployment.observation.state === "missing";
    }
    case "cloudflare": {
      const worker = vault.cloudflareWorkers.find((item) => item.appRoot === appRoot);
      return !worker || worker.observation.state === "missing";
    }
  }
  provider satisfies never;
  return false;
}

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
    case "attach_convex":
      return "convex";
    case "attach_worker":
    case "wire_builds":
    case "wire_convex_build_access":
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

function canRepairCloudflareWorker(vault: VaultDashboardVault): boolean {
  if (vault.state !== "ready") {
    return false;
  }
  if (vault.sourceSetup.status === "running" || vault.sourceSetup.status === "failed") {
    return false;
  }

  return vault.providerSetup.status !== "running";
}

function isCloudflareWorkerWiringStep(step: VaultDashboardProviderSetupStep | null): boolean {
  if (step === null) {
    return false;
  }

  switch (step) {
    case "wire_builds":
    case "wire_convex_build_access":
      return true;
    case "run_created":
    case "initialize_vault":
    case "validate_connections":
    case "create_github_repo":
    case "fetch_github_repo":
    case "connect_github":
    case "create_vault":
    case "seed_starter":
    case "sync_tree":
    case "claim_infra":
    case "attach_convex":
    case "attach_worker":
    case "record_domains":
    case "finish":
      return false;
  }
  step satisfies never;
  return false;
}

function hasCurrentMissingCloudflareBuildsTriggerFailure(
  vault: VaultDashboardVault,
  worker: VaultDashboardVault["cloudflareWorkers"][number],
): boolean {
  const providerSetup = vault.providerSetup;
  const observedAt =
    worker.observation.state === "not_requested" || worker.observation.state === "loading"
      ? 0
      : worker.observation.observedAt;
  return (
    providerSetup.status === "failed" &&
    providerSetup.step === "wire_convex_build_access" &&
    providerSetup.message.includes("Retry Workers Builds wiring") &&
    providerSetup.updatedAt >= observedAt
  );
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
  connectCloudflareGithubRepoOnClick,
  buildAddAppRootHref,
  addAppRootOnClick,
  githubRepositoryUrl,
  isConnectingCloudflareGithubRepo,
  isRetryingInfrastructure,
  isSettingCloudflareConvexDeployKeys,
  retryInfrastructureOnClick,
  setCloudflareConvexDeployKeysOnClick,
  vault,
}: {
  buildAddCloudflareWorkerHref?: (appRoot: string) => string;
  addCloudflareWorkerOnClick?: (appRoot: string) => void;
  buildAddConvexHref?: (appRoot: string) => string;
  addConvexOnClick?: (appRoot: string) => void;
  connectCloudflareGithubRepoOnClick?: (appRoot: string) => void;
  buildAddAppRootHref?: () => string;
  addAppRootOnClick?: () => void;
  githubRepositoryUrl: string;
  isConnectingCloudflareGithubRepo?: (appRoot: string) => boolean;
  isRetryingInfrastructure?: boolean;
  isSettingCloudflareConvexDeployKeys?: (appRoot: string) => boolean;
  retryInfrastructureOnClick?: () => void;
  setCloudflareConvexDeployKeysOnClick?: (appRoot: string) => void;
  vault: VaultDashboardVault;
}): VaultResourceRailState {
  const canConfigureMissingResources =
    vault.state === "ready" && !isVaultResourceSetupBlockingManualActions(vault);
  const canRepairCloudflareWorkers = canRepairCloudflareWorker(vault);
  const providerSetup = resolveVaultProviderSetupStatus(vault.providerSetup);
  const providerSetupProvider = resolveVaultProviderSetupStepProvider(vault.providerSetup);
  const sourceSetupProvider = resolveSourceSetupResourceProvider(vault.sourceSetup);
  const providerSetupStep =
    vault.providerSetup.status === "failed" || vault.providerSetup.status === "running"
      ? vault.providerSetup.step
      : null;
  const appRootSet = new Set(vault.appRoots.map((app) => app.appRoot));
  const canConfigureRootAppRoot = appRootSet.has(".");
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
      actions:
        canConfigureMissingResources && (buildAddAppRootHref || addAppRootOnClick)
          ? [
              {
                kind: "add",
                label: "?add-app-root",
                ariaLabel: "Add app root",
                href: buildAddAppRootHref?.(),
                onClick: addAppRootOnClick,
              },
            ]
          : undefined,
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

  function buildRetryInfrastructureAction(): VaultResourceRailAction {
    return {
      kind: "retry",
      label: isRetryingInfrastructure ? "Retrying..." : "Retry",
      disabled: isRetryingInfrastructure || !retryInfrastructureOnClick,
      onClick: retryInfrastructureOnClick,
    };
  }

  function buildConnectCloudflareGithubRepoAction(appRoot: string): VaultResourceRailAction {
    const isConnecting = isConnectingCloudflareGithubRepo?.(appRoot) ?? false;
    return {
      kind: "connect",
      label: isConnecting ? "Connecting GitHub repo..." : "Connect GitHub repo",
      disabled: isConnecting || !connectCloudflareGithubRepoOnClick,
      onClick: connectCloudflareGithubRepoOnClick
        ? () => connectCloudflareGithubRepoOnClick(appRoot)
        : undefined,
    };
  }

  function buildSetCloudflareConvexDeployKeysAction(appRoot: string): VaultResourceRailAction {
    const isSetting = isSettingCloudflareConvexDeployKeys?.(appRoot) ?? false;
    return {
      kind: "set",
      label: isSetting ? "Setting Convex deploy keys..." : "Set Convex deploy keys",
      disabled: isSetting || !setCloudflareConvexDeployKeysOnClick,
      onClick: setCloudflareConvexDeployKeysOnClick
        ? () => setCloudflareConvexDeployKeysOnClick(appRoot)
        : undefined,
    };
  }

  const convexRowsByAppRoot = new Map<string, VaultResourceRailRowState<"convex">>();
  if (vault.sourceSetup.status === "failed" && sourceSetupProvider === "convex") {
    convexRowsByAppRoot.set(".", {
      provider: "convex",
      status: "failed",
      value: vault.ghRepoName,
      actions: [buildRetryInfrastructureAction()],
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
    const rootConvexObservation = rootConvexDeployment?.observation;
    const canReconnectMissingConvexDeployment =
      vault.providerSetup.source === "manual" &&
      canConfigureRootAppRoot &&
      (!rootConvexDeployment || rootConvexObservation?.state === "missing");
    convexRowsByAppRoot.set(".", {
      provider: "convex",
      status: "failed",
      value:
        rootConvexObservation?.state === "available"
          ? rootConvexObservation.projectSlug
          : (rootConvexDeployment?.deploymentName ?? vault.ghRepoName),
      scope:
        rootConvexObservation?.state === "available"
          ? normalizeResourceScope(rootConvexObservation.teamSlug)
          : undefined,
      actions: canReconnectMissingConvexDeployment
        ? [buildAddConvexAction(".")]
        : vault.providerSetup.source === "managed"
          ? [buildRetryInfrastructureAction()]
          : undefined,
    });
  } else if (
    vault.providerSetup.status === "running" &&
    providerSetupProvider === "convex" &&
    providerSetup?.status === "running"
  ) {
    const rootConvexDeployment = vault.convexDeployments.find(
      (deployment) => deployment.appRoot === ".",
    );
    const rootConvexObservation = rootConvexDeployment?.observation;
    convexRowsByAppRoot.set(".", {
      provider: "convex",
      status: "running",
      value:
        rootConvexObservation?.state === "available"
          ? rootConvexObservation.projectSlug
          : (rootConvexDeployment?.deploymentName ?? vault.ghRepoName),
      scope:
        rootConvexObservation?.state === "available"
          ? normalizeResourceScope(rootConvexObservation.teamSlug)
          : undefined,
    });
  } else {
    const sortedConvexDeployments = [...vault.convexDeployments].sort(
      (left, right) =>
        compareAppRoots(left.appRoot, right.appRoot) ||
        (left.observation.state === "available"
          ? left.observation.projectSlug
          : left.projectId
        ).localeCompare(
          right.observation.state === "available" ? right.observation.projectSlug : right.projectId,
        ) ||
        left.projectId.localeCompare(right.projectId),
    );
    for (const deployment of sortedConvexDeployments) {
      if (
        deployment.observation.state === "not_requested" ||
        deployment.observation.state === "loading"
      ) {
        convexRowsByAppRoot.set(deployment.appRoot, {
          provider: "convex",
          status: "running",
          value: deployment.deploymentName,
        });
        continue;
      }
      if (deployment.observation.state === "missing") {
        convexRowsByAppRoot.set(deployment.appRoot, {
          provider: "convex",
          status: "failed",
          value: deployment.deploymentName,
          actions: [buildAddConvexAction(deployment.appRoot)],
        });
        continue;
      }
      if (deployment.observation.state === "failed") {
        convexRowsByAppRoot.set(deployment.appRoot, {
          provider: "convex",
          status: "failed",
          value: deployment.deploymentName,
        });
        continue;
      }
      convexRowsByAppRoot.set(deployment.appRoot, {
        provider: "convex",
        status: "ready",
        value: deployment.observation.projectSlug,
        scope: normalizeResourceScope(deployment.observation.teamSlug),
        href: deployment.observation.projectSettingsDashboardUrl,
      });
    }
  }

  const cloudflareRowsByAppRoot = new Map<string, VaultResourceRailRowState<"cloudflare">>();
  if (vault.sourceSetup.status === "failed" && sourceSetupProvider === "cloudflare") {
    cloudflareRowsByAppRoot.set(".", {
      provider: "cloudflare",
      status: "failed",
      value: vault.ghRepoName,
      actions: [buildRetryInfrastructureAction()],
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
    providerSetup?.status === "failed" &&
    !isCloudflareWorkerWiringStep(providerSetupStep)
  ) {
    const rootCloudflareWorker = vault.cloudflareWorkers.find((worker) => worker.appRoot === ".");
    const canReconnectMissingCloudflareWorker =
      vault.providerSetup.source === "manual" &&
      canConfigureRootAppRoot &&
      (!rootCloudflareWorker || rootCloudflareWorker.observation.state === "missing");
    cloudflareRowsByAppRoot.set(".", {
      provider: "cloudflare",
      status: "failed",
      value: vault.ghRepoName,
      actions: canReconnectMissingCloudflareWorker
        ? [buildAddCloudflareWorkerAction(".")]
        : vault.providerSetup.source === "managed"
          ? [buildRetryInfrastructureAction()]
          : undefined,
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
      if (worker.observation.state === "not_requested" || worker.observation.state === "loading") {
        cloudflareRowsByAppRoot.set(worker.appRoot, {
          provider: "cloudflare",
          status: "running",
          value: worker.workerName,
        });
        continue;
      }
      if (worker.observation.state === "missing") {
        cloudflareRowsByAppRoot.set(worker.appRoot, {
          provider: "cloudflare",
          status: "failed",
          value: worker.workerName,
          actions: [buildAddCloudflareWorkerAction(worker.appRoot)],
        });
        continue;
      }
      if (worker.observation.state === "failed") {
        cloudflareRowsByAppRoot.set(worker.appRoot, {
          provider: "cloudflare",
          status: "failed",
          value: worker.workerName,
        });
        continue;
      }
      let cloudflareAction: VaultResourceRailAction | undefined;
      let cloudflareDescription: string | undefined;
      const missingBuildsTriggerFailure = hasCurrentMissingCloudflareBuildsTriggerFailure(
        vault,
        worker,
      );
      if (
        canRepairCloudflareWorkers &&
        (worker.observation.githubRepositoryConnection === "not_connected" ||
          missingBuildsTriggerFailure)
      ) {
        cloudflareDescription = missingBuildsTriggerFailure
          ? "Cloudflare's saved Workers Builds trigger is missing."
          : "Cloudflare is not connected to this GitHub repository.";
        cloudflareAction = buildConnectCloudflareGithubRepoAction(worker.appRoot);
      } else if (canRepairCloudflareWorkers && worker.observation.convexDeployKeys === "missing") {
        cloudflareDescription = "Cloudflare does not have this Convex deployment's deploy keys.";
        cloudflareAction = buildSetCloudflareConvexDeployKeysAction(worker.appRoot);
      }
      const cloudflareActions: VaultResourceRailActionList | undefined = cloudflareAction
        ? [cloudflareAction]
        : undefined;
      cloudflareRowsByAppRoot.set(worker.appRoot, {
        actions: cloudflareActions,
        description: cloudflareDescription,
        provider: "cloudflare",
        status: "ready",
        value: worker.workerName,
        scope: resolveCloudflareWorkersSubdomain({
          workersDevUrl: worker.observation.workersDevUrl,
          workerName: worker.workerName,
        }),
        href: worker.projectDashboardUrl,
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
    }
  }

  const appRoots = vault.appRoots.map((app) => app.appRoot).sort(compareAppRoots);
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
    } else if (canConfigureMissingResources && (appRoot !== "." || canConfigureRootAppRoot)) {
      rows.push({
        provider: "cloudflare",
        status: "action_required",
        actions: [buildAddCloudflareWorkerAction(appRoot)],
      });
    } else if (appRoot !== "." || canConfigureRootAppRoot) {
      rows.push({
        provider: "cloudflare",
        status: "pending",
        value: appRoot === "." ? vault.ghRepoName : appRoot,
      });
    }

    return rows.length > 0 ? [{ appRoot, rows }] : [];
  });

  return {
    apps,
    githubRow,
  } satisfies VaultResourceRailState;
}
