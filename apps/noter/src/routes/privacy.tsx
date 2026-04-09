import { createFileRoute } from "@tanstack/react-router";
import { PrivacyRoutePage } from "./-publicRouteComponents";

export const Route = createFileRoute("/privacy")({
  component: PrivacyRoutePage,
});
