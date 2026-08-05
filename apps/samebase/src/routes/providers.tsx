import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ProviderConnectionsPage } from "@/components/ProviderConnectionsPage";
import { PROVIDERS_ROUTE } from "@/lib/providersRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function ProvidersRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <ProviderConnectionsPage githubOwnerLogin={null} />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/providers")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[PROVIDERS_ROUTE],
  component: ProvidersRouteComponent,
});
