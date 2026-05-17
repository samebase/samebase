import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "#src/components/AuthenticatedAppRoutePage.tsx";
import { AddRepository } from "#src/components/AddRepository.tsx";

function AddRepositoryRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <AddRepository />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/add")({
  component: AddRepositoryRouteComponent,
});
