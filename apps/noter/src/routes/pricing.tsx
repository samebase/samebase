import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { validatePricingRouteSearch } from "@/lib/authenticatedRouteSearch";
import { lazy } from "react";

const PricingPage = lazy(async () => {
  const module = await import("@/components/PricingPage");
  return { default: module.PricingPage };
});

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
