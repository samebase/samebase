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
