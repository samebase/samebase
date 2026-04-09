import { createFileRoute } from "@tanstack/react-router";
import { PitchPrintRoutePage } from "./-publicRouteComponents";

export const Route = createFileRoute("/pitch/print")({
  component: PitchPrintRoutePage,
});
