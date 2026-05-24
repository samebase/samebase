import { createFileRoute } from "@tanstack/react-router";
import { TermsOfServicePage } from "@/components/TermsOfServicePage";
import { RoutedPage } from "./-publicRouteComponents";

function TermsRouteComponent() {
  return (
    <RoutedPage pathname="/terms">
      <TermsOfServicePage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/_public/terms")({
  staticData: { permission: "public" },
  component: TermsRouteComponent,
});
