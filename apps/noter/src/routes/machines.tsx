import { createFileRoute } from "@tanstack/react-router";
import { MachinesRoutePage } from "@/components/MachinesRoutePage";
import { validateMachinesRouteSearch } from "@/lib/authenticatedRouteSearch";

export const Route = createFileRoute("/machines")({
  component: MachinesRoutePage,
  validateSearch: validateMachinesRouteSearch,
});
