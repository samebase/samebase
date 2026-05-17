import { createFileRoute } from "@tanstack/react-router";
import { LogoTransitionLabPage } from "#src/components/LogoTransitionLabPage.tsx";
import { RoutedPage } from "./-publicRouteComponents";

function LogoTransitionLabRouteComponent() {
  return (
    <RoutedPage pathname="/logo/transition">
      <LogoTransitionLabPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/logo/transition")({
  component: LogoTransitionLabRouteComponent,
});
