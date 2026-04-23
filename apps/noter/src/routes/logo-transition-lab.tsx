import { createFileRoute } from "@tanstack/react-router";
import { LogoTransitionLabPage } from "@/components/LogoTransitionLabPage";
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
