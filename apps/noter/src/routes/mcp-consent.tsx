import { createFileRoute } from "@tanstack/react-router";
import { McpConsentRoutePage } from "@/components/McpConsentRoutePage";
import {
  MCP_CONSENT_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateMcpConsentRouteSearch,
} from "@/lib/authenticatedRouteSearch";

export const Route = createFileRoute("/oauth/mcp/consent")({
  ssr: false,
  staticData: {
    permission: "admin",
    searchParamSuggestions: MCP_CONSENT_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: McpConsentRoutePage,
  validateSearch: validateMcpConsentRouteSearch,
});
