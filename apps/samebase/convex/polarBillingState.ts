import type { Polar } from "@polar-sh/sdk";
import type { CustomerState } from "@polar-sh/sdk/models/components/customerstate";
import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import {
  createPolarClient,
  isPolarResourceNotFound,
  readPolarProMonthlyProductId,
} from "./polarClient";

const { boolean, literal, null: nullValue, number, object, string, union } = v;

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
export type PolarBillingState = Infer<typeof vPolarBillingState>;

const POLAR_WEBHOOK_RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 120_000] as const;

export function derivePolarBillingFromCustomerState(args: {
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

export async function readCanonicalPolarBillingState(args: {
  polar: Polar;
  externalCustomerId: string;
  productId: string;
}): Promise<PolarBillingState> {
  let customerState: CustomerState;
  try {
    customerState = await args.polar.customers.getStateExternal({
      externalId: args.externalCustomerId,
    });
  } catch (error) {
    if (isPolarResourceNotFound(error)) {
      return {
        externalCustomerId: args.externalCustomerId,
        plan: "free",
        status: "inactive",
      };
    }
    throw error;
  }

  const derived = derivePolarBillingFromCustomerState({
    customerState,
    productId: args.productId,
  });
  if (derived === null || derived.externalCustomerId !== args.externalCustomerId) {
    throw new Error("Polar customer state does not match the requested customer.");
  }
  return derived;
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

    const revision = (user.billingPolarObservationRevision ?? 0) + 1;
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
    if (!user || user.billingPolarObservationRevision !== args.observationRevision) {
      return false;
    }

    await ctx.db.patch(user._id, {
      billingProvider: "polar",
      billingPlan: state.plan,
      billingStatus: state.status,
      billingUpdatedAt: Date.now(),
      billingCurrentPeriodEndAt: state.plan === "pro" ? state.currentPeriodEndAt : undefined,
      billingCancelAtPeriodEnd: state.plan === "pro" ? state.cancelAtPeriodEnd : undefined,
      billingPolarCheckoutAttempt:
        state.plan === "pro" ? undefined : user.billingPolarCheckoutAttempt,
    });

    return true;
  },
});

export const reconcileForWebhook = internalAction({
  args: {
    externalCustomerId: string(),
    attempt: number(),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const productId = readPolarProMonthlyProductId();
    const observationRevision: number | null = await ctx.runMutation(
      internal.polarBillingState.beginObservation,
      { externalCustomerId: args.externalCustomerId },
    );
    if (observationRevision === null) {
      return null;
    }

    try {
      if (!productId) {
        throw new Error("Polar billing product is not configured.");
      }
      const state = await readCanonicalPolarBillingState({
        polar: createPolarClient(),
        externalCustomerId: args.externalCustomerId,
        productId,
      });
      await ctx.runMutation(internal.polarBillingState.applyObservation, {
        state,
        observationRevision,
      });
    } catch (error) {
      const retryDelay = POLAR_WEBHOOK_RETRY_DELAYS_MS.at(args.attempt);
      if (retryDelay !== undefined) {
        console.warn("billing:polar:webhook_reconciliation_retry", {
          attempt: args.attempt + 1,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        await ctx.scheduler.runAfter(retryDelay, internal.polarBillingState.reconcileForWebhook, {
          externalCustomerId: args.externalCustomerId,
          attempt: args.attempt + 1,
        });
      } else {
        console.error("billing:polar:webhook_reconciliation_exhausted", {
          attempts: args.attempt + 1,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }

    return null;
  },
});
