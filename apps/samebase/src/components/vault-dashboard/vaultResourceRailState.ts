import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  VaultResourceRailAction,
  VaultResourceRailActionList,
  VaultResourceRailRowState,
  VaultResourceRailState,
} from "./VaultResourceRail";
import type {
  VaultCloudflareWorkerObservation,
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
  return `https://dash.cloudflare.com/?to=/${encodeURIComponent(worker.accountId)}/workers/services/view/${encodeURIComponent(worker.workerName)}/production/deployments`;
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

function formatCloudflareRepositoryState(
  observation: Extract<VaultCloudflareWorkerObservation, { state: "available" }>,
): { description?: string; canConnect: boolean } {
  const evidence = observation.repository.evidence;
  switch (evidence.state) {
    case "matching_repo":
      return { canConnect: false };
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

function buildCloudflareRow({
  connectCloudflareGithubRepoOnClick,
  isConnectingCloudflareGithubRepo,
  observationState,
  worker,
}: {
  connectCloudflareGithubRepoOnClick?: (workerId: Id<"vaultCloudflareWorkers">) => void;
  isConnectingCloudflareGithubRepo?: (workerId: Id<"vaultCloudflareWorkers">) => boolean;
  observationState: VaultProviderObservationState<VaultCloudflareWorkerObservation>;
  worker: VaultDashboardCloudflareWorker;
}): VaultResourceRailRowState<"cloudflare"> {
  const base = {
    provider: "cloudflare" as const,
    rowId: `cloudflare:${worker.workerId}`,
    value: worker.workerName,
  };
  if (observationState.state === "loading") {
    return {
      ...base,
      status: "loading",
      description: "Loading from Cloudflare...",
    };
  }
  if (observationState.state === "failed") {
    return {
      ...base,
      status: "failed",
      description: "Could not load from Cloudflare.",
      actions: [buildReloadAction(observationState.reload)],
    };
  }

  const observation = observationState.observations.find(
    (candidate) => candidate.workerId === worker.workerId,
  );
  if (!observation) {
    return {
      ...base,
      status: "failed",
      description: "Could not load this Worker.",
      actions: [buildReloadAction(observationState.reload)],
    };
  }
  switch (observation.state) {
    case "missing":
      return {
        ...base,
        status: "missing",
        description: "Missing from Cloudflare.",
      };
    case "failed":
      return {
        ...base,
        status: "failed",
        description:
          observation.reason === "connection_required"
            ? "Connect Cloudflare to load this Worker."
            : "Could not load from Cloudflare.",
        actions: [buildReloadAction(observationState.reload)],
      };
    case "available": {
      const repositoryState = formatCloudflareRepositoryState(observation);
      const isConnecting = isConnectingCloudflareGithubRepo?.(worker.workerId) ?? false;
      const actions: VaultResourceRailActionList | undefined = repositoryState.canConnect
        ? [
            {
              kind: "connect",
              label: isConnecting ? "Connecting GitHub repo..." : "Connect GitHub repo",
              disabled: isConnecting || !connectCloudflareGithubRepoOnClick,
              onClick: connectCloudflareGithubRepoOnClick
                ? () => connectCloudflareGithubRepoOnClick(worker.workerId)
                : undefined,
            },
          ]
        : undefined;
      return {
        ...base,
        status: "available",
        actions,
        description: joinDescriptions(
          formatCloudflarePreviewState(observation),
          repositoryState.description,
        ),
        href: buildCloudflareDashboardUrl(worker),
        scope: resolveCloudflareWorkersSubdomain(observation, worker.workerName),
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
  observationState,
  project,
}: {
  observationState: VaultProviderObservationState<VaultConvexProjectObservation>;
  project: VaultDashboardConvexProject;
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
  connectCloudflareGithubRepoOnClick,
  convexObservations,
  isConnectingCloudflareGithubRepo,
  vault,
}: {
  app: VaultDashboardApp;
  buildAddCloudflareWorkerHref?: (rootDirectory: string) => string;
  addCloudflareWorkerOnClick?: (appId: Id<"vaultApps">, rootDirectory: string) => void;
  buildAddConvexHref?: (rootDirectory: string) => string;
  addConvexOnClick?: (appId: Id<"vaultApps">, rootDirectory: string) => void;
  cloudflareObservations: VaultProviderObservationState<VaultCloudflareWorkerObservation>;
  connectCloudflareGithubRepoOnClick?: (workerId: Id<"vaultCloudflareWorkers">) => void;
  convexObservations: VaultProviderObservationState<VaultConvexProjectObservation>;
  isConnectingCloudflareGithubRepo?: (workerId: Id<"vaultCloudflareWorkers">) => boolean;
  vault: VaultDashboardVault;
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
    buildConvexRow({ observationState: convexObservations, project }),
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
        connectCloudflareGithubRepoOnClick,
        isConnectingCloudflareGithubRepo,
        observationState: cloudflareObservations,
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
  connectCloudflareGithubRepoOnClick,
  buildAddAppRootHref,
  addAppRootOnClick,
  cloudflareObservations,
  convexObservations,
  githubRepositoryUrl,
  isConnectingCloudflareGithubRepo,
  vault,
}: {
  buildAddCloudflareWorkerHref?: (rootDirectory: string) => string;
  addCloudflareWorkerOnClick?: (appId: Id<"vaultApps">, rootDirectory: string) => void;
  buildAddConvexHref?: (rootDirectory: string) => string;
  addConvexOnClick?: (appId: Id<"vaultApps">, rootDirectory: string) => void;
  connectCloudflareGithubRepoOnClick?: (workerId: Id<"vaultCloudflareWorkers">) => void;
  buildAddAppRootHref?: () => string;
  addAppRootOnClick?: () => void;
  cloudflareObservations: VaultProviderObservationState<VaultCloudflareWorkerObservation>;
  convexObservations: VaultProviderObservationState<VaultConvexProjectObservation>;
  githubRepositoryUrl: string;
  isConnectingCloudflareGithubRepo?: (workerId: Id<"vaultCloudflareWorkers">) => boolean;
  vault: VaultDashboardVault;
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
          connectCloudflareGithubRepoOnClick,
          convexObservations,
          isConnectingCloudflareGithubRepo,
          vault,
        }),
      })),
  };
}
