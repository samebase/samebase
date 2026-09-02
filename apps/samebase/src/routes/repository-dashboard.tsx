import { DashboardRoutePage } from "@/components/DashboardRoutePage";
import { DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/routeSearch/root";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

const pathname = "/repo/$owner/$repository";

function RepositoryDashboardRouteComponent() {
  const { owner, repository } = Route.useParams();

  return <DashboardRoutePage selectedRepositoryFullName={`${owner}/${repository}`} />;
}

export const Route = createFileRoute("/repo/$owner/$repository")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    searchParamSuggestions: DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: RepositoryDashboardRouteComponent,
});
