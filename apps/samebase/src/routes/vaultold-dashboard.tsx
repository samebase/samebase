import { DashboardRoutePage } from "@/components/DashboardRoutePage";
import { DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/routeSearch/root";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

const pathname = "/vaultold/$owner/$repo";

function VaultOldDashboardRouteComponent() {
  const { owner, repo } = Route.useParams();

  return <DashboardRoutePage selectedRepositoryFullName={`${owner}/${repo}`} />;
}

export const Route = createFileRoute("/vaultold/$owner/$repo")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    searchParamSuggestions: DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: VaultOldDashboardRouteComponent,
});
