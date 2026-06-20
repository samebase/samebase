import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ProviderConnectionsPage } from "@/components/ProviderConnectionsPage";
import { PROVIDERS_ROUTE } from "@/lib/providersRoute";
import { SAMEBASE_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function ProvidersRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <ProviderConnectionsPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/providers")({
  staticData: SAMEBASE_ROUTE_ACCESS_METADATA_BY_PATH[PROVIDERS_ROUTE],
  component: ProvidersRouteComponent,
});
