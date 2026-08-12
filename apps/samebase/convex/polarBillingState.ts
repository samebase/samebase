import type { Polar } from "@polar-sh/sdk";
import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, type ActionCtx } from "./_generated/server";
import {
  findBillingAccountByPolarExternalCustomerId,
  patchBillingAccount,
  readBillingAccountState,
} from "./organizationBilling";
import {
  createPolarClient,
  readPolarProductCatalog,
  resolvePolarProduct,
  type PolarProductCatalog,
} from "./polarClient";

const { boolean, literal, null: nullValue, number, object, string, union } = v;

const vPolarBillingState = union(
  object({
    status: literal("inactive"),
    plan: literal("free"),
    externalCustomerId: string(),
  }),
  object({
    status: union(literal("active"), literal("past_due")),
    plan: literal("pro"),
    externalCustomerId: string(),
    subscriptionId: string(),
    polarSeatQuantity: number(),
    currentPeriodEndAt: number(),
    cancelAtPeriodEnd: boolean(),
  }),
);
export type PolarBillingState = Infer<typeof vPolarBillingState>;

const vPolarObservationTarget = object({
  observationRevision: number(),
});
type PolarObservationTarget = Infer<typeof vPolarObservationTarget>;

export async function readCanonicalPolarBillingState(args: {
  polar: Polar;
  externalCustomerId: string;
  productCatalog: PolarProductCatalog;
}): Promise<PolarBillingState> {
  const externalCustomerId = args.externalCustomerId.trim();
  if (!externalCustomerId) {
    throw new Error("Polar external customer ID is missing.");
  }

  const customer = await args.polar.customers.getExternal({ externalId: externalCustomerId });
  if (
    customer.type !== "team" ||
    customer.externalId !== externalCustomerId ||
    customer.deletedAt !== null
  ) {
    throw new Error("Polar billing customer is not the expected active team Customer.");
  }

  const page = await args.polar.subscriptions.list({
    externalCustomerId,
    status: ["active", "trialing", "past_due", "paused"],
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
    throw new Error("Polar current subscription page is inconsistent.");
  }

  if (items.length === 0) {
    return {
      status: "inactive",
      plan: "free",
      externalCustomerId,
    };
  }
  if (items.length > 1) {
    throw new Error("Polar billing customer has more than one current subscription.");
  }
  const subscription = items[0];

  if (subscription.status !== "active" && subscription.status !== "past_due") {
    throw new Error("Polar billing subscription has an unsupported current status.");
  }
  if (
    subscription.customerId !== customer.id ||
    subscription.customer.id !== customer.id ||
    subscription.customer.type !== "team" ||
    subscription.customer.externalId !== externalCustomerId ||
    subscription.customer.deletedAt !== null
  ) {
    throw new Error("Polar billing subscription does not belong to the expected team Customer.");
  }
  if (subscription.product.id !== subscription.productId) {
    throw new Error("Polar billing subscription product is inconsistent.");
  }

  if (resolvePolarProduct(args.productCatalog, subscription.productId) === null) {
    throw new Error("Polar billing subscription does not use the expected product.");
  }

  const seats = subscription.seats;
  if (seats === null || seats === undefined || !Number.isSafeInteger(seats) || seats < 2) {
    throw new Error("Polar billing subscription has an invalid seat quantity.");
  }

  const pendingUpdate = subscription.pendingUpdate;
  if (pendingUpdate !== null) {
    if (
      pendingUpdate.seats !== null &&
      (!Number.isSafeInteger(pendingUpdate.seats) || pendingUpdate.seats < 2)
    ) {
      throw new Error("Polar billing subscription has an invalid pending seat quantity.");
    }
    if (pendingUpdate.productId !== null) {
      if (resolvePolarProduct(args.productCatalog, pendingUpdate.productId) === null) {
        throw new Error("Polar billing subscription has an invalid pending product.");
      }
    }
  }

  return {
    status: subscription.status === "past_due" ? "past_due" : "active",
    plan: "pro",
    externalCustomerId,
    subscriptionId: subscription.id,
    polarSeatQuantity: seats,
    currentPeriodEndAt: subscription.currentPeriodEnd.getTime(),
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  };
}

export const beginObservation = internalMutation({
  args: {
    externalCustomerId: string(),
  },
  returns: union(vPolarObservationTarget, nullValue()),
  handler: async (ctx, args) => {
    const target = await findBillingAccountByPolarExternalCustomerId(
      ctx.db,
      args.externalCustomerId,
    );
    if (target === null) {
      return null;
    }
    if ((await ctx.db.get(target.organizationId)) === null) {
      throw new Error("Organization billing account reference is invalid.");
    }
    const account = readBillingAccountState(target);

    const revision =
      Math.max(
        account.polarObservationRevision ?? 0,
        account.polarAppliedObservationRevision ?? 0,
      ) + 1;
    await patchBillingAccount(ctx.db, target, { polarObservationRevision: revision });
    return {
      observationRevision: revision,
    };
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
      ...(state.status === "inactive"
        ? {
            polarSeatQuantity: undefined,
            currentPeriodEndAt: undefined,
            cancelAtPeriodEnd: undefined,
          }
        : {
            polarSeatQuantity: state.polarSeatQuantity,
            currentPeriodEndAt: state.currentPeriodEndAt,
            cancelAtPeriodEnd: state.cancelAtPeriodEnd,
          }),
      ...(state.status !== "inactive" && account.polarCheckoutAttempt?.state === "open"
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

  const observationTarget: PolarObservationTarget | null = await ctx.runMutation(
    internal.polarBillingState.beginObservation,
    { externalCustomerId },
  );
  if (observationTarget === null) {
    return null;
  }

  const productCatalog = readPolarProductCatalog();
  if (productCatalog === null) {
    throw new Error("Polar billing products are not configured.");
  }

  const state = await readCanonicalPolarBillingState({
    polar: args.polar,
    externalCustomerId,
    productCatalog,
  });
  const applied: boolean = await ctx.runMutation(internal.polarBillingState.applyObservation, {
    state,
    observationRevision: observationTarget.observationRevision,
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
