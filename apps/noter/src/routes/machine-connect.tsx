import { createFileRoute } from "@tanstack/react-router";
import { MachineConnectRoutePage } from "@/components/MachineConnectRoutePage";
import { validateMachineConnectRouteSearch } from "@/lib/authenticatedRouteSearch";

export const Route = createFileRoute("/machines/connect")({
  component: MachineConnectRoutePage,
  validateSearch: validateMachineConnectRouteSearch,
});
