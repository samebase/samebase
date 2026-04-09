import { createFileRoute } from "@tanstack/react-router";
import { validateLogoRouteSearch } from "@/lib/logoRouteSearch";
import { LogoIsoRoutePage } from "./-publicRouteComponents";

export const Route = createFileRoute("/logo-iso")({
  component: LogoIsoRoutePage,
  validateSearch: validateLogoRouteSearch,
});
