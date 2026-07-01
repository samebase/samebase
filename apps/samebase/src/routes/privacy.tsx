import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPolicyPage } from "@/components/PrivacyPolicyPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
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
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    appWorkspaceRouteChrome: { left: "none" },
  },
  component: PrivacyRouteComponent,
});
