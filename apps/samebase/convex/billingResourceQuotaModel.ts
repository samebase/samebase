import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

const { id, literal, number, string, union } = v;

export const vBillingResourceKind = union(literal("cloudflare_worker"), literal("convex_project"));
export type BillingResourceKind = Infer<typeof vBillingResourceKind>;

export const vBillingResourceReservationState = union(
  literal("claimed"),
  literal("provider_created"),
);

export const billingResourceQuotaTables = {
  billingResourceReservations: defineTable({
    userId: id("users"),
    kind: vBillingResourceKind,
    operationKey: string(),
    state: vBillingResourceReservationState,
    expiresAt: number(),
  })
    .index("by_userId_and_kind_and_operationKey", ["userId", "kind", "operationKey"])
    .index("by_userId_and_kind_and_expiresAt", ["userId", "kind", "expiresAt"]),
};
