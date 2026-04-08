import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { lazy } from "react";

const AddRepository = lazy(async () => {
  const module = await import("@/components/AddRepository");
  return { default: module.AddRepository };
});

export function AddRepositoryRoutePage() {
  return (
    <AuthenticatedAppRoutePage>
      <AddRepository />
    </AuthenticatedAppRoutePage>
  );
}
