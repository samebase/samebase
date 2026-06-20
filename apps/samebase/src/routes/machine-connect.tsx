import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { MachineConnectPage } from "@/components/MachineConnectPage";
import {
  MACHINE_CONNECT_ROUTE_SEARCH_STATIC_DATA,
  validateMachineConnectRouteSearch,
} from "@/routeSearch/machineConnect";
import { MACHINE_CONNECT_ROUTE } from "@/lib/samebaseSync";
import { SAMEBASE_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

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
    ...SAMEBASE_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    ...MACHINE_CONNECT_ROUTE_SEARCH_STATIC_DATA,
  },
  component: MachineConnectRouteComponent,
  validateSearch: validateMachineConnectRouteSearch,
});
