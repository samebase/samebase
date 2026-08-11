import type { Checkout } from "@polar-sh/sdk/models/components/checkout";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror";
import { ConvexError, Infer, v } from "convex/values";

import { internalMutation } from "./_generated/server";
import {
  patchBillingAccount,
  readBillingAccountState,
  requireOwnerBillingAccountForOrganization,
} from "./organizationBilling";
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

type PolarCheckoutTarget = {
  plan: "free" | "pro";
  seatQuantity: number;
};

export function matchesPolarCheckoutReservation(args: {
  attemptId: string;
  checkout: Checkout;
  externalCustomerId: string;
}): boolean {
  return (
    args.checkout.externalCustomerId === args.externalCustomerId &&
    args.checkout.metadata["source"] === "samebase_organization" &&
    args.checkout.metadata["samebase_checkout_attempt_id"] === args.attemptId
  );
}

export function matchesPolarCheckoutAttempt(
  args: {
    attemptId: string;
    checkout: Checkout;
    externalCustomerId: string;
    productId: string;
  } & PolarCheckoutTarget,
): boolean {
  return (
    matchesPolarCheckoutReservation(args) &&
    args.checkout.products.length === 1 &&
    args.checkout.products[0]?.id === args.productId &&
    args.checkout.seats === args.seatQuantity &&
    args.checkout.metadata["plan"] === args.plan &&
    args.checkout.metadata["seat_quantity"] === args.seatQuantity
  );
}

export function isOpenPolarCheckoutForAttempt(
  args: {
    attemptId: string;
    checkout: Checkout;
    externalCustomerId: string;
    productId: string;
    returnUrl: string;
    successUrl: string;
  } & PolarCheckoutTarget,
): boolean {
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
  hasSubscription: boolean;
}): boolean {
  return (
    args.checkout.status === "expired" ||
    args.checkout.status === "failed" ||
    (args.hasSubscription &&
      (args.checkout.status === "confirmed" || args.checkout.status === "succeeded"))
  );
}

export function isDefinitivePolarCheckoutFailure(error: unknown): boolean {
  return error instanceof PolarError && error.statusCode >= 400 && error.statusCode < 500;
}

export const reserveAttempt = internalMutation({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
  },
  returns: vPolarCheckoutReservation,
  handler: async (ctx, args): Promise<PolarCheckoutReservation> => {
    const billing = await requireOwnerBillingAccountForOrganization(ctx.db, args);

    const state = readBillingAccountState(billing.account);
    if (state.polarBillingUserId !== args.userId) {
      throw new ConvexError("Only the designated billing payer can manage this subscription.");
    }
    const existing = state.polarCheckoutAttempt;
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
    await patchBillingAccount(ctx.db, billing.account, {
      polarCheckoutAttempt: {
        state: "pending",
        attemptId,
      },
    });
    return { state: "pending", attemptId, canCreate: true };
  },
});

export const clearPending = internalMutation({
  args: {
    organizationId: id("organizations"),
    attemptId: string(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("organizationBillingAccounts")
      .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
      .unique();
    const attempt = account ? readBillingAccountState(account).polarCheckoutAttempt : undefined;
    if (!account || attempt?.state !== "pending" || attempt.attemptId !== args.attemptId) {
      return false;
    }

    await patchBillingAccount(ctx.db, account, { polarCheckoutAttempt: undefined });
    return true;
  },
});

export const recordOpen = internalMutation({
  args: {
    organizationId: id("organizations"),
    attemptId: string(),
    checkoutId: string(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("organizationBillingAccounts")
      .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
      .unique();
    if (!account) {
      return false;
    }
    const attempt = readBillingAccountState(account).polarCheckoutAttempt;
    if (
      attempt?.attemptId !== args.attemptId ||
      (attempt.state === "open" && attempt.checkoutId !== args.checkoutId)
    ) {
      return false;
    }

    await patchBillingAccount(ctx.db, account, {
      polarCheckoutAttempt: {
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
    organizationId: id("organizations"),
    attemptId: string(),
    checkoutId: string(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("organizationBillingAccounts")
      .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
      .unique();
    const attempt = account ? readBillingAccountState(account).polarCheckoutAttempt : undefined;
    if (
      !account ||
      attempt?.state !== "open" ||
      attempt.attemptId !== args.attemptId ||
      attempt.checkoutId !== args.checkoutId
    ) {
      return false;
    }

    await patchBillingAccount(ctx.db, account, { polarCheckoutAttempt: undefined });
    return true;
  },
});
