import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { NewAppPage } from "@/components/NewAppPage";
import { NEW_APP_OWNER_ROUTE } from "@/lib/newAppRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function NewAppOwnerRouteComponent() {
  const { owner } = Route.useParams();

  return (
    <AuthenticatedAppRoutePage>
      <NewAppPage githubOwnerLogin={owner} />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/new-app/$owner")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[NEW_APP_OWNER_ROUTE],
  component: NewAppOwnerRouteComponent,
});
