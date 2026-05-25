import { createFileRoute } from "@tanstack/react-router";
import { PitchDeckPage } from "@/components/PitchDeckPage";
import { RoutedPage } from "./-publicRouteComponents";

function PitchPrintMobileRouteComponent() {
  return (
    <RoutedPage pathname="/pitch/print/mobile">
      <PitchDeckPage mode="printMobile" />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/pitch/print/mobile")({
  ssr: false,
  staticData: { permission: "admin" },
  component: PitchPrintMobileRouteComponent,
});
