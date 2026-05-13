import { getAuthUserId } from "@convex-dev/auth/server";
import { Infer, v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getUserId } from "./common";
import { resolveDeploymentProfile } from "./deploymentProfile";
import { randomToken, readRequiredEnv } from "./oauthUtils";
import { isRecord, readString, toErrorMessage } from "./jsonUtils";

const {
  literal,
  object,
  optional,
  string,
  union,
  number,
  id,
  null: nullValue,
  boolean,
} = v;

type PolarServer = "sandbox" | "production";
type BillingCycle = "monthly" | "annual";

const vBillingCycle = union(literal("monthly"), literal("annual"));

const vBillingPlan = union(literal("free"), literal("pro"));
export type BillingPlan = Infer<typeof vBillingPlan>;

const vBillingStatus = union(
  literal("inactive"),
  literal("active"),
  literal("past_due"),
  literal("canceled"),
  literal("unknown"),
);
export type BillingStatus = Infer<typeof vBillingStatus>;

const vViewerBillingStatus = object({
  plan: vBillingPlan,
  status: vBillingStatus,
  currentPeriodEndAt: optional(number()),
  provider: optional(literal("polar")),
});
export type ViewerBillingStatus = Infer<typeof vViewerBillingStatus>;

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

const vPolarApplyStateArgs = object({
  externalCustomerId: string(),
  plan: vBillingPlan,
  status: vBillingStatus,
  currentPeriodEndAt: optional(number()),
});

function inferPolarServer(): PolarServer {
  return resolveDeploymentProfile().kind === "production"
    ? "production"
    : "sandbox";
}

function getPolarApiBaseUrl(server: PolarServer): string {
  return server === "production"
    ? "https://api.polar.sh/v1"
    : "https://sandbox-api.polar.sh/v1";
}

const POLAR_PRODUCTS = {
  sandbox: {
    pro: {
      monthly: "",
      annual: "",
    },
  },
  production: {
    pro: {
      monthly: "",
      annual: "",
    },
  },
} as const;

const POLAR_API_FETCH_TIMEOUT_MS = 10_000;

function readOptionalProductId(id: string): string | null {
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getProProductId(
  server: PolarServer,
  cycle: BillingCycle,
): string | null {
  return readOptionalProductId(POLAR_PRODUCTS[server].pro[cycle]);
}

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
    if (success.origin !== "https://noter.md") {
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

async function fetchPolarJson(args: {
  server: PolarServer;
  path: string;
  method: "GET" | "POST";
  body?: unknown;
}): Promise<unknown> {
  const accessToken = readRequiredEnv("POLAR_ACCESS_TOKEN");
  const baseUrl = getPolarApiBaseUrl(args.server);
  const url = `${baseUrl}${args.path}`;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    POLAR_API_FETCH_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: args.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "noter-app",
      },
      body: args.body ? JSON.stringify(args.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Polar API request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.detail === "string"
        ? payload.detail
        : `Polar API request failed (${response.status}).`;
    throw new Error(message);
  }

  return payload;
}

export const getViewerBillingStatus = query({
  args: {},
  returns: union(vViewerBillingStatus, nullValue()),
  handler: async (ctx): Promise<ViewerBillingStatus | null> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }

    return {
      provider: user.billingProvider,
      plan: user.billingPlan ?? "free",
      status: user.billingStatus ?? "inactive",
      currentPeriodEndAt: user.billingCurrentPeriodEndAt,
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

    const externalCustomerId = `noter_${randomToken(24)}`;
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
  args: vPolarApplyStateArgs,
  returns: nullValue(),
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

    await ctx.db.patch(user._id, {
      billingProvider: "polar",
      billingPlan: args.plan,
      billingStatus: args.status,
      billingUpdatedAt: Date.now(),
      billingCurrentPeriodEndAt: args.currentPeriodEndAt,
    });

    return null;
  },
});

export const createPolarCheckoutSession = action({
  args: object({
    interval: vBillingCycle,
    successUrl: string(),
    returnUrl: string(),
  }),
  returns: vPolarCheckoutSession,
  handler: async (ctx, args): Promise<{ url: string }> => {
    const userId = await getUserId(ctx);
    const currentUser = await ctx.runQuery(internal.users.getById, { userId });
    if (!currentUser) {
      throw new Error("User not found.");
    }

    const currentPlan = currentUser.billingPlan ?? "free";
    const currentStatus = currentUser.billingStatus ?? "inactive";
    if (currentPlan === "pro" && currentStatus === "active") {
      throw new Error("You already have an active Pro subscription.");
    }

    const server = inferPolarServer();
    const { successUrl, returnUrl } = validateReturnUrlPair({
      successUrl: args.successUrl,
      returnUrl: args.returnUrl,
      server,
    });

    const productId = getProProductId(server, args.interval);
    if (!productId) {
      throw new Error("Pro checkout is not configured yet.");
    }

    const customer = await ctx.runMutation(
      internal.billing.ensurePolarExternalCustomerId,
      { userId },
    );

    const payload = await fetchPolarJson({
      server,
      path: "/checkouts",
      method: "POST",
      body: {
        products: [productId],
        external_customer_id: customer.externalCustomerId,
        customer_email: customer.email,
        customer_name: customer.name,
        success_url: successUrl,
        return_url: returnUrl,
        metadata: {
          source: "pricing_page",
          plan: "pro",
          interval: args.interval,
        },
      },
    });

    if (!isRecord(payload)) {
      throw new Error("Polar checkout response is invalid.");
    }
    const url = readString(payload, "url");
    if (!url) {
      throw new Error("Polar checkout response is missing URL.");
    }

    return { url };
  },
});

export const createPolarCustomerPortalSession = action({
  args: object({
    returnUrl: string(),
  }),
  returns: vPolarPortalSession,
  handler: async (ctx, args): Promise<{ url: string }> => {
    const userId = await getUserId(ctx);
    const server = inferPolarServer();

    const { returnUrl } = validateReturnUrlPair({
      successUrl: args.returnUrl,
      returnUrl: args.returnUrl,
      server,
    });

    const customer = await ctx.runMutation(
      internal.billing.ensurePolarExternalCustomerId,
      { userId },
    );

    const payload = await fetchPolarJson({
      server,
      path: "/customer-sessions",
      method: "POST",
      body: {
        external_customer_id: customer.externalCustomerId,
        return_url: returnUrl,
      },
    });

    if (!isRecord(payload)) {
      throw new Error("Polar portal response is invalid.");
    }

    const url = readString(payload, "customer_portal_url");
    if (!url) {
      throw new Error("Polar portal response is missing URL.");
    }

    return { url };
  },
});

export function deriveBillingFromCustomerState(args: {
  customerState: unknown;
  server: PolarServer;
}): {
  externalCustomerId: string;
  plan: BillingPlan;
  status: BillingStatus;
  currentPeriodEndAt?: number;
} | null {
  if (!isRecord(args.customerState)) {
    return null;
  }

  const customer = args.customerState.customer;
  if (!isRecord(customer)) {
    return null;
  }

  const externalCustomerId =
    readString(args.customerState, "external_id") ??
    readString(customer, "external_id");
  if (!externalCustomerId) {
    return null;
  }

  const proMonthly = readOptionalProductId(
    POLAR_PRODUCTS[args.server].pro.monthly,
  );
  const proAnnual = readOptionalProductId(
    POLAR_PRODUCTS[args.server].pro.annual,
  );
  const proProductIds = [proMonthly, proAnnual].filter(
    (id): id is string => id !== null,
  );

  const activeSubscriptions = args.customerState.active_subscriptions;
  if (!Array.isArray(activeSubscriptions)) {
    return {
      externalCustomerId,
      plan: "free",
      status: "inactive",
    };
  }

  for (const subscription of activeSubscriptions) {
    if (!isRecord(subscription)) {
      continue;
    }
    const productId = readString(subscription, "product_id");
    if (!productId || !proProductIds.includes(productId)) {
      continue;
    }

    const currentPeriodEnd = readString(subscription, "current_period_end");
    const currentPeriodEndAt =
      currentPeriodEnd && Number.isFinite(Date.parse(currentPeriodEnd))
        ? Date.parse(currentPeriodEnd)
        : undefined;

    return {
      externalCustomerId,
      plan: "pro",
      status: "active",
      currentPeriodEndAt,
    };
  }

  return {
    externalCustomerId,
    plan: "free",
    status: "inactive",
  };
}

export const syncViewerBillingFromPolar = action({
  args: object({
    externalCustomerId: optional(string()),
  }),
  returns: union(boolean(), nullValue()),
  handler: async (ctx, args): Promise<boolean | null> => {
    const userId = await getUserId(ctx);
    const server = inferPolarServer();

    const customer = await ctx.runMutation(
      internal.billing.ensurePolarExternalCustomerId,
      { userId },
    );

    const externalCustomerId =
      args.externalCustomerId ?? customer.externalCustomerId;
    const payload = await fetchPolarJson({
      server,
      path: `/customers/external/${encodeURIComponent(externalCustomerId)}/state`,
      method: "GET",
    });

    const derived = deriveBillingFromCustomerState({
      customerState: payload,
      server,
    });
    if (!derived) {
      return null;
    }

    try {
      await ctx.runMutation(internal.billing.applyPolarCustomerState, {
        externalCustomerId: derived.externalCustomerId,
        plan: derived.plan,
        status: derived.status,
        currentPeriodEndAt: derived.currentPeriodEndAt,
      });
      return true;
    } catch (error) {
      console.warn("billing:polar:sync_failed", {
        message: toErrorMessage(error),
      });
      return null;
    }
  },
});
