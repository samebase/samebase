import { createFileRoute } from "@tanstack/react-router";
import { TermsOfServicePage } from "@/components/TermsOfServicePage";
import { RoutedPage } from "./-publicRouteComponents";

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
