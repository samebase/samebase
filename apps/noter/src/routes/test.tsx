import { createFileRoute } from "@tanstack/react-router";
import { RootTestRoutePage } from "@/components/RootTestRoutePage";

export const Route = createFileRoute("/test")({
  component: RootTestRoutePage,
});
