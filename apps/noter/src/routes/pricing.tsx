import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { PricingPage } from "@/components/PricingPage";
import { validatePricingRouteSearch } from "@/lib/authenticatedRouteSearch";

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
