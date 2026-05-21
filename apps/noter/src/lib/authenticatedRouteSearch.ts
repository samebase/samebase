import { normalizeRouteSearchPresenceFlags } from "@/lib/routeSearchFlags";
import { z } from "zod";

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

const pricingCheckoutValues = ["success", "cancel"] as const;
const MACHINE_CONNECT_PRESENCE_SEARCH_KEYS = ["openedByCli"] as const;

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
