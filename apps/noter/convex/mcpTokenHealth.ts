import { Infer, v } from "convex/values";

const { literal, number, object, optional, union } = v;

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
  errorMessage: optional(v.string()),
});
export type McpTokenHealth = Infer<typeof mcpTokenHealthValidator>;
