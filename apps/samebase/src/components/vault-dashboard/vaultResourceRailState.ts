import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type VaultResourceRailActionList,
  type VaultResourceRailAction,
  type VaultResourceRailRowState,
  type VaultResourceRailState,
} from "./VaultResourceRail";
import { type VaultDashboardSourceSetup } from "./vaultSourceSetup";

type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];
type VaultDashboardApp = VaultDashboardVault["apps"][number];

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
    case "verify_infrastructure":
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

function hasCurrentMissingCloudflareBuildsTriggerFailure(
  vault: VaultDashboardVault,
  worker: VaultDashboardVault["cloudflareWorkers"][number],
): boolean {
  const providerSetup = vault.providerSetup;
  return (
    providerSetup.status === "failed" &&
    providerSetup.step === "wire_convex_build_access" &&
    providerSetup.message.includes("Retry Workers Builds wiring") &&
    providerSetup.updatedAt >= worker.lastObservedAt
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

function compareRootDirectories(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  if (left === "/") {
    return -1;
  }
  if (right === "/") {
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
  deployCloudflareConvexOnClick,
  buildAddAppHref,
  addAppOnClick,
  githubRepositoryUrl,
  isConnectingCloudflareGithubRepo,
  isRetryingInfrastructure,
  isSettingCloudflareConvexDeployKeys,
  isVerifyingCloudflareInfrastructure,
  retryInfrastructureOnClick,
  setCloudflareConvexDeployKeysOnClick,
  verifyCloudflareInfrastructureOnClick,
  vault,
}: {
  buildAddCloudflareWorkerHref?: (app: VaultDashboardApp) => string;
  addCloudflareWorkerOnClick?: (app: VaultDashboardApp) => void;
  buildAddConvexHref?: (app: VaultDashboardApp) => string;
  addConvexOnClick?: (app: VaultDashboardApp) => void;
  connectCloudflareGithubRepoOnClick?: (workerId: Id<"vaultCloudflareWorkers">) => void;
  deployCloudflareConvexOnClick?: (workerId: Id<"vaultCloudflareWorkers">) => void;
  buildAddAppHref?: () => string;
  addAppOnClick?: () => void;
  githubRepositoryUrl: string;
  isConnectingCloudflareGithubRepo?: (workerId: Id<"vaultCloudflareWorkers">) => boolean;
  isRetryingInfrastructure?: boolean;
  isSettingCloudflareConvexDeployKeys?: (args: {
    workerId: Id<"vaultCloudflareWorkers">;
    convexDeploymentId: Id<"vaultConvexDeployments">;
  }) => boolean;
  isVerifyingCloudflareInfrastructure?: (workerId: Id<"vaultCloudflareWorkers">) => boolean;
  retryInfrastructureOnClick?: () => void;
  setCloudflareConvexDeployKeysOnClick?: (args: {
    workerId: Id<"vaultCloudflareWorkers">;
    convexDeploymentId: Id<"vaultConvexDeployments">;
  }) => void;
  verifyCloudflareInfrastructureOnClick?: (workerId: Id<"vaultCloudflareWorkers">) => void;
  vault: VaultDashboardVault;
}): VaultResourceRailState {
  const canConfigureMissingResources =
    vault.state === "ready" && !isVaultResourceSetupBlockingManualActions(vault);
  const canRepairCloudflareWorkers = canRepairCloudflareWorker(vault);
  const canVerifyCloudflareWorkers = canRepairCloudflareWorkers;
  const sourceSetupProvider = resolveSourceSetupResourceProvider(vault.sourceSetup);
  let githubRow: VaultResourceRailRowState<"github">;
  if (vault.sourceSetup.status === "failed" && sourceSetupProvider === "github") {
    githubRow = {
      provider: "github",
      rowId: `github:${vault._id}`,
      status: "failed",
      value: vault.repositoryFullName,
      actions: [{ kind: "retry", label: "Retry" }],
    };
  } else if (vault.sourceSetup.status === "running" && sourceSetupProvider === "github") {
    githubRow = {
      provider: "github",
      rowId: `github:${vault._id}`,
      status: "running",
      value: vault.repositoryFullName,
    };
  } else if (vault.hasConnectedGitHubRepository) {
    githubRow = {
      provider: "github",
      rowId: `github:${vault._id}`,
      status: "ready",
      value: vault.repositoryFullName,
      href: githubRepositoryUrl,
      actions:
        canConfigureMissingResources && (buildAddAppHref || addAppOnClick)
          ? [
              {
                kind: "add",
                label: "?add-app",
                ariaLabel: "Add app",
                href: buildAddAppHref?.(),
                onClick: addAppOnClick,
              },
            ]
          : undefined,
    };
  } else {
    githubRow = {
      provider: "github",
      rowId: `github:${vault._id}`,
      status: "pending",
      value: vault.repositoryFullName,
    };
  }

  function buildAddConvexAction(app: VaultDashboardApp): VaultResourceRailAction {
    return {
      kind: "add",
      label: "?add-convex",
      disabled: !buildAddConvexHref && !addConvexOnClick,
      href: buildAddConvexHref?.(app),
      onClick: addConvexOnClick ? () => addConvexOnClick(app) : undefined,
    };
  }

  function buildAddCloudflareWorkerAction(app: VaultDashboardApp): VaultResourceRailAction {
    return {
      kind: "add",
      label: "?add-cloudflare",
      disabled: !buildAddCloudflareWorkerHref && !addCloudflareWorkerOnClick,
      href: buildAddCloudflareWorkerHref?.(app),
      onClick: addCloudflareWorkerOnClick ? () => addCloudflareWorkerOnClick(app) : undefined,
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

  function buildConnectCloudflareGithubRepoAction(
    workerId: Id<"vaultCloudflareWorkers">,
  ): VaultResourceRailAction {
    const isConnecting = isConnectingCloudflareGithubRepo?.(workerId) ?? false;
    return {
      kind: "connect",
      label: isConnecting ? "Connecting GitHub repo..." : "Connect GitHub repo",
      disabled: isConnecting || !connectCloudflareGithubRepoOnClick,
      onClick: connectCloudflareGithubRepoOnClick
        ? () => connectCloudflareGithubRepoOnClick(workerId)
        : undefined,
    };
  }

  function buildSetCloudflareConvexDeployKeysAction(args: {
    workerId: Id<"vaultCloudflareWorkers">;
    convexDeploymentId: Id<"vaultConvexDeployments">;
  }): VaultResourceRailAction {
    const isSetting = isSettingCloudflareConvexDeployKeys?.(args) ?? false;
    return {
      kind: "set",
      label: isSetting ? "Setting Convex deploy keys..." : "Set Convex deploy keys",
      disabled: isSetting || !setCloudflareConvexDeployKeysOnClick,
      onClick: setCloudflareConvexDeployKeysOnClick
        ? () => setCloudflareConvexDeployKeysOnClick(args)
        : undefined,
    };
  }

  function buildDeployCloudflareConvexAction(
    workerId: Id<"vaultCloudflareWorkers">,
  ): VaultResourceRailAction {
    return {
      kind: "connect",
      label: "Deploy Convex",
      ariaLabel: "Choose Convex deployment for Cloudflare Worker",
      disabled: !deployCloudflareConvexOnClick,
      onClick: deployCloudflareConvexOnClick
        ? () => deployCloudflareConvexOnClick(workerId)
        : undefined,
    };
  }

  function buildVerifyCloudflareInfrastructureAction(
    workerId: Id<"vaultCloudflareWorkers">,
  ): VaultResourceRailAction {
    const isVerifying = isVerifyingCloudflareInfrastructure?.(workerId) ?? false;
    return {
      kind: "verify",
      label: isVerifying ? "Verifying..." : "Verify infrastructure",
      disabled: isVerifying || !verifyCloudflareInfrastructureOnClick,
      onClick: verifyCloudflareInfrastructureOnClick
        ? () => verifyCloudflareInfrastructureOnClick(workerId)
        : undefined,
    };
  }

  const apps = [...vault.apps].sort(
    (left, right) =>
      compareRootDirectories(left.rootDirectory, right.rootDirectory) ||
      left.appId.localeCompare(right.appId),
  );
  const appsById = new Map(apps.map((app) => [app.appId, app]));
  const convexDeploymentsById = new Map(
    vault.convexDeployments.map((deployment) => [deployment.convexDeploymentId, deployment]),
  );
  const dependenciesByWorkerId = new Map<
    Id<"vaultCloudflareWorkers">,
    VaultDashboardVault["workerDeploymentDependencies"][number]
  >();
  const workerIds = new Set(vault.cloudflareWorkers.map((worker) => worker.workerId));
  for (const dependency of vault.workerDeploymentDependencies) {
    if (dependenciesByWorkerId.has(dependency.workerId)) {
      throw new Error("Cloudflare Worker has more than one Convex deployment dependency.");
    }
    if (
      !workerIds.has(dependency.workerId) ||
      !convexDeploymentsById.has(dependency.convexDeploymentId)
    ) {
      throw new Error("Worker deployment dependency references an unknown resource.");
    }
    dependenciesByWorkerId.set(dependency.workerId, dependency);
  }

  const convexRowsByAppId = new Map<Id<"vaultApps">, VaultResourceRailRowState<"convex">[]>();
  const sortedConvexDeployments = [...vault.convexDeployments].sort(
    (left, right) =>
      left.projectSlug.localeCompare(right.projectSlug) ||
      left.projectId.localeCompare(right.projectId) ||
      left.convexDeploymentId.localeCompare(right.convexDeploymentId),
  );
  for (const deployment of sortedConvexDeployments) {
    const app = appsById.get(deployment.appId);
    if (!app) {
      throw new Error("Convex deployment references an unknown app.");
    }
    const row: VaultResourceRailRowState<"convex"> =
      deployment.upstream.state === "missing_upstream"
        ? {
            provider: "convex",
            rowId: `convex:${deployment.convexDeploymentId}`,
            status: "failed",
            value: deployment.projectSlug,
            scope: normalizeResourceScope(deployment.teamSlug),
            actions: [
              deployment.upstream.nextAction === "retry_infrastructure_provisioning"
                ? buildRetryInfrastructureAction()
                : buildAddConvexAction(app),
            ],
          }
        : {
            provider: "convex",
            rowId: `convex:${deployment.convexDeploymentId}`,
            status: "ready",
            value: deployment.projectSlug,
            scope: normalizeResourceScope(deployment.teamSlug),
            href: deployment.projectSettingsDashboardUrl,
          };
    convexRowsByAppId.set(deployment.appId, [
      ...(convexRowsByAppId.get(deployment.appId) ?? []),
      row,
    ]);
  }

  const cloudflareRowsByAppId = new Map<
    Id<"vaultApps">,
    VaultResourceRailRowState<"cloudflare">[]
  >();
  const sortedCloudflareWorkers = [...vault.cloudflareWorkers].sort(
    (left, right) =>
      left.workerName.localeCompare(right.workerName) ||
      left.workerId.localeCompare(right.workerId),
  );
  for (const worker of sortedCloudflareWorkers) {
    const app = appsById.get(worker.appId);
    if (!app) {
      throw new Error("Cloudflare Worker references an unknown app.");
    }
    const dependency = dependenciesByWorkerId.get(worker.workerId);
    const deployment = dependency
      ? convexDeploymentsById.get(dependency.convexDeploymentId)
      : undefined;
    const deploymentApp = deployment ? appsById.get(deployment.appId) : undefined;
    const dependencyDescription =
      deployment && deploymentApp
        ? `Deploys Convex ${deployment.teamSlug}/${deployment.projectSlug} from ${deploymentApp.rootDirectory}.`
        : undefined;

    let row: VaultResourceRailRowState<"cloudflare">;
    if (worker.upstream.state === "missing_upstream") {
      row = {
        provider: "cloudflare",
        rowId: `cloudflare:${worker.workerId}`,
        status: "failed",
        value: worker.workerName,
        scope: resolveCloudflareWorkersSubdomain({
          workersDevUrl: worker.workersDevUrl,
          workerName: worker.workerName,
        }),
        actions: [
          worker.upstream.nextAction === "retry_infrastructure_provisioning"
            ? buildRetryInfrastructureAction()
            : buildAddCloudflareWorkerAction(app),
        ],
      };
    } else {
      let cloudflareAction: VaultResourceRailAction | undefined;
      let verifyAction: VaultResourceRailAction | undefined;
      let cloudflareDescription = dependencyDescription;
      const missingBuildsTriggerFailure = hasCurrentMissingCloudflareBuildsTriggerFailure(
        vault,
        worker,
      );
      if (
        canRepairCloudflareWorkers &&
        (worker.githubRepositoryConnection.state === "not_connected" || missingBuildsTriggerFailure)
      ) {
        const repairDescription = missingBuildsTriggerFailure
          ? "Cloudflare's saved Workers Builds trigger is missing."
          : "Cloudflare is not connected to this GitHub repository.";
        cloudflareDescription = dependencyDescription
          ? `${repairDescription} ${dependencyDescription}`
          : repairDescription;
        cloudflareAction = buildConnectCloudflareGithubRepoAction(worker.workerId);
      } else if (
        canRepairCloudflareWorkers &&
        dependency === undefined &&
        deployCloudflareConvexOnClick &&
        vault.convexDeployments.some((candidate) => candidate.upstream.state === "present")
      ) {
        cloudflareAction = buildDeployCloudflareConvexAction(worker.workerId);
      } else if (canRepairCloudflareWorkers && dependency?.wiring.state === "not_wired") {
        const repairDescription = "Cloudflare does not have this Convex deployment's deploy keys.";
        cloudflareDescription = dependencyDescription
          ? `${repairDescription} ${dependencyDescription}`
          : repairDescription;
        cloudflareAction = buildSetCloudflareConvexDeployKeysAction({
          workerId: worker.workerId,
          convexDeploymentId: dependency.convexDeploymentId,
        });
      }
      if (
        canVerifyCloudflareWorkers &&
        (verifyCloudflareInfrastructureOnClick ||
          isVerifyingCloudflareInfrastructure?.(worker.workerId))
      ) {
        verifyAction = buildVerifyCloudflareInfrastructureAction(worker.workerId);
      }
      let cloudflareActions: VaultResourceRailActionList | undefined;
      if (cloudflareAction && verifyAction) {
        cloudflareActions = [cloudflareAction, verifyAction];
      } else if (cloudflareAction) {
        cloudflareActions = [cloudflareAction];
      } else if (verifyAction) {
        cloudflareActions = [verifyAction];
      }
      row = {
        actions: cloudflareActions,
        description: cloudflareDescription,
        provider: "cloudflare",
        rowId: `cloudflare:${worker.workerId}`,
        status: "ready",
        value: worker.workerName,
        scope: resolveCloudflareWorkersSubdomain({
          workersDevUrl: worker.workersDevUrl,
          workerName: worker.workerName,
        }),
        href: worker.projectDashboardUrl,
      };
    }
    cloudflareRowsByAppId.set(worker.appId, [
      ...(cloudflareRowsByAppId.get(worker.appId) ?? []),
      row,
    ]);
  }

  const appStates = apps.map((app) => {
    const rows: VaultResourceRailRowState<"cloudflare" | "convex">[] = [];
    const convexRows = convexRowsByAppId.get(app.appId) ?? [];
    rows.push(...convexRows);
    if (convexRows.length === 0) {
      rows.push(
        canConfigureMissingResources
          ? {
              provider: "convex",
              rowId: `convex:${app.appId}:add`,
              status: "action_required",
              actions: [buildAddConvexAction(app)],
            }
          : {
              provider: "convex",
              rowId: `convex:${app.appId}:pending`,
              status: "pending",
              value: app.rootDirectory === "/" ? vault.ghRepoName : app.rootDirectory,
            },
      );
    }

    const cloudflareRows = cloudflareRowsByAppId.get(app.appId) ?? [];
    rows.push(...cloudflareRows);
    if (cloudflareRows.length === 0) {
      rows.push(
        canConfigureMissingResources
          ? {
              provider: "cloudflare",
              rowId: `cloudflare:${app.appId}:add`,
              status: "action_required",
              actions: [buildAddCloudflareWorkerAction(app)],
            }
          : {
              provider: "cloudflare",
              rowId: `cloudflare:${app.appId}:pending`,
              status: "pending",
              value: app.rootDirectory === "/" ? vault.ghRepoName : app.rootDirectory,
            },
      );
    } else if (
      canConfigureMissingResources &&
      (buildAddCloudflareWorkerHref || addCloudflareWorkerOnClick)
    ) {
      rows.push({
        provider: "cloudflare",
        rowId: `cloudflare:${app.appId}:add`,
        status: "action_required",
        actions: [buildAddCloudflareWorkerAction(app)],
      });
    }

    return {
      appId: app.appId,
      rootDirectory: app.rootDirectory,
      rows,
    };
  });

  return {
    apps: appStates,
    githubRow,
  } satisfies VaultResourceRailState;
}
