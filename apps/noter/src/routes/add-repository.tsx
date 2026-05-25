import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { AddRepository } from "@/components/AddRepository";

function AddRepositoryRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <AddRepository />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/add")({
  ssr: false,
  staticData: { permission: "admin" },
  component: AddRepositoryRouteComponent,
});
