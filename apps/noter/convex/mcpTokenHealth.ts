import { Infer, v } from "convex/values";

const { literal, number, object, optional, string, union } = v;
export const MCP_EXPIRING_SOON_MS = 15 * 60 * 1000;

export const mcpTokenHealthStatusValidator = union(
  literal("valid"),
  literal("expiring_soon"),
  literal("expired"),
  literal("invalid"),
  literal("unknown"),
);
export type McpTokenHealthStatus = Infer<typeof mcpTokenHealthStatusValidator>;

export const mcpTokenHealthSourceValidator = union(
  literal("expiry_metadata"),
  literal("refresh_attempt"),
  literal("active_probe"),
  literal("runtime_error"),
);
export type McpTokenHealthSource = Infer<typeof mcpTokenHealthSourceValidator>;

export const mcpTokenHealthValidator = object({
  status: mcpTokenHealthStatusValidator,
  checkedAt: number(),
  expiresAt: optional(number()),
  source: mcpTokenHealthSourceValidator,
  errorMessage: optional(string()),
});
export type McpTokenHealth = Infer<typeof mcpTokenHealthValidator>;

export function deriveMcpTokenStatusFromExpiry(
  expiresAt: number | undefined,
  now: number = Date.now(),
): Infer<typeof mcpTokenHealthStatusValidator> {
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
