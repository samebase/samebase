import { normalizeRouteSearchPresenceFlags } from "@/lib/routeSearchFlags";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchPresenceKeys,
  readRouteSearchStaticData,
  routeSearchNonEmptyString,
  routeSearchPresenceParam,
  routeSearchValueParam,
} from "@/lib/routeSearchParamMetadata";

const RouteSearchSchema_mcpConsent = defineRouteSearchParams({
  mcp_consent_request: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_public",
    sampleValue: "sample-request",
    suggestion: "hidden",
    valueType: "freeform",
  }),
  mcp_login_required: routeSearchPresenceParam({
    access: "access_public",
    suggestion: "hidden",
  }),
});

export type McpConsentRouteSearch = InferRouteSearch<typeof RouteSearchSchema_mcpConsent>;

const mcpConsentRouteSearchParamMetadata = readRouteSearchParamMetadata(
  RouteSearchSchema_mcpConsent,
);

const MCP_CONSENT_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  mcpConsentRouteSearchParamMetadata,
);

export const MCP_CONSENT_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  mcpConsentRouteSearchParamMetadata,
);

export function validateMcpConsentRouteSearch(
  search: Record<string, unknown>,
): McpConsentRouteSearch {
  return RouteSearchSchema_mcpConsent.parse(
    normalizeRouteSearchPresenceFlags(search, MCP_CONSENT_PRESENCE_SEARCH_KEYS),
  );
}
