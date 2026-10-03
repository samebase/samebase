import { useCallback, useState } from "react";
import { useAction } from "convex/react";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { toast } from "@/components/ui/use-toast";
import { useCloudflareBuildTokens } from "@/repository/setup/useCloudflareBuildTokens";
import {
  applyRepositoryDashboardProviderAddSearch,
  clearRepositoryDashboardQueryDialogSearch,
  useRootRouteSearch,
  type RepositoryDashboardQueryDialog,
  type RootRouteSearch,
} from "@/routeSearch/root";
import { applySearchPatch } from "@/routing/searchFlags";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { RepositoryCloudflareDialog } from "./RepositoryCloudflareDialog";
import { RepositoryConvexDialog } from "./RepositoryConvexDialog";
import { RepositoryDeleteDialog } from "./RepositoryDeleteDialog";
import { RepositoryOverviewPage, type RepositoryOverviewPageKind } from "./RepositoryOverviewPage";
import {
  buildRepositorySettingsState,
  readRepositoryProviderActionBlockReason,
  type RepositorySettingsPendingAction,
} from "./repositorySettingsState";
import type { RepositoryWorkspaceSelected as RepositoryWorkspace } from "./repositoryWorkspaceModel";

export function RepositorySelectedWorkspace({
  developerToolsVisible,
  page,
  workspace,
}: {
  developerToolsVisible: boolean;
  page: RepositoryOverviewPageKind;
  workspace: RepositoryWorkspace;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const repositoryDashboardDialogHistoryEntry = useLocation({
    select: (location) => location.state.repositoryDashboardDialog,
  });
  const rootRouteSearch = useRootRouteSearch();
  const retryDeleteRepository = useAction(api.repository.actions.retryDeleteRepository);
  const retryProviderSetup = useAction(api.repository.retryProviderSetup);
  const detachCloudflareWorker = useAction(api.repository.cloudflare.detachWorker);
  const detachConvexProject = useAction(api.repository.convex.detachProject);
  const updateCloudflareWorkerName = useAction(api.repository.cloudflare.updateWorkerName);
  const updateCloudflareWorkerRootDirectory = useAction(
    api.repository.cloudflare.updateWorkerRootDirectory,
  );
  const rotateConvexDeployKeys = useAction(api.repository.cloudflare.rotateConvexDeployKeys);
  const [providerActionInFlight, setProviderActionInFlight] =
    useState<RepositorySettingsPendingAction | null>(null);
  const [isRetryingRepositoryAction, setIsRetryingRepositoryAction] = useState(false);
  const repository = workspace.repository;
  const deleteModeActive = rootRouteSearch.delete === true;
  const addConvexModeActive = rootRouteSearch["add-convex"] === true;
  const addCloudflareWorkerModeActive = rootRouteSearch["add-cloudflare"] === true;
  const cloudflareConnection =
    workspace.cloudflareConnection.state === "ready" &&
    workspace.cloudflareConnection.connection.state === "connected"
      ? workspace.cloudflareConnection.connection
      : null;
  const shouldLoadCloudflareBuildTokens = Boolean(
    cloudflareConnection &&
    (addCloudflareWorkerModeActive ||
      (page === "settings" && repository.cloudflareWorkers.length > 0)),
  );
  const cloudflareBuildTokensQuery = useCloudflareBuildTokens({
    enabled: shouldLoadCloudflareBuildTokens,
    organizationId: repository.organizationId,
  });
  const convexRepairProjectId =
    repositoryDashboardDialogHistoryEntry?.dialog === "add-convex"
      ? (repositoryDashboardDialogHistoryEntry.repairProjectId ?? null)
      : null;
  const cloudflareRepairWorkerId =
    repositoryDashboardDialogHistoryEntry?.dialog === "add-cloudflare"
      ? (repositoryDashboardDialogHistoryEntry.repairWorkerId ?? null)
      : null;
  const cloudflareRepairBuildsObservation =
    cloudflareRepairWorkerId && workspace.cloudflareObservations.builds.state === "loaded"
      ? (workspace.cloudflareObservations.builds.observations.find(
          (observation) => observation.workerId === cloudflareRepairWorkerId,
        ) ?? null)
      : null;
  const cloudflareRepairBuildTokenUuid =
    cloudflareRepairBuildsObservation?.state === "available" &&
    cloudflareRepairBuildsObservation.builds.state === "connected" &&
    cloudflareRepairBuildsObservation.builds.productionBuildTokenUuid ===
      cloudflareRepairBuildsObservation.builds.previewBuildTokenUuid
      ? cloudflareRepairBuildsObservation.builds.productionBuildTokenUuid
      : null;
  const providerActionBlockReason = readRepositoryProviderActionBlockReason(repository);

  const replaceRepositoryDashboardDialogRoute = useCallback(
    (dialog: RepositoryDashboardQueryDialog) => {
      void navigate({
        replace: true,
        resetScroll: false,
        search: (currentSearch: RootRouteSearch) =>
          clearRepositoryDashboardQueryDialogSearch(currentSearch, dialog),
        state: (currentState) => ({
          ...currentState,
          repositoryDashboardDialog: undefined,
        }),
        to: ".",
      });
    },
    [navigate],
  );

  const closeRepositoryDashboardDialog = (dialog: RepositoryDashboardQueryDialog) => {
    if (repositoryDashboardDialogHistoryEntry?.dialog === dialog && router.history.canGoBack()) {
      router.history.back();
      return;
    }
    replaceRepositoryDashboardDialogRoute(dialog);
  };

  const openProviderDialog = (
    dialog:
      | {
          provider: "cloudflare";
          repairWorkerId?: Id<"repositoryCloudflareWorkers">;
        }
      | {
          provider: "convex";
          repairProjectId?: Id<"repositoryConvexProjects">;
        },
  ) => {
    void navigate({
      resetScroll: false,
      to: ".",
      search: (currentSearch: RootRouteSearch) =>
        applyRepositoryDashboardProviderAddSearch({
          currentSearch,
          provider: dialog.provider,
        }),
      state: (currentState) => ({
        ...currentState,
        repositoryDashboardDialog:
          dialog.provider === "convex"
            ? {
                dialog: "add-convex",
                repairProjectId: dialog.repairProjectId,
              }
            : {
                dialog: "add-cloudflare",
                repairWorkerId: dialog.repairWorkerId,
              },
      }),
    });
  };

  const handleRetryRepositoryDeletion = async (runId: Id<"workflow_repositoryDeletion_runs">) => {
    if (isRetryingRepositoryAction) {
      return;
    }
    setIsRetryingRepositoryAction(true);
    try {
      await retryDeleteRepository({ runId });
    } catch (error) {
      toast({
        title: "Could not retry removal from Samebase",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRetryingRepositoryAction(false);
    }
  };

  const handleRetryInfrastructureProvisioning = async () => {
    if (providerActionBlockReason || isRetryingRepositoryAction) {
      return;
    }
    setIsRetryingRepositoryAction(true);
    try {
      await retryProviderSetup({ repositoryId: repository.repositoryId });
    } catch (error) {
      toast({
        title: "Could not retry infrastructure setup",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRetryingRepositoryAction(false);
    }
  };

  const runProviderAction = async ({
    action,
    errorTitle,
    run,
  }: {
    action: RepositorySettingsPendingAction;
    errorTitle: string;
    run: () => Promise<unknown>;
  }) => {
    if (providerActionBlockReason || providerActionInFlight) {
      return;
    }
    setProviderActionInFlight(action);
    try {
      await run();
    } catch (error) {
      toast({
        title: errorTitle,
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setProviderActionInFlight(null);
    }
  };

  const handleDetachCloudflareWorker = (workerId: Id<"repositoryCloudflareWorkers">) => {
    void runProviderAction({
      action: { kind: "detach_cloudflare_worker", workerId },
      errorTitle: "Could not remove Cloudflare attachment",
      run: () => detachCloudflareWorker({ repositoryId: repository.repositoryId, workerId }),
    });
  };

  const handleDetachConvexProject = (convexProjectId: Id<"repositoryConvexProjects">) => {
    void runProviderAction({
      action: { kind: "detach_convex_project", convexProjectId },
      errorTitle: "Could not remove Convex attachment",
      run: () => detachConvexProject({ repositoryId: repository.repositoryId, convexProjectId }),
    });
  };

  const handleConfigureWorkersBuildsForGitHub = (workerId: Id<"repositoryCloudflareWorkers">) => {
    openProviderDialog({ provider: "cloudflare", repairWorkerId: workerId });
  };

  const handleUpdateCloudflareWorkerName = (
    workerId: Id<"repositoryCloudflareWorkers">,
    expectedWorkerName: string,
  ) => {
    void runProviderAction({
      action: { kind: "update_cloudflare_worker_name", workerId },
      errorTitle: "Could not update Cloudflare Worker name",
      run: () =>
        updateCloudflareWorkerName({
          expectedWorkerName,
          repositoryId: repository.repositoryId,
          workerId,
        }),
    });
  };

  const handleUpdateCloudflareWorkerRootDirectory = (
    workerId: Id<"repositoryCloudflareWorkers">,
    expectedRootDirectory: string,
  ) => {
    void runProviderAction({
      action: { kind: "update_cloudflare_worker_root_directory", workerId },
      errorTitle: "Could not update Cloudflare Worker root",
      run: () =>
        updateCloudflareWorkerRootDirectory({
          expectedRootDirectory,
          repositoryId: repository.repositoryId,
          workerId,
        }),
    });
  };

  const handleRotateConvexDeployKeysForWorkersBuilds = (
    workerId: Id<"repositoryCloudflareWorkers">,
    convexProjectId: Id<"repositoryConvexProjects">,
  ) => {
    void runProviderAction({
      action: {
        kind: "rotate_convex_deploy_keys_for_workers_builds",
        workerId,
        convexProjectId,
      },
      errorTitle: "Could not rotate Convex deploy keys for Workers Builds",
      run: () =>
        rotateConvexDeployKeys({
          convexProjectId,
          workerId,
          repositoryId: repository.repositoryId,
        }),
    });
  };

  const settingsState = buildRepositorySettingsState({
    addCloudflareWorkerOnClick: () => openProviderDialog({ provider: "cloudflare" }),
    addConvexOnClick: () => openProviderDialog({ provider: "convex" }),
    cloudflareAccount:
      workspace.cloudflareConnection.state === "ready" &&
      (workspace.cloudflareConnection.connection.state === "connected" ||
        workspace.cloudflareConnection.connection.state === "disconnected")
        ? {
            accountId: workspace.cloudflareConnection.connection.accountId,
            accountName: workspace.cloudflareConnection.connection.accountName,
          }
        : undefined,
    cloudflareBuildTokens: !shouldLoadCloudflareBuildTokens
      ? { state: "not_available" }
      : cloudflareBuildTokensQuery.isFetching
        ? { state: "loading" }
        : cloudflareBuildTokensQuery.error
          ? {
              state: "failed",
              reload: () => {
                void cloudflareBuildTokensQuery.refetch();
              },
            }
          : cloudflareBuildTokensQuery.data
            ? { state: "loaded", tokens: cloudflareBuildTokensQuery.data.tokens }
            : { state: "loading" },
    configureWorkersBuildsForGitHubOnClick: handleConfigureWorkersBuildsForGitHub,
    changeConvexProjectConfigPathOnClick: (convexProjectId) =>
      openProviderDialog({
        provider: "convex",
        repairProjectId: convexProjectId,
      }),
    cloudflareObservations: workspace.cloudflareObservations,
    convexObservations: workspace.convexObservations,
    pendingAction: providerActionInFlight,
    repository,
    detachCloudflareWorkerOnClick: handleDetachCloudflareWorker,
    detachConvexProjectOnClick: handleDetachConvexProject,
    rotateConvexDeployKeysForWorkersBuildsOnClick: handleRotateConvexDeployKeysForWorkersBuilds,
    updateCloudflareWorkerNameOnClick: handleUpdateCloudflareWorkerName,
    updateCloudflareWorkerRootDirectoryOnClick: handleUpdateCloudflareWorkerRootDirectory,
  });

  return (
    <>
      <RepositoryOverviewPage
        developerToolsVisible={developerToolsVisible}
        isRetryingRepositoryAction={isRetryingRepositoryAction}
        page={page}
        settingsState={settingsState}
        workspace={workspace}
        onOpenDeleteDialog={() => {
          void navigate({
            resetScroll: false,
            to: ".",
            search: (currentSearch: RootRouteSearch) =>
              applySearchPatch(currentSearch, { delete: true }),
            state: (currentState) => ({
              ...currentState,
              repositoryDashboardDialog: { dialog: "delete" },
            }),
          });
        }}
        onRetryInfrastructureProvisioning={() => {
          void handleRetryInfrastructureProvisioning();
        }}
        onRetryRepositoryDeletion={() => {
          if (repository.deletion.state === "delete_failed") {
            void handleRetryRepositoryDeletion(repository.deletion.runId);
          }
        }}
      />
      {deleteModeActive ? (
        <RepositoryDeleteDialog
          key={repository.repositoryId}
          repository={repository}
          onClose={() => {
            closeRepositoryDashboardDialog("delete");
          }}
          onDeleted={() => {
            void navigate({
              replace: true,
              search: (currentSearch: RootRouteSearch) =>
                applySearchPatch(currentSearch, {
                  "add-cloudflare": null,
                  "add-convex": null,
                  delete: null,
                }),
              state: (currentState) => ({
                ...currentState,
                repositoryDashboardDialog: undefined,
              }),
              to: DASHBOARD_ROUTE,
            });
          }}
        />
      ) : null}
      {addConvexModeActive ? (
        <RepositoryConvexDialog
          blockedReason={providerActionBlockReason}
          key={`${repository.repositoryId}:${convexRepairProjectId ?? "add"}`}
          onClose={() => {
            closeRepositoryDashboardDialog("add-convex");
          }}
          onSaved={() => {
            closeRepositoryDashboardDialog("add-convex");
          }}
          repairProjectId={convexRepairProjectId}
          repository={repository}
        />
      ) : null}
      {addCloudflareWorkerModeActive ? (
        <RepositoryCloudflareDialog
          blockedReason={providerActionBlockReason}
          key={`${repository.repositoryId}:${cloudflareRepairWorkerId ?? "add"}`}
          onClose={() => {
            closeRepositoryDashboardDialog("add-cloudflare");
          }}
          repairBuildTokenUuid={cloudflareRepairBuildTokenUuid}
          repairWorkerId={cloudflareRepairWorkerId}
          repository={repository}
        />
      ) : null}
    </>
  );
}
