import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { RoutedPage } from "./-publicRouteComponents";

const PrivacyPolicyPage = lazy(async () => {
  const module = await import("@/components/PrivacyPolicyPage");
  return { default: module.PrivacyPolicyPage };
});

function PrivacyRouteComponent() {
  return (
    <RoutedPage pathname="/privacy" withLayout>
      <PrivacyPolicyPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/privacy")({
  component: PrivacyRouteComponent,
});
