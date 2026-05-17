import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "#src/components/AuthenticatedAppRoutePage.tsx";
import { PricingPage } from "#src/components/PricingPage.tsx";
import { validatePricingRouteSearch } from "#src/lib/authenticatedRouteSearch.ts";

function PricingRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <PricingPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/pricing")({
  component: PricingRouteComponent,
  validateSearch: validatePricingRouteSearch,
});
