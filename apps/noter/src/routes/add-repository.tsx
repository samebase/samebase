import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { lazy } from "react";

const AddRepository = lazy(async () => {
  const module = await import("@/components/AddRepository");
  return { default: module.AddRepository };
});

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
