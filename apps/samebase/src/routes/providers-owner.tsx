import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ProviderConnectionsPage } from "@/components/ProviderConnectionsPage";
import { PROVIDERS_OWNER_ROUTE } from "@/lib/providersRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function ProvidersOwnerRouteComponent() {
  const { owner } = Route.useParams();

  return (
    <AuthenticatedAppRoutePage>
      <ProviderConnectionsPage githubOwnerLogin={owner} />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/providers/$owner")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[PROVIDERS_OWNER_ROUTE],
  component: ProvidersOwnerRouteComponent,
});
