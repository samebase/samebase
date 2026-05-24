import { normalizeRouteSearchPresenceFlags } from "@/lib/routeSearchFlags";
import {
  readRouteSearchParamSuggestions,
  readRouteSearchPresenceKeys,
  type RouteSearchParamMetadata,
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
const machineConnectRouteSearchParamMetadata = {
  openedByCli: { permission: "admin", suggestion: "route", valueKind: "presence" },
  requestId: { permission: "admin", suggestion: "route", valueKind: "value" },
} as const satisfies Readonly<Record<string, RouteSearchParamMetadata>>;

const MACHINE_CONNECT_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  machineConnectRouteSearchParamMetadata,
);

function readOptionalPricingCheckoutState(value: unknown): "success" | "cancel" | undefined {
  if (value === "success" || value === "cancel") {
    return value;
  }

  return undefined;
}

const mcpConsentRouteSearchSchema = z.object({
  mcp_consent_request: z.preprocess(readOptionalString, z.string().optional()),
});

export type McpConsentRouteSearch = z.infer<typeof mcpConsentRouteSearchSchema>;

const mcpConsentRouteSearchParamMetadata = {
  mcp_consent_request: { permission: "admin", suggestion: "route", valueKind: "value" },
} as const satisfies Readonly<Record<keyof McpConsentRouteSearch, RouteSearchParamMetadata>>;

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
  checkout: z.preprocess(
    readOptionalPricingCheckoutState,
    z.enum(pricingCheckoutValues).optional(),
  ),
});

export type PricingRouteSearch = z.infer<typeof pricingRouteSearchSchema>;

const pricingRouteSearchParamMetadata = {
  checkout: { permission: "admin", suggestion: "route", valueKind: "value" },
} as const satisfies Readonly<Record<keyof PricingRouteSearch, RouteSearchParamMetadata>>;

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
  openedByCli: z.literal(true).optional(),
  requestId: z.preprocess(readOptionalString, z.string().optional()),
});

export type MachineConnectRouteSearch = z.infer<typeof machineConnectRouteSearchSchema>;

const machineConnectRouteSearchParamMetadataByKey: Readonly<
  Record<keyof MachineConnectRouteSearch, RouteSearchParamMetadata>
> = machineConnectRouteSearchParamMetadata;

export const MACHINE_CONNECT_ROUTE_SEARCH_PARAM_SUGGESTIONS = readRouteSearchParamSuggestions(
  machineConnectRouteSearchParamMetadataByKey,
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
  machineId: z.preprocess(readOptionalString, z.string().optional()),
  threadId: z.preprocess(readOptionalString, z.string().optional()),
});

export type MachinesRouteSearch = z.infer<typeof machinesRouteSearchSchema>;

const machinesRouteSearchParamMetadata = {
  machineId: { permission: "admin", suggestion: "route", valueKind: "value" },
  threadId: { permission: "admin", suggestion: "route", valueKind: "value" },
} as const satisfies Readonly<Record<keyof MachinesRouteSearch, RouteSearchParamMetadata>>;

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
