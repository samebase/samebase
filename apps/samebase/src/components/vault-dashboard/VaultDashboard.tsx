import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { tryParseRepositoryFullName } from "../../../shared/repoName";
import { useRootRouteSearch } from "@/routeSearch/root";
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

export function VaultDashboard({
  page = "overview",
  selectedRepositoryFullName,
}: VaultDashboardProps) {
  const rootRouteSearch = useRootRouteSearch();
  const developerToolsVisible = rootRouteSearch[DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM] === true;
  const { commands: workspaceCommands, model: workspaceModel } = useVaultWorkspaceModel(
    selectedRepositoryFullName,
    true,
  );
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
  const dashboardBody = isVaultRootRoute ? (
    <VaultOverviewVaultPickerPane
      sidebarSummaries={workspaceModel.sidebarSummaries}
      vaults={workspaceModel.vaults}
    />
  ) : workspaceModel.selection.state === "missing" ? (
    <div className="p-4 text-sm text-muted-foreground">
      Vault not found: {workspaceModel.selection.repositoryFullName}
    </div>
  ) : selectedWorkspace ? (
    <VaultSelectedWorkspace
      key={selectedWorkspace.vault._id}
      developerToolsVisible={developerToolsVisible}
      invalidateProviderObservations={workspaceCommands.invalidateProviderObservations}
      page={page}
      workspace={selectedWorkspace}
    />
  ) : (
    <div className="p-4 text-sm text-muted-foreground">
      Select a vault from the left sidebar or add one from the right sidebar.
    </div>
  );

  return (
    <AppWorkspaceRouteChrome left={isVaultRootRoute ? null : leftPane}>
      {dashboardBody}
    </AppWorkspaceRouteChrome>
  );
}
