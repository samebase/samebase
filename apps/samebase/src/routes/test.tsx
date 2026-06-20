import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/test";

function RootTestRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <div data-testid="root-test-route">Test</div>
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/test")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: RootTestRouteComponent,
});
