import { createFileRoute } from "@tanstack/react-router";
import { PitchDeckPage } from "@/components/PitchDeckPage";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

function PitchRouteComponent() {
  return (
    <RoutedPage pathname="/pitch">
      <PitchDeckPage mode="interactive" />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/pitch")({
  staticData: NOTER_ROUTE_ACCESS_METADATA_BY_PATH["/pitch"],
  component: PitchRouteComponent,
});
