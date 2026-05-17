import { createFileRoute } from "@tanstack/react-router";
import { PitchDeckPage } from "#src/components/PitchDeckPage.tsx";
import { RoutedPage } from "./-publicRouteComponents";

function PitchPrintMobileRouteComponent() {
  return (
    <RoutedPage pathname="/pitch/print/mobile">
      <PitchDeckPage mode="printMobile" />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/pitch/print/mobile")({
  component: PitchPrintMobileRouteComponent,
});
