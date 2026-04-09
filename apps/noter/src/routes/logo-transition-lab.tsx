import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { RoutedPage } from "./-publicRouteComponents";

const LogoTransitionLabPage = lazy(async () => {
  const module = await import("@/components/LogoTransitionLabPage");
  return { default: module.LogoTransitionLabPage };
});

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
