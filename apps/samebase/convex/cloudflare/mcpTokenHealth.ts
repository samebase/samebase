import { Infer, v } from "convex/values";

const { literal, number, object, optional, string, union } = v;
export const MCP_EXPIRING_SOON_MS = 15 * 60 * 1000;

export const vMcpTokenHealthStatus = union(
  literal("valid"),
  literal("expiring_soon"),
  literal("expired"),
  literal("invalid"),
  literal("unknown"),
);
export type McpTokenHealthStatus = Infer<typeof vMcpTokenHealthStatus>;

export const vMcpTokenHealthSource = union(
  literal("expiry_metadata"),
  literal("refresh_attempt"),
  literal("active_probe"),
  literal("runtime_error"),
);
export type McpTokenHealthSource = Infer<typeof vMcpTokenHealthSource>;

export const vMcpTokenHealth = object({
  status: vMcpTokenHealthStatus,
  checkedAt: number(),
  expiresAt: optional(number()),
  source: vMcpTokenHealthSource,
  errorMessage: optional(string()),
});
export type McpTokenHealth = Infer<typeof vMcpTokenHealth>;

export function deriveMcpTokenStatusFromExpiry(
  expiresAt: number | undefined,
  now: number = Date.now(),
): Infer<typeof vMcpTokenHealthStatus> {
  if (typeof expiresAt !== "number") {
    return "unknown";
  }
  if (expiresAt <= now) {
    return "expired";
  }
  if (expiresAt <= now + MCP_EXPIRING_SOON_MS) {
    return "expiring_soon";
  }
  return "valid";
}
