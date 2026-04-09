import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { validateMachinesRouteSearch } from "@/lib/authenticatedRouteSearch";
import { lazy } from "react";

const MachinesWorkspacePage = lazy(async () => {
  const module = await import("@/components/MachinesWorkspacePage");
  return { default: module.MachinesWorkspacePage };
});

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
