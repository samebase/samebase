import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { tryParseRepositoryFullName } from "../../../shared/repoName";
import {
  clearVaultDashboardQueryDialogSearch,
  useRootRouteSearch,
  type VaultDashboardQueryDialog,
} from "@/routeSearch/root";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { VaultOverviewLoadingPage, type VaultOverviewPageKind } from "./VaultOverviewPage";
import { VaultOverviewSidebar, VaultOverviewSidebarLoading } from "./VaultOverviewSidebar";
import {
  VaultOverviewVaultListHeader,
  VaultOverviewVaultPickerPane,
} from "./VaultOverviewVaultPickerPane";
import { VaultSelectedWorkspace } from "./VaultSelectedWorkspace";
import { useVaultWorkspaceModel } from "./useVaultWorkspaceModel";

const DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM = "dev";

export type VaultDashboardProps = {
  page?: VaultOverviewPageKind;
  selectedRepositoryFullName?: string;
};

type VaultDashboardDialogAvailability = {
  canDeleteVault: boolean;
  canManageProviderAttachments: boolean;
} | null;

export function VaultDashboard({
  page = "overview",
  selectedRepositoryFullName,
}: VaultDashboardProps) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const rootRouteSearch = useRootRouteSearch();
  const developerToolsVisible = rootRouteSearch[DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM] === true;
  const { commands: workspaceCommands, model: workspaceModel } = useVaultWorkspaceModel(
    selectedRepositoryFullName,
  );
  const dialogAvailability: VaultDashboardDialogAvailability =
    workspaceModel.state === "loading"
      ? null
      : workspaceModel.selection.state === "selected"
        ? {
            canDeleteVault:
              workspaceModel.selection.workspace.vault.deletion.state === "not_deleting" &&
              workspaceModel.selection.workspace.vault.deletion.deleteAction.state === "available",
            canManageProviderAttachments:
              workspaceModel.selection.workspace.vault.hasConnectedGitHubRepository &&
              workspaceModel.selection.workspace.vault.deletion.state === "not_deleting",
          }
        : {
            canDeleteVault: false,
            canManageProviderAttachments: false,
          };
  let unavailableDialog: VaultDashboardQueryDialog | null = null;
  if (dialogAvailability !== null) {
    if (rootRouteSearch.delete === true && !dialogAvailability.canDeleteVault) {
      unavailableDialog = "delete";
    } else if (
      rootRouteSearch["add-convex"] === true &&
      !dialogAvailability.canManageProviderAttachments
    ) {
      unavailableDialog = "add-convex";
    } else if (
      rootRouteSearch["add-cloudflare"] === true &&
      !dialogAvailability.canManageProviderAttachments
    ) {
      unavailableDialog = "add-cloudflare";
    }
  }

  useEffect(() => {
    if (!unavailableDialog) {
      return;
    }
    void navigate({
      hash: true,
      replace: true,
      resetScroll: false,
      search: (currentSearch) =>
        clearVaultDashboardQueryDialogSearch(currentSearch, unavailableDialog),
      state: (currentState) => ({
        ...currentState,
        vaultDashboardDialog: undefined,
      }),
      to: pathname,
    });
  }, [navigate, pathname, unavailableDialog]);

  if (workspaceModel.state === "loading") {
    if (!selectedRepositoryFullName) {
      return <VaultOverviewVaultPickerPane sidebarSummaries={{ state: "loading" }} vaults={null} />;
    }
    const loadingRepository = tryParseRepositoryFullName(selectedRepositoryFullName);
    if (!loadingRepository) {
      return null;
    }
    return (
      <AppWorkspaceRouteChrome
        left={{
          header: <VaultOverviewVaultListHeader />,
          content: <VaultOverviewSidebarLoading />,
        }}
      >
        <VaultOverviewLoadingPage
          owner={loadingRepository.owner}
          page={page}
          repoName={loadingRepository.name}
        />
      </AppWorkspaceRouteChrome>
    );
  }

  const selectedWorkspace =
    workspaceModel.selection.state === "selected" ? workspaceModel.selection.workspace : null;
  const isVaultRootRoute = workspaceModel.selection.state === "root";
  const leftPane = {
    header: <VaultOverviewVaultListHeader />,
    content: (
      <VaultOverviewSidebar
        page={page}
        selectedVaultId={selectedWorkspace?.vault._id ?? null}
        sidebarSummaries={workspaceModel.sidebarSummaries}
        vaults={workspaceModel.vaults}
        workspace={selectedWorkspace}
      />
    ),
  };
  const dashboardBody = (() => {
    switch (workspaceModel.selection.state) {
      case "root":
        return (
          <VaultOverviewVaultPickerPane
            sidebarSummaries={workspaceModel.sidebarSummaries}
            vaults={workspaceModel.vaults}
          />
        );
      case "missing":
        return (
          <div className="p-4 text-sm text-muted-foreground">
            Vault not found: {workspaceModel.selection.repositoryFullName}
          </div>
        );
      case "selected":
        return (
          <VaultSelectedWorkspace
            key={workspaceModel.selection.workspace.vault._id}
            developerToolsVisible={developerToolsVisible}
            invalidateExternalData={workspaceCommands.invalidateExternalData}
            page={page}
            workspace={workspaceModel.selection.workspace}
          />
        );
    }
    workspaceModel.selection satisfies never;
    return null;
  })();

  return (
    <AppWorkspaceRouteChrome left={isVaultRootRoute ? null : leftPane}>
      {dashboardBody}
    </AppWorkspaceRouteChrome>
  );
}
