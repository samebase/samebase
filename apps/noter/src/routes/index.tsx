import { createFileRoute } from "@tanstack/react-router";
import { RootIndexRoutePage } from "@/components/RootIndexRoutePage";

export const Route = createFileRoute("/_public/")({
  component: RootIndexRoutePage,
});
