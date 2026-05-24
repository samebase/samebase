import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { MachinesWorkspacePage } from "@/components/MachinesWorkspacePage";
import {
  MACHINES_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateMachinesRouteSearch,
} from "@/lib/authenticatedRouteSearch";

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
    permission: "admin",
    searchParamSuggestions: MACHINES_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: MachinesRouteComponent,
  validateSearch: validateMachinesRouteSearch,
});
