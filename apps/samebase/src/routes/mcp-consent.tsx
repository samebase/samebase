import { createFileRoute } from "@tanstack/react-router";
import { McpConsentRoutePage } from "@/agentAccess/McpConsentRoutePage";
import {
  MCP_CONSENT_ROUTE_SEARCH_STATIC_DATA,
  validateMcpConsentRouteSearch,
} from "@/routeSearch/mcpConsent";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { buildPageHead, MCP_CONSENT_PAGE_METADATA } from "@/lib/pageMetadata";

const pathname = "/oauth/mcp/consent";

export const Route = createFileRoute("/oauth/mcp/consent")({
  head: () => buildPageHead(MCP_CONSENT_PAGE_METADATA),
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    ...MCP_CONSENT_ROUTE_SEARCH_STATIC_DATA,
  },
  component: McpConsentRoutePage,
  validateSearch: validateMcpConsentRouteSearch,
});
