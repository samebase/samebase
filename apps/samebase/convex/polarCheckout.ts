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
    state: literal("open"),
    url: string(),
  }),
);
export type PolarCheckoutReservation = Infer<typeof vPolarCheckoutReservation>;

const POLAR_CHECKOUT_CREATION_LEASE_MS = 60_000;
const POLAR_CHECKOUT_MAX_LIST_PAGES = 10;

function isReusablePolarCheckout(args: {
  attemptId: string;
  checkout: Checkout;
  externalCustomerId: string;
  productId: string;
}): boolean {
  return (
    args.checkout.status === "open" &&
    args.checkout.expiresAt.getTime() > Date.now() &&
    args.checkout.externalCustomerId === args.externalCustomerId &&
    args.checkout.products.some((product) => product.id === args.productId) &&
    args.checkout.metadata.source === "samebase_account" &&
    args.checkout.metadata.plan === "pro" &&
    args.checkout.metadata.samebase_checkout_attempt_id === args.attemptId
  );
}

export async function findReusablePolarCheckout(args: {
  polar: Polar;
  attemptId: string;
  externalCustomerId: string;
  productId: string;
}): Promise<Checkout | null> {
  const pages = await args.polar.checkouts.list({
    externalCustomerId: args.externalCustomerId,
    productId: args.productId,
    status: "open",
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
        !isReusablePolarCheckout({
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

    const now = Date.now();
    const existing = user.billingPolarCheckoutAttempt;
    if (existing?.state === "open" && existing.expiresAt > now) {
      return { state: "open", url: existing.url };
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

export const confirmCreationLease = internalMutation({
  args: {
    userId: id("users"),
    attemptId: string(),
    leaseId: string(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
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
        ...attempt,
        leaseExpiresAt: now + POLAR_CHECKOUT_CREATION_LEASE_MS,
      },
    });
    return true;
  },
});

export const recordOpen = internalMutation({
  args: {
    userId: id("users"),
    attemptId: string(),
    leaseId: string(),
    checkoutId: string(),
    url: string(),
    expiresAt: number(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return false;
    }
    const attempt = user.billingPolarCheckoutAttempt;
    if (
      attempt?.state === "open" &&
      attempt.attemptId === args.attemptId &&
      attempt.checkoutId === args.checkoutId
    ) {
      return true;
    }
    if (
      attempt?.state !== "creating" ||
      attempt.attemptId !== args.attemptId ||
      attempt.leaseId !== args.leaseId
    ) {
      return false;
    }

    await ctx.db.patch(user._id, {
      billingPolarCheckoutAttempt: {
        state: "open",
        attemptId: args.attemptId,
        checkoutId: args.checkoutId,
        url: args.url,
        expiresAt: args.expiresAt,
      },
    });
    return true;
  },
});

export const releaseCreationLease = internalMutation({
  args: {
    userId: id("users"),
    attemptId: string(),
    leaseId: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return null;
    }
    const attempt = user.billingPolarCheckoutAttempt;
    if (
      attempt?.state === "creating" &&
      attempt.attemptId === args.attemptId &&
      attempt.leaseId === args.leaseId
    ) {
      await ctx.db.patch(user._id, { billingPolarCheckoutAttempt: undefined });
    }
    return null;
  },
});
