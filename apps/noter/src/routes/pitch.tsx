import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { RoutedPage } from "./-publicRouteComponents";

const PitchDeckPage = lazy(async () => {
  const module = await import("@/components/PitchDeckPage");
  return { default: module.PitchDeckPage };
});

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
