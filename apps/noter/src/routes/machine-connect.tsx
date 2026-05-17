import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "#src/components/AuthenticatedAppRoutePage.tsx";
import { MachineConnectPage } from "#src/components/MachineConnectPage.tsx";
import { validateMachineConnectRouteSearch } from "#src/lib/authenticatedRouteSearch.ts";

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
  component: MachineConnectRouteComponent,
  validateSearch: validateMachineConnectRouteSearch,
});
