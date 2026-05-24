import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { MachineConnectPage } from "@/components/MachineConnectPage";
import {
  MACHINE_CONNECT_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateMachineConnectRouteSearch,
} from "@/lib/authenticatedRouteSearch";

/**
 * Preserve the authenticated route shell while this page stays route-owned.
 */
function MachineConnectRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <MachineConnectPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/machines/connect")({
  staticData: {
    permission: "admin",
    searchParamSuggestions: MACHINE_CONNECT_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: MachineConnectRouteComponent,
  validateSearch: validateMachineConnectRouteSearch,
});
