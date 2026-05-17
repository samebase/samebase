import { createFileRoute } from "@tanstack/react-router";
import { TermsOfServicePage } from "#src/components/TermsOfServicePage.tsx";
import { RoutedPage } from "./-publicRouteComponents";

function TermsRouteComponent() {
  return (
    <RoutedPage pathname="/terms">
      <TermsOfServicePage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/_public/terms")({
  component: TermsRouteComponent,
});
