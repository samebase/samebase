import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ProvidersPage } from "@/components/ProvidersPage";
import { PROVIDERS_ROUTE } from "@/lib/providersRoute";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = PROVIDERS_ROUTE;

function ProvidersRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <ProvidersPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/providers")({
  staticData: NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: ProvidersRouteComponent,
});
