import { createFileRoute } from "@tanstack/react-router";
import { TermsOfServicePage } from "@/components/TermsOfServicePage";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

function TermsRouteComponent() {
  return (
    <RoutedPage pathname="/terms">
      <TermsOfServicePage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/terms")({
  staticData: NOTER_ROUTE_ACCESS_METADATA_BY_PATH["/terms"],
  component: TermsRouteComponent,
});
