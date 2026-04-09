import { createFileRoute } from "@tanstack/react-router";
import { PricingRoutePage } from "@/components/PricingRoutePage";
import { validatePricingRouteSearch } from "@/lib/authenticatedRouteSearch";

export const Route = createFileRoute("/pricing")({
  component: PricingRoutePage,
  validateSearch: validatePricingRouteSearch,
});
