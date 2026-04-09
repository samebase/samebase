import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { RoutedPage } from "./-publicRouteComponents";

const LogoTransitionTransformsLabPage = lazy(async () => {
  const module = await import("@/components/LogoTransitionTransformsLabPage");
  return { default: module.LogoTransitionTransformsLabPage };
});

function LogoTransitionTransformsLabRouteComponent() {
  return (
    <RoutedPage pathname="/logo-transition-lab-transforms">
      <LogoTransitionTransformsLabPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/logo-transition-lab-transforms")({
  component: LogoTransitionTransformsLabRouteComponent,
});
