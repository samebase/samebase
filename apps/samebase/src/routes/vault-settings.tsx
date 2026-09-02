import { DashboardRoutePage } from "@/components/DashboardRoutePage";
import { DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/routeSearch/root";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

const pathname = "/repo/$owner/$repository/settings";

function VaultSettingsRouteComponent() {
  const { owner, repository } = Route.useParams();

  return (
    <DashboardRoutePage page="settings" selectedRepositoryFullName={`${owner}/${repository}`} />
  );
}

export const Route = createFileRoute("/repo/$owner/$repository/settings")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    searchParamSuggestions: DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: VaultSettingsRouteComponent,
});
