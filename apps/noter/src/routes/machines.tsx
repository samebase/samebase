import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "#src/components/AuthenticatedAppRoutePage.tsx";
import { MachinesWorkspacePage } from "#src/components/MachinesWorkspacePage.tsx";
import { validateMachinesRouteSearch } from "#src/lib/authenticatedRouteSearch.ts";

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
  component: MachinesRouteComponent,
  validateSearch: validateMachinesRouteSearch,
});
