import { createFileRoute } from "@tanstack/react-router";
import { validateCodexResearchRouteSearch } from "@/lib/codexResearchRouteSearch";
import { CodexThreadBrowserRoutePage } from "./-publicRouteComponents";

export const Route = createFileRoute("/research/codex-app-server/browser")({
  component: CodexThreadBrowserRoutePage,
  validateSearch: validateCodexResearchRouteSearch,
});
