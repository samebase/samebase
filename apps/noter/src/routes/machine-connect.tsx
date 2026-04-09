import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { MachineConnectPage } from "@/components/MachineConnectPage";
import { validateMachineConnectRouteSearch } from "@/lib/authenticatedRouteSearch";

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
