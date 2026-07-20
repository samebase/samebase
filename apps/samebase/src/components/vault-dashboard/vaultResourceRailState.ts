import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  VaultResourceRailAction,
  VaultResourceRailActionList,
  VaultResourceRailRowState,
  VaultResourceRailState,
} from "./VaultResourceRail";
import type {
  VaultCloudflareProviderObservationState,
  VaultCloudflareWorkerObservation,
  VaultCloudflareWorkerBuildsObservation,
  VaultCloudflareWorkerConvexBuildAccessObservation,
  VaultConvexProjectObservation,
  VaultProviderObservationState,
} from "./useVaultProviderObservations";

type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];
type VaultDashboardApp = VaultDashboardVault["apps"][number];
type VaultDashboardCloudflareWorker = VaultDashboardVault["cloudflareWorkers"][number];
type VaultDashboardConvexProject = VaultDashboardVault["convexProjects"][number];

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

function buildCloudflareDashboardUrl(worker: VaultDashboardCloudflareWorker): string {
  return `https://dash.cloudflare.com/?to=/${encodeURIComponent(worker.accountId)}/workers/services/view/${encodeURIComponent(worker.workerName)}/production/settings`;
}

function buildConvexProjectSettingsUrl(
  observation: Extract<VaultConvexProjectObservation, { state: "available" }>,
): string {
  return `https://dashboard.convex.dev/t/${encodeURIComponent(observation.teamSlug)}/${encodeURIComponent(observation.projectSlug)}/settings`;
}

function resolveCloudflareWorkersSubdomain(
  observation: Extract<VaultCloudflareWorkerObservation, { state: "available" }>,
  workerName: string,
): string | undefined {
  if (observation.workersDev.state !== "enabled") {
    return undefined;
  }

  let hostname: string;
  try {
    hostname = new URL(observation.workersDev.url).hostname;
  } catch {
    return undefined;
  }

  const suffix = ".workers.dev";
  const workerPrefix = `${workerName}.`;
  if (!hostname.endsWith(suffix)) {
    return undefined;
  }
  const prefix = hostname.slice(0, -suffix.length);
  if (!prefix.startsWith(workerPrefix)) {
    return undefined;
  }
  const subdomain = prefix.slice(workerPrefix.length).trim();
  return subdomain || undefined;
}

function buildReloadAction(reload: () => void): VaultResourceRailAction {
  return {
    kind: "retry",
    label: "Reload",
    onClick: reload,
  };
}

function buildAddAction({
  href,
  label,
  onClick,
}: {
  href: string | undefined;
  label: "?add-cloudflare" | "?add-convex";
  onClick: (() => void) | undefined;
}): VaultResourceRailAction {
  return {
    kind: "add",
    label,
    disabled: !href && !onClick,
    href,
    onClick,
  };
}

function buildRemoveMissingAttachmentAction(args: {
  ariaLabel: string;
  isRemoving: boolean;
  onClick: () => void;
}): VaultResourceRailAction {
  return {
    kind: "remove",
    label: args.isRemoving ? "Removing..." : "Remove from Samebase",
    ariaLabel: args.ariaLabel,
    disabled: args.isRemoving,
    onClick: args.onClick,
  };
}

function formatCloudflareRepositoryState(
  observation: Extract<VaultCloudflareWorkerBuildsObservation, { state: "available" }>,
): { description?: string; canConnect: boolean } {
  const evidence = observation.repository.evidence;
  switch (evidence.state) {
    case "matching_repo":
      return observation.builds.state === "connected"
        ? { canConnect: false }
        : {
            canConnect: true,
            description: "Cloudflare Builds setup is incomplete.",
          };
    case "none":
    case "deleted_repo_connection":
      return {
        canConnect: true,
        description: "Cloudflare is not connected to this GitHub repository.",
      };
    case "same_repo_different_root":
      return {
        canConnect: false,
        description: `Cloudflare Builds uses ${evidence.rootDirectory}; this app uses ${evidence.expectedRootDirectory}.`,
      };
    case "different_repo":
      return {
        canConnect: false,
        description: "Cloudflare Builds is connected to a different GitHub repository.",
      };
    case "missing_repo_id":
      return {
        canConnect: false,
        description: "Cloudflare Builds does not identify its GitHub repository.",
      };
    case "missing_root_directory":
      return {
        canConnect: false,
        description: "Cloudflare Builds has no root directory.",
      };
    case "trigger_read_failed":
      return {
        canConnect: false,
        description: "Cloudflare Builds could not be loaded.",
      };
  }
  evidence satisfies never;
  return { canConnect: false };
}

function formatCloudflarePreviewState(
  observation: Extract<VaultCloudflareWorkerObservation, { state: "available" }>,
): string | undefined {
  switch (observation.workersDev.state) {
    case "enabled":
      return undefined;
    case "disabled":
      return "Preview URL disabled.";
    case "failed":
      return "Preview URL could not be loaded.";
  }
  observation.workersDev satisfies never;
  return undefined;
}

function joinDescriptions(...descriptions: (string | undefined)[]): string | undefined {
  const presentDescriptions = descriptions.filter((description) => description !== undefined);
  return presentDescriptions.length > 0 ? presentDescriptions.join(" ") : undefined;
}

function buildConvexBuildAccessActions({
  convexProjects,
  isRotatingConvexDeployKeysForWorkersBuilds,
  rotateConvexDeployKeysForWorkersBuildsOnClick,
  workerId,
}: {
  convexProjects: readonly VaultDashboardConvexProject[];
  isRotatingConvexDeployKeysForWorkersBuilds?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => boolean;
  rotateConvexDeployKeysForWorkersBuildsOnClick?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => void;
  workerId: Id<"vaultCloudflareWorkers">;
}): VaultResourceRailActionList | undefined {
  const sortedProjects = [...convexProjects].sort(
    (left, right) =>
      left.projectId.localeCompare(right.projectId) ||
      left.convexProjectId.localeCompare(right.convexProjectId),
  );
  if (sortedProjects.length === 0) {
    return undefined;
  }
  const actions = sortedProjects.map((project) => {
    const isRotating =
      isRotatingConvexDeployKeysForWorkersBuilds?.(workerId, project.convexProjectId) ?? false;
    const label =
      sortedProjects.length === 1
        ? isRotating
          ? "Rotating Convex deploy keys for Workers Builds..."
          : "Rotate Convex deploy keys for Workers Builds"
        : isRotating
          ? `Rotating keys for ${project.projectId}...`
          : `Rotate keys for ${project.projectId}`;
    return {
      kind: "configure" as const,
      label,
      ariaLabel: `${label} for ${project.projectId}`,
      disabled: isRotating || !rotateConvexDeployKeysForWorkersBuildsOnClick,
      onClick: rotateConvexDeployKeysForWorkersBuildsOnClick
        ? () => rotateConvexDeployKeysForWorkersBuildsOnClick(workerId, project.convexProjectId)
        : undefined,
    };
  });
  const [first, ...rest] = actions;
  return [first, ...rest];
}

function formatCloudflareConvexBuildAccessState({
  convexProjects,
  isRotatingConvexDeployKeysForWorkersBuilds,
  observation,
  rotateConvexDeployKeysForWorkersBuildsOnClick,
  workerId,
}: {
  convexProjects: readonly VaultDashboardConvexProject[];
  isRotatingConvexDeployKeysForWorkersBuilds?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => boolean;
  observation: Extract<VaultCloudflareWorkerConvexBuildAccessObservation, { state: "available" }>;
  rotateConvexDeployKeysForWorkersBuildsOnClick?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => void;
  workerId: Id<"vaultCloudflareWorkers">;
}): { actions?: VaultResourceRailActionList; description?: string } {
  const access = observation.convexBuildAccess;
  if (access.state === "configured" && access.convexProject.state === "attached") {
    return {
      description: `Convex deploy keys use ${access.convexProject.projectId}.`,
    };
  }

  const actions = buildConvexBuildAccessActions({
    convexProjects,
    isRotatingConvexDeployKeysForWorkersBuilds,
    rotateConvexDeployKeysForWorkersBuildsOnClick,
    workerId,
  });
  switch (access.state) {
    case "configured":
      return {
        actions,
        description: `Convex deploy keys target ${access.convexProject.teamId}/${access.convexProject.projectId}, which is not attached to this vault.`,
      };
    case "incomplete":
      return {
        actions,
        description: `Convex deploy keys for ${access.convexProject.projectId} are incomplete.`,
      };
    case "not_configured":
      return { actions, description: "Convex deploy keys are not configured." };
    case "target_unknown":
      return {
        actions,
        description: "Convex deploy keys exist, but their project is unknown.",
      };
    case "inconsistent":
      return {
        actions,
        description: "Production and preview Builds target different Convex projects.",
      };
    case "invalid":
      return { actions, description: "The Convex project marker is invalid." };
  }
  access satisfies never;
  return {};
}

function buildCloudflareRow({
  convexProjects,
  configureWorkersBuildsForGitHubOnClick,
  isConfiguringWorkersBuildsForGitHub,
  isRemovingMissingCloudflareWorker,
  isRotatingConvexDeployKeysForWorkersBuilds,
  observationState,
  removeMissingCloudflareWorkerOnClick,
  rotateConvexDeployKeysForWorkersBuildsOnClick,
  worker,
}: {
  convexProjects: readonly VaultDashboardConvexProject[];
  configureWorkersBuildsForGitHubOnClick?: (workerId: Id<"vaultCloudflareWorkers">) => void;
  isConfiguringWorkersBuildsForGitHub?: (workerId: Id<"vaultCloudflareWorkers">) => boolean;
  isRemovingMissingCloudflareWorker?: (workerId: Id<"vaultCloudflareWorkers">) => boolean;
  isRotatingConvexDeployKeysForWorkersBuilds?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => boolean;
  observationState: VaultCloudflareProviderObservationState;
  removeMissingCloudflareWorkerOnClick?: (workerId: Id<"vaultCloudflareWorkers">) => void;
  rotateConvexDeployKeysForWorkersBuildsOnClick?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => void;
  worker: VaultDashboardCloudflareWorker;
}): VaultResourceRailRowState<"cloudflare"> {
  const base = {
    provider: "cloudflare" as const,
    rowId: `cloudflare:${worker.workerId}`,
    value: worker.workerName,
  };
  if (observationState.workers.state === "loading") {
    return {
      ...base,
      status: "loading",
      description: "Loading from Cloudflare...",
    };
  }
  if (observationState.workers.state === "failed") {
    return {
      ...base,
      status: "failed",
      description: "Could not load from Cloudflare.",
      actions: [buildReloadAction(observationState.workers.reload)],
    };
  }

  const observation = observationState.workers.observations.find(
    (candidate) => candidate.workerId === worker.workerId,
  );
  if (!observation) {
    return {
      ...base,
      status: "failed",
      description: "Could not load this Worker.",
      actions: [buildReloadAction(observationState.workers.reload)],
    };
  }
  switch (observation.state) {
    case "missing":
      return {
        ...base,
        status: "missing",
        description: "Missing from Cloudflare.",
        actions: removeMissingCloudflareWorkerOnClick
          ? [
              buildRemoveMissingAttachmentAction({
                ariaLabel: `Remove missing Cloudflare Worker ${worker.workerName} from Samebase`,
                isRemoving: isRemovingMissingCloudflareWorker?.(worker.workerId) ?? false,
                onClick: () => removeMissingCloudflareWorkerOnClick(worker.workerId),
              }),
            ]
          : undefined,
      };
    case "failed":
      return {
        ...base,
        status: "failed",
        description:
          observation.reason === "connection_required"
            ? "Connect Cloudflare to load this Worker."
            : "Could not load from Cloudflare.",
        actions: [buildReloadAction(observationState.workers.reload)],
      };
    case "available": {
      const availableBase = {
        ...base,
        status: "available" as const,
        href: buildCloudflareDashboardUrl(worker),
        scope: resolveCloudflareWorkersSubdomain(observation, worker.workerName),
      };
      const previewDescription = formatCloudflarePreviewState(observation);
      if (observationState.builds.state === "loading") {
        return {
          ...availableBase,
          description: previewDescription,
          loadingDescription: "Loading Workers Builds...",
        };
      }
      if (observationState.builds.state === "failed") {
        return {
          ...availableBase,
          actions: [buildReloadAction(observationState.builds.reload)],
          description: joinDescriptions(previewDescription, "Could not load Workers Builds."),
        };
      }

      const buildsObservation = observationState.builds.observations.find(
        (candidate) => candidate.workerId === worker.workerId,
      );
      if (!buildsObservation || buildsObservation.state === "failed") {
        return {
          ...availableBase,
          actions: [buildReloadAction(observationState.builds.reload)],
          description: joinDescriptions(previewDescription, "Could not load Workers Builds."),
        };
      }

      const repositoryState = formatCloudflareRepositoryState(buildsObservation);
      if (repositoryState.canConnect) {
        const isConfiguring = isConfiguringWorkersBuildsForGitHub?.(worker.workerId) ?? false;
        return {
          ...availableBase,
          actions: [
            {
              kind: "connect",
              label: isConfiguring
                ? "Configuring Workers Builds for GitHub..."
                : "Configure Workers Builds for GitHub",
              disabled: isConfiguring || !configureWorkersBuildsForGitHubOnClick,
              onClick: configureWorkersBuildsForGitHubOnClick
                ? () => configureWorkersBuildsForGitHubOnClick(worker.workerId)
                : undefined,
            },
          ],
          description: joinDescriptions(previewDescription, repositoryState.description),
        };
      }
      if (buildsObservation.builds.state === "not_connected") {
        return {
          ...availableBase,
          description: joinDescriptions(previewDescription, repositoryState.description),
        };
      }
      if (observationState.convexBuildAccess.state === "loading") {
        return {
          ...availableBase,
          description: joinDescriptions(previewDescription, repositoryState.description),
          loadingDescription: "Loading Convex deploy keys...",
        };
      }
      if (observationState.convexBuildAccess.state === "failed") {
        return {
          ...availableBase,
          actions: [buildReloadAction(observationState.convexBuildAccess.reload)],
          description: joinDescriptions(
            previewDescription,
            repositoryState.description,
            "Could not load Convex deploy keys.",
          ),
        };
      }

      const buildAccessObservation = observationState.convexBuildAccess.observations.find(
        (candidate) => candidate.workerId === worker.workerId,
      );
      if (!buildAccessObservation || buildAccessObservation.state === "failed") {
        return {
          ...availableBase,
          actions: [buildReloadAction(observationState.convexBuildAccess.reload)],
          description: joinDescriptions(
            previewDescription,
            repositoryState.description,
            "Could not load Convex deploy keys.",
          ),
        };
      }

      const convexBuildAccessState = formatCloudflareConvexBuildAccessState({
        convexProjects,
        isRotatingConvexDeployKeysForWorkersBuilds,
        observation: buildAccessObservation,
        rotateConvexDeployKeysForWorkersBuildsOnClick,
        workerId: worker.workerId,
      });
      return {
        ...availableBase,
        actions: convexBuildAccessState.actions,
        description: joinDescriptions(
          previewDescription,
          repositoryState.description,
          convexBuildAccessState.description,
        ),
      };
    }
  }
  observation satisfies never;
  return {
    ...base,
    status: "failed",
    description: "Could not load this Worker.",
  };
}

function buildConvexRow({
  isRemovingMissingConvexProject,
  observationState,
  project,
  removeMissingConvexProjectOnClick,
}: {
  isRemovingMissingConvexProject?: (convexProjectId: Id<"vaultConvexProjects">) => boolean;
  observationState: VaultProviderObservationState<VaultConvexProjectObservation>;
  project: VaultDashboardConvexProject;
  removeMissingConvexProjectOnClick?: (convexProjectId: Id<"vaultConvexProjects">) => void;
}): VaultResourceRailRowState<"convex"> {
  const base = {
    provider: "convex" as const,
    rowId: `convex:${project.convexProjectId}`,
    value: project.projectId,
  };
  if (observationState.state === "loading") {
    return {
      ...base,
      status: "loading",
      description: "Loading from Convex...",
    };
  }
  if (observationState.state === "failed") {
    return {
      ...base,
      status: "failed",
      description: "Could not load from Convex.",
      actions: [buildReloadAction(observationState.reload)],
    };
  }

  const observation = observationState.observations.find(
    (candidate) => candidate.convexProjectId === project.convexProjectId,
  );
  if (!observation) {
    return {
      ...base,
      status: "failed",
      description: "Could not load this Convex project.",
      actions: [buildReloadAction(observationState.reload)],
    };
  }
  switch (observation.state) {
    case "missing":
      return {
        ...base,
        status: "missing",
        description: "Missing from Convex.",
        actions: removeMissingConvexProjectOnClick
          ? [
              buildRemoveMissingAttachmentAction({
                ariaLabel: `Remove missing Convex project ${project.projectId} from Samebase`,
                isRemoving: isRemovingMissingConvexProject?.(project.convexProjectId) ?? false,
                onClick: () => removeMissingConvexProjectOnClick(project.convexProjectId),
              }),
            ]
          : undefined,
      };
    case "failed":
      return {
        ...base,
        status: "failed",
        description:
          observation.reason === "connection_required"
            ? "Connect Convex to load this project."
            : "Could not load from Convex.",
        actions: [buildReloadAction(observationState.reload)],
      };
    case "available":
      return {
        ...base,
        status: "available",
        description:
          observation.productionDeployment.state === "missing"
            ? "No production deployment."
            : undefined,
        href: buildConvexProjectSettingsUrl(observation),
        scope: observation.teamSlug,
        value: observation.projectSlug,
      };
  }
  observation satisfies never;
  return {
    ...base,
    status: "failed",
    description: "Could not load this Convex project.",
  };
}

function buildAppRows({
  app,
  buildAddCloudflareWorkerHref,
  addCloudflareWorkerOnClick,
  buildAddConvexHref,
  addConvexOnClick,
  cloudflareObservations,
  configureWorkersBuildsForGitHubOnClick,
  convexObservations,
  isConfiguringWorkersBuildsForGitHub,
  isRemovingMissingCloudflareWorker,
  isRemovingMissingConvexProject,
  isRotatingConvexDeployKeysForWorkersBuilds,
  removeMissingCloudflareWorkerOnClick,
  removeMissingConvexProjectOnClick,
  vault,
  rotateConvexDeployKeysForWorkersBuildsOnClick,
}: {
  app: VaultDashboardApp;
  buildAddCloudflareWorkerHref?: (rootDirectory: string) => string;
  addCloudflareWorkerOnClick?: (appId: Id<"vaultApps">, rootDirectory: string) => void;
  buildAddConvexHref?: (rootDirectory: string) => string;
  addConvexOnClick?: (appId: Id<"vaultApps">, rootDirectory: string) => void;
  cloudflareObservations: VaultCloudflareProviderObservationState;
  configureWorkersBuildsForGitHubOnClick?: (workerId: Id<"vaultCloudflareWorkers">) => void;
  convexObservations: VaultProviderObservationState<VaultConvexProjectObservation>;
  isConfiguringWorkersBuildsForGitHub?: (workerId: Id<"vaultCloudflareWorkers">) => boolean;
  isRemovingMissingCloudflareWorker?: (workerId: Id<"vaultCloudflareWorkers">) => boolean;
  isRemovingMissingConvexProject?: (convexProjectId: Id<"vaultConvexProjects">) => boolean;
  isRotatingConvexDeployKeysForWorkersBuilds?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => boolean;
  removeMissingCloudflareWorkerOnClick?: (workerId: Id<"vaultCloudflareWorkers">) => void;
  removeMissingConvexProjectOnClick?: (convexProjectId: Id<"vaultConvexProjects">) => void;
  vault: VaultDashboardVault;
  rotateConvexDeployKeysForWorkersBuildsOnClick?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => void;
}): VaultResourceRailRowState<"cloudflare" | "convex">[] {
  const projects = vault.convexProjects
    .filter((project) => project.appId === app.appId)
    .sort(
      (left, right) =>
        left.projectId.localeCompare(right.projectId) ||
        left.convexProjectId.localeCompare(right.convexProjectId),
    );
  const workers = vault.cloudflareWorkers
    .filter((worker) => worker.appId === app.appId)
    .sort(
      (left, right) =>
        left.workerName.localeCompare(right.workerName) ||
        left.workerId.localeCompare(right.workerId),
    );
  const rows: VaultResourceRailRowState<"cloudflare" | "convex">[] = projects.map((project) =>
    buildConvexRow({
      isRemovingMissingConvexProject,
      observationState: convexObservations,
      project,
      removeMissingConvexProjectOnClick,
    }),
  );
  if (projects.length === 0) {
    rows.push({
      provider: "convex",
      rowId: `convex:add:${app.appId}`,
      status: "action_required",
      actions: [
        buildAddAction({
          href: buildAddConvexHref?.(app.rootDirectory),
          label: "?add-convex",
          onClick: addConvexOnClick
            ? () => addConvexOnClick(app.appId, app.rootDirectory)
            : undefined,
        }),
      ],
    });
  }
  rows.push(
    ...workers.map((worker) =>
      buildCloudflareRow({
        convexProjects: vault.convexProjects,
        configureWorkersBuildsForGitHubOnClick,
        isConfiguringWorkersBuildsForGitHub,
        isRemovingMissingCloudflareWorker,
        isRotatingConvexDeployKeysForWorkersBuilds,
        observationState: cloudflareObservations,
        removeMissingCloudflareWorkerOnClick,
        rotateConvexDeployKeysForWorkersBuildsOnClick,
        worker,
      }),
    ),
  );
  if (workers.length === 0) {
    rows.push({
      provider: "cloudflare",
      rowId: `cloudflare:add:${app.appId}`,
      status: "action_required",
      actions: [
        buildAddAction({
          href: buildAddCloudflareWorkerHref?.(app.rootDirectory),
          label: "?add-cloudflare",
          onClick: addCloudflareWorkerOnClick
            ? () => addCloudflareWorkerOnClick(app.appId, app.rootDirectory)
            : undefined,
        }),
      ],
    });
  }
  return rows;
}

export function buildVaultDashboardResourceRailState({
  buildAddCloudflareWorkerHref,
  addCloudflareWorkerOnClick,
  buildAddConvexHref,
  addConvexOnClick,
  configureWorkersBuildsForGitHubOnClick,
  buildAddAppRootHref,
  addAppRootOnClick,
  cloudflareObservations,
  convexObservations,
  githubRepositoryUrl,
  isConfiguringWorkersBuildsForGitHub,
  isRemovingMissingCloudflareWorker,
  isRemovingMissingConvexProject,
  isRotatingConvexDeployKeysForWorkersBuilds,
  removeMissingCloudflareWorkerOnClick,
  removeMissingConvexProjectOnClick,
  vault,
  rotateConvexDeployKeysForWorkersBuildsOnClick,
}: {
  buildAddCloudflareWorkerHref?: (rootDirectory: string) => string;
  addCloudflareWorkerOnClick?: (appId: Id<"vaultApps">, rootDirectory: string) => void;
  buildAddConvexHref?: (rootDirectory: string) => string;
  addConvexOnClick?: (appId: Id<"vaultApps">, rootDirectory: string) => void;
  configureWorkersBuildsForGitHubOnClick?: (workerId: Id<"vaultCloudflareWorkers">) => void;
  buildAddAppRootHref?: () => string;
  addAppRootOnClick?: () => void;
  cloudflareObservations: VaultCloudflareProviderObservationState;
  convexObservations: VaultProviderObservationState<VaultConvexProjectObservation>;
  githubRepositoryUrl: string;
  isConfiguringWorkersBuildsForGitHub?: (workerId: Id<"vaultCloudflareWorkers">) => boolean;
  isRemovingMissingCloudflareWorker?: (workerId: Id<"vaultCloudflareWorkers">) => boolean;
  isRemovingMissingConvexProject?: (convexProjectId: Id<"vaultConvexProjects">) => boolean;
  isRotatingConvexDeployKeysForWorkersBuilds?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => boolean;
  removeMissingCloudflareWorkerOnClick?: (workerId: Id<"vaultCloudflareWorkers">) => void;
  removeMissingConvexProjectOnClick?: (convexProjectId: Id<"vaultConvexProjects">) => void;
  vault: VaultDashboardVault;
  rotateConvexDeployKeysForWorkersBuildsOnClick?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => void;
}): VaultResourceRailState {
  let githubRow: VaultResourceRailRowState<"github">;
  if (vault.sourceSetup.status === "failed" || vault.state === "failed") {
    githubRow = {
      provider: "github",
      rowId: "github",
      status: "failed",
      value: vault.repositoryFullName,
      description: "Repository setup failed.",
    };
  } else if (!vault.hasConnectedGitHubRepository) {
    githubRow = {
      provider: "github",
      rowId: "github",
      status: vault.state === "ready" ? "missing" : "loading",
      value: vault.repositoryFullName,
      description:
        vault.state === "ready"
          ? "GitHub repository connection is missing."
          : "Loading from GitHub...",
    };
  } else {
    const addAppActions: VaultResourceRailActionList | undefined =
      buildAddAppRootHref || addAppRootOnClick
        ? [
            {
              kind: "add",
              label: "?add-app-root",
              ariaLabel: "Add app root",
              href: buildAddAppRootHref?.(),
              onClick: addAppRootOnClick,
            },
          ]
        : undefined;
    githubRow = {
      provider: "github",
      rowId: "github",
      status: "available",
      value: vault.repositoryFullName,
      href: githubRepositoryUrl,
      actions: addAppActions,
    };
  }

  return {
    githubRow,
    apps: [...vault.apps]
      .sort(
        (left, right) =>
          compareRootDirectories(left.rootDirectory, right.rootDirectory) ||
          left.appId.localeCompare(right.appId),
      )
      .map((app) => ({
        appId: app.appId,
        rootDirectory: app.rootDirectory,
        rows: buildAppRows({
          app,
          buildAddCloudflareWorkerHref,
          addCloudflareWorkerOnClick,
          buildAddConvexHref,
          addConvexOnClick,
          cloudflareObservations,
          configureWorkersBuildsForGitHubOnClick,
          convexObservations,
          isConfiguringWorkersBuildsForGitHub,
          isRemovingMissingCloudflareWorker,
          isRemovingMissingConvexProject,
          isRotatingConvexDeployKeysForWorkersBuilds,
          removeMissingCloudflareWorkerOnClick,
          removeMissingConvexProjectOnClick,
          vault,
          rotateConvexDeployKeysForWorkersBuildsOnClick,
        }),
      })),
  };
}
