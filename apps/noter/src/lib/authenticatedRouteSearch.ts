import { normalizeRouteSearchPresenceFlags } from "@/lib/routeSearchFlags";
import {
  readRouteSearchParamSuggestions,
  readRouteSearchPresenceKeys,
  readRouteSearchParamMetadata,
  routeSearchPresenceParam,
  routeSearchValueParam,
} from "@/lib/routeSearchParamMetadata";
import { z } from "zod";

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

const pricingCheckoutValues = ["success", "cancel"] as const;

function readOptionalPricingCheckoutState(value: unknown): "success" | "cancel" | undefined {
  if (value === "success" || value === "cancel") {
    return value;
  }

  return undefined;
}

const mcpConsentRouteSearchSchema = z.object({
  mcp_consent_request: routeSearchValueParam(
    z.preprocess(readOptionalString, z.string().optional()),
    { permission: "admin", suggestion: "route" },
  ),
});

export type McpConsentRouteSearch = z.infer<typeof mcpConsentRouteSearchSchema>;

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

const pricingRouteSearchSchema = z.object({
  checkout: routeSearchValueParam(
    z.preprocess(readOptionalPricingCheckoutState, z.enum(pricingCheckoutValues).optional()),
    {
      permission: "admin",
      suggestion: "route",
      valueSuggestions: pricingCheckoutValues,
    },
  ),
});

export type PricingRouteSearch = z.infer<typeof pricingRouteSearchSchema>;

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

const machineConnectRouteSearchSchema = z.object({
  openedByCli: routeSearchPresenceParam(z.literal(true).optional(), {
    permission: "admin",
    suggestion: "route",
  }),
  requestId: routeSearchValueParam(z.preprocess(readOptionalString, z.string().optional()), {
    permission: "admin",
    suggestion: "route",
  }),
});

export type MachineConnectRouteSearch = z.infer<typeof machineConnectRouteSearchSchema>;

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

const machinesRouteSearchSchema = z.object({
  machineId: routeSearchValueParam(z.preprocess(readOptionalString, z.string().optional()), {
    permission: "admin",
    suggestion: "route",
  }),
  threadId: routeSearchValueParam(z.preprocess(readOptionalString, z.string().optional()), {
    permission: "admin",
    suggestion: "route",
  }),
});

export type MachinesRouteSearch = z.infer<typeof machinesRouteSearchSchema>;

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
