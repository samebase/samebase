import type { Checkout } from "@polar-sh/sdk/models/components/checkout";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror";
import { Infer, v } from "convex/values";

import { internalMutation } from "./_generated/server";
import {
  findBillingAccountForOrganization,
  patchBillingAccount,
  readBillingAccountState,
  requireBillingAccountForOrganization,
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
    organizationId: id("organizations"),
  },
  returns: vPolarCheckoutReservation,
  handler: async (ctx, args): Promise<PolarCheckoutReservation> => {
    const billing = await requireBillingAccountForOrganization(ctx.db, args);
    const user = billing.user;
    if (user.accountDeletion !== undefined) {
      throw new Error("Checkout is unavailable.");
    }

    const existing = readBillingAccountState(billing.account).polarCheckoutAttempt;
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
    userId: id("users"),
    organizationId: id("organizations"),
    attemptId: string(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const billing = await findBillingAccountForOrganization(ctx.db, args);
    const attempt = billing
      ? readBillingAccountState(billing.account).polarCheckoutAttempt
      : undefined;
    if (!billing || attempt?.state !== "pending" || attempt.attemptId !== args.attemptId) {
      return false;
    }

    await patchBillingAccount(ctx.db, billing.account, { polarCheckoutAttempt: undefined });
    return true;
  },
});

export const recordOpen = internalMutation({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
    attemptId: string(),
    checkoutId: string(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const billing = await findBillingAccountForOrganization(ctx.db, args);
    if (!billing) {
      return false;
    }
    const attempt = readBillingAccountState(billing.account).polarCheckoutAttempt;
    if (
      attempt?.attemptId !== args.attemptId ||
      (attempt.state === "open" && attempt.checkoutId !== args.checkoutId)
    ) {
      return false;
    }

    await patchBillingAccount(ctx.db, billing.account, {
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
    userId: id("users"),
    organizationId: id("organizations"),
    attemptId: string(),
    checkoutId: string(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const billing = await findBillingAccountForOrganization(ctx.db, args);
    const attempt = billing
      ? readBillingAccountState(billing.account).polarCheckoutAttempt
      : undefined;
    if (
      !billing ||
      attempt?.state !== "open" ||
      attempt.attemptId !== args.attemptId ||
      attempt.checkoutId !== args.checkoutId
    ) {
      return false;
    }

    await patchBillingAccount(ctx.db, billing.account, { polarCheckoutAttempt: undefined });
    return true;
  },
});
