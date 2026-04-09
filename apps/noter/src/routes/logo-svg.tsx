import { createFileRoute } from "@tanstack/react-router";
import { validateLogoRouteSearch } from "@/lib/logoRouteSearch";
import { LogoSvgRoutePage } from "./-publicRouteComponents";

export const Route = createFileRoute("/logo-svg")({
  component: LogoSvgRoutePage,
  validateSearch: validateLogoRouteSearch,
});
