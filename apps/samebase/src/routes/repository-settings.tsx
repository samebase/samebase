import { DashboardRoutePage } from "@/repository/dashboard/DashboardRoutePage";
import { RepositoryDashboardLeftPane } from "@/repository/dashboard/RepositoryDashboardLeftPane";
import { RepositoryOverviewListHeader } from "@/repository/dashboard/RepositoryOverviewPickerPane";
import { DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/routeSearch/root";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";
import { loadRepositoryDashboard } from "@/routes/repository-dashboard.queries";

const pathname = "/repo/$owner/$repository/settings";

function RepositorySettingsRouteComponent() {
  const { owner, repository } = Route.useParams();

  return (
    <DashboardRoutePage page="settings" selectedRepositoryFullName={`${owner}/${repository}`} />
  );
}

function RepositorySettingsRouteLeftPane() {
  const { owner, repository } = Route.useParams();

  return (
    <RepositoryDashboardLeftPane
      page="settings"
      selectedRepositoryFullName={`${owner}/${repository}`}
    />
  );
}

export const Route = createFileRoute("/_authed/repo/$owner/$repository/settings")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    appWorkspaceRouteChrome: {
      leftPane: {
        header: <RepositoryOverviewListHeader />,
        content: <RepositorySettingsRouteLeftPane />,
      },
    },
    searchParamSuggestions: DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  loader: loadRepositoryDashboard,
  component: RepositorySettingsRouteComponent,
});
