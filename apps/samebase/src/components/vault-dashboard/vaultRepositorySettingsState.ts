import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  getConvexCodeLocationPath,
  getConvexCodeRootDirectory,
} from "../../../shared/convexCodeLocation";
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
type VaultManagedProviderPlan = NonNullable<VaultDashboardVault["providerPlan"]>;

type VaultRepositorySettingsActionKind = "configure" | "connect" | "remove" | "retry";

export type VaultRepositorySettingsPendingAction =
  | {
      kind: "configure_workers_builds_for_github";
      workerId: Id<"vaultCloudflareWorkers">;
    }
  | {
      kind: "rotate_convex_deploy_keys_for_workers_builds";
      workerId: Id<"vaultCloudflareWorkers">;
      convexProjectId: Id<"vaultConvexProjects">;
    }
  | {
      kind: "detach_cloudflare_worker";
      workerId: Id<"vaultCloudflareWorkers">;
    }
  | {
      kind: "detach_convex_project";
      convexProjectId: Id<"vaultConvexProjects">;
    }
  | {
      kind: "reconcile_convex_project_team";
      convexProjectId: Id<"vaultConvexProjects">;
    };

export type VaultRepositorySettingsAction = {
  disabled?: boolean;
  kind: VaultRepositorySettingsActionKind;
  label: string;
  onClick?: () => void;
};

type VaultRepositorySettingsActionList = readonly [
  VaultRepositorySettingsAction,
  ...VaultRepositorySettingsAction[],
];

export type VaultRepositorySettingsResource = {
  actions?: VaultRepositorySettingsActionList;
  description?: string;
  href?: string;
  name: string;
  owner?: string;
  provider: "cloudflare" | "convex";
  resourceId: string;
  state: "available" | "checking" | "failed" | "loading" | "missing" | "setting_up";
};

export type VaultRepositorySettingsState = {
  addCloudflareWorker: {
    disabled: boolean;
    onClick?: () => void;
  };
  addConvexProject: {
    disabled: boolean;
    onClick?: () => void;
  };
  attentionResources: readonly VaultRepositorySettingsResource[];
  pendingResources: readonly VaultRepositorySettingsResource[];
  providerActionBlockReason: string | null;
  roots: readonly {
    resources: readonly VaultRepositorySettingsResource[];
    rootDirectory: string;
  }[];
};

export function readVaultProviderActionBlockReason(vault: VaultDashboardVault): string | null {
  switch (vault.providerWrite.status) {
    case "active":
      return "A provider operation is in progress.";
    case "idle":
      break;
  }

  if (vault.deletion.state === "deleting") {
    return "Vault removal is in progress.";
  }
  if (vault.deletion.state === "delete_failed") {
    return "Retry vault removal before you change providers.";
  }
  return vault.hasConnectedGitHubRepository ? null : "Finish GitHub repository setup first.";
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

function buildCloudflareDashboardUrl(worker: VaultDashboardCloudflareWorker): string {
  return `https://dash.cloudflare.com/?to=/${encodeURIComponent(worker.accountId)}/workers/services/view/${encodeURIComponent(worker.workerName)}/production/settings`;
}

function buildConvexProjectSettingsUrl(project: { projectSlug: string; teamSlug: string }): string {
  return `https://dashboard.convex.dev/t/${encodeURIComponent(project.teamSlug)}/${encodeURIComponent(project.projectSlug)}/settings`;
}

function buildReloadAction(reload: () => void): VaultRepositorySettingsAction {
  return {
    kind: "retry",
    label: "Reload",
    onClick: reload,
  };
}

function buildDetachAttachmentAction(args: {
  isDetaching: boolean;
  onClick: () => void;
}): VaultRepositorySettingsAction {
  return {
    kind: "remove",
    label: args.isDetaching ? "Removing..." : "Remove from vault",
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
}

function buildConvexBuildAccessActions({
  actionIntent,
  convexProjectActionLabels,
  convexProjects,
  pendingAction,
  rotateConvexDeployKeysForWorkersBuildsOnClick,
  workerId,
}: {
  actionIntent: "repair" | "use";
  convexProjectActionLabels: ReadonlyMap<Id<"vaultConvexProjects">, string>;
  convexProjects: readonly VaultDashboardConvexProject[];
  pendingAction: VaultRepositorySettingsPendingAction | null;
  rotateConvexDeployKeysForWorkersBuildsOnClick?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => void;
  workerId: Id<"vaultCloudflareWorkers">;
}): VaultRepositorySettingsActionList | undefined {
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
      pendingAction?.kind === "rotate_convex_deploy_keys_for_workers_builds" &&
      pendingAction.workerId === workerId &&
      pendingAction.convexProjectId === project.convexProjectId;
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
  observation,
  pendingAction,
  rotateConvexDeployKeysForWorkersBuildsOnClick,
  workerId,
}: {
  convexProjectActionLabels: ReadonlyMap<Id<"vaultConvexProjects">, string>;
  convexProjects: readonly VaultDashboardConvexProject[];
  observation: Extract<VaultCloudflareWorkerConvexBuildAccessObservation, { state: "available" }>;
  pendingAction: VaultRepositorySettingsPendingAction | null;
  rotateConvexDeployKeysForWorkersBuildsOnClick?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => void;
  workerId: Id<"vaultCloudflareWorkers">;
}): { actions?: VaultRepositorySettingsActionList; description?: string } {
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

  let actions: VaultRepositorySettingsActionList | undefined;
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
      pendingAction,
      rotateConvexDeployKeysForWorkersBuildsOnClick,
      workerId,
    });
  } else {
    actions = buildConvexBuildAccessActions({
      actionIntent: "use",
      convexProjectActionLabels,
      convexProjects,
      pendingAction,
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
}

function buildCloudflareRow({
  connectedCloudflareAccount,
  convexProjectActionLabels,
  convexProjects,
  configureWorkersBuildsForGitHubOnClick,
  observationState,
  detachCloudflareWorkerOnClick,
  pendingAction,
  rotateConvexDeployKeysForWorkersBuildsOnClick,
  settingUp,
  worker,
}: {
  connectedCloudflareAccount:
    | {
        accountId: string;
        accountName: string | undefined;
      }
    | undefined;
  convexProjectActionLabels: ReadonlyMap<Id<"vaultConvexProjects">, string>;
  convexProjects: readonly VaultDashboardConvexProject[];
  configureWorkersBuildsForGitHubOnClick?: (
    workerId: Id<"vaultCloudflareWorkers">,
    rootDirectory: string | undefined,
  ) => void;
  observationState: VaultCloudflareProviderObservationState;
  detachCloudflareWorkerOnClick?: (workerId: Id<"vaultCloudflareWorkers">) => void;
  pendingAction: VaultRepositorySettingsPendingAction | null;
  rotateConvexDeployKeysForWorkersBuildsOnClick?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => void;
  settingUp: boolean;
  worker: VaultDashboardCloudflareWorker;
}): VaultRepositorySettingsResource {
  const base = {
    name: worker.workerName,
    owner:
      connectedCloudflareAccount?.accountId === worker.accountId &&
      connectedCloudflareAccount.accountName
        ? connectedCloudflareAccount.accountName
        : worker.accountId,
    provider: "cloudflare" as const,
    resourceId: worker.workerId,
  };
  if (settingUp) {
    return {
      ...base,
      state: "setting_up",
      description: "Setting up",
      href: buildCloudflareDashboardUrl(worker),
    };
  }
  if (observationState.workers.state === "checking") {
    return {
      ...base,
      state: "checking",
      description: "Checking",
      href: buildCloudflareDashboardUrl(worker),
    };
  }
  if (observationState.workers.state === "loading") {
    return {
      ...base,
      state: "loading",
      description: "Loading from Cloudflare...",
    };
  }
  if (observationState.workers.state === "failed") {
    return {
      ...base,
      state: "failed",
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
      state: "failed",
      description: "Could not load this Worker.",
      actions: [buildReloadAction(observationState.workers.reload)],
    };
  }
  switch (observation.state) {
    case "missing":
      return {
        ...base,
        state: "missing",
        description: "Missing from Cloudflare.",
        actions: detachCloudflareWorkerOnClick
          ? [
              buildDetachAttachmentAction({
                isDetaching:
                  pendingAction?.kind === "detach_cloudflare_worker" &&
                  pendingAction.workerId === worker.workerId,
                onClick: () => detachCloudflareWorkerOnClick(worker.workerId),
              }),
            ]
          : undefined,
      };
    case "failed":
      return {
        ...base,
        state: "failed",
        description:
          observation.reason === "connection_required"
            ? "Connect Cloudflare to load this Worker."
            : "Could not load from Cloudflare.",
        actions: [buildReloadAction(observationState.workers.reload)],
      };
    case "available": {
      const availableBase = {
        ...base,
        state: "available" as const,
        href: buildCloudflareDashboardUrl(worker),
      };
      const previewDescription = formatCloudflarePreviewState(observation);
      if (observationState.builds.state === "checking") {
        return {
          ...availableBase,
          description: "Checking",
          state: "checking",
        };
      }
      if (observationState.builds.state === "loading") {
        return {
          ...availableBase,
          description: joinDescriptions(previewDescription, "Loading Workers Builds..."),
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
        const isConfiguring =
          pendingAction?.kind === "configure_workers_builds_for_github" &&
          pendingAction.workerId === worker.workerId;
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
          description: joinDescriptions(
            previewDescription,
            repositoryState.description,
            "Loading Convex deploy keys...",
          ),
        };
      }
      if (observationState.convexBuildAccess.state === "checking") {
        return {
          ...availableBase,
          description: "Checking",
          state: "checking",
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
        observation: buildAccessObservation,
        pendingAction,
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
}

function buildActionList(
  actions: readonly (VaultRepositorySettingsAction | undefined)[],
): VaultRepositorySettingsActionList | undefined {
  const presentActions: VaultRepositorySettingsAction[] = [];
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
  checkingName,
  detachConvexProjectOnClick,
  observationState,
  pendingAction,
  project,
  reconcileConvexProjectTeamOnClick,
  settingUp,
}: {
  changeConvexProjectConfigPathOnClick?: (convexProjectId: Id<"vaultConvexProjects">) => void;
  checkingName: string;
  detachConvexProjectOnClick?: (convexProjectId: Id<"vaultConvexProjects">) => void;
  observationState: VaultProviderObservationState<VaultConvexProjectObservation>;
  pendingAction: VaultRepositorySettingsPendingAction | null;
  project: VaultDashboardConvexProject;
  reconcileConvexProjectTeamOnClick?: (convexProjectId: Id<"vaultConvexProjects">) => void;
  settingUp: { name: string; owner?: string } | null;
}): VaultRepositorySettingsResource {
  const base = {
    name: project.projectId,
    owner: project.teamId,
    provider: "convex" as const,
    resourceId: project.convexProjectId,
  };
  if (settingUp) {
    const observation =
      observationState.state === "loaded"
        ? observationState.observations.find(
            (candidate) => candidate.convexProjectId === project.convexProjectId,
          )
        : undefined;
    const provider = observation?.provider;
    const currentProvider =
      provider?.state === "current" || provider?.state === "moved" ? provider : null;
    return {
      ...base,
      state: "setting_up",
      description: "Setting up",
      href: currentProvider ? buildConvexProjectSettingsUrl(currentProvider) : undefined,
      name: settingUp.name,
      owner: currentProvider?.teamSlug ?? settingUp.owner ?? base.owner,
    };
  }
  if (observationState.state === "checking") {
    return {
      ...base,
      state: "checking",
      description: "Checking",
      name: checkingName,
      owner: undefined,
    };
  }
  if (observationState.state === "loading") {
    return {
      ...base,
      state: "loading",
      description: "Loading from Convex...",
    };
  }
  if (observationState.state === "failed") {
    return {
      ...base,
      state: "failed",
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
      state: "failed",
      description: "Could not load this Convex project.",
      actions: [buildReloadAction(observationState.reload)],
    };
  }

  const sourceDescription = (() => {
    switch (observation.source.state) {
      case "valid":
        return undefined;
      case "missing":
        return `${getConvexCodeLocationPath(observation.codeLocation)} is no longer discoverable on the default branch.`;
      case "unavailable_partial":
        return "The repository could not be fully scanned.";
      case "unavailable":
        return observation.source.reason === "connection_required"
          ? "Connect GitHub to verify the Convex code location."
          : "Could not verify the Convex code location.";
    }
  })();
  const changeConfigAction =
    observation.source.state === "missing" && changeConvexProjectConfigPathOnClick
      ? {
          kind: "configure" as const,
          label: "Change code location",
          onClick: () => changeConvexProjectConfigPathOnClick(project.convexProjectId),
        }
      : undefined;
  const detachAction = detachConvexProjectOnClick
    ? buildDetachAttachmentAction({
        isDetaching:
          pendingAction?.kind === "detach_convex_project" &&
          pendingAction.convexProjectId === project.convexProjectId,
        onClick: () => detachConvexProjectOnClick(project.convexProjectId),
      })
    : undefined;

  switch (observation.provider.state) {
    case "current":
      return {
        ...base,
        state: "available",
        actions: buildActionList([changeConfigAction, detachAction]),
        description: joinDescriptions(
          sourceDescription,
          observation.provider.productionDeployment.state === "missing"
            ? "No production deployment."
            : undefined,
        ),
        href: buildConvexProjectSettingsUrl(observation.provider),
        name: observation.provider.projectSlug,
        owner: observation.provider.teamSlug,
      };
    case "moved": {
      const isReconciling =
        pendingAction?.kind === "reconcile_convex_project_team" &&
        pendingAction.convexProjectId === project.convexProjectId;
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
        state: "available",
        actions: buildActionList([changeConfigAction, reconcileAction, detachAction]),
        description: joinDescriptions(
          sourceDescription,
          "This project moved to another Convex team.",
        ),
        href: buildConvexProjectSettingsUrl(observation.provider),
        name: observation.provider.projectSlug,
        owner: observation.provider.teamSlug,
      };
    }
    case "missing_ambiguous":
      return {
        ...base,
        state: "missing",
        actions: buildActionList([changeConfigAction, detachAction]),
        description: joinDescriptions(
          sourceDescription,
          "The project may have been deleted or moved to another team.",
        ),
      };
    case "unavailable":
      return {
        ...base,
        state: "failed",
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
}

function isPlannedConvexAttachment(
  plan: VaultManagedProviderPlan["convex"],
  project: VaultDashboardConvexProject,
): boolean {
  return (
    plan.state === "created" &&
    plan.teamId === project.teamId &&
    plan.projectId === project.projectId
  );
}

function isPlannedCloudflareAttachment(
  plan: VaultManagedProviderPlan["cloudflare"],
  worker: VaultDashboardCloudflareWorker,
): boolean {
  return (
    plan.accountId === worker.accountId &&
    plan.workerName === worker.workerName &&
    (plan.state !== "created" || plan.workerTag === worker.workerTag)
  );
}

function buildPlannedConvexRow({
  failedMessage,
  plan,
}: {
  failedMessage: string | null;
  plan: VaultManagedProviderPlan;
}): VaultRepositorySettingsResource {
  return {
    description: failedMessage ?? "Setting up",
    name: plan.convex.projectName,
    owner: plan.convex.teamId,
    provider: "convex",
    resourceId: "planned-convex",
    state: failedMessage ? "failed" : "setting_up",
  };
}

function buildPlannedCloudflareRow({
  connectedCloudflareAccount,
  failedMessage,
  plan,
}: {
  connectedCloudflareAccount:
    | {
        accountId: string;
        accountName: string | undefined;
      }
    | undefined;
  failedMessage: string | null;
  plan: VaultManagedProviderPlan;
}): VaultRepositorySettingsResource {
  return {
    description: failedMessage ?? "Setting up",
    name: plan.cloudflare.workerName,
    owner:
      connectedCloudflareAccount?.accountId === plan.cloudflare.accountId
        ? connectedCloudflareAccount.accountName
        : plan.cloudflare.accountId,
    provider: "cloudflare",
    resourceId: "planned-cloudflare",
    state: failedMessage ? "failed" : "setting_up",
  };
}

function disableProviderWriteActions(
  resource: VaultRepositorySettingsResource,
): VaultRepositorySettingsResource {
  const actions = resource.actions;
  if (!actions) {
    return resource;
  }
  const [first, ...rest] = actions;
  const disableWriteAction = (action: VaultRepositorySettingsAction) =>
    action.kind === "retry" ? action : { ...action, disabled: true };
  return {
    ...resource,
    actions: [disableWriteAction(first), ...rest.map(disableWriteAction)],
  };
}

export function buildVaultRepositorySettingsState({
  addCloudflareWorkerOnClick,
  addConvexOnClick,
  connectedCloudflareAccount,
  configureWorkersBuildsForGitHubOnClick,
  changeConvexProjectConfigPathOnClick,
  cloudflareObservations,
  convexObservations,
  detachCloudflareWorkerOnClick,
  detachConvexProjectOnClick,
  pendingAction,
  reconcileConvexProjectTeamOnClick,
  vault,
  rotateConvexDeployKeysForWorkersBuildsOnClick,
}: {
  addCloudflareWorkerOnClick?: () => void;
  addConvexOnClick?: () => void;
  connectedCloudflareAccount:
    | {
        accountId: string;
        accountName: string | undefined;
      }
    | undefined;
  configureWorkersBuildsForGitHubOnClick?: (
    workerId: Id<"vaultCloudflareWorkers">,
    rootDirectory: string | undefined,
  ) => void;
  changeConvexProjectConfigPathOnClick?: (convexProjectId: Id<"vaultConvexProjects">) => void;
  cloudflareObservations: VaultCloudflareProviderObservationState;
  convexObservations: VaultProviderObservationState<VaultConvexProjectObservation>;
  detachCloudflareWorkerOnClick?: (workerId: Id<"vaultCloudflareWorkers">) => void;
  detachConvexProjectOnClick?: (convexProjectId: Id<"vaultConvexProjects">) => void;
  pendingAction: VaultRepositorySettingsPendingAction | null;
  reconcileConvexProjectTeamOnClick?: (convexProjectId: Id<"vaultConvexProjects">) => void;
  vault: VaultDashboardVault;
  rotateConvexDeployKeysForWorkersBuildsOnClick?: (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => void;
}): VaultRepositorySettingsState {
  const resourcesByRoot = new Map<string, VaultRepositorySettingsResource[]>();
  const providerActionBlockReason = readVaultProviderActionBlockReason(vault);
  const managedSetupActive =
    vault.providerWrite.status === "active" && vault.providerWrite.owner.kind === "managed_run";
  const managedSetupFailed = vault.providerSetup.status === "failed";
  const applicablePlan =
    vault.providerPlan && (managedSetupActive || managedSetupFailed) ? vault.providerPlan : null;
  const failedPlanMessage =
    applicablePlan && managedSetupFailed && vault.providerSetup.status === "failed"
      ? vault.providerSetup.message
      : null;
  const convexProjectActionLabels = new Map(
    vault.convexProjects.map((project) => [
      project.convexProjectId,
      resolveConvexProjectActionLabel(project, convexObservations),
    ]),
  );
  const addResourceToRoot = (rootDirectory: string, resource: VaultRepositorySettingsResource) => {
    const resources = resourcesByRoot.get(rootDirectory);
    if (resources) {
      resources.push(resource);
      return;
    }
    resourcesByRoot.set(rootDirectory, [resource]);
  };

  for (const project of [...vault.convexProjects].sort(
    (left, right) =>
      left.projectId.localeCompare(right.projectId) ||
      left.convexProjectId.localeCompare(right.convexProjectId),
  )) {
    const plannedProjectName =
      vault.providerPlan && isPlannedConvexAttachment(vault.providerPlan.convex, project)
        ? vault.providerPlan.convex.projectName
        : null;
    const settingUp =
      applicablePlan &&
      managedSetupActive &&
      isPlannedConvexAttachment(applicablePlan.convex, project)
        ? {
            name: applicablePlan.convex.projectName,
            owner: applicablePlan.convex.teamId,
          }
        : null;
    addResourceToRoot(
      getConvexCodeRootDirectory(project.codeLocation),
      buildConvexRow({
        changeConvexProjectConfigPathOnClick,
        checkingName: plannedProjectName ?? "Convex project",
        detachConvexProjectOnClick,
        observationState: convexObservations,
        pendingAction,
        project,
        reconcileConvexProjectTeamOnClick,
        settingUp,
      }),
    );
  }
  if (
    applicablePlan &&
    !vault.convexProjects.some((project) =>
      isPlannedConvexAttachment(applicablePlan.convex, project),
    )
  ) {
    addResourceToRoot(
      getConvexCodeRootDirectory({
        kind: "config",
        convexConfigPath: applicablePlan.convexConfigPath,
      }),
      buildPlannedConvexRow({
        failedMessage: failedPlanMessage,
        plan: applicablePlan,
      }),
    );
  }

  const attentionResources: VaultRepositorySettingsResource[] = [];
  const pendingResources: VaultRepositorySettingsResource[] = [];
  for (const worker of [...vault.cloudflareWorkers].sort(
    (left, right) =>
      left.workerName.localeCompare(right.workerName) ||
      left.workerId.localeCompare(right.workerId),
  )) {
    const plannedAttachment =
      applicablePlan && isPlannedCloudflareAttachment(applicablePlan.cloudflare, worker);
    const resource = buildCloudflareRow({
      connectedCloudflareAccount,
      convexProjectActionLabels,
      convexProjects: vault.convexProjects,
      configureWorkersBuildsForGitHubOnClick,
      observationState: cloudflareObservations,
      detachCloudflareWorkerOnClick,
      pendingAction,
      rotateConvexDeployKeysForWorkersBuildsOnClick,
      settingUp: Boolean(managedSetupActive && plannedAttachment),
      worker,
    });
    const buildsObservation =
      cloudflareObservations.builds.state === "loaded"
        ? cloudflareObservations.builds.observations.find(
            (candidate) => candidate.workerId === worker.workerId,
          )
        : undefined;
    if (managedSetupActive && plannedAttachment) {
      addResourceToRoot(applicablePlan.cloudflare.rootDirectory, resource);
    } else if (
      cloudflareObservations.builds.state === "loading" ||
      cloudflareObservations.builds.state === "checking"
    ) {
      pendingResources.push(resource);
    } else if (
      buildsObservation?.state === "available" &&
      buildsObservation.repository.state === "ready"
    ) {
      addResourceToRoot(buildsObservation.repository.rootDirectory, resource);
    } else {
      attentionResources.push(resource);
    }
  }
  if (
    applicablePlan &&
    !vault.cloudflareWorkers.some((worker) =>
      isPlannedCloudflareAttachment(applicablePlan.cloudflare, worker),
    )
  ) {
    addResourceToRoot(
      applicablePlan.cloudflare.rootDirectory,
      buildPlannedCloudflareRow({
        connectedCloudflareAccount,
        failedMessage: failedPlanMessage,
        plan: applicablePlan,
      }),
    );
  }

  const providerWritePending = pendingAction !== null;
  const applyWriteBlock = (resource: VaultRepositorySettingsResource) =>
    providerActionBlockReason || providerWritePending
      ? disableProviderWriteActions(resource)
      : resource;

  return {
    addCloudflareWorker: {
      disabled:
        Boolean(providerActionBlockReason) || providerWritePending || !addCloudflareWorkerOnClick,
      onClick: addCloudflareWorkerOnClick,
    },
    addConvexProject: {
      disabled: Boolean(providerActionBlockReason) || providerWritePending || !addConvexOnClick,
      onClick: addConvexOnClick,
    },
    attentionResources: attentionResources.map(applyWriteBlock),
    pendingResources: pendingResources.map(applyWriteBlock),
    providerActionBlockReason,
    roots: [...resourcesByRoot.entries()]
      .sort(([leftRoot], [rightRoot]) => compareRootDirectories(leftRoot, rightRoot))
      .map(([rootDirectory, resources]) => ({
        rootDirectory,
        resources: resources.map(applyWriteBlock),
      })),
  };
}
