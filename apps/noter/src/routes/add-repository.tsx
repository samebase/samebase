import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { AddRepository } from "@/components/AddRepository";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function AddRepositoryRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <AddRepository />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/add")({
  staticData: NOTER_ROUTE_ACCESS_METADATA_BY_PATH["/add"],
  component: AddRepositoryRouteComponent,
});
