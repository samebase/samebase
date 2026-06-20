import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { PricingPage } from "@/components/PricingPage";
import {
  PRICING_ROUTE_SEARCH_STATIC_DATA,
  validatePricingRouteSearch,
} from "@/routeSearch/pricing";
import { SAMEBASE_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

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
    ...SAMEBASE_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    ...PRICING_ROUTE_SEARCH_STATIC_DATA,
  },
  component: PricingRouteComponent,
  validateSearch: validatePricingRouteSearch,
});
