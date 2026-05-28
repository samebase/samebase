import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { MachineConnectPage } from "@/components/MachineConnectPage";
import {
  MACHINE_CONNECT_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateMachineConnectRouteSearch,
} from "@/lib/authenticatedRouteSearch";
import { MACHINE_CONNECT_ROUTE } from "@/lib/noterSync";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = MACHINE_CONNECT_ROUTE;

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
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    searchParamSuggestions: MACHINE_CONNECT_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: MachineConnectRouteComponent,
  validateSearch: validateMachineConnectRouteSearch,
});
