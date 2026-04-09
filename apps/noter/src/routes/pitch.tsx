import { createFileRoute } from "@tanstack/react-router";
import { PitchRoutePage } from "./-publicRouteComponents";

export const Route = createFileRoute("/pitch")({
  component: PitchRoutePage,
});
