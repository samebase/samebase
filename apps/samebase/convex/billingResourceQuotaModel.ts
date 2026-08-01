import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

const { id, literal, number, object, string, union } = v;

export const vBillingResourceKind = union(literal("cloudflare_worker"), literal("convex_project"));
export type BillingResourceKind = Infer<typeof vBillingResourceKind>;

export const vBillingProviderResourceIdentity = union(
  object({
    kind: literal("cloudflare_worker"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
  }),
  object({
    kind: literal("convex_project"),
    teamId: string(),
    projectId: string(),
  }),
);
export type BillingProviderResourceIdentity = Infer<typeof vBillingProviderResourceIdentity>;

const vBillingResourceReservationResource = union(
  object({
    state: literal("claimed"),
    kind: vBillingResourceKind,
  }),
  object({
    state: literal("provider_created"),
    kind: literal("cloudflare_worker"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
  }),
  object({
    state: literal("provider_created"),
    kind: literal("convex_project"),
    teamId: string(),
    projectId: string(),
  }),
);

export const billingResourceQuotaTables = {
  billingResourceReservations: defineTable({
    userId: id("users"),
    operationKey: string(),
    resource: vBillingResourceReservationResource,
    expiresAt: number(),
  })
    .index("by_userId_and_kind_and_operationKey", ["userId", "resource.kind", "operationKey"])
    .index("by_userId_and_kind_and_expiresAt", ["userId", "resource.kind", "expiresAt"])
    .index("by_userId_and_cloudflare_identity_and_expiresAt", [
      "userId",
      "resource.accountId",
      "resource.workerName",
      "resource.workerTag",
      "expiresAt",
    ])
    .index("by_userId_and_convex_identity_and_expiresAt", [
      "userId",
      "resource.teamId",
      "resource.projectId",
      "expiresAt",
    ]),
};
