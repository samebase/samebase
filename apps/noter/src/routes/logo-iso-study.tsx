import { createFileRoute } from "@tanstack/react-router";
import { validateLogoRouteSearch } from "@/lib/logoRouteSearch";
import { LogoIsoStudyRoutePage } from "./-publicRouteComponents";

export const Route = createFileRoute("/logo-iso-study")({
  component: LogoIsoStudyRoutePage,
  validateSearch: validateLogoRouteSearch,
});
