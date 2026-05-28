import { createFileRoute } from "@tanstack/react-router";
import { PitchDeckPage } from "@/components/PitchDeckPage";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

function PitchPrintMobileRouteComponent() {
  return (
    <RoutedPage pathname="/pitch/print/mobile">
      <PitchDeckPage mode="printMobile" />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/pitch/print/mobile")({
  staticData: NOTER_ROUTE_ACCESS_METADATA_BY_PATH["/pitch/print/mobile"],
  component: PitchPrintMobileRouteComponent,
});
