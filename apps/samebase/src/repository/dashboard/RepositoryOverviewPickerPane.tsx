import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import type { RepositorySidebarSummariesState } from "@/repository/dashboard/useRepositorySidebarSummaries";
import { ORGANIZATIONS_ROUTE } from "@/lib/organizationRoutes";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import {
  type RepositoryFolderCallbacks,
  type RepositoryOrganizationTreeCallbacks,
  RepositoryOverviewOrganizationSidebar,
  RepositoryOverviewSidebarLoading,
} from "./RepositoryOverviewSidebar";
import type { RepositoryFolderCreate } from "./RepositoryFolderCreateButton";
import type {
  RepositoryFolderState,
  RepositoryOrganization,
  RepositoryOrganizationTreeSettings,
} from "./repositoryWorkspaceModel";

export type { RepositoryOrganization } from "./repositoryWorkspaceModel";

export function RepositoryOverviewListHeader() {
  return (
    <div className="min-w-0 truncate px-3 text-sm font-medium @max-[120px]:px-1">Repositories</div>
  );
}

function OpenOrganizationsButton() {
  return (
    <Button asChild className="justify-self-start" size="sm">
      <Link to={ORGANIZATIONS_ROUTE}>Add organization</Link>
    </Button>
  );
}

export function RepositoryOverviewPickerPane({
  folderState,
  globalInventory,
  organizations,
  onCreateRepositoryFolder,
  onDeleteRepositoryFolder,
  onMoveRepositoryFolder,
  onMoveRepositoryToFolder,
  onRenameRepositoryFolder,
  onSetRepositoryFolderCollapsed,
  onSetRepositoryOrganizationCollapsed,
  organizationTreeSettings,
  sidebarSummaries,
  repositories,
}: {
  folderState: RepositoryFolderState | null;
  globalInventory: boolean;
  organizations: readonly RepositoryOrganization[] | null;
  organizationTreeSettings: RepositoryOrganizationTreeSettings | null;
  onCreateRepositoryFolder: RepositoryFolderCreate;
  sidebarSummaries: RepositorySidebarSummariesState;
  repositories: readonly UserRepositoryResult[] | null;
} & RepositoryFolderCallbacks &
  RepositoryOrganizationTreeCallbacks) {
  const loading =
    folderState === null ||
    organizations === null ||
    organizationTreeSettings === null ||
    repositories === null;

  return (
    <div className="mx-auto min-h-full w-full max-w-[1100px]">
      <div className="@container flex min-h-11 items-center border-b px-4 py-1.5">
        <RepositoryOverviewListHeader />
      </div>
      {loading ? (
        <RepositoryOverviewSidebarLoading />
      ) : organizations.length === 0 && globalInventory ? (
        <div className="grid gap-3 p-4">
          <h1 className="text-base font-semibold">No organizations</h1>
          <p className="text-sm text-muted-foreground">
            Connect a GitHub account or organization to Samebase.
          </p>
          <OpenOrganizationsButton />
        </div>
      ) : organizations.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">No repositories</div>
      ) : (
        <RepositoryOverviewOrganizationSidebar
          folderState={folderState}
          organizations={organizations}
          organizationsCollapsible={globalInventory}
          organizationTreeSettings={organizationTreeSettings}
          page="overview"
          selectedRepositoryId={null}
          sidebarSummaries={sidebarSummaries}
          repositories={repositories}
          workspace={null}
          onCreateRepositoryFolder={onCreateRepositoryFolder}
          onDeleteRepositoryFolder={onDeleteRepositoryFolder}
          onMoveRepositoryFolder={onMoveRepositoryFolder}
          onMoveRepositoryToFolder={onMoveRepositoryToFolder}
          onRenameRepositoryFolder={onRenameRepositoryFolder}
          onSetRepositoryFolderCollapsed={onSetRepositoryFolderCollapsed}
          onSetRepositoryOrganizationCollapsed={onSetRepositoryOrganizationCollapsed}
        />
      )}
    </div>
  );
}
