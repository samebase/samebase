import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { MachinesWorkspacePage } from "@/components/MachinesWorkspacePage";
import {
  MACHINES_ROUTE_SEARCH_KEYS,
  MACHINES_ROUTE_SEARCH_PARAM_ACCESS,
  MACHINES_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateMachinesRouteSearch,
} from "@/lib/authenticatedRouteSearch";
import { MACHINES_ROUTE } from "@/lib/noterSync";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

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
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: MACHINES_ROUTE_SEARCH_KEYS,
    searchParamAccess: MACHINES_ROUTE_SEARCH_PARAM_ACCESS,
    searchParamSuggestions: MACHINES_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: MachinesRouteComponent,
  validateSearch: validateMachinesRouteSearch,
});
