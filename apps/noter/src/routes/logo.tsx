import { createFileRoute } from "@tanstack/react-router";
import { validateLogoRouteSearch } from "@/lib/logoRouteSearch";
import { LogoThreeRoutePage } from "./-publicRouteComponents";

export const Route = createFileRoute("/logo")({
  component: LogoThreeRoutePage,
  validateSearch: validateLogoRouteSearch,
});
