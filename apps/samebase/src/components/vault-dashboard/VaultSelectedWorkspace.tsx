import { useCallback, useState } from "react";
import { useAction } from "convex/react";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { toast } from "@/components/ui/use-toast";
import { useCloudflareBuildTokens } from "@/components/useCloudflareBuildTokens";
import {
  applyVaultDashboardProviderAddSearch,
  clearVaultDashboardQueryDialogSearch,
  useRootRouteSearch,
  type VaultDashboardQueryDialog,
} from "@/routeSearch/root";
import { applySearchPatch } from "@/routing/searchFlags";
import { VaultCloudflareDialog } from "./VaultCloudflareDialog";
import { VaultConvexDialog } from "./VaultConvexDialog";
import { VaultDeleteDialog } from "./VaultDeleteDialog";
import { VaultOverviewPage, type VaultOverviewPageKind } from "./VaultOverviewPage";
import {
  buildVaultRepositorySettingsState,
  readVaultProviderActionBlockReason,
  type VaultRepositorySettingsPendingAction,
} from "./vaultRepositorySettingsState";
import type { VaultWorkspaceSelected as VaultWorkspace } from "./vaultWorkspaceModel";

export function VaultSelectedWorkspace({
  developerToolsVisible,
  page,
  workspace,
}: {
  developerToolsVisible: boolean;
  page: VaultOverviewPageKind;
  workspace: VaultWorkspace;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const vaultDashboardDialogHistoryEntry = useLocation({
    select: (location) => location.state.vaultDashboardDialog,
  });
  const rootRouteSearch = useRootRouteSearch();
  const retryDeleteVault = useAction(api.vault.actions.retryDeleteVault);
  const retryInfrastructureProvisioning = useAction(
    api.vault.actions.retryInfrastructureProvisioning,
  );
  const detachCloudflareWorker = useAction(api.vault.cloudflare.detachWorker);
  const detachConvexProject = useAction(api.vault.convex.detachProject);
  const updateCloudflareWorkerName = useAction(api.vault.cloudflare.updateWorkerName);
  const updateCloudflareWorkerRootDirectory = useAction(
    api.vault.cloudflare.updateWorkerRootDirectory,
  );
  const rotateConvexDeployKeysForWorkersBuilds = useAction(
    api.vault.cloudflare.rotateConvexDeployKeysForWorkersBuilds,
  );
  const [providerActionInFlight, setProviderActionInFlight] =
    useState<VaultRepositorySettingsPendingAction | null>(null);
  const [isRetryingVaultAction, setIsRetryingVaultAction] = useState(false);
  const vault = workspace.vault;
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
    (addCloudflareWorkerModeActive || (page === "settings" && vault.cloudflareWorkers.length > 0)),
  );
  const cloudflareBuildTokensQuery = useCloudflareBuildTokens({
    enabled: shouldLoadCloudflareBuildTokens,
    organizationId: vault.organizationId,
  });
  const convexRepairProjectId =
    vaultDashboardDialogHistoryEntry?.dialog === "add-convex"
      ? (vaultDashboardDialogHistoryEntry.repairProjectId ?? null)
      : null;
  const cloudflareRepairWorkerId =
    vaultDashboardDialogHistoryEntry?.dialog === "add-cloudflare"
      ? (vaultDashboardDialogHistoryEntry.repairWorkerId ?? null)
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
  const providerActionBlockReason = readVaultProviderActionBlockReason(vault);

  const replaceVaultDashboardDialogRoute = useCallback(
    (dialog: VaultDashboardQueryDialog) => {
      void navigate({
        replace: true,
        resetScroll: false,
        search: (currentSearch) => clearVaultDashboardQueryDialogSearch(currentSearch, dialog),
        state: (currentState) => ({
          ...currentState,
          vaultDashboardDialog: undefined,
        }),
        to: ".",
      });
    },
    [navigate],
  );

  const closeVaultDashboardDialog = (dialog: VaultDashboardQueryDialog) => {
    if (vaultDashboardDialogHistoryEntry?.dialog === dialog && router.history.canGoBack()) {
      router.history.back();
      return;
    }
    replaceVaultDashboardDialogRoute(dialog);
  };

  const openProviderDialog = (
    dialog:
      | {
          provider: "cloudflare";
          repairWorkerId?: Id<"vaultCloudflareWorkers">;
        }
      | {
          provider: "convex";
          repairProjectId?: Id<"vaultConvexProjects">;
        },
  ) => {
    void navigate({
      resetScroll: false,
      to: ".",
      search: (currentSearch) =>
        applyVaultDashboardProviderAddSearch({
          currentSearch,
          provider: dialog.provider,
        }),
      state: (currentState) => ({
        ...currentState,
        vaultDashboardDialog:
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

  const handleRetryVaultDeletion = async (runId: Id<"workflow_vaultDeletion_runs">) => {
    if (isRetryingVaultAction) {
      return;
    }
    setIsRetryingVaultAction(true);
    try {
      await retryDeleteVault({ runId });
    } catch (error) {
      toast({
        title: "Could not retry vault deletion",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRetryingVaultAction(false);
    }
  };

  const handleRetryInfrastructureProvisioning = async () => {
    if (providerActionBlockReason || isRetryingVaultAction) {
      return;
    }
    setIsRetryingVaultAction(true);
    try {
      await retryInfrastructureProvisioning({ vaultId: vault._id });
    } catch (error) {
      toast({
        title: "Could not retry infrastructure setup",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRetryingVaultAction(false);
    }
  };

  const runProviderAction = async ({
    action,
    errorTitle,
    run,
  }: {
    action: VaultRepositorySettingsPendingAction;
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

  const handleDetachCloudflareWorker = (workerId: Id<"vaultCloudflareWorkers">) => {
    void runProviderAction({
      action: { kind: "detach_cloudflare_worker", workerId },
      errorTitle: "Could not remove Cloudflare attachment",
      run: () => detachCloudflareWorker({ vaultId: vault._id, workerId }),
    });
  };

  const handleDetachConvexProject = (convexProjectId: Id<"vaultConvexProjects">) => {
    void runProviderAction({
      action: { kind: "detach_convex_project", convexProjectId },
      errorTitle: "Could not remove Convex attachment",
      run: () => detachConvexProject({ vaultId: vault._id, convexProjectId }),
    });
  };

  const handleConfigureWorkersBuildsForGitHub = (workerId: Id<"vaultCloudflareWorkers">) => {
    openProviderDialog({ provider: "cloudflare", repairWorkerId: workerId });
  };

  const handleUpdateCloudflareWorkerName = (
    workerId: Id<"vaultCloudflareWorkers">,
    expectedWorkerName: string,
  ) => {
    void runProviderAction({
      action: { kind: "update_cloudflare_worker_name", workerId },
      errorTitle: "Could not update Cloudflare Worker name",
      run: () =>
        updateCloudflareWorkerName({
          expectedWorkerName,
          vaultId: vault._id,
          workerId,
        }),
    });
  };

  const handleUpdateCloudflareWorkerRootDirectory = (
    workerId: Id<"vaultCloudflareWorkers">,
    expectedRootDirectory: string,
  ) => {
    void runProviderAction({
      action: { kind: "update_cloudflare_worker_root_directory", workerId },
      errorTitle: "Could not update Cloudflare Worker root",
      run: () =>
        updateCloudflareWorkerRootDirectory({
          expectedRootDirectory,
          vaultId: vault._id,
          workerId,
        }),
    });
  };

  const handleRotateConvexDeployKeysForWorkersBuilds = (
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => {
    void runProviderAction({
      action: {
        kind: "rotate_convex_deploy_keys_for_workers_builds",
        workerId,
        convexProjectId,
      },
      errorTitle: "Could not rotate Convex deploy keys for Workers Builds",
      run: () =>
        rotateConvexDeployKeysForWorkersBuilds({
          convexProjectId,
          workerId,
          vaultId: vault._id,
        }),
    });
  };

  const settingsState = buildVaultRepositorySettingsState({
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
    vault,
    detachCloudflareWorkerOnClick: handleDetachCloudflareWorker,
    detachConvexProjectOnClick: handleDetachConvexProject,
    rotateConvexDeployKeysForWorkersBuildsOnClick: handleRotateConvexDeployKeysForWorkersBuilds,
    updateCloudflareWorkerNameOnClick: handleUpdateCloudflareWorkerName,
    updateCloudflareWorkerRootDirectoryOnClick: handleUpdateCloudflareWorkerRootDirectory,
  });

  return (
    <>
      <VaultOverviewPage
        developerToolsVisible={developerToolsVisible}
        isRetryingVaultAction={isRetryingVaultAction}
        page={page}
        settingsState={settingsState}
        workspace={workspace}
        onOpenDeleteDialog={() => {
          void navigate({
            resetScroll: false,
            to: ".",
            search: (currentSearch) => ({ ...currentSearch, delete: true }),
            state: (currentState) => ({
              ...currentState,
              vaultDashboardDialog: { dialog: "delete" },
            }),
          });
        }}
        onRetryInfrastructureProvisioning={() => {
          void handleRetryInfrastructureProvisioning();
        }}
        onRetryVaultDeletion={() => {
          if (vault.deletion.state === "delete_failed") {
            void handleRetryVaultDeletion(vault.deletion.runId);
          }
        }}
      />
      {deleteModeActive ? (
        <VaultDeleteDialog
          key={vault._id}
          vault={vault}
          onClose={() => {
            closeVaultDashboardDialog("delete");
          }}
          onDeleted={() => {
            void navigate({
              replace: true,
              search: (currentSearch) =>
                applySearchPatch(currentSearch, {
                  "add-cloudflare": null,
                  "add-convex": null,
                  delete: null,
                }),
              state: (currentState) => ({
                ...currentState,
                vaultDashboardDialog: undefined,
              }),
              to: "/vault",
            });
          }}
        />
      ) : null}
      {addConvexModeActive ? (
        <VaultConvexDialog
          blockedReason={providerActionBlockReason}
          key={`${vault._id}:${convexRepairProjectId ?? "add"}`}
          onClose={() => {
            closeVaultDashboardDialog("add-convex");
          }}
          onSaved={() => {
            closeVaultDashboardDialog("add-convex");
          }}
          repairProjectId={convexRepairProjectId}
          vault={vault}
        />
      ) : null}
      {addCloudflareWorkerModeActive ? (
        <VaultCloudflareDialog
          blockedReason={providerActionBlockReason}
          key={`${vault._id}:${cloudflareRepairWorkerId ?? "add"}`}
          onClose={() => {
            closeVaultDashboardDialog("add-cloudflare");
          }}
          repairBuildTokenUuid={cloudflareRepairBuildTokenUuid}
          repairWorkerId={cloudflareRepairWorkerId}
          vault={vault}
        />
      ) : null}
    </>
  );
}
