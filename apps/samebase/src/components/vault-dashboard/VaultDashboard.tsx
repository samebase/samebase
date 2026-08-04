import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { tryParseRepositoryFullName } from "../../../shared/repoName";
import {
  clearVaultDashboardQueryDialogSearch,
  useRootRouteSearch,
  type VaultDashboardQueryDialog,
} from "@/routeSearch/root";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { VaultOverviewLoadingPage, type VaultOverviewPageKind } from "./VaultOverviewPage";
import { VaultOverviewSidebar, VaultOverviewSidebarLoading } from "./VaultOverviewSidebar";
import {
  VaultOverviewVaultListHeader,
  VaultOverviewVaultPickerPane,
} from "./VaultOverviewVaultPickerPane";
import { VaultSelectedWorkspace } from "./VaultSelectedWorkspace";
import { useVaultWorkspaceModel } from "./useVaultWorkspaceModel";
import { api } from "../../../convex/_generated/api";

const DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM = "dev";

export type VaultDashboardProps = {
  page?: VaultOverviewPageKind | undefined;
  selectedRepositoryFullName?: string | undefined;
};

export function VaultDashboard({
  page = "overview",
  selectedRepositoryFullName,
}: VaultDashboardProps) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const rootRouteSearch = useRootRouteSearch();
  const developerToolsVisible = rootRouteSearch[DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM] === true;
  const workspaceModel = useVaultWorkspaceModel(selectedRepositoryFullName);
  const createVaultFolder = useMutation(api.vault.folders.createVaultFolder);
  const deleteVaultFolder = useMutation(api.vault.folders.deleteVaultFolder);
  const moveVaultFolder = useMutation(api.vault.folders.moveVaultFolder);
  const moveVaultToFolder = useMutation(api.vault.folders.moveVaultToFolder);
  const renameVaultFolder = useMutation(api.vault.folders.renameVaultFolder);
  const setVaultFolderCollapsed = useMutation(api.vault.folders.setVaultFolderCollapsed);
  const selectedVaultAvailable =
    workspaceModel.state === "loading" ? null : workspaceModel.selection.state === "selected";
  let unavailableDialog: VaultDashboardQueryDialog | null = null;
  if (selectedVaultAvailable === false) {
    if (rootRouteSearch.delete === true) {
      unavailableDialog = "delete";
    } else if (rootRouteSearch["add-convex"] === true) {
      unavailableDialog = "add-convex";
    } else if (rootRouteSearch["add-cloudflare"] === true) {
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
      state: ({ vaultDashboardDialog: _vaultDashboardDialog, ...currentState }) => currentState,
      to: pathname,
    });
  }, [navigate, pathname, unavailableDialog]);

  if (workspaceModel.state === "loading") {
    if (!selectedRepositoryFullName) {
      return (
        <VaultOverviewVaultPickerPane
          onCreateVaultFolder={createVaultFolder}
          sidebarSummaries={{ state: "loading" }}
          vaults={null}
        />
      );
    }
    const loadingRepository = tryParseRepositoryFullName(selectedRepositoryFullName);
    if (!loadingRepository) {
      return null;
    }
    return (
      <AppWorkspaceRouteChrome
        left={{
          header: <VaultOverviewVaultListHeader onCreateVaultFolder={createVaultFolder} />,
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
    header: <VaultOverviewVaultListHeader onCreateVaultFolder={createVaultFolder} />,
    content: (
      <VaultOverviewSidebar
        page={page}
        folderState={workspaceModel.folderState}
        selectedVaultId={selectedWorkspace?.vault._id ?? null}
        sidebarSummaries={workspaceModel.sidebarSummaries}
        vaults={workspaceModel.vaults}
        workspace={selectedWorkspace}
        onDeleteVaultFolder={deleteVaultFolder}
        onMoveVaultFolder={moveVaultFolder}
        onMoveVaultToFolder={moveVaultToFolder}
        onRenameVaultFolder={renameVaultFolder}
        onSetVaultFolderCollapsed={setVaultFolderCollapsed}
      />
    ),
  };
  const dashboardBody = (() => {
    switch (workspaceModel.selection.state) {
      case "root":
        return (
          <VaultOverviewVaultPickerPane
            folderState={workspaceModel.folderState}
            onCreateVaultFolder={createVaultFolder}
            onDeleteVaultFolder={deleteVaultFolder}
            onMoveVaultFolder={moveVaultFolder}
            onMoveVaultToFolder={moveVaultToFolder}
            onRenameVaultFolder={renameVaultFolder}
            onSetVaultFolderCollapsed={setVaultFolderCollapsed}
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
            page={page}
            workspace={workspaceModel.selection.workspace}
          />
        );
      default:
        return workspaceModel.selection satisfies never;
    }
  })();

  return (
    <AppWorkspaceRouteChrome left={isVaultRootRoute ? null : leftPane}>
      {dashboardBody}
    </AppWorkspaceRouteChrome>
  );
}
