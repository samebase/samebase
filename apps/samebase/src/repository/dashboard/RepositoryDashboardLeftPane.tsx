import { useQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { rootQueries } from "@/routes/root.queries";
import type { RepositoryOverviewPageKind } from "./RepositoryOverviewPage";
import {
  RepositoryOverviewOrganizationSidebar,
  RepositoryOverviewSidebarLoading,
} from "./RepositoryOverviewSidebar";
import { useRepositoryTreeActions } from "./useRepositoryTreeActions";
import { useRepositoryWorkspaceModel } from "./useRepositoryWorkspaceModel";

type RepositoryDashboardLeftPaneProps = {
  page: RepositoryOverviewPageKind;
  selectedRepositoryFullName: string;
  source?: "attachments";
};

function RepositoryDashboardLeftPaneTree({
  page,
  selectedRepositoryFullName,
  source,
}: RepositoryDashboardLeftPaneProps) {
  // The page's source: the pane shares the page's queries and reads no store for `?attachments`.
  const workspaceModel = useRepositoryWorkspaceModel(selectedRepositoryFullName, undefined, source);
  const treeActions = useRepositoryTreeActions();
  if (workspaceModel.state === "loading") {
    return <RepositoryOverviewSidebarLoading />;
  }

  const selectedWorkspace =
    workspaceModel.selection.state === "selected" ? workspaceModel.selection.workspace : null;

  return (
    <RepositoryOverviewOrganizationSidebar
      {...treeActions}
      folderState={workspaceModel.folderState}
      organizations={workspaceModel.organizations}
      organizationsCollapsible
      organizationTreeSettings={workspaceModel.organizationTreeSettings}
      page={page}
      selectedRepositoryId={selectedWorkspace?.repository.repositoryId ?? null}
      sidebarSummaries={workspaceModel.sidebarSummaries}
      repositories={workspaceModel.repositories}
      workspace={selectedWorkspace}
    />
  );
}

/**
The left pane of a repository page: the repository tree with the page's repository selected. The
route's static data gives it to the shell, which renders it in the same render as the page, so the
server HTML has the tree. It reads the data that the route loader fetched; a viewer without
dashboard access gets the access page of RouteAccessOutlet and an empty pane, and the loader
fetched nothing for that viewer.
*/
export function RepositoryDashboardLeftPane(props: RepositoryDashboardLeftPaneProps) {
  const { data: viewerAccess } = useQuery(rootQueries.viewerAccess);
  if (viewerAccess?.accessKeys.includes("access_dashboard") !== true) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <RepositoryDashboardLeftPaneTree {...props} />
    </Suspense>
  );
}
