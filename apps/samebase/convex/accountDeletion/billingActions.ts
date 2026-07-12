import { Infer, v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { resolveDeploymentProfile } from "../deploymentProfile";
import { isRecord, readNumber, readString } from "../jsonUtils";
import { readRequiredEnv } from "../oauthUtils";
import { createUrlSearchParams } from "../../shared/urlSearchParams";

const { id, literal, object, string, union } = v;

const vCancelBillingResult = union(
  object({ state: literal("not_applicable") }),
  object({ state: literal("succeeded") }),
  object({ state: literal("failed"), safeError: string() }),
);
type CancelBillingResult = Infer<typeof vCancelBillingResult>;

const POLAR_API_FETCH_TIMEOUT_MS = 10_000;
const POLAR_SUBSCRIPTION_PAGE_SIZE = 100;
const POLAR_MAX_SUBSCRIPTION_PAGES = 100;
const POLAR_CANCELLATION_SAFE_ERROR = "Polar subscription cancellation could not be confirmed.";

function getPolarApiBaseUrl(): string {
  return resolveDeploymentProfile().kind === "production"
    ? "https://api.polar.sh/v1"
    : "https://sandbox-api.polar.sh/v1";
}

async function requestPolar(args: { path: string; method: "GET" | "DELETE" }): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POLAR_API_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${getPolarApiBaseUrl()}${args.path}`, {
      method: args.method,
      headers: {
        Authorization: `Bearer ${readRequiredEnv("POLAR_ACCESS_TOKEN")}`,
        Accept: "application/json",
        "User-Agent": "samebase-app",
      },
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`Polar subscription request failed (${response.status}).`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function listActivePolarSubscriptionIds(externalCustomerId: string): Promise<string[]> {
  const subscriptionIds: string[] = [];
  let page = 1;

  while (page <= POLAR_MAX_SUBSCRIPTION_PAGES) {
    const searchParams = createUrlSearchParams({
      external_customer_id: externalCustomerId,
      active: "true",
      page: String(page),
      limit: String(POLAR_SUBSCRIPTION_PAGE_SIZE),
    });
    const payload = await requestPolar({
      path: `/subscriptions/?${searchParams.toString()}`,
      method: "GET",
    });
    if (!isRecord(payload) || !Array.isArray(payload.items) || !isRecord(payload.pagination)) {
      throw new Error("Polar subscription list response is invalid.");
    }

    for (const item of payload.items) {
      if (!isRecord(item)) {
        throw new Error("Polar subscription list response is invalid.");
      }
      const subscriptionId = readString(item, "id");
      if (!subscriptionId) {
        throw new Error("Polar subscription list response is invalid.");
      }
      subscriptionIds.push(subscriptionId);
    }

    const maxPage = readNumber(payload.pagination, "max_page");
    if (
      maxPage === undefined ||
      !Number.isInteger(maxPage) ||
      maxPage < 0 ||
      maxPage > POLAR_MAX_SUBSCRIPTION_PAGES ||
      (maxPage === 0 && payload.items.length > 0)
    ) {
      throw new Error("Polar subscription pagination response is invalid.");
    }
    if (page >= maxPage) {
      return subscriptionIds;
    }
    page += 1;
  }

  throw new Error("Polar subscription pagination exceeded the supported bound.");
}

export const cancelForAccountDeletion = internalAction({
  args: {
    runId: id("accountDeletionRuns"),
  },
  returns: vCancelBillingResult,
  handler: async (ctx, args): Promise<CancelBillingResult> => {
    const identity = await ctx.runQuery(internal.accountDeletion.stepContext.getActiveIdentity, {
      runId: args.runId,
    });
    if (identity === null) {
      throw new Error("Account deletion run is not active.");
    }
    const user = await ctx.runQuery(internal.users.getById, { userId: identity.userId });
    if (!user) {
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
        user.billingStatus === "past_due" ||
        user.billingStatus === "unknown"
      ) {
        return {
          state: "failed",
          safeError: POLAR_CANCELLATION_SAFE_ERROR,
        };
      }
      return { state: "not_applicable" };
    }

    try {
      const activeSubscriptionIds = await listActivePolarSubscriptionIds(externalCustomerId);
      for (const subscriptionId of activeSubscriptionIds) {
        await requestPolar({
          path: `/subscriptions/${encodeURIComponent(subscriptionId)}`,
          method: "DELETE",
        });
      }

      const remainingActiveSubscriptionIds =
        await listActivePolarSubscriptionIds(externalCustomerId);
      if (remainingActiveSubscriptionIds.length > 0) {
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
