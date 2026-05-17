import { createFileRoute } from "@tanstack/react-router";
import { RootIndexRoutePage } from "#src/components/RootIndexRoutePage.tsx";

export const Route = createFileRoute("/_public/")({
  component: RootIndexRoutePage,
});
