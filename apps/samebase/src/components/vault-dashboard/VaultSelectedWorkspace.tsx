import { useCallback, useEffect, useState } from "react";
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
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import { VaultCloudflareDialog } from "./VaultCloudflareDialog";
import { VaultConvexDialog } from "./VaultConvexDialog";
import { VaultDeleteDialog } from "./VaultDeleteDialog";
import { VaultOverviewPage, type VaultOverviewPageKind } from "./VaultOverviewPage";
import { buildVaultDashboardResourceRailState } from "./vaultResourceRailState";
import type { VaultWorkspaceSelected as VaultWorkspace } from "./vaultWorkspaceModel";

type ProviderActionInFlight =
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

type ConvexCodeLocationRepairTarget = {
  convexProjectId: Id<"vaultConvexProjects">;
};

type CloudflareBuildsRepairTarget = {
  workerId: Id<"vaultCloudflareWorkers">;
};

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

function buildVaultDashboardProviderAddHref({
  dashboardRoutePathname,
  provider,
  rootRouteSearch,
}: {
  dashboardRoutePathname: string;
  provider: "cloudflare" | "convex";
  rootRouteSearch: RootRouteSearch;
}): string {
  return buildPathWithTanStackSearch({
    pathname: dashboardRoutePathname,
    search: applyVaultDashboardProviderAddSearch({
      currentSearch: rootRouteSearch,
      provider,
    }),
  });
}

export function VaultSelectedWorkspace({
  developerToolsVisible,
  page,
  workspace,
  invalidateProviderObservations,
}: {
  developerToolsVisible: boolean;
  page: VaultOverviewPageKind;
  workspace: VaultWorkspace;
  invalidateProviderObservations: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const vaultDashboardDialogHistoryEntry = useLocation({
    select: (location) => location.state.vaultDashboardDialog,
  });
  const dashboardRoutePathname = useLocation({
    select: (location) => location.pathname,
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
    useState<ProviderActionInFlight | null>(null);
  const [convexCodeLocationRepairTarget, setConvexCodeLocationRepairTarget] =
    useState<ConvexCodeLocationRepairTarget | null>(null);
  const [cloudflareBuildsRepairTarget, setCloudflareBuildsRepairTarget] =
    useState<CloudflareBuildsRepairTarget | null>(null);
  const [isRetryingVaultAction, setIsRetryingVaultAction] = useState(false);
  const vault = workspace.vault;
  const deleteModeActive = rootRouteSearch.delete === true;
  const addConvexModeActive = rootRouteSearch["add-convex"] === true;
  const addCloudflareWorkerModeActive = rootRouteSearch["add-cloudflare"] === true;
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
    if (vaultDashboardDialogHistoryEntry === dialog && router.history.canGoBack()) {
      router.history.back();
      return;
    }
    replaceVaultDashboardDialogRoute(dialog);
  };

  useEffect(() => {
    if (deleteModeActive && !canDelete) {
      replaceVaultDashboardDialogRoute("delete");
    } else if (addConvexModeActive && !canManageProviderAttachments) {
      replaceVaultDashboardDialogRoute("add-convex");
    } else if (addCloudflareWorkerModeActive && !canManageProviderAttachments) {
      replaceVaultDashboardDialogRoute("add-cloudflare");
    }
  }, [
    addCloudflareWorkerModeActive,
    addConvexModeActive,
    canDelete,
    canManageProviderAttachments,
    deleteModeActive,
    replaceVaultDashboardDialogRoute,
  ]);

  const openProviderDialog = (provider: "cloudflare" | "convex") => {
    void navigate({
      resetScroll: false,
      to: ".",
      search: (currentSearch) =>
        applyVaultDashboardProviderAddSearch({
          currentSearch,
          provider,
        }),
      state: (currentState) => ({
        ...currentState,
        vaultDashboardDialog: provider === "convex" ? "add-convex" : "add-cloudflare",
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
    invalidate,
    run,
  }: {
    action: ProviderActionInFlight;
    errorTitle: string;
    invalidate: boolean;
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
      if (invalidate) {
        void invalidateProviderObservations();
      }
    }
  };

  const handleReconcileConvexProjectTeam = (convexProjectId: Id<"vaultConvexProjects">) => {
    void runProviderAction({
      action: { kind: "reconcile_convex_project_team", convexProjectId },
      errorTitle: "Could not update the Convex team",
      invalidate: true,
      run: () => reconcileConvexProjectTeam({ vaultId: vault._id, convexProjectId }),
    });
  };

  const handleDetachCloudflareWorker = (workerId: Id<"vaultCloudflareWorkers">) => {
    void runProviderAction({
      action: { kind: "detach_cloudflare_worker", workerId },
      errorTitle: "Could not remove Cloudflare attachment",
      invalidate: false,
      run: () => detachCloudflareWorker({ vaultId: vault._id, workerId }),
    });
  };

  const handleDetachConvexProject = (convexProjectId: Id<"vaultConvexProjects">) => {
    void runProviderAction({
      action: { kind: "detach_convex_project", convexProjectId },
      errorTitle: "Could not remove Convex attachment",
      invalidate: false,
      run: () => detachConvexProject({ vaultId: vault._id, convexProjectId }),
    });
  };

  const handleConfigureWorkersBuildsForGitHub = (
    workerId: Id<"vaultCloudflareWorkers">,
    rootDirectory: string | undefined,
  ) => {
    if (!rootDirectory) {
      setCloudflareBuildsRepairTarget({ workerId });
      openProviderDialog("cloudflare");
      return;
    }
    void runProviderAction({
      action: { kind: "configure_workers_builds_for_github", workerId },
      errorTitle: "Could not configure Workers Builds for GitHub",
      invalidate: true,
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
      invalidate: true,
      run: () =>
        rotateConvexDeployKeysForWorkersBuilds({
          convexProjectId,
          workerId,
          vaultId: vault._id,
        }),
    });
  };

  const resourceRailState = buildVaultDashboardResourceRailState({
    buildAddCloudflareWorkerHref: canManageProviderAttachments
      ? () =>
          buildVaultDashboardProviderAddHref({
            dashboardRoutePathname,
            provider: "cloudflare",
            rootRouteSearch,
          })
      : undefined,
    addCloudflareWorkerOnClick: canManageProviderAttachments
      ? () => openProviderDialog("cloudflare")
      : undefined,
    buildAddConvexHref: canManageProviderAttachments
      ? () =>
          buildVaultDashboardProviderAddHref({
            dashboardRoutePathname,
            provider: "convex",
            rootRouteSearch,
          })
      : undefined,
    addConvexOnClick: canManageProviderAttachments ? () => openProviderDialog("convex") : undefined,
    configureWorkersBuildsForGitHubOnClick: canManageProviderAttachments
      ? handleConfigureWorkersBuildsForGitHub
      : undefined,
    changeConvexProjectConfigPathOnClick: canManageProviderAttachments
      ? (convexProjectId) => {
          setConvexCodeLocationRepairTarget({ convexProjectId });
          openProviderDialog("convex");
        }
      : undefined,
    cloudflareObservations: workspace.cloudflareObservations,
    convexObservations: workspace.convexObservations,
    isConfiguringWorkersBuildsForGitHub: (workerId) =>
      providerActionInFlight?.kind === "configure_workers_builds_for_github" &&
      providerActionInFlight.workerId === workerId,
    isDetachingCloudflareWorker: (workerId) =>
      providerActionInFlight?.kind === "detach_cloudflare_worker" &&
      providerActionInFlight.workerId === workerId,
    isDetachingConvexProject: (convexProjectId) =>
      providerActionInFlight?.kind === "detach_convex_project" &&
      providerActionInFlight.convexProjectId === convexProjectId,
    isReconcilingConvexProjectTeam: (convexProjectId) =>
      providerActionInFlight?.kind === "reconcile_convex_project_team" &&
      providerActionInFlight.convexProjectId === convexProjectId,
    isRotatingConvexDeployKeysForWorkersBuilds: (workerId, convexProjectId) =>
      providerActionInFlight?.kind === "rotate_convex_deploy_keys_for_workers_builds" &&
      providerActionInFlight.workerId === workerId &&
      providerActionInFlight.convexProjectId === convexProjectId,
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
        resourceRailState={resourceRailState}
        workspace={workspace}
        onOpenDeleteDialog={() => {
          void navigate({
            resetScroll: false,
            to: ".",
            search: (currentSearch) => ({ ...currentSearch, delete: true }),
            state: (currentState) => ({
              ...currentState,
              vaultDashboardDialog: "delete",
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
          key={`${vault._id}:${convexCodeLocationRepairTarget?.convexProjectId ?? "add"}`}
          onClose={() => {
            setConvexCodeLocationRepairTarget(null);
            closeVaultDashboardDialog("add-convex");
          }}
          onSaved={() => {
            setConvexCodeLocationRepairTarget(null);
            void invalidateProviderObservations();
            closeVaultDashboardDialog("add-convex");
          }}
          repairProjectId={convexCodeLocationRepairTarget?.convexProjectId ?? null}
          vault={vault}
        />
      ) : null}
      {addCloudflareWorkerModeActive && canManageProviderAttachments ? (
        <VaultCloudflareDialog
          key={`${vault._id}:${cloudflareBuildsRepairTarget?.workerId ?? "add"}`}
          connectedAccountId={connectedAccountId}
          onClose={() => {
            setCloudflareBuildsRepairTarget(null);
            closeVaultDashboardDialog("add-cloudflare");
          }}
          onSaved={() => {
            setCloudflareBuildsRepairTarget(null);
            void invalidateProviderObservations();
          }}
          repairWorkerId={cloudflareBuildsRepairTarget?.workerId ?? null}
          vault={vault}
        />
      ) : null}
    </>
  );
}
