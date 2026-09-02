import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { Button } from "@/components/ui/button";
import { tryParseGitHubRepositoryFullName } from "../../../shared/githubRepositoryName";
import {
  clearRepositoryDashboardQueryDialogSearch,
  useRootRouteSearch,
  type RepositoryDashboardQueryDialog,
} from "@/routeSearch/root";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import {
  RepositoryOverviewLoadingPage,
  type RepositoryOverviewPageKind,
} from "./RepositoryOverviewPage";
import {
  RepositoryOverviewOrganizationSidebar,
  RepositoryOverviewSidebarLoading,
} from "./RepositoryOverviewSidebar";
import {
  RepositoryOverviewListHeader,
  RepositoryOverviewPickerPane,
} from "./RepositoryOverviewPickerPane";
import { RepositorySelectedWorkspace } from "./RepositorySelectedWorkspace";
import { useRepositoryWorkspaceModel } from "./useRepositoryWorkspaceModel";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";

const DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM = "dev";

export type RepositoryDashboardProps = {
  organizationOwner?: string;
  page?: RepositoryOverviewPageKind;
  selectedRepositoryFullName?: string;
};

export function RepositoryDashboard({
  organizationOwner,
  page = "overview",
  selectedRepositoryFullName,
}: RepositoryDashboardProps) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const rootRouteSearch = useRootRouteSearch();
  const developerToolsVisible = rootRouteSearch[DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM] === true;
  const workspaceModel = useRepositoryWorkspaceModel(selectedRepositoryFullName, organizationOwner);
  const createRepositoryFolder = useMutation(api.repository.folders.createRepositoryFolder);
  const deleteRepositoryFolder = useMutation(api.repository.folders.deleteRepositoryFolder);
  const moveRepositoryFolder = useMutation(api.repository.folders.moveRepositoryFolder);
  const moveRepositoryToFolder = useMutation(api.repository.folders.moveRepositoryToFolder);
  const renameRepositoryFolder = useMutation(api.repository.folders.renameRepositoryFolder);
  const setRepositoryFolderCollapsed = useMutation(
    api.repository.folders.setRepositoryFolderCollapsed,
  );
  const setRepositoryOrganizationCollapsed = useMutation(
    api.repository.organizationTree.setRepositoryOrganizationCollapsed,
  ).withOptimisticUpdate((localStore, args) => {
    const currentSettings = localStore.getQuery(
      api.repository.organizationTree.getRepositoryOrganizationTreeSettings,
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
      api.repository.organizationTree.getRepositoryOrganizationTreeSettings,
      {},
      nextSettings,
    );
  });
  const selectedRepositoryAvailable =
    workspaceModel.state === "loading" ? null : workspaceModel.selection.state === "selected";
  let unavailableDialog: RepositoryDashboardQueryDialog | null = null;
  if (selectedRepositoryAvailable === false) {
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
        clearRepositoryDashboardQueryDialogSearch(currentSearch, unavailableDialog),
      state: (currentState) => ({
        ...currentState,
        repositoryDashboardDialog: undefined,
      }),
      to: pathname,
    });
  }, [navigate, pathname, unavailableDialog]);

  if (workspaceModel.state === "loading") {
    if (!selectedRepositoryFullName) {
      return (
        <RepositoryOverviewPickerPane
          folderState={null}
          globalInventory={!organizationOwner}
          organizations={null}
          organizationTreeSettings={null}
          onCreateRepositoryFolder={createRepositoryFolder}
          onDeleteRepositoryFolder={deleteRepositoryFolder}
          onMoveRepositoryFolder={moveRepositoryFolder}
          onMoveRepositoryToFolder={moveRepositoryToFolder}
          onRenameRepositoryFolder={renameRepositoryFolder}
          onSetRepositoryFolderCollapsed={setRepositoryFolderCollapsed}
          onSetRepositoryOrganizationCollapsed={setRepositoryOrganizationCollapsed}
          sidebarSummaries={{ state: "loading" }}
          repositories={null}
        />
      );
    }
    const loadingRepository = tryParseGitHubRepositoryFullName(selectedRepositoryFullName);
    if (!loadingRepository) {
      return null;
    }
    return (
      <AppWorkspaceRouteChrome
        left={{
          header: <RepositoryOverviewListHeader />,
          content: <RepositoryOverviewSidebarLoading />,
        }}
      >
        <RepositoryOverviewLoadingPage
          owner={loadingRepository.owner}
          page={page}
          repoName={loadingRepository.name}
        />
      </AppWorkspaceRouteChrome>
    );
  }

  const selectedWorkspace =
    workspaceModel.selection.state === "selected" ? workspaceModel.selection.workspace : null;
  const isRepositoryRootRoute = workspaceModel.selection.state === "root";
  const leftPane = {
    header: <RepositoryOverviewListHeader />,
    content: (
      <RepositoryOverviewOrganizationSidebar
        folderState={workspaceModel.folderState}
        organizations={workspaceModel.organizations}
        organizationsCollapsible
        organizationTreeSettings={workspaceModel.organizationTreeSettings}
        onCreateRepositoryFolder={createRepositoryFolder}
        onDeleteRepositoryFolder={deleteRepositoryFolder}
        onMoveRepositoryFolder={moveRepositoryFolder}
        onMoveRepositoryToFolder={moveRepositoryToFolder}
        onRenameRepositoryFolder={renameRepositoryFolder}
        onSetRepositoryFolderCollapsed={setRepositoryFolderCollapsed}
        onSetRepositoryOrganizationCollapsed={setRepositoryOrganizationCollapsed}
        page={page}
        selectedRepositoryId={selectedWorkspace?.repository.repositoryId ?? null}
        sidebarSummaries={workspaceModel.sidebarSummaries}
        repositories={workspaceModel.repositories}
        workspace={selectedWorkspace}
      />
    ),
  };
  const dashboardBody = (() => {
    switch (workspaceModel.selection.state) {
      case "root":
        return (
          <RepositoryOverviewPickerPane
            folderState={workspaceModel.folderState}
            globalInventory={!organizationOwner}
            organizations={workspaceModel.organizations}
            organizationTreeSettings={workspaceModel.organizationTreeSettings}
            onCreateRepositoryFolder={createRepositoryFolder}
            onDeleteRepositoryFolder={deleteRepositoryFolder}
            onMoveRepositoryFolder={moveRepositoryFolder}
            onMoveRepositoryToFolder={moveRepositoryToFolder}
            onRenameRepositoryFolder={renameRepositoryFolder}
            onSetRepositoryFolderCollapsed={setRepositoryFolderCollapsed}
            onSetRepositoryOrganizationCollapsed={setRepositoryOrganizationCollapsed}
            sidebarSummaries={workspaceModel.sidebarSummaries}
            repositories={workspaceModel.repositories}
          />
        );
      case "missing":
        return (
          <main className="grid gap-4 p-4">
            <h1 className="text-base font-semibold">Repository unavailable</h1>
            <Button asChild className="w-fit" variant="outline">
              <Link to={DASHBOARD_ROUTE}>All repositories</Link>
            </Button>
          </main>
        );
      case "selected":
        return (
          <RepositorySelectedWorkspace
            key={workspaceModel.selection.workspace.repository.repositoryId}
            developerToolsVisible={developerToolsVisible}
            page={page}
            workspace={workspaceModel.selection.workspace}
          />
        );
    }
  })();

  return (
    <AppWorkspaceRouteChrome left={isRepositoryRootRoute || !selectedWorkspace ? null : leftPane}>
      {dashboardBody}
    </AppWorkspaceRouteChrome>
  );
}
