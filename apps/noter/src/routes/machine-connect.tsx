import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { MachineConnectPage } from "@/components/MachineConnectPage";
import { validateMachineConnectRouteSearch } from "@/lib/authenticatedRouteSearch";

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
  staticData: { permission: "admin" },
  component: MachineConnectRouteComponent,
  validateSearch: validateMachineConnectRouteSearch,
});
