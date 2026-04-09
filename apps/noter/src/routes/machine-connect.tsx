import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { validateMachineConnectRouteSearch } from "@/lib/authenticatedRouteSearch";
import { lazy } from "react";

const MachineConnectPage = lazy(async () => {
  const module = await import("@/components/MachineConnectPage");
  return { default: module.MachineConnectPage };
});

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
