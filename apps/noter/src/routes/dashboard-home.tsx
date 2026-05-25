import { DashboardRoutePage } from "@/components/DashboardRoutePage";
import { DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/lib/rootRouteSearch";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/home")({
  staticData: {
    permission: "admin",
    searchParamSuggestions: DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  loader: () => {
    void import("@/components/vault-dashboard/VaultDashboard");
  },
  component: DashboardRoutePage,
});
