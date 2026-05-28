import { DashboardRoutePage } from "@/components/DashboardRoutePage";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/lib/rootRouteSearch";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

const pathname = DASHBOARD_ROUTE;

export const Route = createFileRoute("/home")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    searchParamSuggestions: DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: DashboardRoutePage,
});
