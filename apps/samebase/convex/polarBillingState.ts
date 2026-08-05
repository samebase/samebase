import type { Polar } from "@polar-sh/sdk";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription";
import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, type ActionCtx } from "./_generated/server";
import {
  findBillingAccountByPolarExternalCustomerId,
  patchBillingAccount,
  readBillingAccountState,
} from "./organizationBilling";
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
    const target = await findBillingAccountByPolarExternalCustomerId(
      ctx.db,
      args.externalCustomerId,
    );
    if (target === null) {
      return null;
    }
    const account = readBillingAccountState(target);

    const revision =
      Math.max(
        account.polarObservationRevision ?? 0,
        account.polarAppliedObservationRevision ?? 0,
      ) + 1;
    await patchBillingAccount(ctx.db, target, { polarObservationRevision: revision });
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
    const target = await findBillingAccountByPolarExternalCustomerId(
      ctx.db,
      state.externalCustomerId,
    );
    if (target === null) {
      return false;
    }
    const account = readBillingAccountState(target);
    if (args.observationRevision <= (account.polarAppliedObservationRevision ?? 0)) {
      return false;
    }

    await patchBillingAccount(ctx.db, target, {
      provider: "polar",
      plan: state.plan,
      status: state.status,
      updatedAt: Date.now(),
      polarAppliedObservationRevision: args.observationRevision,
      currentPeriodEndAt: state.plan === "pro" ? state.currentPeriodEndAt : undefined,
      cancelAtPeriodEnd: state.plan === "pro" ? state.cancelAtPeriodEnd : undefined,
      ...(state.plan === "pro" && account.polarCheckoutAttempt?.state === "open"
        ? { polarCheckoutAttempt: undefined }
        : {}),
    });

    return true;
  },
});

type PolarReconciliationCtx = Pick<ActionCtx, "runMutation">;

export async function reconcilePolarCustomerBilling(
  ctx: PolarReconciliationCtx,
  args: { externalCustomerId: string; polar: Polar },
): Promise<PolarBillingState | null> {
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
    return null;
  }

  const state = await readCanonicalPolarBillingState({
    polar: args.polar,
    externalCustomerId,
    productId,
  });
  const applied: boolean = await ctx.runMutation(internal.polarBillingState.applyObservation, {
    state,
    observationRevision,
  });
  return applied ? state : null;
}

export const reconcileCustomerFromPolar = internalAction({
  args: {
    externalCustomerId: string(),
  },
  returns: boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const state = await reconcilePolarCustomerBilling(ctx, {
      ...args,
      polar: createPolarClient(),
    });
    return state !== null;
  },
});
