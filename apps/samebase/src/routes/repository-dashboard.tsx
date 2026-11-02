import { DashboardRoutePage } from "@/repository/dashboard/DashboardRoutePage";
import { RepositoryDashboardLeftPane } from "@/repository/dashboard/RepositoryDashboardLeftPane";
import { RepositoryOverviewListHeader } from "@/repository/dashboard/RepositoryOverviewPickerPane";
import { DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/routeSearch/root";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";
import { loadRepositoryOverview } from "@/routes/repository-dashboard.queries";

const pathname = "/repo/$owner/$repository";

function RepositoryDashboardRouteComponent() {
  const { owner, repository } = Route.useParams();

  return <DashboardRoutePage selectedRepositoryFullName={`${owner}/${repository}`} />;
}

function RepositoryDashboardRouteLeftPane() {
  const { owner, repository } = Route.useParams();

  return (
    <RepositoryDashboardLeftPane
      page="overview"
      selectedRepositoryFullName={`${owner}/${repository}`}
    />
  );
}

export const Route = createFileRoute("/_authed/repo/$owner/$repository")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    appWorkspaceRouteChrome: {
      leftPane: {
        header: <RepositoryOverviewListHeader />,
        content: <RepositoryDashboardRouteLeftPane />,
      },
    },
    searchParamSuggestions: DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  loader: loadRepositoryOverview,
  // The loader's store token lasts five minutes and its read is one moment of the store, so the
  // route keeps no loader data after the page is left, and the next visit reads the store again.
  gcTime: 0,
  component: RepositoryDashboardRouteComponent,
});
