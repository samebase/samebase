import type { Checkout } from "@polar-sh/sdk/models/components/checkout";
import { ConvexError, Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { action, query } from "./functions";
import {
  findBillingAccountForOrganization,
  patchBillingAccount,
  readBillingAccountState,
  requireBillingAccountForOrganization,
  requireOwnerBillingAccountForOrganization,
} from "./organizationBilling";
import { randomToken } from "./oauthUtils";
import { reconcilePolarCustomerBilling } from "./polarBillingState";
import {
  canClearPolarCheckoutAfterObservation,
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
import schema from "./schema";
import { vOrganizationMembershipRole } from "./organizationModel";

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

const vPolarBillingReconciliationResult = union(
  object({ state: literal("observed"), plan: vBillingPlan }),
  object({ state: literal("unavailable") }),
);
type PolarBillingReconciliationResult = Infer<typeof vPolarBillingReconciliationResult>;

const vPolarCustomerSeed = object({
  externalCustomerId: string(),
  name: optional(string()),
  email: optional(string()),
});

const vUserDoc = schema.tables.users.validator.extend({
  _id: id("users"),
  _creationTime: number(),
});

const vOrganizationBillingAccountDoc = schema.tables.organizationBillingAccounts.validator.extend({
  _id: id("organizationBillingAccounts"),
  _creationTime: number(),
});

const vUserBillingAccount = object({
  account: vOrganizationBillingAccountDoc,
  role: vOrganizationMembershipRole,
  user: vUserDoc,
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
    throw new ConvexError("Invalid checkout return URL.");
  }

  if (success.origin !== ret.origin) {
    throw new ConvexError("Checkout return URLs must share the same origin.");
  }

  if (args.server === "production") {
    if (success.origin !== "https://samebase.com") {
      throw new ConvexError("Checkout return URL origin is not allowed.");
    }
  } else {
    const hostname = success.hostname;
    if (success.protocol !== "http:") {
      throw new ConvexError("Checkout return URL must be http in local development.");
    }
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      throw new ConvexError("Checkout return URL host is not allowed.");
    }
  }

  return { successUrl: success.toString(), returnUrl: ret.toString() };
}

function hasStoredProEntitlement(plan: BillingPlan, status: BillingStatus): boolean {
  return plan === "pro" && (status === "active" || status === "past_due");
}

export const getViewerBillingStatus = query({
  access: "access_user_preferences",
  args: {
    organizationId: id("organizations"),
  },
  returns: vViewerBillingStatus,
  handler: async (ctx, args): Promise<ViewerBillingStatus> => {
    const billing = await requireBillingAccountForOrganization(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    const state = readBillingAccountState(billing.account);

    return {
      provider: state.provider,
      plan: state.plan,
      status: state.status,
      currentPeriodEndAt: state.currentPeriodEndAt,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      canStartCheckout:
        billing.role === "owner" && ctx.viewer.accessKeys.includes("access_dashboard"),
    };
  },
});

export const getBillingAccountForOrganization = internalQuery({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
  },
  returns: union(vUserBillingAccount, v.null()),
  handler: async (ctx, args) => await findBillingAccountForOrganization(ctx.db, args),
});

export const ensurePolarExternalCustomerId = internalMutation({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
  },
  returns: vPolarCustomerSeed,
  handler: async (ctx, args) => {
    const billing = await requireOwnerBillingAccountForOrganization(ctx.db, args);
    const state = readBillingAccountState(billing.account);
    const user = billing.user;

    const existing = state.polarExternalCustomerId?.trim() ?? "";
    if (existing.length > 0) {
      return {
        externalCustomerId: existing,
        name: user.name,
        email: user.email,
      };
    }

    const externalCustomerId = `samebase_${randomToken(24)}`;
    await patchBillingAccount(ctx.db, billing.account, {
      polarExternalCustomerId: externalCustomerId,
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
    organizationId: id("organizations"),
    successUrl: string(),
    returnUrl: string(),
  }),
  returns: vPolarCheckoutSession,
  handler: async (ctx, args): Promise<{ url: string }> => {
    const userId = ctx.viewer.userId;
    const organizationId = args.organizationId;
    const currentBilling = await ctx.runQuery(internal.billing.getBillingAccountForOrganization, {
      userId,
      organizationId,
    });
    if (!currentBilling) {
      throw new Error("User not found.");
    }
    if (currentBilling.role !== "owner") {
      throw new Error("Organization owner access is required.");
    }
    const storedBilling = readBillingAccountState(currentBilling.account);

    const productId = readPolarProMonthlyProductId();
    if (!productId) {
      throw new ConvexError("Pro checkout is not configured yet.");
    }
    const polar = createPolarClient();
    const server = resolvePolarServer();
    const { successUrl, returnUrl } = validateReturnUrlPair({
      successUrl: args.successUrl,
      returnUrl: args.returnUrl,
      server,
    });

    const storedPlan = storedBilling.plan;
    const storedStatus = storedBilling.status;
    const storedExternalCustomerId = storedBilling.polarExternalCustomerId?.trim();
    if (!storedExternalCustomerId && hasStoredProEntitlement(storedPlan, storedStatus)) {
      throw new ConvexError("Samebase could not verify your current subscription.");
    }

    const customer = await ctx.runMutation(internal.billing.ensurePolarExternalCustomerId, {
      userId,
      organizationId,
    });

    if (storedExternalCustomerId) {
      const state = await reconcilePolarCustomerBilling(ctx, {
        polar,
        externalCustomerId: storedExternalCustomerId,
      }).catch((error: unknown) => {
        console.warn("billing:polar:subscription_reconciliation_failed", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        throw new ConvexError("Samebase could not verify your current subscription.");
      });
      if (state === null) {
        throw new ConvexError("Samebase could not verify your current subscription.");
      }
      if (state.plan === "pro") {
        throw new ConvexError("You already have a Pro subscription.");
      }
    }

    let reservation: PolarCheckoutReservation = await ctx.runMutation(
      internal.polarCheckout.reserveAttempt,
      { userId, organizationId },
    );
    if (reservation.state === "open") {
      let storedCheckout: Checkout;
      try {
        storedCheckout = await polar.checkouts.get({ id: reservation.checkoutId });
      } catch (error) {
        console.error("billing:polar:checkout_refresh_failed", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        throw new ConvexError("Samebase could not verify your open checkout.");
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
        throw new ConvexError("Samebase could not verify your open checkout.");
      }

      const cleared: boolean = await ctx.runMutation(internal.polarCheckout.clearOpen, {
        userId,
        organizationId,
        attemptId: reservation.attemptId,
        checkoutId: reservation.checkoutId,
      });
      if (!cleared) {
        throw new ConvexError("Samebase could not verify your open checkout.");
      }
      reservation = await ctx.runMutation(internal.polarCheckout.reserveAttempt, {
        userId,
        organizationId,
      });
    }

    if (reservation.state !== "pending" || !reservation.canCreate) {
      throw new ConvexError(
        "The previous checkout result must be inspected before another can start.",
      );
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
          organizationId,
          attemptId: reservation.attemptId,
        });
      }
      console.error("billing:polar:checkout_failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      throw new ConvexError("Polar checkout could not be started.");
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
      throw new ConvexError("Samebase could not verify your open checkout.");
    }

    const recorded: boolean = await ctx.runMutation(internal.polarCheckout.recordOpen, {
      userId,
      organizationId,
      attemptId: reservation.attemptId,
      checkoutId: checkout.id,
    });
    if (!recorded) {
      throw new ConvexError("Polar checkout could not be started.");
    }
    return { url: checkout.url };
  },
});

export const createPolarCustomerPortalSession = action({
  access: "access_dashboard",
  args: object({
    organizationId: id("organizations"),
    returnUrl: string(),
  }),
  returns: vPolarPortalSession,
  handler: async (ctx, args): Promise<{ url: string }> => {
    const userId = ctx.viewer.userId;
    const currentBilling = await ctx.runQuery(internal.billing.getBillingAccountForOrganization, {
      userId,
      organizationId: args.organizationId,
    });
    if (!currentBilling) {
      throw new Error("User not found.");
    }
    if (currentBilling.role !== "owner") {
      throw new Error("Organization owner access is required.");
    }

    const externalCustomerId = readBillingAccountState(
      currentBilling.account,
    ).polarExternalCustomerId?.trim();
    if (!externalCustomerId) {
      throw new ConvexError("No billing account exists yet.");
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
      throw new ConvexError("The billing portal could not be opened.");
    }
  },
});

export const reconcileViewerBillingFromPolar = action({
  access: "access_user_preferences",
  args: {
    organizationId: id("organizations"),
  },
  returns: vPolarBillingReconciliationResult,
  handler: async (ctx, args): Promise<PolarBillingReconciliationResult> => {
    const userId = ctx.viewer.userId;
    const organizationId = args.organizationId;
    const currentBilling = await ctx.runQuery(internal.billing.getBillingAccountForOrganization, {
      userId,
      organizationId,
    });
    if (currentBilling === null) {
      return { state: "unavailable" };
    }
    if (currentBilling.role !== "owner") {
      throw new Error("Organization owner access is required.");
    }
    const storedBilling = readBillingAccountState(currentBilling.account);
    const externalCustomerId = storedBilling.polarExternalCustomerId?.trim();
    const productId = readPolarProMonthlyProductId();
    if (!externalCustomerId || !productId) {
      return { state: "unavailable" };
    }

    try {
      const polar = createPolarClient();
      const state = await reconcilePolarCustomerBilling(ctx, {
        polar,
        externalCustomerId,
      });
      if (state === null) {
        return { state: "unavailable" };
      }

      const attempt = storedBilling.polarCheckoutAttempt;
      if (attempt?.state === "open") {
        try {
          const checkout = await polar.checkouts.get({ id: attempt.checkoutId });
          if (
            matchesPolarCheckoutAttempt({
              attemptId: attempt.attemptId,
              checkout,
              externalCustomerId,
              productId,
            }) &&
            canClearPolarCheckoutAfterObservation({ checkout, observedPlan: state.plan })
          ) {
            await ctx.runMutation(internal.polarCheckout.clearOpen, {
              userId,
              organizationId,
              attemptId: attempt.attemptId,
              checkoutId: attempt.checkoutId,
            });
          }
        } catch (error) {
          console.warn("billing:polar:checkout_reconciliation_failed", {
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
        }
      }

      return { state: "observed", plan: state.plan };
    } catch (error) {
      console.warn("billing:polar:reconciliation_failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return { state: "unavailable" };
    }
  },
});
