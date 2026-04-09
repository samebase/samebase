import { createFileRoute } from "@tanstack/react-router";
import { PitchDeckPage } from "@/components/PitchDeckPage";
import { RoutedPage } from "./-publicRouteComponents";

function PitchPrintRouteComponent() {
  return (
    <RoutedPage pathname="/pitch/print">
      <PitchDeckPage mode="print" />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/pitch/print")({
  component: PitchPrintRouteComponent,
});
