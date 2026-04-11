import { createFileRoute } from "@tanstack/react-router";
import { LogoTransitionLabPage } from "@noter-md/logo";
import { RoutedPage } from "./-publicRouteComponents";

function LogoTransitionLabRouteComponent() {
  return (
    <RoutedPage pathname="/logo-transition-lab">
      <LogoTransitionLabPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/logo-transition-lab")({
  component: LogoTransitionLabRouteComponent,
});
