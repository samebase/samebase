import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { RoutedPage } from "./-publicRouteComponents";

const PitchDeckPage = lazy(async () => {
  const module = await import("@/components/PitchDeckPage");
  return { default: module.PitchDeckPage };
});

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
