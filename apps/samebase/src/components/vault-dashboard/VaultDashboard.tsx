import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { Button } from "@/components/ui/button";
import { tryParseRepositoryFullName } from "../../../shared/repoName";
import {
  clearVaultDashboardQueryDialogSearch,
  useRootRouteSearch,
  type VaultDashboardQueryDialog,
} from "@/routeSearch/root";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
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
  organizationOwner?: string;
  page?: VaultOverviewPageKind;
  selectedRepositoryFullName?: string;
};

export function VaultDashboard({
  organizationOwner,
  page = "overview",
  selectedRepositoryFullName,
}: VaultDashboardProps) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const rootRouteSearch = useRootRouteSearch();
  const developerToolsVisible = rootRouteSearch[DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM] === true;
  const workspaceModel = useVaultWorkspaceModel(selectedRepositoryFullName, organizationOwner);
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
          globalInventory={!organizationOwner}
          organizations={null}
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

  const selectedWorkspace =
    workspaceModel.selection.state === "selected" ? workspaceModel.selection.workspace : null;
  const isVaultRootRoute = workspaceModel.selection.state === "root";
  const leftPane = {
    header: <VaultOverviewVaultListHeader />,
    content: (
      <VaultOverviewOrganizationSidebar
        organizations={workspaceModel.organizations}
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
            globalInventory={!organizationOwner}
            organizations={workspaceModel.organizations}
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
