import type { Polar } from "@polar-sh/sdk";
import type { CustomerState } from "@polar-sh/sdk/models/components/customerstate";
import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { randomToken } from "./oauthUtils";
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
      billingPolarCheckoutAttempt:
        state.plan === "pro" ? undefined : user.billingPolarCheckoutAttempt,
    });

    return true;
  },
});

export const requestWebhookReconciliation = internalMutation({
  args: {
    externalCustomerId: string(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_polar_external_customer_id", (q) =>
        q.eq("billingPolarExternalCustomerId", args.externalCustomerId),
      )
      .unique();
    if (!user) {
      return false;
    }

    const reconciliation = user.billingPolarWebhookReconciliation;
    if (reconciliation?.state === "queued") {
      return false;
    }
    if (reconciliation?.state === "running") {
      if (!reconciliation.dirty) {
        await ctx.db.patch(user._id, {
          billingPolarWebhookReconciliation: { ...reconciliation, dirty: true },
        });
      }
      return false;
    }

    const runId = randomToken(18);
    await ctx.db.patch(user._id, {
      billingPolarWebhookReconciliation: { state: "queued", runId },
    });
    await ctx.scheduler.runAfter(0, internal.polarBillingState.reconcileForWebhook, {
      externalCustomerId: args.externalCustomerId,
      runId,
      attempt: 0,
    });
    return true;
  },
});

export const claimWebhookReconciliation = internalMutation({
  args: {
    externalCustomerId: string(),
    runId: string(),
    attempt: number(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_polar_external_customer_id", (q) =>
        q.eq("billingPolarExternalCustomerId", args.externalCustomerId),
      )
      .unique();
    const reconciliation = user?.billingPolarWebhookReconciliation;
    if (!user || !reconciliation || reconciliation.runId !== args.runId) {
      return false;
    }

    if (reconciliation.state === "queued") {
      if (args.attempt !== 0) {
        return false;
      }
      await ctx.db.patch(user._id, {
        billingPolarWebhookReconciliation: {
          state: "running",
          runId: args.runId,
          dirty: false,
        },
      });
      return true;
    }

    return args.attempt > 0;
  },
});

export const finishWebhookReconciliation = internalMutation({
  args: {
    externalCustomerId: string(),
    runId: string(),
  },
  returns: boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_polar_external_customer_id", (q) =>
        q.eq("billingPolarExternalCustomerId", args.externalCustomerId),
      )
      .unique();
    const reconciliation = user?.billingPolarWebhookReconciliation;
    if (!user || reconciliation?.state !== "running" || reconciliation.runId !== args.runId) {
      return false;
    }

    if (!reconciliation.dirty) {
      await ctx.db.patch(user._id, { billingPolarWebhookReconciliation: undefined });
      return false;
    }

    await ctx.db.patch(user._id, {
      billingPolarWebhookReconciliation: { state: "queued", runId: args.runId },
    });
    await ctx.scheduler.runAfter(0, internal.polarBillingState.reconcileForWebhook, {
      externalCustomerId: args.externalCustomerId,
      runId: args.runId,
      attempt: 0,
    });
    return true;
  },
});

export const reconcileForWebhook = internalAction({
  args: {
    externalCustomerId: string(),
    runId: string(),
    attempt: number(),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const claimed: boolean = await ctx.runMutation(
      internal.polarBillingState.claimWebhookReconciliation,
      args,
    );
    if (!claimed) {
      return null;
    }

    const productId = readPolarProMonthlyProductId();
    const observationRevision: number | null = await ctx.runMutation(
      internal.polarBillingState.beginObservation,
      { externalCustomerId: args.externalCustomerId },
    );
    if (observationRevision === null) {
      await ctx.runMutation(internal.polarBillingState.finishWebhookReconciliation, {
        externalCustomerId: args.externalCustomerId,
        runId: args.runId,
      });
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
      await ctx.runMutation(internal.polarBillingState.finishWebhookReconciliation, {
        externalCustomerId: args.externalCustomerId,
        runId: args.runId,
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
          runId: args.runId,
          attempt: args.attempt + 1,
        });
      } else {
        console.error("billing:polar:webhook_reconciliation_exhausted", {
          attempts: args.attempt + 1,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        await ctx.runMutation(internal.polarBillingState.finishWebhookReconciliation, {
          externalCustomerId: args.externalCustomerId,
          runId: args.runId,
        });
      }
    }

    return null;
  },
});
