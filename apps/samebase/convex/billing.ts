import type { Checkout } from "@polar-sh/sdk/models/components/checkout";
import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { action, query } from "./functions";
import { randomToken } from "./oauthUtils";
import { readCanonicalPolarBillingState } from "./polarBillingState";
import {
  isDefinitivePolarCheckoutFailure,
  isOpenPolarCheckoutForAttempt,
  matchesPolarCheckoutAttempt,
  type PolarCheckoutReservation,
} from "./polarCheckout";
import {
  createPolarClient,
  readPolarProMonthlyProductId,
  resolvePolarServer,
  type PolarServer,
} from "./polarClient";

const { boolean, id, literal, number, object, optional, string, union } = v;

const vBillingPlan = union(literal("free"), literal("pro"));
type BillingPlan = Infer<typeof vBillingPlan>;

const vBillingStatus = union(literal("inactive"), literal("active"), literal("past_due"));
type BillingStatus = Infer<typeof vBillingStatus>;

const vViewerBillingStatus = object({
  plan: vBillingPlan,
  status: vBillingStatus,
  currentPeriodEndAt: optional(number()),
  cancelAtPeriodEnd: optional(boolean()),
  canStartCheckout: boolean(),
  provider: optional(literal("polar")),
});
type ViewerBillingStatus = Infer<typeof vViewerBillingStatus>;

const vPolarCheckoutSession = object({
  url: string(),
});

const vPolarPortalSession = object({
  url: string(),
});

const vPolarCustomerSeed = object({
  externalCustomerId: string(),
  name: optional(string()),
  email: optional(string()),
});

function validateReturnUrlPair(args: {
  successUrl: string;
  returnUrl: string;
  server: PolarServer;
}): { successUrl: string; returnUrl: string } {
  let success: URL;
  let ret: URL;
  try {
    success = new URL(args.successUrl);
    ret = new URL(args.returnUrl);
  } catch {
    throw new Error("Invalid checkout return URL.");
  }

  if (success.origin !== ret.origin) {
    throw new Error("Checkout return URLs must share the same origin.");
  }

  if (args.server === "production") {
    if (success.origin !== "https://samebase.com") {
      throw new Error("Checkout return URL origin is not allowed.");
    }
  } else {
    const hostname = success.hostname;
    if (success.protocol !== "http:") {
      throw new Error("Checkout return URL must be http in local development.");
    }
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      throw new Error("Checkout return URL host is not allowed.");
    }
  }

  return { successUrl: success.toString(), returnUrl: ret.toString() };
}

function hasStoredProEntitlement(plan: BillingPlan, status: BillingStatus): boolean {
  return plan === "pro" && (status === "active" || status === "past_due");
}

export const getViewerBillingStatus = query({
  access: "access_user_preferences",
  args: {},
  returns: vViewerBillingStatus,
  handler: async (ctx): Promise<ViewerBillingStatus> => {
    const user = ctx.viewer.user;

    return {
      provider: user.billingProvider,
      plan: user.billingPlan ?? "free",
      status: user.billingStatus ?? "inactive",
      currentPeriodEndAt: user.billingCurrentPeriodEndAt,
      cancelAtPeriodEnd: user.billingCancelAtPeriodEnd,
      canStartCheckout: ctx.viewer.accessKeys.includes("access_dashboard"),
    };
  },
});

export const ensurePolarExternalCustomerId = internalMutation({
  args: {
    userId: id("users"),
  },
  returns: vPolarCustomerSeed,
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found.");
    }

    const existing = user.billingPolarExternalCustomerId?.trim() ?? "";
    if (existing.length > 0) {
      return {
        externalCustomerId: existing,
        name: user.name,
        email: user.email,
      };
    }

    const externalCustomerId = `samebase_${randomToken(24)}`;
    await ctx.db.patch(args.userId, {
      billingPolarExternalCustomerId: externalCustomerId,
    });

    return {
      externalCustomerId,
      name: user.name,
      email: user.email,
    };
  },
});

export const createPolarCheckoutSession = action({
  access: "access_dashboard",
  args: object({
    successUrl: string(),
    returnUrl: string(),
  }),
  returns: vPolarCheckoutSession,
  handler: async (ctx, args): Promise<{ url: string }> => {
    const userId = ctx.viewer.userId;
    const currentUser = await ctx.runQuery(internal.users.getById, { userId });
    if (!currentUser) {
      throw new Error("User not found.");
    }

    const productId = readPolarProMonthlyProductId();
    if (!productId) {
      throw new Error("Pro checkout is not configured yet.");
    }
    const polar = createPolarClient();
    const server = resolvePolarServer();
    const { successUrl, returnUrl } = validateReturnUrlPair({
      successUrl: args.successUrl,
      returnUrl: args.returnUrl,
      server,
    });

    const storedPlan = currentUser.billingPlan ?? "free";
    const storedStatus = currentUser.billingStatus ?? "inactive";
    const storedExternalCustomerId = currentUser.billingPolarExternalCustomerId?.trim();
    if (!storedExternalCustomerId && hasStoredProEntitlement(storedPlan, storedStatus)) {
      throw new Error("Samebase could not verify your current subscription.");
    }

    const customer = await ctx.runMutation(internal.billing.ensurePolarExternalCustomerId, {
      userId,
    });

    if (storedExternalCustomerId) {
      const observationRevision: number | null = await ctx.runMutation(
        internal.polarBillingState.beginObservation,
        { externalCustomerId: storedExternalCustomerId },
      );
      if (observationRevision === null) {
        throw new Error("Samebase could not verify your current subscription.");
      }

      const state = await readCanonicalPolarBillingState({
        polar,
        externalCustomerId: storedExternalCustomerId,
        productId,
      }).catch(() => {
        throw new Error("Samebase could not verify your current subscription.");
      });

      const applied: boolean = await ctx.runMutation(internal.polarBillingState.applyObservation, {
        state,
        observationRevision,
      });
      if (!applied) {
        throw new Error("Samebase could not verify your current subscription.");
      }
      if (state.plan === "pro") {
        throw new Error("You already have a Pro subscription.");
      }
    }

    let reservation: PolarCheckoutReservation = await ctx.runMutation(
      internal.polarCheckout.reserveAttempt,
      { userId },
    );
    if (reservation.state === "open") {
      let storedCheckout: Checkout;
      try {
        storedCheckout = await polar.checkouts.get({ id: reservation.checkoutId });
      } catch (error) {
        console.error("billing:polar:checkout_refresh_failed", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        throw new Error("Samebase could not verify your open checkout.");
      }

      if (
        isOpenPolarCheckoutForAttempt({
          attemptId: reservation.attemptId,
          checkout: storedCheckout,
          externalCustomerId: customer.externalCustomerId,
          productId,
          returnUrl,
          successUrl,
        })
      ) {
        return { url: storedCheckout.url };
      }
      if (
        !matchesPolarCheckoutAttempt({
          attemptId: reservation.attemptId,
          checkout: storedCheckout,
          externalCustomerId: customer.externalCustomerId,
          productId,
        }) ||
        (storedCheckout.status !== "expired" && storedCheckout.status !== "failed")
      ) {
        throw new Error("Samebase could not verify your open checkout.");
      }

      const cleared: boolean = await ctx.runMutation(internal.polarCheckout.clearOpen, {
        userId,
        attemptId: reservation.attemptId,
        checkoutId: reservation.checkoutId,
      });
      if (!cleared) {
        throw new Error("Samebase could not verify your open checkout.");
      }
      reservation = await ctx.runMutation(internal.polarCheckout.reserveAttempt, { userId });
    }

    if (reservation.state !== "pending" || !reservation.canCreate) {
      throw new Error("The previous checkout result must be inspected before another can start.");
    }

    let checkout: Checkout;
    try {
      checkout = await polar.checkouts.create({
        products: [productId],
        externalCustomerId: customer.externalCustomerId,
        customerEmail: customer.email,
        customerName: customer.name,
        successUrl,
        returnUrl,
        allowTrial: false,
        metadata: {
          source: "samebase_account",
          plan: "pro",
          samebase_checkout_attempt_id: reservation.attemptId,
        },
      });
    } catch (error) {
      if (isDefinitivePolarCheckoutFailure(error)) {
        await ctx.runMutation(internal.polarCheckout.clearPending, {
          userId,
          attemptId: reservation.attemptId,
        });
      }
      console.error("billing:polar:checkout_failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      throw new Error("Polar checkout could not be started.");
    }

    if (
      !isOpenPolarCheckoutForAttempt({
        attemptId: reservation.attemptId,
        checkout,
        externalCustomerId: customer.externalCustomerId,
        productId,
        returnUrl,
        successUrl,
      })
    ) {
      throw new Error("Samebase could not verify your open checkout.");
    }

    const recorded: boolean = await ctx.runMutation(internal.polarCheckout.recordOpen, {
      userId,
      attemptId: reservation.attemptId,
      checkoutId: checkout.id,
    });
    if (!recorded) {
      throw new Error("Polar checkout could not be started.");
    }
    return { url: checkout.url };
  },
});

export const createPolarCustomerPortalSession = action({
  access: "access_user_preferences",
  args: object({
    returnUrl: string(),
  }),
  returns: vPolarPortalSession,
  handler: async (ctx, args): Promise<{ url: string }> => {
    const userId = ctx.viewer.userId;
    const currentUser = await ctx.runQuery(internal.users.getById, { userId });
    if (!currentUser) {
      throw new Error("User not found.");
    }

    const externalCustomerId = currentUser.billingPolarExternalCustomerId?.trim();
    if (!externalCustomerId) {
      throw new Error("No billing account exists yet.");
    }

    const server = resolvePolarServer();
    const { returnUrl } = validateReturnUrlPair({
      successUrl: args.returnUrl,
      returnUrl: args.returnUrl,
      server,
    });

    try {
      const session = await createPolarClient().customerSessions.create({
        externalCustomerId,
        returnUrl,
      });

      return { url: session.customerPortalUrl };
    } catch (error) {
      console.error("billing:polar:portal_failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      throw new Error("The billing portal could not be opened.");
    }
  },
});

export const reconcileViewerBillingFromPolar = action({
  access: "access_user_preferences",
  args: {},
  returns: boolean(),
  handler: async (ctx): Promise<boolean> => {
    const userId = ctx.viewer.userId;
    const currentUser = await ctx.runQuery(internal.users.getById, { userId });
    const externalCustomerId = currentUser?.billingPolarExternalCustomerId?.trim();
    const productId = readPolarProMonthlyProductId();
    if (!externalCustomerId || !productId) {
      return false;
    }

    const observationRevision: number | null = await ctx.runMutation(
      internal.polarBillingState.beginObservation,
      { externalCustomerId },
    );
    if (observationRevision === null) {
      return false;
    }

    try {
      const state = await readCanonicalPolarBillingState({
        polar: createPolarClient(),
        externalCustomerId,
        productId,
      });
      return await ctx.runMutation(internal.polarBillingState.applyObservation, {
        state,
        observationRevision,
      });
    } catch (error) {
      console.warn("billing:polar:reconciliation_failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return false;
    }
  },
});
