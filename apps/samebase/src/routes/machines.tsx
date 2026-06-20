import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { MachinesWorkspacePage } from "@/components/MachinesWorkspacePage";
import {
  MACHINES_ROUTE_SEARCH_STATIC_DATA,
  validateMachinesRouteSearch,
} from "@/routeSearch/machines";
import { MACHINES_ROUTE } from "@/lib/samebaseSync";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = MACHINES_ROUTE;

/**
 * Preserve the authenticated route shell while this page stays route-owned.
 */
function MachinesRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <MachinesWorkspacePage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/machines")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    ...MACHINES_ROUTE_SEARCH_STATIC_DATA,
  },
  component: MachinesRouteComponent,
  validateSearch: validateMachinesRouteSearch,
});
