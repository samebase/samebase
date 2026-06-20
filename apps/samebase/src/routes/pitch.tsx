import { createFileRoute } from "@tanstack/react-router";
import { PitchDeckPage } from "@/components/PitchDeckPage";
import { SAMEBASE_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/pitch";

function PitchRouteComponent() {
  return (
    <RoutedPage pathname={pathname}>
      <PitchDeckPage mode="interactive" />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/pitch")({
  staticData: SAMEBASE_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: PitchRouteComponent,
});
