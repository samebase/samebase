import { createFileRoute } from "@tanstack/react-router";
import { McpConsentRoutePage } from "@/components/McpConsentRoutePage";
import {
  MCP_CONSENT_ROUTE_SEARCH_STATIC_DATA,
  validateMcpConsentRouteSearch,
} from "@/routeSearch/mcpConsent";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/oauth/mcp/consent";

export const Route = createFileRoute("/oauth/mcp/consent")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    ...MCP_CONSENT_ROUTE_SEARCH_STATIC_DATA,
  },
  component: McpConsentRoutePage,
  validateSearch: validateMcpConsentRouteSearch,
});
