import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { PricingPage } from "@/components/PricingPage";
import {
  PRICING_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validatePricingRouteSearch,
} from "@/lib/authenticatedRouteSearch";

function PricingRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <PricingPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/pricing")({
  ssr: false,
  staticData: {
    permission: "admin",
    searchParamSuggestions: PRICING_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: PricingRouteComponent,
  validateSearch: validatePricingRouteSearch,
});
