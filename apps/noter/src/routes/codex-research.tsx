import { createFileRoute } from "@tanstack/react-router";
import { validateCodexResearchRouteSearch } from "@/lib/codexResearchRouteSearch";
import { CodexResearchRoutePage } from "./-publicRouteComponents";

export const Route = createFileRoute("/research/codex-app-server")({
  component: CodexResearchRoutePage,
  validateSearch: validateCodexResearchRouteSearch,
});
