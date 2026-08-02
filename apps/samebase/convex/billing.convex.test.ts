import { CustomerState$inboundSchema } from "@polar-sh/sdk/models/components/customerstate";
import { ResourceNotFound } from "@polar-sh/sdk/models/errors/resourcenotfound";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const polarSdkMocks = vi.hoisted(() => ({
  constructorOptions: vi.fn(),
  checkoutsCreate: vi.fn(),
  checkoutsGet: vi.fn(),
  checkoutsList: vi.fn(),
  customerSessionsCreate: vi.fn(),
  customersGetStateExternal: vi.fn(),
}));

vi.mock("@polar-sh/sdk", () => ({
  Polar: class {
    readonly checkouts = {
      create: polarSdkMocks.checkoutsCreate,
      get: polarSdkMocks.checkoutsGet,
      list: polarSdkMocks.checkoutsList,
    };
    readonly customerSessions = { create: polarSdkMocks.customerSessionsCreate };
    readonly customers = { getStateExternal: polarSdkMocks.customersGetStateExternal };

    constructor(options: unknown) {
      polarSdkMocks.constructorOptions(options);
    }
  },
}));

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

const productId = "samebase-pro-monthly";
const currentPeriodEnd = "2026-09-01T00:00:00.000Z";
const checkoutExpiresAt = new Date("2026-08-03T12:00:00.000Z");

function createDeferred<Value>() {
  const control: { resolve: (value: Value) => void } = {
    resolve: () => {
      throw new Error("Deferred promise was not initialized.");
    },
  };
  const promise = new Promise<Value>((resolve) => {
    control.resolve = resolve;
  });
  return { promise, resolve: control.resolve };
}

function checkoutPages(items: readonly unknown[]) {
  return (async function* () {
    yield { result: { items } };
  })();
}

function polarCheckout(args: {
  attemptId: string;
  externalCustomerId: string;
  expiresAt?: Date;
  id?: string;
  products?: Array<{ id: string }>;
  status?: string;
  url?: string;
}) {
  return {
    id: args.id ?? "checkout-recovered",
    createdAt: new Date("2026-08-02T11:00:00.000Z"),
    status: args.status ?? "open",
    url: args.url ?? "https://sandbox.polar.sh/checkout/recovered",
    expiresAt: args.expiresAt ?? checkoutExpiresAt,
    externalCustomerId: args.externalCustomerId,
    products: args.products ?? [{ id: productId }],
    metadata: {
      source: "samebase_account",
      plan: "pro",
      samebase_checkout_attempt_id: args.attemptId,
    },
  };
}

function polarCheckoutFromCreate(
  request: {
    externalCustomerId: string;
    metadata: { samebase_checkout_attempt_id: string };
    products: string[];
  },
  id: string,
  url: string,
) {
  return polarCheckout({
    attemptId: request.metadata.samebase_checkout_attempt_id,
    externalCustomerId: request.externalCustomerId,
    id,
    products: [{ id: request.products[0] ?? "" }],
    url,
  });
}

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

async function markAccountDeleting(t: ConvexTest, userId: Id<"users">): Promise<void> {
  await t.run(async (ctx) => {
    const initiatingSessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: 2_000_000_000_000,
    });
    const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
      identity: { state: "active", userId, email: "ada.member@example.test" },
      completionCapability: "billing-checkout-race-test",
      state: "running",
      workflow: { state: "started", workflowId: "billing-checkout-race", attempt: 1 },
      currentStep: "request_accepted",
      requestedAt: Date.now(),
      updatedAt: Date.now(),
      initiatingSessionId,
      retryCount: 0,
      outcomes: {
        billing: { state: "not_started" },
        providerRevocation: { state: "not_started" },
        completionEmail: { state: "not_started" },
      },
    });
    await ctx.db.patch(userId, {
      accountDeletion: { state: "deleting", runId, requestedAt: Date.now() },
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
  polarSdkMocks.checkoutsList.mockImplementation(() => Promise.resolve(checkoutPages([])));
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
      canStartCheckout: true,
    });
  });

  it("lets a pending member read billing status from Settings", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t, false);

    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      plan: "free",
      status: "inactive",
      canStartCheckout: false,
    });
  });

  it("blocks pending members from checkout but lets them manage existing billing", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t, false);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { billingPolarExternalCustomerId: "pending-customer" });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockResolvedValue(
      polarCustomerState({ externalCustomerId: "pending-customer" }),
    );
    polarSdkMocks.customerSessionsCreate.mockResolvedValue({
      customerPortalUrl: "https://sandbox.polar.sh/portal/pending",
    });

    const pendingUser = asUser(t, userId);
    await expect(
      pendingUser.action(api.billing.createPolarCheckoutSession, {
        successUrl: "http://localhost:5174/settings?checkout=success",
        returnUrl: "http://localhost:5174/settings?checkout=cancel",
      }),
    ).rejects.toThrow("Access denied");
    await expect(
      pendingUser.action(api.billing.createPolarCustomerPortalSession, {
        returnUrl: "http://localhost:5174/settings",
      }),
    ).resolves.toEqual({ url: "https://sandbox.polar.sh/portal/pending" });
    await expect(pendingUser.action(api.billing.reconcileViewerBillingFromPolar, {})).resolves.toBe(
      true,
    );
    expect(polarSdkMocks.checkoutsCreate).not.toHaveBeenCalled();
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
    polarSdkMocks.checkoutsCreate.mockImplementation((request) =>
      polarCheckoutFromCreate(request, "checkout-test", "https://sandbox.polar.sh/checkout/test"),
    );

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
        samebase_checkout_attempt_id: expect.stringMatching(/^polar_checkout_/),
      },
    });

    const user = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(user?.billingPolarExternalCustomerId).toMatch(/^samebase_/);
  });

  it("reuses the stored open checkout for repeated requests", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { billingPolarExternalCustomerId: "existing-customer" });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockRejectedValue(resourceNotFound());
    polarSdkMocks.checkoutsCreate.mockImplementation((request) => {
      const checkout = polarCheckoutFromCreate(
        request,
        "checkout-reused",
        "https://sandbox.polar.sh/checkout/created-url",
      );
      polarSdkMocks.checkoutsGet.mockResolvedValue({
        ...checkout,
        url: "https://sandbox.polar.sh/checkout/current-url",
      });
      return checkout;
    });

    const viewer = asUser(t, userId);
    const args = {
      successUrl: "http://localhost:5174/settings?checkout=success",
      returnUrl: "http://localhost:5174/settings?checkout=cancel",
    };
    await expect(viewer.action(api.billing.createPolarCheckoutSession, args)).resolves.toEqual({
      url: "https://sandbox.polar.sh/checkout/created-url",
    });
    await expect(viewer.action(api.billing.createPolarCheckoutSession, args)).resolves.toEqual({
      url: "https://sandbox.polar.sh/checkout/current-url",
    });

    expect(polarSdkMocks.checkoutsCreate).toHaveBeenCalledOnce();
    expect(polarSdkMocks.checkoutsList).toHaveBeenCalledOnce();
    expect(polarSdkMocks.checkoutsGet).toHaveBeenCalledWith({ id: "checkout-reused" });
    const user = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(user?.billingPolarCheckoutAttempt).toEqual({
      state: "open",
      attemptId: expect.stringMatching(/^polar_checkout_/),
      checkoutId: "checkout-reused",
      expiresAt: checkoutExpiresAt.getTime(),
    });
  });

  it("fails closed when the stored checkout no longer belongs to the same customer", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    const attemptId = "polar_checkout_stored_customer";
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        billingPolarExternalCustomerId: "existing-customer",
        billingPolarCheckoutAttempt: {
          state: "open",
          attemptId,
          checkoutId: "checkout-stored-customer",
          expiresAt: checkoutExpiresAt.getTime(),
        },
      });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockRejectedValue(resourceNotFound());
    polarSdkMocks.checkoutsGet.mockResolvedValue(
      polarCheckout({
        attemptId,
        externalCustomerId: "different-customer",
        id: "checkout-stored-customer",
      }),
    );

    await expect(
      asUser(t, userId).action(api.billing.createPolarCheckoutSession, {
        successUrl: "http://localhost:5174/settings?checkout=success",
        returnUrl: "http://localhost:5174/settings?checkout=cancel",
      }),
    ).rejects.toThrow("Samebase could not verify your open checkout.");
    expect(polarSdkMocks.checkoutsGet).toHaveBeenCalledWith({ id: "checkout-stored-customer" });
    expect(polarSdkMocks.checkoutsCreate).not.toHaveBeenCalled();
  });

  it("fails closed when the stored checkout has another product", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    const attemptId = "polar_checkout_stored_product";
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        billingPolarExternalCustomerId: "existing-customer",
        billingPolarCheckoutAttempt: {
          state: "open",
          attemptId,
          checkoutId: "checkout-stored-product",
          expiresAt: checkoutExpiresAt.getTime(),
        },
      });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockRejectedValue(resourceNotFound());
    polarSdkMocks.checkoutsGet.mockResolvedValue(
      polarCheckout({
        attemptId,
        externalCustomerId: "existing-customer",
        id: "checkout-stored-product",
        products: [{ id: productId }, { id: "another-product" }],
      }),
    );

    await expect(
      asUser(t, userId).action(api.billing.createPolarCheckoutSession, {
        successUrl: "http://localhost:5174/settings?checkout=success",
        returnUrl: "http://localhost:5174/settings?checkout=cancel",
      }),
    ).rejects.toThrow("Samebase could not verify your open checkout.");
    expect(polarSdkMocks.checkoutsCreate).not.toHaveBeenCalled();
  });

  it("replaces a stored checkout only after Polar reports it unavailable", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    const attemptId = "polar_checkout_stored_expired";
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        billingPolarExternalCustomerId: "existing-customer",
        billingPolarCheckoutAttempt: {
          state: "open",
          attemptId,
          checkoutId: "checkout-stored-expired",
          expiresAt: checkoutExpiresAt.getTime(),
        },
      });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockRejectedValue(resourceNotFound());
    polarSdkMocks.checkoutsGet.mockResolvedValue(
      polarCheckout({
        attemptId,
        externalCustomerId: "existing-customer",
        id: "checkout-stored-expired",
        status: "expired",
      }),
    );
    polarSdkMocks.checkoutsCreate.mockImplementation((request) =>
      polarCheckoutFromCreate(
        request,
        "checkout-replacement",
        "https://sandbox.polar.sh/checkout/replacement",
      ),
    );

    await expect(
      asUser(t, userId).action(api.billing.createPolarCheckoutSession, {
        successUrl: "http://localhost:5174/settings?checkout=success",
        returnUrl: "http://localhost:5174/settings?checkout=cancel",
      }),
    ).resolves.toEqual({ url: "https://sandbox.polar.sh/checkout/replacement" });
    expect(polarSdkMocks.checkoutsCreate).toHaveBeenCalledOnce();
  });

  it("allows only one concurrent checkout creation", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { billingPolarExternalCustomerId: "existing-customer" });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockRejectedValue(resourceNotFound());
    const createGate = createDeferred<ReturnType<typeof polarCheckout>>();
    polarSdkMocks.checkoutsCreate.mockReturnValue(createGate.promise);

    const viewer = asUser(t, userId);
    const args = {
      successUrl: "http://localhost:5174/settings?checkout=success",
      returnUrl: "http://localhost:5174/settings?checkout=cancel",
    };
    const firstRequest = viewer.action(api.billing.createPolarCheckoutSession, args);
    await vi.waitFor(() => expect(polarSdkMocks.checkoutsCreate).toHaveBeenCalledOnce());

    await expect(viewer.action(api.billing.createPolarCheckoutSession, args)).rejects.toThrow(
      "Checkout result is still being recovered. Please try again later.",
    );
    const createRequest = polarSdkMocks.checkoutsCreate.mock.calls[0]?.[0];
    createGate.resolve(
      polarCheckoutFromCreate(
        createRequest,
        "checkout-concurrent",
        "https://sandbox.polar.sh/checkout/concurrent",
      ),
    );
    await expect(firstRequest).resolves.toEqual({
      url: "https://sandbox.polar.sh/checkout/concurrent",
    });
    expect(polarSdkMocks.checkoutsCreate).toHaveBeenCalledOnce();
  });

  it("does not cross an account deletion marker before provider create", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { billingPolarExternalCustomerId: "existing-customer" });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockRejectedValue(resourceNotFound());
    const checkoutList = createDeferred<ReturnType<typeof checkoutPages>>();
    polarSdkMocks.checkoutsList.mockReturnValue(checkoutList.promise);

    const checkoutRequest = asUser(t, userId).action(api.billing.createPolarCheckoutSession, {
      successUrl: "http://localhost:5174/settings?checkout=success",
      returnUrl: "http://localhost:5174/settings?checkout=cancel",
    });
    await vi.waitFor(() => expect(polarSdkMocks.checkoutsList).toHaveBeenCalledOnce());
    await markAccountDeleting(t, userId);
    checkoutList.resolve(checkoutPages([]));

    await expect(checkoutRequest).rejects.toThrow(
      "Checkout is already being prepared. Please try again.",
    );
    await expect(t.mutation(internal.polarCheckout.reserveAttempt, { userId })).rejects.toThrow(
      "Checkout is unavailable.",
    );
    expect(polarSdkMocks.checkoutsCreate).not.toHaveBeenCalled();
  });

  it("recovers a Polar checkout created before the local result was stored", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    const attemptId = "polar_checkout_recovery";
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        billingPolarExternalCustomerId: "existing-customer",
        billingPolarCheckoutAttempt: {
          state: "recovering",
          attemptId,
          recoverUntilAt: Date.now() + 24 * 60 * 60 * 1_000,
        },
      });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockRejectedValue(resourceNotFound());
    polarSdkMocks.checkoutsList.mockImplementation(() =>
      Promise.resolve(
        checkoutPages([polarCheckout({ attemptId, externalCustomerId: "existing-customer" })]),
      ),
    );

    await expect(
      asUser(t, userId).action(api.billing.createPolarCheckoutSession, {
        successUrl: "http://localhost:5174/settings?checkout=success",
        returnUrl: "http://localhost:5174/settings?checkout=cancel",
      }),
    ).resolves.toEqual({ url: "https://sandbox.polar.sh/checkout/recovered" });
    expect(polarSdkMocks.checkoutsCreate).not.toHaveBeenCalled();
    const user = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(user?.billingPolarCheckoutAttempt).toEqual({
      state: "open",
      attemptId,
      checkoutId: "checkout-recovered",
      expiresAt: checkoutExpiresAt.getTime(),
    });
  });

  it("does not recover a checkout that contains more than the configured product", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    const attemptId = "polar_checkout_multiple_products";
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        billingPolarExternalCustomerId: "existing-customer",
        billingPolarCheckoutAttempt: {
          state: "recovering",
          attemptId,
          recoverUntilAt: Date.now() + 24 * 60 * 60 * 1_000,
        },
      });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockRejectedValue(resourceNotFound());
    polarSdkMocks.checkoutsList.mockImplementation(() =>
      Promise.resolve(
        checkoutPages([
          polarCheckout({
            attemptId,
            externalCustomerId: "existing-customer",
            products: [{ id: productId }, { id: "another-product" }],
          }),
        ]),
      ),
    );

    await expect(
      asUser(t, userId).action(api.billing.createPolarCheckoutSession, {
        successUrl: "http://localhost:5174/settings?checkout=success",
        returnUrl: "http://localhost:5174/settings?checkout=cancel",
      }),
    ).rejects.toThrow("Checkout result is still being recovered. Please try again later.");
    expect(polarSdkMocks.checkoutsCreate).not.toHaveBeenCalled();
  });

  it("releases the creation lease after a definitive Polar rejection", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { billingPolarExternalCustomerId: "existing-customer" });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockRejectedValue(resourceNotFound());
    polarSdkMocks.checkoutsCreate
      .mockRejectedValueOnce(resourceNotFound())
      .mockImplementationOnce((request) =>
        polarCheckoutFromCreate(
          request,
          "checkout-after-rejection",
          "https://sandbox.polar.sh/checkout/retry",
        ),
      );
    const viewer = asUser(t, userId);
    const args = {
      successUrl: "http://localhost:5174/settings?checkout=success",
      returnUrl: "http://localhost:5174/settings?checkout=cancel",
    };

    await expect(viewer.action(api.billing.createPolarCheckoutSession, args)).rejects.toThrow(
      "Polar checkout could not be started.",
    );
    await expect(viewer.action(api.billing.createPolarCheckoutSession, args)).resolves.toEqual({
      url: "https://sandbox.polar.sh/checkout/retry",
    });
    expect(polarSdkMocks.checkoutsCreate).toHaveBeenCalledTimes(2);
  });

  it("keeps an ambiguous attempt in recovery and never creates it twice", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { billingPolarExternalCustomerId: "existing-customer" });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockRejectedValue(resourceNotFound());
    polarSdkMocks.checkoutsCreate.mockRejectedValue(
      new Error("Connection closed after request upload"),
    );
    const viewer = asUser(t, userId);
    const args = {
      successUrl: "http://localhost:5174/settings?checkout=success",
      returnUrl: "http://localhost:5174/settings?checkout=cancel",
    };

    await expect(viewer.action(api.billing.createPolarCheckoutSession, args)).rejects.toThrow(
      "Polar checkout could not be started.",
    );
    const firstAttempt = await t.run(
      async (ctx) => (await ctx.db.get(userId))?.billingPolarCheckoutAttempt,
    );
    expect(firstAttempt?.state).toBe("recovering");
    if (firstAttempt?.state !== "recovering") {
      throw new Error("Expected a checkout recovery attempt.");
    }

    await expect(viewer.action(api.billing.createPolarCheckoutSession, args)).rejects.toThrow(
      "Checkout result is still being recovered. Please try again later.",
    );
    polarSdkMocks.checkoutsList.mockImplementation(() =>
      Promise.resolve(
        checkoutPages([
          polarCheckout({
            attemptId: firstAttempt.attemptId,
            externalCustomerId: "existing-customer",
            id: "checkout-after-timeout",
            url: "https://sandbox.polar.sh/checkout/recovered-timeout",
          }),
        ]),
      ),
    );
    await expect(viewer.action(api.billing.createPolarCheckoutSession, args)).resolves.toEqual({
      url: "https://sandbox.polar.sh/checkout/recovered-timeout",
    });
    expect(polarSdkMocks.checkoutsCreate).toHaveBeenCalledOnce();
  });

  it("allows a new attempt only after an ambiguous checkout can no longer be open", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { billingPolarExternalCustomerId: "existing-customer" });
    });
    configureSandboxBilling();
    polarSdkMocks.customersGetStateExternal.mockRejectedValue(resourceNotFound());
    polarSdkMocks.checkoutsCreate
      .mockRejectedValueOnce(new Error("Connection closed after request upload"))
      .mockRejectedValueOnce(resourceNotFound());
    const viewer = asUser(t, userId);
    const args = {
      successUrl: "http://localhost:5174/settings?checkout=success",
      returnUrl: "http://localhost:5174/settings?checkout=cancel",
    };

    await expect(viewer.action(api.billing.createPolarCheckoutSession, args)).rejects.toThrow(
      "Polar checkout could not be started.",
    );
    const firstAttempt = await t.run(
      async (ctx) => (await ctx.db.get(userId))?.billingPolarCheckoutAttempt,
    );
    if (firstAttempt?.state !== "recovering") {
      throw new Error("Expected a checkout recovery attempt.");
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        billingPolarCheckoutAttempt: { ...firstAttempt, recoverUntilAt: Date.now() - 1 },
      });
    });

    await expect(viewer.action(api.billing.createPolarCheckoutSession, args)).rejects.toThrow(
      "Polar checkout could not be started.",
    );
    const firstCreate = polarSdkMocks.checkoutsCreate.mock.calls[0]?.[0];
    const secondCreate = polarSdkMocks.checkoutsCreate.mock.calls[1]?.[0];
    expect(polarSdkMocks.checkoutsCreate).toHaveBeenCalledTimes(2);
    expect(secondCreate.metadata.samebase_checkout_attempt_id).not.toBe(
      firstCreate.metadata.samebase_checkout_attempt_id,
    );
  });

  it("uses the production Polar server only for the production deployment", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    vi.stubEnv("CONVEX_AGENT_MODE", "");
    vi.stubEnv("CONVEX_DEPLOYMENT", "prod:billing-test");
    vi.stubEnv("POLAR_ACCESS_TOKEN", "production-token");
    vi.stubEnv("POLAR_PRO_MONTHLY_PRODUCT_ID", "production-product");
    polarSdkMocks.checkoutsCreate.mockImplementation((request) =>
      polarCheckoutFromCreate(request, "checkout-production", "https://polar.sh/checkout/test"),
    );

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
    polarSdkMocks.checkoutsCreate.mockImplementation((request) =>
      polarCheckoutFromCreate(
        request,
        "checkout-existing",
        "https://sandbox.polar.sh/checkout/test",
      ),
    );

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
      canStartCheckout: true,
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
  it("applies an earlier valid observation when a later observation fails", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { billingPolarExternalCustomerId: "existing-customer" });
    });
    configureSandboxBilling();
    const firstRead = createDeferred<ReturnType<typeof polarCustomerState>>();
    polarSdkMocks.customersGetStateExternal
      .mockReturnValueOnce(firstRead.promise)
      .mockRejectedValueOnce(new Error("Later Polar read failed"));
    const viewer = asUser(t, userId);

    const earlierReconciliation = viewer.action(api.billing.reconcileViewerBillingFromPolar, {});
    await vi.waitFor(() => expect(polarSdkMocks.customersGetStateExternal).toHaveBeenCalledOnce());
    await expect(viewer.action(api.billing.reconcileViewerBillingFromPolar, {})).resolves.toBe(
      false,
    );
    firstRead.resolve(
      polarCustomerState({
        externalCustomerId: "existing-customer",
        subscription: { cancelAtPeriodEnd: false, productId, status: "active" },
      }),
    );
    await expect(earlierReconciliation).resolves.toBe(true);

    const user = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(user?.billingPolarObservationRevision).toBe(2);
    expect(user?.billingPolarAppliedObservationRevision).toBe(1);
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "pro",
      status: "active",
      currentPeriodEndAt: Date.parse(currentPeriodEnd),
      cancelAtPeriodEnd: false,
      canStartCheckout: true,
    });
  });

  it("rejects a stale Polar response after a newer observation applies", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { billingPolarExternalCustomerId: "existing-customer" });
    });
    configureSandboxBilling();
    const firstRead = createDeferred<ReturnType<typeof polarCustomerState>>();
    polarSdkMocks.customersGetStateExternal
      .mockReturnValueOnce(firstRead.promise)
      .mockResolvedValueOnce(polarCustomerState({ externalCustomerId: "existing-customer" }));
    const viewer = asUser(t, userId);

    const staleReconciliation = viewer.action(api.billing.reconcileViewerBillingFromPolar, {});
    await vi.waitFor(() => expect(polarSdkMocks.customersGetStateExternal).toHaveBeenCalledOnce());
    await expect(viewer.action(api.billing.reconcileViewerBillingFromPolar, {})).resolves.toBe(
      true,
    );
    firstRead.resolve(
      polarCustomerState({
        externalCustomerId: "existing-customer",
        subscription: { cancelAtPeriodEnd: false, productId, status: "active" },
      }),
    );
    await expect(staleReconciliation).resolves.toBe(false);

    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "free",
      status: "inactive",
      canStartCheckout: true,
    });
  });

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
      canStartCheckout: true,
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
      canStartCheckout: true,
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
      canStartCheckout: true,
    });
  });
});
