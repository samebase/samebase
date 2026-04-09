import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { RoutedPage } from "./-publicRouteComponents";

const PitchDeckPage = lazy(async () => {
  const module = await import("@/components/PitchDeckPage");
  return { default: module.PitchDeckPage };
});

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
