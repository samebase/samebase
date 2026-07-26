import { useCallback, useState } from "react";
import { useAction } from "convex/react";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { toast } from "@/components/ui/use-toast";
import {
  clearVaultDashboardQueryDialogSearch,
  type RootRouteSearch,
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
  type VaultRepositorySettingsPendingAction,
} from "./vaultRepositorySettingsState";
import type { VaultWorkspaceSelected as VaultWorkspace } from "./vaultWorkspaceModel";

function applyVaultDashboardProviderAddSearch({
  currentSearch,
  provider,
}: {
  currentSearch: RootRouteSearch;
  provider: "cloudflare" | "convex";
}): RootRouteSearch {
  return applySearchPatch(currentSearch, {
    "add-cloudflare": provider === "cloudflare" ? true : null,
    "add-convex": provider === "convex" ? true : null,
    delete: null,
  });
}

export function VaultSelectedWorkspace({
  developerToolsVisible,
  page,
  workspace,
  invalidateExternalData,
}: {
  developerToolsVisible: boolean;
  page: VaultOverviewPageKind;
  workspace: VaultWorkspace;
  invalidateExternalData: () => Promise<void>;
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
  const reconcileConvexProjectTeam = useAction(api.vault.convex.reconcileProjectTeam);
  const detachCloudflareWorker = useAction(api.vault.cloudflare.detachWorker);
  const detachConvexProject = useAction(api.vault.convex.detachProject);
  const configureWorkersBuildsForGitHub = useAction(
    api.vault.cloudflare.configureWorkersBuildsForGitHub,
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
  const convexRepairProjectId =
    vaultDashboardDialogHistoryEntry?.dialog === "add-convex"
      ? (vaultDashboardDialogHistoryEntry.repairProjectId ?? null)
      : null;
  const cloudflareRepairWorkerId =
    vaultDashboardDialogHistoryEntry?.dialog === "add-cloudflare"
      ? (vaultDashboardDialogHistoryEntry.repairWorkerId ?? null)
      : null;
  const canDelete =
    vault.deletion.state === "not_deleting" && vault.deletion.deleteAction.state === "available";
  const canManageProviderAttachments =
    vault.hasConnectedGitHubRepository && vault.deletion.state === "not_deleting";

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
    if (isRetryingVaultAction) {
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
    if (providerActionInFlight) {
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
      void invalidateExternalData();
    }
  };

  const handleReconcileConvexProjectTeam = (convexProjectId: Id<"vaultConvexProjects">) => {
    void runProviderAction({
      action: { kind: "reconcile_convex_project_team", convexProjectId },
      errorTitle: "Could not update the Convex team",
      run: () => reconcileConvexProjectTeam({ vaultId: vault._id, convexProjectId }),
    });
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

  const handleConfigureWorkersBuildsForGitHub = (
    workerId: Id<"vaultCloudflareWorkers">,
    rootDirectory: string | undefined,
  ) => {
    if (!rootDirectory) {
      openProviderDialog({ provider: "cloudflare", repairWorkerId: workerId });
      return;
    }
    void runProviderAction({
      action: { kind: "configure_workers_builds_for_github", workerId },
      errorTitle: "Could not configure Workers Builds for GitHub",
      run: () =>
        configureWorkersBuildsForGitHub({
          workerId,
          vaultId: vault._id,
          rootDirectory,
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
    addCloudflareWorkerOnClick: canManageProviderAttachments
      ? () => openProviderDialog({ provider: "cloudflare" })
      : undefined,
    addConvexOnClick: canManageProviderAttachments
      ? () => openProviderDialog({ provider: "convex" })
      : undefined,
    connectedCloudflareAccount:
      workspace.cloudflareConnection.state === "ready" &&
      workspace.cloudflareConnection.connection.connected === true &&
      workspace.cloudflareConnection.connection.accountId
        ? {
            accountId: workspace.cloudflareConnection.connection.accountId,
            accountName: workspace.cloudflareConnection.connection.accountName,
          }
        : undefined,
    configureWorkersBuildsForGitHubOnClick: canManageProviderAttachments
      ? handleConfigureWorkersBuildsForGitHub
      : undefined,
    changeConvexProjectConfigPathOnClick: canManageProviderAttachments
      ? (convexProjectId) =>
          openProviderDialog({
            provider: "convex",
            repairProjectId: convexProjectId,
          })
      : undefined,
    cloudflareObservations: workspace.cloudflareObservations,
    convexObservations: workspace.convexObservations,
    pendingAction: providerActionInFlight,
    vault,
    detachCloudflareWorkerOnClick: canManageProviderAttachments
      ? handleDetachCloudflareWorker
      : undefined,
    detachConvexProjectOnClick: canManageProviderAttachments
      ? handleDetachConvexProject
      : undefined,
    reconcileConvexProjectTeamOnClick: canManageProviderAttachments
      ? handleReconcileConvexProjectTeam
      : undefined,
    rotateConvexDeployKeysForWorkersBuildsOnClick: canManageProviderAttachments
      ? handleRotateConvexDeployKeysForWorkersBuilds
      : undefined,
  });

  const connectedAccountId =
    workspace.cloudflareConnection.state === "ready" &&
    workspace.cloudflareConnection.connection.connected === true
      ? workspace.cloudflareConnection.connection.accountId
      : undefined;

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
      {deleteModeActive && canDelete ? (
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
      {addConvexModeActive && canManageProviderAttachments ? (
        <VaultConvexDialog
          key={`${vault._id}:${convexRepairProjectId ?? "add"}`}
          onClose={() => {
            closeVaultDashboardDialog("add-convex");
          }}
          onSaved={() => {
            void invalidateExternalData();
            closeVaultDashboardDialog("add-convex");
          }}
          repairProjectId={convexRepairProjectId}
          vault={vault}
        />
      ) : null}
      {addCloudflareWorkerModeActive && canManageProviderAttachments ? (
        <VaultCloudflareDialog
          key={`${vault._id}:${cloudflareRepairWorkerId ?? "add"}`}
          connectedAccountId={connectedAccountId}
          onClose={() => {
            closeVaultDashboardDialog("add-cloudflare");
          }}
          onSaved={() => {
            void invalidateExternalData();
          }}
          repairWorkerId={cloudflareRepairWorkerId}
          vault={vault}
        />
      ) : null}
    </>
  );
}
