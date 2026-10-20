import { DashboardRoutePage } from "@/repository/dashboard/DashboardRoutePage";
import { DASHBOARD_ROOT_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/routeSearch/root";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";
import { loadRepositoryDashboard } from "@/routes/repository-dashboard.queries";

const pathname = "/repo/";

export const Route = createFileRoute("/_authed/repo/")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    searchParamSuggestions: DASHBOARD_ROOT_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  loader: loadRepositoryDashboard,
  component: DashboardRoutePage,
});
