import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  getConvexCodeLocationPath,
  getConvexCodeRootDirectory,
} from "../../../shared/convexCodeLocation";
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

function buildConvexProjectSettingsUrl(project: { projectSlug: string; teamSlug: string }): string {
  return `https://dashboard.convex.dev/t/${encodeURIComponent(project.teamSlug)}/${encodeURIComponent(project.projectSlug)}/settings`;
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
  label: string;
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

function buildDetachAttachmentAction(args: {
  ariaLabel: string;
  isDetaching: boolean;
  onClick: () => void;
}): VaultResourceRailAction {
  return {
    kind: "remove",
    label: args.isDetaching ? "Removing..." : "Remove from vault",
    ariaLabel: args.ariaLabel,
    disabled: args.isDetaching,
    onClick: args.onClick,
  };
}

function formatCloudflareRepositoryState(
  observation: Extract<VaultCloudflareWorkerBuildsObservation, { state: "available" }>,
): { description?: string; canConnect: boolean } {
  const repository = observation.repository;
  switch (repository.state) {
    case "ready":
      return observation.builds.state === "connected"
        ? { canConnect: false }
        : {
            canConnect: true,
            description: "Cloudflare Builds setup is incomplete.",
          };
    case "not_connected":
      return {
        canConnect: true,
        description: "Cloudflare is not connected to this GitHub repository.",
      };
    case "connected_elsewhere":
      return {
        canConnect: false,
        description: "Cloudflare Builds is connected to another repository.",
      };
    case "ambiguous":
      return {
        canConnect: false,
        description: "Cloudflare Builds does not have one unambiguous repository root.",
      };
    case "failed":
      return {
        canConnect: false,
        description: "Cloudflare Builds could not be loaded.",
      };
  }
  repository satisfies never;
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

function resolveConvexProjectActionLabel(
  project: VaultDashboardConvexProject,
  observationState: VaultProviderObservationState<VaultConvexProjectObservation>,
): string {
  if (observationState.state !== "loaded") {
    return project.projectId;
  }
  const observation = observationState.observations.find(
    (candidate) => candidate.convexProjectId === project.convexProjectId,
  );
  if (!observation) {
    return project.projectId;
  }
  switch (observation.provider.state) {
    case "current":
    case "moved":
      return observation.provider.projectSlug;
    case "missing_ambiguous":
    case "unavailable":
      return project.projectId;
  }
  observation.provider satisfies never;
  return project.projectId;
}

function buildConvexBuildAccessActions({
  actionIntent,
  convexProjectActionLabels,
  convexProjects,
  isRotatingConvexDeployKeysForWorkersBuilds,
  rotateConvexDeployKeysForWorkersBuildsOnClick,
  workerId,
}: {
  actionIntent: "repair" | "use";
  convexProjectActionLabels: ReadonlyMap<Id<"vaultConvexProjects">, string>;
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
    const projectLabel =
      convexProjectActionLabels.get(project.convexProjectId) ?? project.projectId;
    const label =
      actionIntent === "repair"
        ? isRotating
          ? `Repairing keys for ${projectLabel}...`
          : `Repair keys for ${projectLabel}`
        : isRotating
          ? `Using ${projectLabel}...`
          : `Use ${projectLabel} for Workers Builds`;
    return {
      kind: "configure" as const,
      label,
      ariaLabel:
        actionIntent === "repair"
          ? `Repair Convex deploy keys for ${projectLabel} in Workers Builds (${project.teamId}/${project.projectId})`
          : `Use Convex project ${projectLabel} for Workers Builds (${project.teamId}/${project.projectId})`,
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
  convexProjectActionLabels,
  convexProjects,
  isRotatingConvexDeployKeysForWorkersBuilds,
  observation,
  rotateConvexDeployKeysForWorkersBuildsOnClick,
  workerId,
}: {
  convexProjectActionLabels: ReadonlyMap<Id<"vaultConvexProjects">, string>;
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
  if (
    access.state === "configured" &&
    access.convexProject.state === "attached" &&
    access.convexProject.teamState === "matches"
  ) {
    return {
      description: `Convex deploy keys use ${access.convexProject.projectId}.`,
    };
  }

  let actions: VaultResourceRailActionList | undefined;
  if (
    (access.state === "configured" || access.state === "incomplete") &&
    access.convexProject.state === "attached"
  ) {
    const convexProjectId = access.convexProject.convexProjectId;
    actions = buildConvexBuildAccessActions({
      actionIntent: "repair",
      convexProjectActionLabels,
      convexProjects: convexProjects.filter(
        (project) => project.convexProjectId === convexProjectId,
      ),
      isRotatingConvexDeployKeysForWorkersBuilds,
      rotateConvexDeployKeysForWorkersBuildsOnClick,
      workerId,
    });
  } else {
    actions = buildConvexBuildAccessActions({
      actionIntent: "use",
      convexProjectActionLabels,
      convexProjects,
      isRotatingConvexDeployKeysForWorkersBuilds,
      rotateConvexDeployKeysForWorkersBuildsOnClick,
      workerId,
    });
  }
  switch (access.state) {
    case "configured":
      return {
        actions,
        description:
          access.convexProject.state === "attached"
            ? `Convex deploy keys still use ${access.convexProject.teamId}/${access.convexProject.projectId}.`
            : `Convex deploy keys target ${access.convexProject.teamId}/${access.convexProject.projectId}, which is not attached to this vault.`,
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
  convexProjectActionLabels,
  convexProjects,
  configureWorkersBuildsForGitHubOnClick,
  isConfiguringWorkersBuildsForGitHub,
  isDetachingCloudflareWorker,
  isRotatingConvexDeployKeysForWorkersBuilds,
  observationState,
  detachCloudflareWorkerOnClick,
  rotateConvexDeployKeysForWorkersBuildsOnClick,
  worker,
}: {
  convexProjectActionLabels: ReadonlyMap<Id<"vaultConvexProjects">, string>;
  convexProjects: readonly VaultDashboardConvexProject[];
  configureWorkersBuildsForGitHubOnClick?: (
    workerId: Id<"vaultCloudflareWorkers">,
    rootDirectory: string | undefined,
  ) => void;
  isConfiguringWorkersBuildsForGitHub?: (workerId: Id<"vaultCloudflareWorkers">) => boolean;
  isDetachingCloudflareWorker?: (workerId: Id<"vaultCloudflareWorkers">) => boolean;
  isRotatingConvexDeployKeysForWorkersBuilds?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => boolean;
  observationState: VaultCloudflareProviderObservationState;
  detachCloudflareWorkerOnClick?: (workerId: Id<"vaultCloudflareWorkers">) => void;
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
        actions: detachCloudflareWorkerOnClick
          ? [
              buildDetachAttachmentAction({
                ariaLabel: `Remove Cloudflare Worker ${worker.workerName} from vault`,
                isDetaching: isDetachingCloudflareWorker?.(worker.workerId) ?? false,
                onClick: () => detachCloudflareWorkerOnClick(worker.workerId),
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
                ? () =>
                    configureWorkersBuildsForGitHubOnClick(
                      worker.workerId,
                      buildsObservation.repository.state === "ready"
                        ? buildsObservation.repository.rootDirectory
                        : undefined,
                    )
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
        convexProjectActionLabels,
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

function buildActionList(
  actions: readonly (VaultResourceRailAction | undefined)[],
): VaultResourceRailActionList | undefined {
  const presentActions: VaultResourceRailAction[] = [];
  for (const action of actions) {
    if (action) {
      presentActions.push(action);
    }
  }
  if (presentActions.length === 0) {
    return undefined;
  }
  const [first, ...rest] = presentActions;
  return [first, ...rest];
}

function buildConvexRow({
  changeConvexProjectConfigPathOnClick,
  detachConvexProjectOnClick,
  isDetachingConvexProject,
  isReconcilingConvexProjectTeam,
  observationState,
  project,
  reconcileConvexProjectTeamOnClick,
}: {
  changeConvexProjectConfigPathOnClick?: (convexProjectId: Id<"vaultConvexProjects">) => void;
  detachConvexProjectOnClick?: (convexProjectId: Id<"vaultConvexProjects">) => void;
  isDetachingConvexProject?: (convexProjectId: Id<"vaultConvexProjects">) => boolean;
  isReconcilingConvexProjectTeam?: (convexProjectId: Id<"vaultConvexProjects">) => boolean;
  observationState: VaultProviderObservationState<VaultConvexProjectObservation>;
  project: VaultDashboardConvexProject;
  reconcileConvexProjectTeamOnClick?: (convexProjectId: Id<"vaultConvexProjects">) => void;
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

  const sourceDescription = (() => {
    switch (observation.source.state) {
      case "valid":
        return undefined;
      case "invalid":
        return `${getConvexCodeLocationPath(observation.codeLocation)} is not a valid Convex code location.`;
      case "missing":
        return `${getConvexCodeLocationPath(observation.codeLocation)} is missing.`;
      case "unavailable_partial":
        return "The repository could not be fully scanned.";
      case "unavailable":
        return observation.source.reason === "connection_required"
          ? "Connect GitHub to verify the Convex code location."
          : "Could not verify the Convex code location.";
    }
    observation.source satisfies never;
    return undefined;
  })();
  const changeConfigAction =
    (observation.source.state === "invalid" || observation.source.state === "missing") &&
    changeConvexProjectConfigPathOnClick
      ? {
          kind: "configure" as const,
          label: "Change code location",
          onClick: () => changeConvexProjectConfigPathOnClick(project.convexProjectId),
        }
      : undefined;
  const detachAction = detachConvexProjectOnClick
    ? buildDetachAttachmentAction({
        ariaLabel: `Remove Convex project ${project.projectId} from vault`,
        isDetaching: isDetachingConvexProject?.(project.convexProjectId) ?? false,
        onClick: () => detachConvexProjectOnClick(project.convexProjectId),
      })
    : undefined;

  switch (observation.provider.state) {
    case "current":
      return {
        ...base,
        status: "available",
        actions: buildActionList([changeConfigAction, detachAction]),
        description: joinDescriptions(
          sourceDescription,
          observation.provider.productionDeployment.state === "missing"
            ? "No production deployment."
            : undefined,
        ),
        href: buildConvexProjectSettingsUrl(observation.provider),
        scope: observation.provider.teamSlug,
        value: observation.provider.projectSlug,
      };
    case "moved": {
      const isReconciling = isReconcilingConvexProjectTeam?.(project.convexProjectId) ?? false;
      const reconcileAction = reconcileConvexProjectTeamOnClick
        ? {
            kind: "configure" as const,
            label: isReconciling ? "Updating team..." : "Use current team",
            disabled: isReconciling,
            onClick: () => reconcileConvexProjectTeamOnClick(project.convexProjectId),
          }
        : undefined;
      return {
        ...base,
        status: "available",
        actions: buildActionList([changeConfigAction, reconcileAction, detachAction]),
        description: joinDescriptions(
          sourceDescription,
          "This project moved to another Convex team.",
        ),
        href: buildConvexProjectSettingsUrl(observation.provider),
        scope: observation.provider.teamSlug,
        value: observation.provider.projectSlug,
      };
    }
    case "missing_ambiguous":
      return {
        ...base,
        status: "missing",
        actions: buildActionList([changeConfigAction, detachAction]),
        description: joinDescriptions(
          sourceDescription,
          "The project may have been deleted or moved to another team.",
        ),
      };
    case "unavailable":
      return {
        ...base,
        status: "failed",
        actions: buildActionList([
          buildReloadAction(observationState.reload),
          changeConfigAction,
          detachAction,
        ]),
        description: joinDescriptions(
          sourceDescription,
          observation.provider.reason === "connection_required"
            ? "Connect Convex to load this project."
            : "Could not load from Convex.",
        ),
      };
  }
  observation.provider satisfies never;
  return {
    ...base,
    status: "failed",
    description: "Could not load this Convex project.",
  };
}

export function buildVaultDashboardResourceRailState({
  buildAddCloudflareWorkerHref,
  addCloudflareWorkerOnClick,
  buildAddConvexHref,
  addConvexOnClick,
  configureWorkersBuildsForGitHubOnClick,
  changeConvexProjectConfigPathOnClick,
  cloudflareObservations,
  convexObservations,
  githubRepositoryUrl,
  isConfiguringWorkersBuildsForGitHub,
  isDetachingCloudflareWorker,
  isDetachingConvexProject,
  isReconcilingConvexProjectTeam,
  isRotatingConvexDeployKeysForWorkersBuilds,
  detachCloudflareWorkerOnClick,
  detachConvexProjectOnClick,
  reconcileConvexProjectTeamOnClick,
  vault,
  rotateConvexDeployKeysForWorkersBuildsOnClick,
}: {
  buildAddCloudflareWorkerHref?: () => string;
  addCloudflareWorkerOnClick?: () => void;
  buildAddConvexHref?: () => string;
  addConvexOnClick?: () => void;
  configureWorkersBuildsForGitHubOnClick?: (
    workerId: Id<"vaultCloudflareWorkers">,
    rootDirectory: string | undefined,
  ) => void;
  changeConvexProjectConfigPathOnClick?: (convexProjectId: Id<"vaultConvexProjects">) => void;
  cloudflareObservations: VaultCloudflareProviderObservationState;
  convexObservations: VaultProviderObservationState<VaultConvexProjectObservation>;
  githubRepositoryUrl: string;
  isConfiguringWorkersBuildsForGitHub?: (workerId: Id<"vaultCloudflareWorkers">) => boolean;
  isDetachingCloudflareWorker?: (workerId: Id<"vaultCloudflareWorkers">) => boolean;
  isDetachingConvexProject?: (convexProjectId: Id<"vaultConvexProjects">) => boolean;
  isReconcilingConvexProjectTeam?: (convexProjectId: Id<"vaultConvexProjects">) => boolean;
  isRotatingConvexDeployKeysForWorkersBuilds?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => boolean;
  detachCloudflareWorkerOnClick?: (workerId: Id<"vaultCloudflareWorkers">) => void;
  detachConvexProjectOnClick?: (convexProjectId: Id<"vaultConvexProjects">) => void;
  reconcileConvexProjectTeamOnClick?: (convexProjectId: Id<"vaultConvexProjects">) => void;
  vault: VaultDashboardVault;
  rotateConvexDeployKeysForWorkersBuildsOnClick?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => void;
}): VaultResourceRailState {
  let githubRow: VaultResourceRailRowState<"github">;
  if (vault.hasConnectedGitHubRepository) {
    githubRow = {
      provider: "github",
      rowId: "github",
      status: "available",
      value: vault.repositoryFullName,
      href: githubRepositoryUrl,
    };
  } else if (vault.sourceSetup.status === "failed") {
    githubRow = {
      provider: "github",
      rowId: "github",
      status: "failed",
      value: vault.repositoryFullName,
      description: "Repository setup failed.",
    };
  } else {
    githubRow = {
      provider: "github",
      rowId: "github",
      status: "loading",
      value: vault.repositoryFullName,
      description: "Loading from GitHub...",
    };
  }

  const rowsByRoot = new Map<string, VaultResourceRailRowState<"cloudflare" | "convex">[]>();
  const convexProjectActionLabels = new Map(
    vault.convexProjects.map((project) => [
      project.convexProjectId,
      resolveConvexProjectActionLabel(project, convexObservations),
    ]),
  );
  const addRowToRoot = (
    rootDirectory: string,
    row: VaultResourceRailRowState<"cloudflare" | "convex">,
  ) => {
    const rows = rowsByRoot.get(rootDirectory);
    if (rows) {
      rows.push(row);
      return;
    }
    rowsByRoot.set(rootDirectory, [row]);
  };

  for (const project of [...vault.convexProjects].sort(
    (left, right) =>
      left.projectId.localeCompare(right.projectId) ||
      left.convexProjectId.localeCompare(right.convexProjectId),
  )) {
    addRowToRoot(
      getConvexCodeRootDirectory(project.codeLocation),
      buildConvexRow({
        changeConvexProjectConfigPathOnClick,
        detachConvexProjectOnClick,
        isDetachingConvexProject,
        isReconcilingConvexProjectTeam,
        observationState: convexObservations,
        project,
        reconcileConvexProjectTeamOnClick,
      }),
    );
  }

  const attentionRows: VaultResourceRailRowState<"cloudflare" | "convex">[] = [];
  for (const worker of [...vault.cloudflareWorkers].sort(
    (left, right) =>
      left.workerName.localeCompare(right.workerName) ||
      left.workerId.localeCompare(right.workerId),
  )) {
    const row = buildCloudflareRow({
      convexProjectActionLabels,
      convexProjects: vault.convexProjects,
      configureWorkersBuildsForGitHubOnClick,
      isConfiguringWorkersBuildsForGitHub,
      isDetachingCloudflareWorker,
      isRotatingConvexDeployKeysForWorkersBuilds,
      observationState: cloudflareObservations,
      detachCloudflareWorkerOnClick,
      rotateConvexDeployKeysForWorkersBuildsOnClick,
      worker,
    });
    const buildsObservation =
      cloudflareObservations.builds.state === "loaded"
        ? cloudflareObservations.builds.observations.find(
            (candidate) => candidate.workerId === worker.workerId,
          )
        : undefined;
    if (
      buildsObservation?.state === "available" &&
      buildsObservation.repository.state === "ready"
    ) {
      addRowToRoot(buildsObservation.repository.rootDirectory, row);
    } else {
      attentionRows.push(row);
    }
  }

  return {
    attentionRows,
    githubRow,
    roots: [...rowsByRoot.entries()]
      .sort(([leftRoot], [rightRoot]) => compareRootDirectories(leftRoot, rightRoot))
      .map(([rootDirectory, rows]) => ({ rootDirectory, rows })),
    vaultActionRows: [
      {
        provider: "convex",
        rowId: "convex:add",
        status: "action_required",
        actions: [
          buildAddAction({
            href: buildAddConvexHref?.(),
            label: "Add",
            onClick: addConvexOnClick,
          }),
        ],
      },
      {
        provider: "cloudflare",
        rowId: "cloudflare:add",
        status: "action_required",
        actions: [
          buildAddAction({
            href: buildAddCloudflareWorkerHref?.(),
            label: "Add",
            onClick: addCloudflareWorkerOnClick,
          }),
        ],
      },
    ],
  };
}
