import { createFileRoute } from "@tanstack/react-router";
import { LogoTransitionTransformsLabPage } from "@noter-md/logo";
import { RoutedPage } from "./-publicRouteComponents";

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
