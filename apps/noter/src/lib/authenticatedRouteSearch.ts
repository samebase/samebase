import { normalizeRouteSearchPresenceFlags } from "@/lib/routeSearchFlags";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamSuggestions,
  readRouteSearchPresenceKeys,
  readRouteSearchParamMetadata,
  routeSearchNonEmptyString,
  routeSearchPresenceParam,
  routeSearchStringValue,
  routeSearchValueParam,
} from "@/lib/routeSearchParamMetadata";

const pricingCheckoutValues = ["success", "cancel"] as const;

const mcpConsentRouteSearchSchema = defineRouteSearchParams({
  mcp_consent_request: routeSearchValueParam(routeSearchNonEmptyString, {
    permission: "admin",
    sampleValue: "sample-request",
    suggestion: "route",
  }),
});

export type McpConsentRouteSearch = InferRouteSearch<typeof mcpConsentRouteSearchSchema>;

const mcpConsentRouteSearchParamMetadata = readRouteSearchParamMetadata(
  mcpConsentRouteSearchSchema,
);

export const MCP_CONSENT_ROUTE_SEARCH_PARAM_SUGGESTIONS = readRouteSearchParamSuggestions(
  mcpConsentRouteSearchParamMetadata,
  "route",
);

export function validateMcpConsentRouteSearch(
  search: Record<string, unknown>,
): McpConsentRouteSearch {
  return mcpConsentRouteSearchSchema.parse(search);
}

const pricingRouteSearchSchema = defineRouteSearchParams({
  checkout: routeSearchValueParam(routeSearchStringValue(pricingCheckoutValues), {
    permission: "admin",
    sampleValue: "success",
    suggestion: "route",
    valueSuggestions: pricingCheckoutValues,
  }),
});

export type PricingRouteSearch = InferRouteSearch<typeof pricingRouteSearchSchema>;

const pricingRouteSearchParamMetadata = readRouteSearchParamMetadata(pricingRouteSearchSchema);

export const PRICING_ROUTE_SEARCH_PARAM_SUGGESTIONS = readRouteSearchParamSuggestions(
  pricingRouteSearchParamMetadata,
  "route",
);

export function validatePricingRouteSearch(search: Record<string, unknown>): PricingRouteSearch {
  return pricingRouteSearchSchema.parse(search);
}

export function buildPricingRouteSearch(
  checkout: PricingRouteSearch["checkout"] | null | undefined,
): PricingRouteSearch {
  return checkout === "success" || checkout === "cancel" ? { checkout } : {};
}

const machineConnectRouteSearchSchema = defineRouteSearchParams({
  openedByCli: routeSearchPresenceParam({
    permission: "admin",
    suggestion: "route",
  }),
  requestId: routeSearchValueParam(routeSearchNonEmptyString, {
    permission: "admin",
    sampleValue: "sample-request",
    suggestion: "route",
  }),
});

export type MachineConnectRouteSearch = InferRouteSearch<typeof machineConnectRouteSearchSchema>;

const machineConnectRouteSearchParamMetadata = readRouteSearchParamMetadata(
  machineConnectRouteSearchSchema,
);

const MACHINE_CONNECT_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  machineConnectRouteSearchParamMetadata,
);

export const MACHINE_CONNECT_ROUTE_SEARCH_PARAM_SUGGESTIONS = readRouteSearchParamSuggestions(
  machineConnectRouteSearchParamMetadata,
  "route",
);

export function validateMachineConnectRouteSearch(
  search: Record<string, unknown>,
): MachineConnectRouteSearch {
  return machineConnectRouteSearchSchema.parse(
    normalizeRouteSearchPresenceFlags(search, MACHINE_CONNECT_PRESENCE_SEARCH_KEYS),
  );
}

const machinesRouteSearchSchema = defineRouteSearchParams({
  machineId: routeSearchValueParam(routeSearchNonEmptyString, {
    permission: "admin",
    sampleValue: "sample-machine",
    suggestion: "route",
  }),
  threadId: routeSearchValueParam(routeSearchNonEmptyString, {
    permission: "admin",
    sampleValue: "sample-thread",
    suggestion: "route",
  }),
});

export type MachinesRouteSearch = InferRouteSearch<typeof machinesRouteSearchSchema>;

const machinesRouteSearchParamMetadata = readRouteSearchParamMetadata(machinesRouteSearchSchema);

export const MACHINES_ROUTE_SEARCH_PARAM_SUGGESTIONS = readRouteSearchParamSuggestions(
  machinesRouteSearchParamMetadata,
  "route",
);

export function validateMachinesRouteSearch(search: Record<string, unknown>): MachinesRouteSearch {
  return machinesRouteSearchSchema.parse(search);
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
