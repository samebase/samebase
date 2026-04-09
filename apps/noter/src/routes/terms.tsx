import { createFileRoute } from "@tanstack/react-router";
import { TermsRoutePage } from "./-publicRouteComponents";

export const Route = createFileRoute("/terms")({
  component: TermsRoutePage,
});
