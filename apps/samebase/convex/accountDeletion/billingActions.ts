import { Infer, v } from "convex/values";
import type { Polar } from "@polar-sh/sdk";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { createPolarClient } from "../polarClient";

const { id, literal, object, string, union } = v;

const vCancelBillingResult = union(
  object({ state: literal("not_applicable") }),
  object({ state: literal("succeeded") }),
  object({ state: literal("failed"), safeError: string() }),
);
type CancelBillingResult = Infer<typeof vCancelBillingResult>;

const POLAR_MAX_SUBSCRIPTION_PAGES = 100;
const POLAR_CANCELLATION_SAFE_ERROR = "Polar subscription cancellation could not be confirmed.";

async function listCancelablePolarSubscriptionIds(
  polar: Polar,
  externalCustomerId: string,
): Promise<string[]> {
  const subscriptionIds: string[] = [];
  const pages = await polar.subscriptions.list({
    externalCustomerId,
    limit: 100,
  });
  let pageCount = 0;
  let listedItemCount = 0;
  let expectedItemCount: number | null = null;

  for await (const page of pages) {
    pageCount += 1;
    if (pageCount > POLAR_MAX_SUBSCRIPTION_PAGES) {
      throw new Error("Polar subscription pagination exceeded the supported bound.");
    }

    const totalCount = page.result.pagination.totalCount;
    if (expectedItemCount !== null && expectedItemCount !== totalCount) {
      throw new Error("Polar subscription pagination count changed during the list pass.");
    }
    expectedItemCount = totalCount;
    listedItemCount += page.result.items.length;

    for (const subscription of page.result.items) {
      if (subscription.customer.externalId !== externalCustomerId) {
        throw new Error("Polar subscription customer does not match the requested customer.");
      }

      switch (subscription.status) {
        case "incomplete":
        case "trialing":
        case "active":
        case "past_due":
        case "unpaid":
        case "paused":
          subscriptionIds.push(subscription.id);
          break;
        case "incomplete_expired":
        case "canceled":
          break;
        default:
          throw new Error("Polar subscription status is invalid.");
      }
    }
  }

  if (expectedItemCount !== listedItemCount) {
    throw new Error("Polar subscription pagination item count is inconsistent.");
  }

  return subscriptionIds;
}

async function revokeCancelablePolarSubscriptions(
  polar: Polar,
  externalCustomerId: string,
): Promise<boolean> {
  const activeSubscriptionIds = await listCancelablePolarSubscriptionIds(polar, externalCustomerId);

  for (const subscriptionId of activeSubscriptionIds) {
    await polar.subscriptions.revoke({ id: subscriptionId });
  }

  const remainingActiveSubscriptionIds = await listCancelablePolarSubscriptionIds(
    polar,
    externalCustomerId,
  );
  return remainingActiveSubscriptionIds.length === 0;
}

export const cancelForAccountDeletion = internalAction({
  args: {
    runId: id("workflow_accountDeletion_runs"),
    workflowId: string(),
  },
  returns: vCancelBillingResult,
  handler: async (ctx, args): Promise<CancelBillingResult> => {
    const identity = await ctx.runQuery(
      internal.accountDeletion.stepContext.getOwnedIdentity,
      args,
    );
    const user = await ctx.runQuery(internal.users.getById, { userId: identity.userId });

    if (!user) {
      return {
        state: "failed",
        safeError: POLAR_CANCELLATION_SAFE_ERROR,
      };
    }

    if (user.accountDeletion?.runId !== args.runId || user.billingPolarCheckoutAttempt) {
      return {
        state: "failed",
        safeError: POLAR_CANCELLATION_SAFE_ERROR,
      };
    }

    const externalCustomerId = user.billingPolarExternalCustomerId?.trim();

    if (!externalCustomerId) {
      if (
        user.billingProvider === "polar" ||
        user.billingPlan === "pro" ||
        user.billingStatus === "active" ||
        user.billingStatus === "past_due"
      ) {
        return {
          state: "failed",
          safeError: POLAR_CANCELLATION_SAFE_ERROR,
        };
      }

      return { state: "not_applicable" };
    }

    try {
      const revoked = await revokeCancelablePolarSubscriptions(
        createPolarClient(),
        externalCustomerId,
      );
      if (!revoked) {
        return {
          state: "failed",
          safeError: POLAR_CANCELLATION_SAFE_ERROR,
        };
      }

      return { state: "succeeded" };
    } catch {
      return {
        state: "failed",
        safeError: POLAR_CANCELLATION_SAFE_ERROR,
      };
    }
  },
});
