import { createFileRoute } from "@tanstack/react-router";
import { PitchDeckPage } from "#src/components/PitchDeckPage.tsx";
import { RoutedPage } from "./-publicRouteComponents";

function PitchRouteComponent() {
  return (
    <RoutedPage pathname="/pitch">
      <PitchDeckPage mode="interactive" />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/pitch")({
  component: PitchRouteComponent,
});
