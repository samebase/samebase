import type { Checkout } from "@polar-sh/sdk/models/components/checkout";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror";
import { Infer, v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { randomToken } from "./oauthUtils";

const { boolean, id, literal, object, string, union } = v;

const vPolarCheckoutReservation = union(
  object({
    state: literal("pending"),
    attemptId: string(),
    canCreate: boolean(),
  }),
  object({
    state: literal("open"),
    attemptId: string(),
    checkoutId: string(),
  }),
);
export type PolarCheckoutReservation = Infer<typeof vPolarCheckoutReservation>;

const vPolarCheckoutOperatorResolution = union(
  object({ state: literal("clear_pending") }),
  object({ state: literal("record_open"), checkoutId: string() }),
  object({ state: literal("clear_open"), checkoutId: string() }),
);

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

export function canClearPolarCheckoutAfterObservation(args: {
  checkout: Checkout;
  observedPlan: "free" | "pro";
}): boolean {
  return (
    args.checkout.status === "expired" ||
    args.checkout.status === "failed" ||
    (args.observedPlan === "pro" &&
      (args.checkout.status === "confirmed" || args.checkout.status === "succeeded"))
  );
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

    const existing = user.billingPolarCheckoutAttempt;
    if (existing?.state === "open") {
      return existing;
    }
    if (existing?.state === "pending") {
      return {
        state: "pending",
        attemptId: existing.attemptId,
        canCreate: false,
      };
    }

    const attemptId = `polar_checkout_${randomToken(18)}`;
    await ctx.db.patch(args.userId, {
      billingPolarCheckoutAttempt: {
        state: "pending",
        attemptId,
      },
    });
    return { state: "pending", attemptId, canCreate: true };
  },
});

export const clearPending = internalMutation({
  args: {
    userId: id("users"),
    attemptId: string(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const attempt = user?.billingPolarCheckoutAttempt;
    if (!user || attempt?.state !== "pending" || attempt.attemptId !== args.attemptId) {
      return false;
    }

    await ctx.db.patch(user._id, { billingPolarCheckoutAttempt: undefined });
    return true;
  },
});

export const recordOpen = internalMutation({
  args: {
    userId: id("users"),
    attemptId: string(),
    checkoutId: string(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return false;
    }
    const attempt = user.billingPolarCheckoutAttempt;
    if (
      attempt?.attemptId !== args.attemptId ||
      (attempt.state === "open" && attempt.checkoutId !== args.checkoutId)
    ) {
      return false;
    }

    await ctx.db.patch(user._id, {
      billingPolarCheckoutAttempt: {
        state: "open",
        attemptId: args.attemptId,
        checkoutId: args.checkoutId,
      },
    });
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

/**
 * Apply one checkout marker change after an operator verifies the exact Polar checkout.
 */
export const resolveAttemptForOperator = internalMutation({
  args: {
    externalCustomerId: string(),
    expectedAttemptId: string(),
    resolution: vPolarCheckoutOperatorResolution,
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const externalCustomerId = args.externalCustomerId.trim();
    if (!externalCustomerId) {
      return false;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_polar_external_customer_id", (q) =>
        q.eq("billingPolarExternalCustomerId", externalCustomerId),
      )
      .unique();
    const attempt = user?.billingPolarCheckoutAttempt;
    if (!user || attempt?.attemptId !== args.expectedAttemptId) {
      return false;
    }

    if (args.resolution.state === "clear_pending") {
      if (attempt.state !== "pending") {
        return false;
      }
      await ctx.db.patch(user._id, { billingPolarCheckoutAttempt: undefined });
      return true;
    }
    if (args.resolution.state === "record_open") {
      if (attempt.state !== "pending" || !args.resolution.checkoutId.trim()) {
        return false;
      }
      await ctx.db.patch(user._id, {
        billingPolarCheckoutAttempt: {
          state: "open",
          attemptId: args.expectedAttemptId,
          checkoutId: args.resolution.checkoutId,
        },
      });
      return true;
    }
    if (attempt.state !== "open" || attempt.checkoutId !== args.resolution.checkoutId) {
      return false;
    }
    await ctx.db.patch(user._id, { billingPolarCheckoutAttempt: undefined });
    return true;
  },
});
