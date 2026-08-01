import type { CustomerState } from "@polar-sh/sdk/models/components/customerstate";
import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { action, query } from "./functions";
import { randomToken } from "./oauthUtils";
import {
  createPolarClient,
  isPolarResourceNotFound,
  readPolarProMonthlyProductId,
  resolvePolarServer,
  type PolarServer,
} from "./polarClient";

const { boolean, id, literal, null: nullValue, number, object, optional, string, union } = v;

const vBillingPlan = union(literal("free"), literal("pro"));
type BillingPlan = Infer<typeof vBillingPlan>;

const vBillingStatus = union(literal("inactive"), literal("active"), literal("past_due"));
type BillingStatus = Infer<typeof vBillingStatus>;

const vViewerBillingStatus = object({
  plan: vBillingPlan,
  status: vBillingStatus,
  currentPeriodEndAt: optional(number()),
  cancelAtPeriodEnd: optional(boolean()),
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

const vPolarBillingState = union(
  object({
    externalCustomerId: string(),
    plan: literal("free"),
    status: literal("inactive"),
  }),
  object({
    externalCustomerId: string(),
    plan: literal("pro"),
    status: union(literal("active"), literal("past_due")),
    currentPeriodEndAt: number(),
    cancelAtPeriodEnd: boolean(),
  }),
);
type PolarBillingState = Infer<typeof vPolarBillingState>;

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

export function deriveBillingFromCustomerState(args: {
  customerState: CustomerState;
  productId: string;
}): PolarBillingState | null {
  const externalCustomerId = args.customerState.externalId?.trim();
  if (!externalCustomerId) {
    return null;
  }

  let selectedSubscription: CustomerState["activeSubscriptions"][number] | null = null;
  for (const subscription of args.customerState.activeSubscriptions) {
    if (subscription.productId !== args.productId) {
      continue;
    }

    if (
      selectedSubscription === null ||
      subscription.currentPeriodEnd.getTime() > selectedSubscription.currentPeriodEnd.getTime() ||
      (subscription.currentPeriodEnd.getTime() ===
        selectedSubscription.currentPeriodEnd.getTime() &&
        subscription.id.localeCompare(selectedSubscription.id) < 0)
    ) {
      selectedSubscription = subscription;
    }
  }

  if (selectedSubscription === null) {
    return {
      externalCustomerId,
      plan: "free",
      status: "inactive",
    };
  }

  return {
    externalCustomerId,
    plan: "pro",
    status: selectedSubscription.status === "past_due" ? "past_due" : "active",
    currentPeriodEndAt: selectedSubscription.currentPeriodEnd.getTime(),
    cancelAtPeriodEnd: selectedSubscription.cancelAtPeriodEnd,
  };
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

export const applyPolarCustomerState = internalMutation({
  args: {
    state: vPolarBillingState,
    polarStateChangedAt: optional(number()),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const state = args.state;
    const user = await ctx.db
      .query("users")
      .withIndex("by_polar_external_customer_id", (q) =>
        q.eq("billingPolarExternalCustomerId", state.externalCustomerId),
      )
      .unique();
    if (!user) {
      return null;
    }

    if (
      args.polarStateChangedAt !== undefined &&
      user.billingPolarStateChangedAt !== undefined &&
      args.polarStateChangedAt < user.billingPolarStateChangedAt
    ) {
      return null;
    }

    await ctx.db.patch(user._id, {
      billingProvider: "polar",
      billingPlan: state.plan,
      billingStatus: state.status,
      billingUpdatedAt: Date.now(),
      billingCurrentPeriodEndAt: state.plan === "pro" ? state.currentPeriodEndAt : undefined,
      billingCancelAtPeriodEnd: state.plan === "pro" ? state.cancelAtPeriodEnd : undefined,
      ...(args.polarStateChangedAt === undefined
        ? {}
        : { billingPolarStateChangedAt: args.polarStateChangedAt }),
    });

    return null;
  },
});

export const createPolarCheckoutSession = action({
  access: "access_user_preferences",
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

    const existingExternalCustomerId = currentUser.billingPolarExternalCustomerId?.trim();
    if (existingExternalCustomerId) {
      let customerState: CustomerState | null = null;
      try {
        customerState = await polar.customers.getStateExternal({
          externalId: existingExternalCustomerId,
        });
      } catch (error) {
        if (!isPolarResourceNotFound(error)) {
          throw new Error("Samebase could not verify your current subscription.");
        }
      }

      if (customerState) {
        const derived = deriveBillingFromCustomerState({
          customerState,
          productId,
        });
        if (!derived) {
          throw new Error("Samebase could not verify your current subscription.");
        }

        await ctx.runMutation(internal.billing.applyPolarCustomerState, { state: derived });
        if (derived.plan === "pro") {
          throw new Error("You already have a Pro subscription.");
        }
      } else if (
        hasStoredProEntitlement(
          currentUser.billingPlan ?? "free",
          currentUser.billingStatus ?? "inactive",
        )
      ) {
        throw new Error("Samebase could not verify your current subscription.");
      }
    } else if (
      hasStoredProEntitlement(
        currentUser.billingPlan ?? "free",
        currentUser.billingStatus ?? "inactive",
      )
    ) {
      throw new Error("Samebase could not verify your current subscription.");
    }

    const customer = await ctx.runMutation(internal.billing.ensurePolarExternalCustomerId, {
      userId,
    });

    try {
      const checkout = await polar.checkouts.create({
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
        },
      });

      return { url: checkout.url };
    } catch (error) {
      console.error("billing:polar:checkout_failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      throw new Error("Polar checkout could not be started.");
    }
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

    try {
      const customerState = await createPolarClient().customers.getStateExternal({
        externalId: externalCustomerId,
      });
      const derived = deriveBillingFromCustomerState({
        customerState,
        productId,
      });
      if (!derived) {
        return false;
      }

      await ctx.runMutation(internal.billing.applyPolarCustomerState, { state: derived });
      return true;
    } catch (error) {
      if (isPolarResourceNotFound(error)) {
        await ctx.runMutation(internal.billing.applyPolarCustomerState, {
          state: {
            externalCustomerId,
            plan: "free",
            status: "inactive",
          },
        });
        return true;
      }

      console.warn("billing:polar:reconciliation_failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return false;
    }
  },
});
