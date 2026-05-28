import { createFileRoute } from "@tanstack/react-router";
import { PitchDeckPage } from "@/components/PitchDeckPage";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/pitch/print";

function PitchPrintRouteComponent() {
  return (
    <RoutedPage pathname={pathname}>
      <PitchDeckPage mode="print" />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/pitch/print")({
  staticData: NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: PitchPrintRouteComponent,
});
