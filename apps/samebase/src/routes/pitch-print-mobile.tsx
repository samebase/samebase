import { createFileRoute } from "@tanstack/react-router";
import { PitchDeckPage } from "@/components/PitchDeckPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/pitch/print/mobile";

function PitchPrintMobileRouteComponent() {
  return (
    <RoutedPage pathname={pathname}>
      <PitchDeckPage mode="printMobile" />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/_authed/pitch/print/mobile")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: PitchPrintMobileRouteComponent,
});
