import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { lazy } from "react";

const PricingPage = lazy(async () => {
  const module = await import("@/components/PricingPage");
  return { default: module.PricingPage };
});

export function PricingRoutePage() {
  return (
    <AuthenticatedAppRoutePage>
      <PricingPage />
    </AuthenticatedAppRoutePage>
  );
}
