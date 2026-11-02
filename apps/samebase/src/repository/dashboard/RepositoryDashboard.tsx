import { Button } from "@/components/ui/button";
import { tryParseGitHubRepositoryFullName } from "../../../shared/githubRepositoryName";
import {
  clearRepositoryDashboardQueryDialogSearch,
  useRootRouteSearch,
  type RepositoryDashboardQueryDialog,
} from "@/routeSearch/root";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  RepositoryOverviewLoadingPage,
  type RepositoryOverviewPageKind,
} from "./RepositoryOverviewPage";
import { RepositoryOverviewPickerPane } from "./RepositoryOverviewPickerPane";
import { RepositorySelectedWorkspace } from "./RepositorySelectedWorkspace";
import { useRepositoryTreeActions } from "./useRepositoryTreeActions";
import { useRepositoryWorkspaceModel } from "./useRepositoryWorkspaceModel";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";

const DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM = "dev";

export type RepositoryDashboardProps = {
  organizationOwner?: string;
  page?: RepositoryOverviewPageKind;
  selectedRepositoryFullName?: string;
  source?: "attachments";
};

export function RepositoryDashboard({
  organizationOwner,
  page = "overview",
  selectedRepositoryFullName,
  source,
}: RepositoryDashboardProps) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const rootRouteSearch = useRootRouteSearch();
  const developerToolsVisible = rootRouteSearch[DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM] === true;
  const workspaceModel = useRepositoryWorkspaceModel(
    selectedRepositoryFullName,
    organizationOwner,
    source,
  );
  const treeActions = useRepositoryTreeActions();
  const selectedRepositoryAvailable =
    workspaceModel.state === "loading" ? null : workspaceModel.selection.state === "selected";
  let unavailableDialog: RepositoryDashboardQueryDialog | null = null;
  if (selectedRepositoryAvailable === false && rootRouteSearch.delete === true) {
    unavailableDialog = "delete";
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
          {...treeActions}
          folderState={null}
          globalInventory={!organizationOwner}
          organizations={null}
          organizationTreeSettings={null}
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
      <RepositoryOverviewLoadingPage
        owner={loadingRepository.owner}
        page={page}
        repoName={loadingRepository.name}
      />
    );
  }

  switch (workspaceModel.selection.state) {
    case "root":
      return (
        <RepositoryOverviewPickerPane
          {...treeActions}
          folderState={workspaceModel.folderState}
          globalInventory={!organizationOwner}
          organizations={workspaceModel.organizations}
          organizationTreeSettings={workspaceModel.organizationTreeSettings}
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
}
