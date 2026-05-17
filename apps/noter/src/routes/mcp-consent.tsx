import { createFileRoute } from "@tanstack/react-router";
import { McpConsentRoutePage } from "#src/components/McpConsentRoutePage.tsx";
import { validateMcpConsentRouteSearch } from "#src/lib/authenticatedRouteSearch.ts";

export const Route = createFileRoute("/oauth/mcp/consent")({
  component: McpConsentRoutePage,
  validateSearch: validateMcpConsentRouteSearch,
});
