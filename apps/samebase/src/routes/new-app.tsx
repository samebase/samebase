import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { NewAppPage } from "@/components/NewAppPage";
import { NEW_APP_ROUTE } from "@/lib/newAppRoute";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function NewAppRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <NewAppPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/new-app")({
  staticData: NOTER_ROUTE_ACCESS_METADATA_BY_PATH[NEW_APP_ROUTE],
  component: NewAppRouteComponent,
});
