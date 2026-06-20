import { createFileRoute } from "@tanstack/react-router";
import { TermsOfServicePage } from "@/components/TermsOfServicePage";
import { SAMEBASE_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/terms";

function TermsRouteComponent() {
  return (
    <RoutedPage pathname={pathname}>
      <TermsOfServicePage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/terms")({
  staticData: SAMEBASE_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: TermsRouteComponent,
});
