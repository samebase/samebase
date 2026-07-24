import { DashboardRoutePage } from "@/components/DashboardRoutePage";
import { DASHBOARD_ROOT_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/routeSearch/root";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

const pathname = "/vaultold/";

export const Route = createFileRoute("/vaultold/")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    searchParamSuggestions: DASHBOARD_ROOT_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: DashboardRoutePage,
});
