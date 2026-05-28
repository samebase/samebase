import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPolicyPage } from "@/components/PrivacyPolicyPage";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/privacy";

function PrivacyRouteComponent() {
  return (
    <RoutedPage pathname={pathname}>
      <PrivacyPolicyPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/privacy")({
  staticData: NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: PrivacyRouteComponent,
});
