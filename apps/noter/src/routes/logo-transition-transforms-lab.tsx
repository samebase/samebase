import { createFileRoute } from "@tanstack/react-router";
import { LogoTransitionTransformsLabPage } from "@/components/logo/LogoTransitionTransformsLabPage";
import { RoutedPage } from "./-publicRouteComponents";

function LogoTransitionTransformsLabRouteComponent() {
  return (
    <RoutedPage pathname="/logo/transition/transforms">
      <LogoTransitionTransformsLabPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/logo/transition/transforms")({
  component: LogoTransitionTransformsLabRouteComponent,
});
