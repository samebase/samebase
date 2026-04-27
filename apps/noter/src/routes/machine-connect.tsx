import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { validateMachineConnectRouteSearch } from "@/lib/authenticatedRouteSearch";

const MachineConnectPage = lazy(async () => {
  const module = await import("@/components/MachineConnectPage");
  return { default: module.MachineConnectPage };
});

/**
 * Keep the machine approval page lazy so unauthorized users stop at the route gate.
 */
function MachineConnectRouteComponent() {
  return (
    <AuthenticatedAppRoutePage requiredPermission="machines.access">
      <MachineConnectPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/machines/connect")({
  component: MachineConnectRouteComponent,
  validateSearch: validateMachineConnectRouteSearch,
});
