import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { LogoMengerDepthTransitionPage } from "@/components/logo/LogoMengerDepthTransitionPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

const pathname = "/logo/transition/menger";

function LogoMengerTransitionRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <LogoMengerDepthTransitionPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/logo/transition/menger")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: LogoMengerTransitionRouteComponent,
});
