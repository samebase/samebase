import type { Polar } from "@polar-sh/sdk";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription";
import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, type ActionCtx } from "./_generated/server";
import { createPolarClient, readPolarProMonthlyProductId } from "./polarClient";

const { boolean, literal, null: nullValue, number, object, string, union } = v;

const vPolarBillingState = union(
  object({
    plan: literal("free"),
    status: literal("inactive"),
    externalCustomerId: string(),
  }),
  object({
    plan: literal("pro"),
    status: union(literal("active"), literal("past_due")),
    externalCustomerId: string(),
    currentPeriodEndAt: number(),
    cancelAtPeriodEnd: boolean(),
  }),
);
export type PolarBillingState = Infer<typeof vPolarBillingState>;

function selectPolarEntitledSubscription(args: {
  selectedSubscription: Subscription | null;
  subscription: Subscription;
  externalCustomerId: string;
  productId: string;
}): Subscription | null {
  if (
    args.subscription.customer.externalId !== args.externalCustomerId ||
    args.subscription.productId !== args.productId ||
    (args.subscription.status !== "active" &&
      args.subscription.status !== "trialing" &&
      args.subscription.status !== "past_due")
  ) {
    throw new Error("Polar entitled subscription does not match the requested filters.");
  }

  if (
    args.selectedSubscription === null ||
    args.subscription.currentPeriodEnd.getTime() >
      args.selectedSubscription.currentPeriodEnd.getTime() ||
    (args.subscription.currentPeriodEnd.getTime() ===
      args.selectedSubscription.currentPeriodEnd.getTime() &&
      args.subscription.id.localeCompare(args.selectedSubscription.id) < 0)
  ) {
    return args.subscription;
  }

  return args.selectedSubscription;
}

function buildPolarBillingState(args: {
  externalCustomerId: string;
  selectedSubscription: Subscription | null;
}): PolarBillingState {
  if (args.selectedSubscription === null) {
    return {
      plan: "free",
      status: "inactive",
      externalCustomerId: args.externalCustomerId,
    };
  }

  return {
    plan: "pro",
    status: args.selectedSubscription.status === "past_due" ? "past_due" : "active",
    externalCustomerId: args.externalCustomerId,
    currentPeriodEndAt: args.selectedSubscription.currentPeriodEnd.getTime(),
    cancelAtPeriodEnd: args.selectedSubscription.cancelAtPeriodEnd,
  };
}

export async function readCanonicalPolarBillingState(args: {
  polar: Polar;
  externalCustomerId: string;
  productId: string;
}): Promise<PolarBillingState> {
  const externalCustomerId = args.externalCustomerId.trim();
  if (!externalCustomerId) {
    throw new Error("Polar external customer ID is missing.");
  }

  const page = await args.polar.subscriptions.list({
    externalCustomerId,
    productId: args.productId,
    status: ["active", "trialing", "past_due"],
    page: 1,
    limit: 100,
  });
  const items = page.result.items;
  const pagination = page.result.pagination;
  if (
    pagination.totalCount > 100 ||
    pagination.totalCount !== items.length ||
    pagination.maxPage !== Math.ceil(pagination.totalCount / 100)
  ) {
    throw new Error("Polar entitled subscription page is inconsistent.");
  }

  let selectedSubscription: Subscription | null = null;
  for (const subscription of items) {
    selectedSubscription = selectPolarEntitledSubscription({
      selectedSubscription,
      subscription,
      externalCustomerId,
      productId: args.productId,
    });
  }

  return buildPolarBillingState({ externalCustomerId, selectedSubscription });
}

export const beginObservation = internalMutation({
  args: {
    externalCustomerId: string(),
  },
  returns: union(number(), nullValue()),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_polar_external_customer_id", (q) =>
        q.eq("billingPolarExternalCustomerId", args.externalCustomerId),
      )
      .unique();
    if (!user) {
      return null;
    }

    const revision =
      Math.max(
        user.billingPolarObservationRevision ?? 0,
        user.billingPolarAppliedObservationRevision ?? 0,
      ) + 1;
    await ctx.db.patch(user._id, { billingPolarObservationRevision: revision });
    return revision;
  },
});

export const applyObservation = internalMutation({
  args: {
    state: vPolarBillingState,
    observationRevision: number(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const state = args.state;
    const user = await ctx.db
      .query("users")
      .withIndex("by_polar_external_customer_id", (q) =>
        q.eq("billingPolarExternalCustomerId", state.externalCustomerId),
      )
      .unique();
    if (!user || args.observationRevision <= (user.billingPolarAppliedObservationRevision ?? 0)) {
      return false;
    }

    await ctx.db.patch(user._id, {
      billingProvider: "polar",
      billingPlan: state.plan,
      billingStatus: state.status,
      billingUpdatedAt: Date.now(),
      billingPolarAppliedObservationRevision: args.observationRevision,
      billingCurrentPeriodEndAt: state.plan === "pro" ? state.currentPeriodEndAt : undefined,
      billingCancelAtPeriodEnd: state.plan === "pro" ? state.cancelAtPeriodEnd : undefined,
    });

    return true;
  },
});

type PolarReconciliationCtx = Pick<ActionCtx, "runMutation">;

export async function reconcilePolarCustomerBilling(
  ctx: PolarReconciliationCtx,
  args: { externalCustomerId: string; polar: Polar },
): Promise<boolean> {
  const externalCustomerId = args.externalCustomerId.trim();
  if (!externalCustomerId) {
    throw new Error("Polar external customer ID is missing.");
  }

  const productId = readPolarProMonthlyProductId();
  if (!productId) {
    throw new Error("Polar billing product is not configured.");
  }

  const observationRevision: number | null = await ctx.runMutation(
    internal.polarBillingState.beginObservation,
    { externalCustomerId },
  );
  if (observationRevision === null) {
    return false;
  }

  const state = await readCanonicalPolarBillingState({
    polar: args.polar,
    externalCustomerId,
    productId,
  });
  return await ctx.runMutation(internal.polarBillingState.applyObservation, {
    state,
    observationRevision,
  });
}

export const reconcileCustomerFromPolar = internalAction({
  args: {
    externalCustomerId: string(),
  },
  returns: boolean(),
  handler: async (ctx, args): Promise<boolean> =>
    await reconcilePolarCustomerBilling(ctx, {
      ...args,
      polar: createPolarClient(),
    }),
});
