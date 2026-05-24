import { createFileRoute } from "@tanstack/react-router";
import { McpConsentRoutePage } from "@/components/McpConsentRoutePage";
import { validateMcpConsentRouteSearch } from "@/lib/authenticatedRouteSearch";

export const Route = createFileRoute("/oauth/mcp/consent")({
  staticData: { permission: "admin" },
  component: McpConsentRoutePage,
  validateSearch: validateMcpConsentRouteSearch,
});
