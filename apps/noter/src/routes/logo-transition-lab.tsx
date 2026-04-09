import { createFileRoute } from "@tanstack/react-router";
import { LogoTransitionLabRoutePage } from "./-publicRouteComponents";

export const Route = createFileRoute("/logo-transition-lab")({
  component: LogoTransitionLabRoutePage,
});
