import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { RoutedPage } from "./-publicRouteComponents";

const TermsOfServicePage = lazy(async () => {
  const module = await import("@/components/TermsOfServicePage");
  return { default: module.TermsOfServicePage };
});

function TermsRouteComponent() {
  return (
    <RoutedPage pathname="/terms" withLayout>
      <TermsOfServicePage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/terms")({
  component: TermsRouteComponent,
});
