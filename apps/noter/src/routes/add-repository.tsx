import { createFileRoute } from "@tanstack/react-router";
import { AddRepositoryRoutePage } from "@/components/AddRepositoryRoutePage";

export const Route = createFileRoute("/add")({
  component: AddRepositoryRoutePage,
});
