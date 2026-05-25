import { createFileRoute } from "@tanstack/react-router";
import { PitchDeckPage } from "@/components/PitchDeckPage";
import { RoutedPage } from "./-publicRouteComponents";

function PitchRouteComponent() {
  return (
    <RoutedPage pathname="/pitch">
      <PitchDeckPage mode="interactive" />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/pitch")({
  ssr: false,
  staticData: { permission: "admin" },
  component: PitchRouteComponent,
});
