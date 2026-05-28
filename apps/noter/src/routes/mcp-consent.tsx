import { createFileRoute } from "@tanstack/react-router";
import { McpConsentRoutePage } from "@/components/McpConsentRoutePage";
import {
  MCP_CONSENT_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateMcpConsentRouteSearch,
} from "@/lib/authenticatedRouteSearch";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/oauth/mcp/consent";

export const Route = createFileRoute("/oauth/mcp/consent")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    searchParamSuggestions: MCP_CONSENT_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: McpConsentRoutePage,
  validateSearch: validateMcpConsentRouteSearch,
});
