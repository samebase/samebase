import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { PricingPage } from "@/components/PricingPage";
import {
  PRICING_ROUTE_SEARCH_KEYS,
  PRICING_ROUTE_SEARCH_PARAM_ACCESS,
  PRICING_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validatePricingRouteSearch,
} from "@/lib/authenticatedRouteSearch";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/pricing";

function PricingRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <PricingPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/pricing")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: PRICING_ROUTE_SEARCH_KEYS,
    searchParamAccess: PRICING_ROUTE_SEARCH_PARAM_ACCESS,
    searchParamSuggestions: PRICING_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: PricingRouteComponent,
  validateSearch: validatePricingRouteSearch,
});
