import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { validateMachinesRouteSearch } from "@/lib/authenticatedRouteSearch";

const MachinesWorkspacePage = lazy(async () => {
  const module = await import("@/components/MachinesWorkspacePage");
  return { default: module.MachinesWorkspacePage };
});

/**
 * Keep the machine workspace lazy so unauthorized users stop at the route gate.
 */
function MachinesRouteComponent() {
  return (
    <AuthenticatedAppRoutePage requiredPermission="machines.access">
      <MachinesWorkspacePage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/machines")({
  component: MachinesRouteComponent,
  validateSearch: validateMachinesRouteSearch,
});
