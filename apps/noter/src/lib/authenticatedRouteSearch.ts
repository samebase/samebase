import { normalizeRouteSearchPresenceFlags } from "@/lib/routeSearchFlags";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchPresenceKeys,
  readRouteSearchParamMetadata,
  readRouteSearchStaticData,
  routeSearchNonEmptyString,
  routeSearchPresenceParam,
  routeSearchStringValue,
  routeSearchValueParam,
} from "@/lib/routeSearchParamMetadata";

const pricingCheckoutValues = ["success", "cancel"] as const;

const RouteSearchSchema_mcpConsent = defineRouteSearchParams({
  mcp_consent_request: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_mcp",
    sampleValue: "sample-request",
    suggestion: "route",
    valueType: "freeform",
  }),
});

export type McpConsentRouteSearch = InferRouteSearch<typeof RouteSearchSchema_mcpConsent>;

const mcpConsentRouteSearchParamMetadata = readRouteSearchParamMetadata(
  RouteSearchSchema_mcpConsent,
);

export const MCP_CONSENT_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  mcpConsentRouteSearchParamMetadata,
);

export function validateMcpConsentRouteSearch(
  search: Record<string, unknown>,
): McpConsentRouteSearch {
  return RouteSearchSchema_mcpConsent.parse(search);
}

const RouteSearchSchema_pricing = defineRouteSearchParams({
  checkout: routeSearchValueParam(routeSearchStringValue(pricingCheckoutValues), {
    access: "access_dashboard",
    sampleValue: "success",
    suggestion: "route",
    valueSuggestions: pricingCheckoutValues,
    valueType: "options",
  }),
});

export type PricingRouteSearch = InferRouteSearch<typeof RouteSearchSchema_pricing>;

const pricingRouteSearchParamMetadata = readRouteSearchParamMetadata(RouteSearchSchema_pricing);

export const PRICING_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  pricingRouteSearchParamMetadata,
);

export function validatePricingRouteSearch(search: Record<string, unknown>): PricingRouteSearch {
  return RouteSearchSchema_pricing.parse(search);
}

export function buildPricingRouteSearch(
  checkout: PricingRouteSearch["checkout"] | null | undefined,
): PricingRouteSearch {
  return checkout === "success" || checkout === "cancel" ? { checkout } : {};
}

const RouteSearchSchema_machineConnect = defineRouteSearchParams({
  openedByCli: routeSearchPresenceParam({
    access: "access_machines",
    suggestion: "route",
  }),
  requestId: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_machines",
    sampleValue: "sample-request",
    suggestion: "route",
    valueType: "freeform",
  }),
});

export type MachineConnectRouteSearch = InferRouteSearch<typeof RouteSearchSchema_machineConnect>;

const machineConnectRouteSearchParamMetadata = readRouteSearchParamMetadata(
  RouteSearchSchema_machineConnect,
);

const MACHINE_CONNECT_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  machineConnectRouteSearchParamMetadata,
);

export const MACHINE_CONNECT_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  machineConnectRouteSearchParamMetadata,
);

export function validateMachineConnectRouteSearch(
  search: Record<string, unknown>,
): MachineConnectRouteSearch {
  return RouteSearchSchema_machineConnect.parse(
    normalizeRouteSearchPresenceFlags(search, MACHINE_CONNECT_PRESENCE_SEARCH_KEYS),
  );
}

const RouteSearchSchema_machines = defineRouteSearchParams({
  machineId: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_machines",
    sampleValue: "sample-machine",
    suggestion: "route",
    valueType: "freeform",
  }),
  threadId: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_machines",
    sampleValue: "sample-thread",
    suggestion: "route",
    valueType: "freeform",
  }),
});

export type MachinesRouteSearch = InferRouteSearch<typeof RouteSearchSchema_machines>;

const machinesRouteSearchParamMetadata = readRouteSearchParamMetadata(RouteSearchSchema_machines);

export const MACHINES_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  machinesRouteSearchParamMetadata,
);

export function validateMachinesRouteSearch(search: Record<string, unknown>): MachinesRouteSearch {
  return RouteSearchSchema_machines.parse(search);
}

export function buildMachinesRouteSearch(args?: {
  machineId?: string | null;
  threadId?: string | null;
}): MachinesRouteSearch {
  const machineId = typeof args?.machineId === "string" ? args.machineId.trim() : "";
  const threadId = typeof args?.threadId === "string" ? args.threadId.trim() : "";

  return {
    ...(machineId.length > 0 ? { machineId } : {}),
    ...(threadId.length > 0 ? { threadId } : {}),
  };
}
