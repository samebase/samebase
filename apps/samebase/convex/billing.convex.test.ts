import { CustomerState$inboundSchema } from "@polar-sh/sdk/models/components/customerstate";
import { ResourceNotFound } from "@polar-sh/sdk/models/errors/resourcenotfound";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const polarSdkMocks = vi.hoisted(() => ({
  constructorOptions: vi.fn(),
  checkoutsCreate: vi.fn(),
  customerSessionsCreate: vi.fn(),
  customersGetStateExternal: vi.fn(),
}));

vi.mock("@polar-sh/sdk", () => ({
  Polar: class {
    readonly checkouts = { create: polarSdkMocks.checkoutsCreate };
    readonly customerSessions = { create: polarSdkMocks.customerSessionsCreate };
    readonly customers = { getStateExternal: polarSdkMocks.customersGetStateExternal };

    constructor(options: unknown) {
      polarSdkMocks.constructorOptions(options);
    }
  },
}));

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

const productId = "samebase-pro-monthly";
const currentPeriodEnd = "2026-09-01T00:00:00.000Z";

function asUser(t: ConvexTest, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

async function seedMember(t: ConvexTest, isApproved = true) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Ada",
      email: "ada.member@example.test",
      isApproved,
    });
  });
}

function polarCustomerState(args: {
  externalCustomerId: string;
  subscription?: {
    cancelAtPeriodEnd: boolean;
    productId: string;
    status: string;
  };
}) {
  return CustomerState$inboundSchema.parse({
    id: "polar-customer",
    created_at: "2026-08-01T00:00:00.000Z",
    modified_at: null,
    metadata: {},
    external_id: args.externalCustomerId,
    email: "ada.member@example.test",
    email_verified: true,
    type: "individual",
    name: "Ada",
    billing_name: null,
    billing_address: null,
    tax_id: null,
    locale: null,
    organization_id: "polar-organization",
    default_payment_method_id: null,
    deleted_at: null,
    avatar_url: null,
    active_subscriptions: args.subscription
      ? [
          {
            id: "polar-subscription",
            created_at: "2026-08-01T00:00:00.000Z",
            modified_at: null,
            metadata: {},
            status: args.subscription.status,
            amount: 400,
            currency: "usd",
            recurring_interval: "month",
            current_period_start: "2026-08-01T00:00:00.000Z",
            current_period_end: currentPeriodEnd,
            trial_start: null,
            trial_end: null,
            cancel_at_period_end: args.subscription.cancelAtPeriodEnd,
            canceled_at: args.subscription.cancelAtPeriodEnd ? "2026-08-15T00:00:00.000Z" : null,
            started_at: "2026-08-01T00:00:00.000Z",
            ends_at: args.subscription.cancelAtPeriodEnd ? currentPeriodEnd : null,
            product_id: args.subscription.productId,
            discount_id: null,
            meters: [],
          },
        ]
      : [],
    granted_benefits: [],
    active_meters: [],
  });
}

function resourceNotFound() {
  const body = JSON.stringify({ error: "ResourceNotFound", detail: "Not found" });
  return new ResourceNotFound(
    { error: "ResourceNotFound", detail: "Not found" },
    {
      request: new Request("https://sandbox-api.polar.sh/v1/customers/external/test/state"),
      response: new Response(body, { status: 404 }),
      body,
    },
  );
}

function configureSandboxBilling(): void {
  vi.stubEnv("CONVEX_AGENT_MODE", "anonymous");
  vi.stubEnv("POLAR_ACCESS_TOKEN", "sandbox-token");
  vi.stubEnv("POLAR_PRO_MONTHLY_PRODUCT_ID", productId);
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("billing access", () => {
  it("returns Free for an approved member without billing state", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);

    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      plan: "free",
      status: "inactive",
    });
  });

  it("lets a pending member read billing status from Settings", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t, false);

    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      plan: "free",
      status: "inactive",
    });
  });

  it("lets a pending member manage their own billing from Settings", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t, false);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { billingPolarExternalCustomerId: "pending-customer" });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockResolvedValue(
      polarCustomerState({ externalCustomerId: "pending-customer" }),
    );
    polarSdkMocks.checkoutsCreate.mockResolvedValue({
      url: "https://sandbox.polar.sh/checkout/pending",
    });
    polarSdkMocks.customerSessionsCreate.mockResolvedValue({
      customerPortalUrl: "https://sandbox.polar.sh/portal/pending",
    });

    const pendingUser = asUser(t, userId);
    await expect(
      pendingUser.action(api.billing.createPolarCheckoutSession, {
        successUrl: "http://localhost:5174/settings?checkout=success",
        returnUrl: "http://localhost:5174/settings?checkout=cancel",
      }),
    ).resolves.toEqual({ url: "https://sandbox.polar.sh/checkout/pending" });
    await expect(
      pendingUser.action(api.billing.createPolarCustomerPortalSession, {
        returnUrl: "http://localhost:5174/settings",
      }),
    ).resolves.toEqual({ url: "https://sandbox.polar.sh/portal/pending" });
    await expect(pendingUser.action(api.billing.reconcileViewerBillingFromPolar, {})).resolves.toBe(
      true,
    );
  });

  it("fails closed when a preview has no product configuration", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    vi.stubEnv("CONVEX_AGENT_MODE", "");
    vi.stubEnv("CONVEX_DEPLOYMENT", "preview:billing-test");
    vi.stubEnv("POLAR_PRO_MONTHLY_PRODUCT_ID", "");

    await expect(
      asUser(t, userId).action(api.billing.createPolarCheckoutSession, {
        successUrl: "https://preview.example.test/settings?checkout=success",
        returnUrl: "https://preview.example.test/settings?checkout=cancel",
      }),
    ).rejects.toThrow("Pro checkout is not configured yet.");
    expect(polarSdkMocks.constructorOptions).not.toHaveBeenCalled();
  });

  it("creates the monthly Sandbox checkout with the stable external customer id", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    configureSandboxBilling();
    polarSdkMocks.checkoutsCreate.mockResolvedValue({
      url: "https://sandbox.polar.sh/checkout/test",
    });

    await expect(
      asUser(t, userId).action(api.billing.createPolarCheckoutSession, {
        successUrl: "http://localhost:5174/settings?checkout=success",
        returnUrl: "http://localhost:5174/settings?checkout=cancel",
      }),
    ).resolves.toEqual({ url: "https://sandbox.polar.sh/checkout/test" });

    expect(polarSdkMocks.constructorOptions).toHaveBeenCalledWith({
      accessToken: "sandbox-token",
      server: "sandbox",
      timeoutMs: 10_000,
    });
    expect(polarSdkMocks.checkoutsCreate).toHaveBeenCalledOnce();
    expect(polarSdkMocks.checkoutsCreate).toHaveBeenCalledWith({
      products: [productId],
      externalCustomerId: expect.stringMatching(/^samebase_/),
      customerEmail: "ada.member@example.test",
      customerName: "Ada",
      successUrl: "http://localhost:5174/settings?checkout=success",
      returnUrl: "http://localhost:5174/settings?checkout=cancel",
      allowTrial: false,
      metadata: {
        source: "samebase_account",
        plan: "pro",
      },
    });

    const user = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(user?.billingPolarExternalCustomerId).toMatch(/^samebase_/);
  });

  it("uses the production Polar server only for the production deployment", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    vi.stubEnv("CONVEX_AGENT_MODE", "");
    vi.stubEnv("CONVEX_DEPLOYMENT", "prod:billing-test");
    vi.stubEnv("POLAR_ACCESS_TOKEN", "production-token");
    vi.stubEnv("POLAR_PRO_MONTHLY_PRODUCT_ID", "production-product");
    polarSdkMocks.checkoutsCreate.mockResolvedValue({
      url: "https://polar.sh/checkout/test",
    });

    await expect(
      asUser(t, userId).action(api.billing.createPolarCheckoutSession, {
        successUrl: "https://samebase.com/settings?checkout=success",
        returnUrl: "https://samebase.com/settings?checkout=cancel",
      }),
    ).resolves.toEqual({ url: "https://polar.sh/checkout/test" });
    expect(polarSdkMocks.constructorOptions).toHaveBeenCalledWith({
      accessToken: "production-token",
      server: "production",
      timeoutMs: 10_000,
    });
    expect(polarSdkMocks.checkoutsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ products: ["production-product"] }),
    );
  });

  it("continues checkout after an earlier checkout reserved an external id but no customer", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { billingPolarExternalCustomerId: "existing-customer" });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockRejectedValue(resourceNotFound());
    polarSdkMocks.checkoutsCreate.mockResolvedValue({
      url: "https://sandbox.polar.sh/checkout/test",
    });

    await expect(
      asUser(t, userId).action(api.billing.createPolarCheckoutSession, {
        successUrl: "http://localhost:5174/settings?checkout=success",
        returnUrl: "http://localhost:5174/settings?checkout=cancel",
      }),
    ).resolves.toEqual({ url: "https://sandbox.polar.sh/checkout/test" });
    expect(polarSdkMocks.checkoutsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ externalCustomerId: "existing-customer" }),
    );
  });

  it("reconciles Polar before checkout and rejects a duplicate Pro subscription", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { billingPolarExternalCustomerId: "existing-customer" });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockResolvedValue(
      polarCustomerState({
        externalCustomerId: "existing-customer",
        subscription: { cancelAtPeriodEnd: false, productId, status: "active" },
      }),
    );

    await expect(
      asUser(t, userId).action(api.billing.createPolarCheckoutSession, {
        successUrl: "http://localhost:5174/settings?checkout=success",
        returnUrl: "http://localhost:5174/settings?checkout=cancel",
      }),
    ).rejects.toThrow("You already have a Pro subscription.");
    expect(polarSdkMocks.checkoutsCreate).not.toHaveBeenCalled();
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "pro",
      status: "active",
      currentPeriodEndAt: Date.parse(currentPeriodEnd),
      cancelAtPeriodEnd: false,
    });
  });

  it("opens the hosted portal for an existing Polar customer", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { billingPolarExternalCustomerId: "existing-customer" });
    });
    configureSandboxBilling();
    polarSdkMocks.customerSessionsCreate.mockResolvedValue({
      customerPortalUrl: "https://sandbox.polar.sh/portal/customer-session",
    });

    await expect(
      asUser(t, userId).action(api.billing.createPolarCustomerPortalSession, {
        returnUrl: "http://localhost:5174/settings",
      }),
    ).resolves.toEqual({
      url: "https://sandbox.polar.sh/portal/customer-session",
    });
    expect(polarSdkMocks.customerSessionsCreate).toHaveBeenCalledWith({
      externalCustomerId: "existing-customer",
      returnUrl: "http://localhost:5174/settings",
    });
  });
});

describe("billing reconciliation", () => {
  it("restores Pro after a missed webhook and keeps cancellation timing", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { billingPolarExternalCustomerId: "existing-customer" });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockResolvedValue(
      polarCustomerState({
        externalCustomerId: "existing-customer",
        subscription: { cancelAtPeriodEnd: true, productId, status: "past_due" },
      }),
    );

    await expect(
      asUser(t, userId).action(api.billing.reconcileViewerBillingFromPolar, {}),
    ).resolves.toBe(true);
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "pro",
      status: "past_due",
      currentPeriodEndAt: Date.parse(currentPeriodEnd),
      cancelAtPeriodEnd: true,
    });
  });

  it("downgrades to Free after the Polar entitlement disappears", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        billingProvider: "polar",
        billingPlan: "pro",
        billingStatus: "active",
        billingCurrentPeriodEndAt: Date.parse(currentPeriodEnd),
        billingCancelAtPeriodEnd: true,
        billingPolarExternalCustomerId: "existing-customer",
      });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockResolvedValue(
      polarCustomerState({ externalCustomerId: "existing-customer" }),
    );

    await expect(
      asUser(t, userId).action(api.billing.reconcileViewerBillingFromPolar, {}),
    ).resolves.toBe(true);
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "free",
      status: "inactive",
    });
  });

  it("preserves the stored entitlement when Polar returns malformed data", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        billingProvider: "polar",
        billingPlan: "pro",
        billingStatus: "active",
        billingCurrentPeriodEndAt: Date.parse(currentPeriodEnd),
        billingCancelAtPeriodEnd: false,
        billingPolarExternalCustomerId: "existing-customer",
      });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockRejectedValue(
      new Error("SDK response validation failed"),
    );

    await expect(
      asUser(t, userId).action(api.billing.reconcileViewerBillingFromPolar, {}),
    ).resolves.toBe(false);
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "pro",
      status: "active",
      currentPeriodEndAt: Date.parse(currentPeriodEnd),
      cancelAtPeriodEnd: false,
    });
  });
});
