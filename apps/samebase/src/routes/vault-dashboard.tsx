import { DashboardRoutePage } from "@/components/DashboardRoutePage";
import { DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/routeSearch/root";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

const pathname = "/vault/$owner/$repo";

function VaultDashboardRouteComponent() {
  const { owner, repo } = Route.useParams();

  return <DashboardRoutePage presentation="v2" selectedRepositoryFullName={`${owner}/${repo}`} />;
}

export const Route = createFileRoute("/vault/$owner/$repo")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    searchParamSuggestions: DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: VaultDashboardRouteComponent,
});
