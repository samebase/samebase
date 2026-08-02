import type { Polar } from "@polar-sh/sdk";
import type { Checkout } from "@polar-sh/sdk/models/components/checkout";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror";
import { Infer, v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { randomToken } from "./oauthUtils";

const { boolean, id, literal, null: nullValue, number, object, string, union } = v;

const vPolarCheckoutReservation = union(
  object({
    state: literal("creating"),
    attemptId: string(),
    leaseId: string(),
    canCreate: boolean(),
  }),
  object({
    state: literal("recovering"),
    attemptId: string(),
    recoverUntilAt: number(),
  }),
  object({
    state: literal("open"),
    attemptId: string(),
    checkoutId: string(),
    expiresAt: number(),
  }),
);
export type PolarCheckoutReservation = Infer<typeof vPolarCheckoutReservation>;

const POLAR_CHECKOUT_CREATION_LEASE_MS = 60_000;
const POLAR_CHECKOUT_MAX_LIST_PAGES = 10;
export const POLAR_CHECKOUT_EXPIRY_SAFETY_MARGIN_MS = 60_000;

// Polar checkouts expire after 24 hours. The extra minute covers a request that reaches Polar at
// the end of the local request timeout and provider clock skew during account deletion.
const POLAR_CHECKOUT_RECOVERY_WINDOW_MS =
  24 * 60 * 60 * 1_000 + POLAR_CHECKOUT_EXPIRY_SAFETY_MARGIN_MS;

export function matchesPolarCheckoutAttempt(args: {
  attemptId: string;
  checkout: Checkout;
  externalCustomerId: string;
  productId: string;
}): boolean {
  return (
    args.checkout.externalCustomerId === args.externalCustomerId &&
    args.checkout.products.length === 1 &&
    args.checkout.products[0]?.id === args.productId &&
    args.checkout.metadata.source === "samebase_account" &&
    args.checkout.metadata.plan === "pro" &&
    args.checkout.metadata.samebase_checkout_attempt_id === args.attemptId
  );
}

export function isOpenPolarCheckoutForAttempt(args: {
  attemptId: string;
  checkout: Checkout;
  externalCustomerId: string;
  productId: string;
  returnUrl: string;
  successUrl: string;
}): boolean {
  return (
    matchesPolarCheckoutAttempt(args) &&
    args.checkout.successUrl === args.successUrl &&
    args.checkout.returnUrl === args.returnUrl &&
    args.checkout.status === "open" &&
    args.checkout.expiresAt.getTime() > Date.now()
  );
}

export function isPolarCheckoutUnavailable(checkout: Checkout): boolean {
  return (
    checkout.status === "expired" ||
    checkout.status === "failed" ||
    (checkout.status === "open" && checkout.expiresAt.getTime() <= Date.now())
  );
}

export async function findPolarCheckoutForAttempt(args: {
  polar: Polar;
  attemptId: string;
  externalCustomerId: string;
  productId: string;
}): Promise<Checkout | null> {
  const pages = await args.polar.checkouts.list({
    externalCustomerId: args.externalCustomerId,
    productId: args.productId,
    sorting: ["-created_at"],
    limit: 100,
  });
  let pageCount = 0;
  let selected: Checkout | null = null;

  for await (const page of pages) {
    pageCount += 1;
    if (pageCount > POLAR_CHECKOUT_MAX_LIST_PAGES) {
      throw new Error("Polar checkout pagination exceeded the supported bound.");
    }

    for (const checkout of page.result.items) {
      if (
        !matchesPolarCheckoutAttempt({
          attemptId: args.attemptId,
          checkout,
          externalCustomerId: args.externalCustomerId,
          productId: args.productId,
        })
      ) {
        continue;
      }

      if (
        selected === null ||
        checkout.createdAt.getTime() > selected.createdAt.getTime() ||
        (checkout.createdAt.getTime() === selected.createdAt.getTime() &&
          checkout.id.localeCompare(selected.id) < 0)
      ) {
        selected = checkout;
      }
    }
  }

  return selected;
}

export function isDefinitivePolarCheckoutFailure(error: unknown): boolean {
  return error instanceof PolarError && error.statusCode >= 400 && error.statusCode < 500;
}

export const reserveAttempt = internalMutation({
  args: {
    userId: id("users"),
  },
  returns: vPolarCheckoutReservation,
  handler: async (ctx, args): Promise<PolarCheckoutReservation> => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found.");
    }
    if (user.accountDeletion !== undefined) {
      throw new Error("Checkout is unavailable.");
    }

    const now = Date.now();
    const existing = user.billingPolarCheckoutAttempt;
    if (existing?.state === "open") {
      return existing;
    }
    if (existing?.state === "recovering") {
      return existing;
    }
    if (existing?.state === "creating" && existing.leaseExpiresAt > now) {
      return {
        state: "creating",
        attemptId: existing.attemptId,
        leaseId: existing.leaseId,
        canCreate: false,
      };
    }

    const attemptId =
      existing?.state === "creating" ? existing.attemptId : `polar_checkout_${randomToken(18)}`;
    const leaseId = randomToken(18);
    await ctx.db.patch(args.userId, {
      billingPolarCheckoutAttempt: {
        state: "creating",
        attemptId,
        leaseId,
        leaseExpiresAt: now + POLAR_CHECKOUT_CREATION_LEASE_MS,
      },
    });
    return { state: "creating", attemptId, leaseId, canCreate: true };
  },
});

export const beginRecovery = internalMutation({
  args: {
    userId: id("users"),
    attemptId: string(),
    leaseId: string(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.accountDeletion !== undefined) {
      return false;
    }
    const attempt = user.billingPolarCheckoutAttempt;
    const now = Date.now();
    if (
      attempt?.state !== "creating" ||
      attempt.attemptId !== args.attemptId ||
      attempt.leaseId !== args.leaseId ||
      attempt.leaseExpiresAt <= now
    ) {
      return false;
    }

    await ctx.db.patch(user._id, {
      billingPolarCheckoutAttempt: {
        state: "recovering",
        attemptId: args.attemptId,
        recoverUntilAt: now + POLAR_CHECKOUT_RECOVERY_WINDOW_MS,
      },
    });
    return true;
  },
});

export const recordOpen = internalMutation({
  args: {
    userId: id("users"),
    attemptId: string(),
    checkoutId: string(),
    expiresAt: number(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return false;
    }
    const attempt = user.billingPolarCheckoutAttempt;
    if (attempt?.attemptId !== args.attemptId) {
      return false;
    }
    if (attempt.state === "open" && attempt.checkoutId !== args.checkoutId) {
      return false;
    }

    await ctx.db.patch(user._id, {
      billingPolarCheckoutAttempt: {
        state: "open",
        attemptId: args.attemptId,
        checkoutId: args.checkoutId,
        expiresAt: args.expiresAt,
      },
    });
    return true;
  },
});

export const releaseRecovery = internalMutation({
  args: {
    userId: id("users"),
    attemptId: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (
      user?.billingPolarCheckoutAttempt?.state === "recovering" &&
      user.billingPolarCheckoutAttempt.attemptId === args.attemptId
    ) {
      await ctx.db.patch(user._id, { billingPolarCheckoutAttempt: undefined });
    }
    return null;
  },
});

export const expireRecovery = internalMutation({
  args: {
    userId: id("users"),
    attemptId: string(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const attempt = user?.billingPolarCheckoutAttempt;
    if (
      !user ||
      attempt?.state !== "recovering" ||
      attempt.attemptId !== args.attemptId ||
      attempt.recoverUntilAt > Date.now()
    ) {
      return false;
    }

    await ctx.db.patch(user._id, { billingPolarCheckoutAttempt: undefined });
    return true;
  },
});

export const clearOpen = internalMutation({
  args: {
    userId: id("users"),
    attemptId: string(),
    checkoutId: string(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const attempt = user?.billingPolarCheckoutAttempt;
    if (
      !user ||
      attempt?.state !== "open" ||
      attempt.attemptId !== args.attemptId ||
      attempt.checkoutId !== args.checkoutId
    ) {
      return false;
    }

    await ctx.db.patch(user._id, { billingPolarCheckoutAttempt: undefined });
    return true;
  },
});
