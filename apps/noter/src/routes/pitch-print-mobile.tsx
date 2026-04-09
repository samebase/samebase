import { createFileRoute } from "@tanstack/react-router";
import { PitchPrintMobileRoutePage } from "./-publicRouteComponents";

export const Route = createFileRoute("/pitch/print/mobile")({
  component: PitchPrintMobileRoutePage,
});
