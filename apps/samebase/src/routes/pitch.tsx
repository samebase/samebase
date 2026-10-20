import { createFileRoute } from "@tanstack/react-router";
import { PitchDeckPage } from "@/components/PitchDeckPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/pitch";

function PitchRouteComponent() {
  return (
    <RoutedPage pathname={pathname}>
      <PitchDeckPage mode="interactive" />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/_authed/pitch")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: PitchRouteComponent,
});
