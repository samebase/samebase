import { Infer, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { type BillingResourceKind, vBillingResourceKind } from "./billingResourceQuotaModel";
import { query } from "./functions";

const { id, literal, null: nullValue, number, object, string, union } = v;

const FREE_RESOURCE_ATTACHMENT_LIMIT = 5;
const PRO_RESOURCE_ATTACHMENT_LIMIT = 40;
const RESOURCE_USAGE_READ_LIMIT = PRO_RESOURCE_ATTACHMENT_LIMIT + 1;
const RESERVATION_CLAIM_TTL_MS = 10 * 60 * 1_000;
const RESERVATION_PROVIDER_CREATED_TTL_MS = 24 * 60 * 60 * 1_000;
const EXPIRED_RESERVATION_CLEANUP_BATCH_SIZE = 20;

type BillingResourceReadCtx = Pick<QueryCtx, "db">;
type BillingResourceMutationCtx = Pick<MutationCtx, "db">;

type BillingResourceReservationIdentity = {
  kind: BillingResourceKind;
  operationKey: string;
  reservationId: Id<"billingResourceReservations">;
  userId: Id<"users">;
};

const vResourceAttachmentCount = union(
  object({
    state: literal("exact"),
    count: number(),
  }),
  object({
    state: literal("at_least"),
    count: number(),
  }),
);

const vResourceAttachmentUsage = object({
  used: vResourceAttachmentCount,
  limit: number(),
});

const vBillingResourceUsage = object({
  cloudflareWorkers: vResourceAttachmentUsage,
  convexProjects: vResourceAttachmentUsage,
});
export type BillingResourceUsage = Infer<typeof vBillingResourceUsage>;

export function manualBillingResourceOperationKey(args: {
  providerScopeId: string;
  resourceName: string;
  vaultId: Id<"vaults">;
}): string {
  return `manual:${args.vaultId}\u0000${args.providerScopeId}\u0000${args.resourceName}`;
}

export function managedBillingResourceOperationKey(
  runId: Id<"workflow_vaultProvisioning_runs">,
): string {
  return `managed:${runId}`;
}

function readResourceAttachmentLimit(
  user: Pick<Doc<"users">, "billingPlan" | "billingStatus">,
): number {
  return user.billingPlan === "pro" &&
    (user.billingStatus === "active" || user.billingStatus === "past_due")
    ? PRO_RESOURCE_ATTACHMENT_LIMIT
    : FREE_RESOURCE_ATTACHMENT_LIMIT;
}

async function readResourceAttachmentCount(
  ctx: BillingResourceReadCtx,
  args: {
    kind: BillingResourceKind;
    userId: Id<"users">;
    maximumRows: number;
  },
): Promise<number> {
  switch (args.kind) {
    case "cloudflare_worker":
      return (
        await ctx.db
          .query("vaultCloudflareWorkers")
          .withIndex("by_user", (q) => q.eq("userId", args.userId))
          .take(args.maximumRows)
      ).length;
    case "convex_project":
      return (
        await ctx.db
          .query("vaultConvexProjects")
          .withIndex("by_user", (q) => q.eq("userId", args.userId))
          .take(args.maximumRows)
      ).length;
    default:
      args.kind satisfies never;
      return 0;
  }
}

function throwBillingResourceLimit(kind: BillingResourceKind, limit: number): never {
  switch (kind) {
    case "cloudflare_worker":
      throw new Error(`Cloudflare Worker attachment limit reached (${limit}).`);
    case "convex_project":
      throw new Error(`Convex project attachment limit reached (${limit}).`);
    default:
      kind satisfies never;
      throw new Error("Unsupported billing resource kind.");
  }
}

async function readLiveReservations(
  ctx: BillingResourceMutationCtx,
  args: {
    kind: BillingResourceKind;
    now: number;
    userId: Id<"users">;
  },
): Promise<Array<Doc<"billingResourceReservations">>> {
  return await ctx.db
    .query("billingResourceReservations")
    .withIndex("by_userId_and_kind_and_expiresAt", (q) =>
      q.eq("userId", args.userId).eq("kind", args.kind).gt("expiresAt", args.now),
    )
    .take(PRO_RESOURCE_ATTACHMENT_LIMIT + 1);
}

async function requireReservationIdentity(
  ctx: BillingResourceMutationCtx,
  args: BillingResourceReservationIdentity,
): Promise<Doc<"billingResourceReservations">> {
  const reservation = await ctx.db.get(args.reservationId);
  if (
    !reservation ||
    reservation.userId !== args.userId ||
    reservation.kind !== args.kind ||
    reservation.operationKey !== args.operationKey
  ) {
    throw new Error("Billing resource reservation not found.");
  }
  return reservation;
}

async function readLimitForUser(
  ctx: BillingResourceMutationCtx,
  userId: Id<"users">,
): Promise<number> {
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("User not found.");
  }
  return readResourceAttachmentLimit(user);
}

async function requireUnreservedCapacity(
  ctx: BillingResourceMutationCtx,
  args: {
    additionalResources: number;
    kind: BillingResourceKind;
    now: number;
    ownReservationId: Id<"billingResourceReservations"> | null;
    userId: Id<"users">;
  },
): Promise<void> {
  const limit = await readLimitForUser(ctx, args.userId);
  const [used, liveReservations] = await Promise.all([
    readResourceAttachmentCount(ctx, {
      kind: args.kind,
      userId: args.userId,
      maximumRows: limit + 1,
    }),
    readLiveReservations(ctx, args),
  ]);
  const reservedByOtherOperations = liveReservations.filter(
    (reservation) => reservation._id !== args.ownReservationId,
  ).length;
  if (used + reservedByOtherOperations + args.additionalResources > limit) {
    throwBillingResourceLimit(args.kind, limit);
  }
}

export const claimBillingResourceReservation = internalMutation({
  args: {
    userId: id("users"),
    kind: vBillingResourceKind,
    operationKey: string(),
  },
  returns: id("billingResourceReservations"),
  handler: async (ctx, args): Promise<Id<"billingResourceReservations">> => {
    const now = Date.now();
    const existing = await ctx.db
      .query("billingResourceReservations")
      .withIndex("by_userId_and_kind_and_operationKey", (q) =>
        q.eq("userId", args.userId).eq("kind", args.kind).eq("operationKey", args.operationKey),
      )
      .unique();
    if (existing && existing.expiresAt > now) {
      await requireUnreservedCapacity(ctx, {
        ...args,
        additionalResources: 1,
        now,
        ownReservationId: existing._id,
      });
      const ttl =
        existing.state === "provider_created"
          ? RESERVATION_PROVIDER_CREATED_TTL_MS
          : RESERVATION_CLAIM_TTL_MS;
      const expiresAt = Math.max(existing.expiresAt, now + ttl);
      if (expiresAt !== existing.expiresAt) {
        await ctx.db.patch(existing._id, { expiresAt });
      }
      return existing._id;
    }
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    const expired = await ctx.db
      .query("billingResourceReservations")
      .withIndex("by_userId_and_kind_and_expiresAt", (q) =>
        q.eq("userId", args.userId).eq("kind", args.kind).lte("expiresAt", now),
      )
      .take(EXPIRED_RESERVATION_CLEANUP_BATCH_SIZE);
    for (const reservation of expired) {
      await ctx.db.delete(reservation._id);
    }

    await requireUnreservedCapacity(ctx, {
      ...args,
      additionalResources: 1,
      now,
      ownReservationId: null,
    });
    return await ctx.db.insert("billingResourceReservations", {
      ...args,
      state: "claimed",
      expiresAt: now + RESERVATION_CLAIM_TTL_MS,
    });
  },
});

export const markBillingResourceReservationProviderCreated = internalMutation({
  args: {
    reservationId: id("billingResourceReservations"),
    userId: id("users"),
    kind: vBillingResourceKind,
    operationKey: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const reservation = await requireReservationIdentity(ctx, args);
    const now = Date.now();
    if (reservation.expiresAt <= now) {
      await requireUnreservedCapacity(ctx, {
        additionalResources: 1,
        kind: args.kind,
        now,
        ownReservationId: null,
        userId: args.userId,
      });
    }
    await ctx.db.patch(reservation._id, {
      state: "provider_created",
      expiresAt: now + RESERVATION_PROVIDER_CREATED_TTL_MS,
    });
    return null;
  },
});

export const releaseUnusedBillingResourceReservation = internalMutation({
  args: {
    reservationId: id("billingResourceReservations"),
    userId: id("users"),
    kind: vBillingResourceKind,
    operationKey: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation) {
      return null;
    }
    await requireReservationIdentity(ctx, args);
    if (reservation.state === "claimed") {
      await ctx.db.delete(reservation._id);
    }
    return null;
  },
});

export async function consumeBillingResourceReservationForExistingAttachment(
  ctx: BillingResourceMutationCtx,
  args: BillingResourceReservationIdentity,
): Promise<void> {
  const reservation = await ctx.db.get(args.reservationId);
  if (!reservation) {
    return;
  }
  await requireReservationIdentity(ctx, args);
  await ctx.db.delete(reservation._id);
}

export async function requireBillingResourceCapacity(
  ctx: BillingResourceMutationCtx,
  args: {
    additionalResources: number;
    kind: BillingResourceKind;
    reservation: {
      operationKey: string;
      reservationId: Id<"billingResourceReservations">;
    } | null;
    userId: Id<"users">;
  },
): Promise<void> {
  if (args.additionalResources === 0) {
    return;
  }
  const reservation = args.reservation
    ? await requireReservationIdentity(ctx, {
        ...args,
        ...args.reservation,
      })
    : null;
  await requireUnreservedCapacity(ctx, {
    additionalResources: args.additionalResources,
    kind: args.kind,
    now: Date.now(),
    ownReservationId: reservation?._id ?? null,
    userId: args.userId,
  });
  if (reservation) {
    await ctx.db.delete(reservation._id);
  }
}

export const getViewerBillingResourceUsage = query({
  access: "access_user_preferences",
  args: {},
  returns: vBillingResourceUsage,
  handler: async (ctx): Promise<BillingResourceUsage> => {
    const limit = readResourceAttachmentLimit(ctx.viewer.user);
    const [cloudflareWorkers, convexProjects] = await Promise.all([
      readResourceAttachmentCount(ctx, {
        kind: "cloudflare_worker",
        userId: ctx.viewer.userId,
        maximumRows: RESOURCE_USAGE_READ_LIMIT,
      }),
      readResourceAttachmentCount(ctx, {
        kind: "convex_project",
        userId: ctx.viewer.userId,
        maximumRows: RESOURCE_USAGE_READ_LIMIT,
      }),
    ]);

    const toUsageCount = (count: number) =>
      count === RESOURCE_USAGE_READ_LIMIT
        ? { state: "at_least" as const, count }
        : { state: "exact" as const, count };

    return {
      cloudflareWorkers: { used: toUsageCount(cloudflareWorkers), limit },
      convexProjects: { used: toUsageCount(convexProjects), limit },
    };
  },
});
