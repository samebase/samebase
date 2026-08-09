import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { Button } from "@/components/ui/button";
import { tryParseRepositoryFullName } from "../../../shared/repoName";
import {
  clearVaultDashboardQueryDialogSearch,
  useRootRouteSearch,
  type VaultDashboardQueryDialog,
} from "@/routeSearch/root";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { VaultOverviewLoadingPage, type VaultOverviewPageKind } from "./VaultOverviewPage";
import {
  VaultOverviewOrganizationSidebar,
  VaultOverviewSidebarLoading,
} from "./VaultOverviewSidebar";
import {
  VaultOverviewVaultListHeader,
  VaultOverviewVaultPickerPane,
} from "./VaultOverviewVaultPickerPane";
import { VaultSelectedWorkspace } from "./VaultSelectedWorkspace";
import { useVaultWorkspaceModel } from "./useVaultWorkspaceModel";

const DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM = "dev";

export type VaultDashboardProps = {
  activeVaultId?: Id<"vaults"> | null;
  organizationOwner?: string;
  page?: VaultOverviewPageKind;
  selectedRepositoryFullName?: string;
};

export function VaultDashboard({
  activeVaultId,
  organizationOwner,
  page = "overview",
  selectedRepositoryFullName,
}: VaultDashboardProps) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const rootRouteSearch = useRootRouteSearch();
  const developerToolsVisible = rootRouteSearch[DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM] === true;
  const workspaceModel = useVaultWorkspaceModel(
    selectedRepositoryFullName,
    organizationOwner,
    activeVaultId,
  );
  const selectedWorkspace =
    workspaceModel.state === "ready" && workspaceModel.selection.state === "selected"
      ? workspaceModel.selection.workspace
      : null;
  const createVaultFolder = useMutation(api.vault.folders.createVaultFolder);
  const deleteVaultFolder = useMutation(api.vault.folders.deleteVaultFolder);
  const moveVaultFolder = useMutation(api.vault.folders.moveVaultFolder);
  const moveVaultToFolder = useMutation(api.vault.folders.moveVaultToFolder);
  const renameVaultFolder = useMutation(api.vault.folders.renameVaultFolder);
  const setVaultFolderCollapsed = useMutation(api.vault.folders.setVaultFolderCollapsed);
  const setVaultOrganizationCollapsed = useMutation(
    api.vault.organizationTree.setVaultOrganizationCollapsed,
  ).withOptimisticUpdate((localStore, args) => {
    const currentSettings = localStore.getQuery(
      api.vault.organizationTree.getVaultOrganizationTreeSettings,
      {},
    );
    if (!currentSettings) {
      return;
    }

    const nextSettings = currentSettings
      .filter((setting) => setting.organizationId !== args.organizationId)
      .concat({ collapsed: args.collapsed, organizationId: args.organizationId })
      .sort((left, right) => left.organizationId.localeCompare(right.organizationId));
    localStore.setQuery(
      api.vault.organizationTree.getVaultOrganizationTreeSettings,
      {},
      nextSettings,
    );
  });
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
      state: (currentState) => ({
        ...currentState,
        vaultDashboardDialog: undefined,
      }),
      to: pathname,
    });
  }, [navigate, pathname, unavailableDialog]);

  if (workspaceModel.state === "loading") {
    if (!selectedRepositoryFullName) {
      return (
        <VaultOverviewVaultPickerPane
          folderState={null}
          globalInventory={!organizationOwner}
          organizations={null}
          organizationTreeSettings={null}
          onCreateVaultFolder={createVaultFolder}
          onDeleteVaultFolder={deleteVaultFolder}
          onMoveVaultFolder={moveVaultFolder}
          onMoveVaultToFolder={moveVaultToFolder}
          onRenameVaultFolder={renameVaultFolder}
          onSetVaultFolderCollapsed={setVaultFolderCollapsed}
          onSetVaultOrganizationCollapsed={setVaultOrganizationCollapsed}
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

  const isVaultRootRoute = workspaceModel.selection.state === "root";
  const leftPane = {
    header: <VaultOverviewVaultListHeader />,
    content: (
      <VaultOverviewOrganizationSidebar
        folderState={workspaceModel.folderState}
        organizations={workspaceModel.organizations}
        organizationTreeSettings={workspaceModel.organizationTreeSettings}
        onCreateVaultFolder={createVaultFolder}
        onDeleteVaultFolder={deleteVaultFolder}
        onMoveVaultFolder={moveVaultFolder}
        onMoveVaultToFolder={moveVaultToFolder}
        onRenameVaultFolder={renameVaultFolder}
        onSetVaultFolderCollapsed={setVaultFolderCollapsed}
        onSetVaultOrganizationCollapsed={setVaultOrganizationCollapsed}
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
            folderState={workspaceModel.folderState}
            globalInventory={!organizationOwner}
            organizations={workspaceModel.organizations}
            organizationTreeSettings={workspaceModel.organizationTreeSettings}
            onCreateVaultFolder={createVaultFolder}
            onDeleteVaultFolder={deleteVaultFolder}
            onMoveVaultFolder={moveVaultFolder}
            onMoveVaultToFolder={moveVaultToFolder}
            onRenameVaultFolder={renameVaultFolder}
            onSetVaultFolderCollapsed={setVaultFolderCollapsed}
            onSetVaultOrganizationCollapsed={setVaultOrganizationCollapsed}
            sidebarSummaries={workspaceModel.sidebarSummaries}
            vaults={workspaceModel.vaults}
          />
        );
      case "missing":
        return (
          <main className="grid gap-4 p-4">
            <h1 className="text-base font-semibold">Vault unavailable</h1>
            <Button asChild className="w-fit" variant="outline">
              <Link to="/vault">All vaults</Link>
            </Button>
          </main>
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
    }
  })();

  return (
    <AppWorkspaceRouteChrome left={isVaultRootRoute || !selectedWorkspace ? null : leftPane}>
      {dashboardBody}
    </AppWorkspaceRouteChrome>
  );
}
