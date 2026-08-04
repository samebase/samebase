import { ResourceNotFound } from "@polar-sh/sdk/models/errors/resourcenotfound";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const polarSdkMocks = vi.hoisted(() => ({
  constructorOptions: vi.fn(),
  checkoutsCreate: vi.fn(),
  checkoutsGet: vi.fn(),
  customerSessionsCreate: vi.fn(),
  subscriptionsList: vi.fn(),
}));

vi.mock("@polar-sh/sdk", () => ({
  Polar: class {
    readonly checkouts = {
      create: polarSdkMocks.checkoutsCreate,
      get: polarSdkMocks.checkoutsGet,
    };
    readonly customerSessions = { create: polarSdkMocks.customerSessionsCreate };
    readonly subscriptions = { list: polarSdkMocks.subscriptionsList };

    constructor(options: unknown) {
      polarSdkMocks.constructorOptions(options);
    }
  },
}));

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;
const billingAccountsByTest = new WeakMap<
  ConvexTest,
  Map<Id<"users">, Id<"organizationBillingAccounts">>
>();

function rememberBillingAccount(
  t: ConvexTest,
  userId: Id<"users">,
  billingAccountId: Id<"organizationBillingAccounts">,
): void {
  const accounts = billingAccountsByTest.get(t) ?? new Map();
  accounts.set(userId, billingAccountId);
  billingAccountsByTest.set(t, accounts);
}

function billingAccountIdFor(t: ConvexTest, userId: Id<"users">) {
  const billingAccountId = billingAccountsByTest.get(t)?.get(userId);
  if (billingAccountId === undefined) {
    throw new Error("Expected an organization billing account.");
  }
  return billingAccountId;
}
type CheckoutAttempt =
  | { state: "pending"; attemptId: string }
  | { state: "open"; attemptId: string; checkoutId: string };

const productId = "samebase-pro-monthly";
const externalCustomerId = "existing-customer";
const currentPeriodEnd = "2026-09-01T00:00:00.000Z";
const testNow = new Date("2026-08-03T11:00:00.000Z");
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

function subscriptionPage(items: readonly unknown[], totalCount = items.length) {
  return {
    result: {
      items,
      pagination: { totalCount, maxPage: Math.ceil(totalCount / 100) },
    },
  };
}

function polarSubscription(args: {
  cancelAtPeriodEnd?: boolean;
  externalCustomerId?: string;
  productId?: string;
  status: string;
}) {
  return {
    id: "polar-subscription",
    customer: { externalId: args.externalCustomerId ?? "existing-customer" },
    productId: args.productId ?? productId,
    status: args.status,
    currentPeriodEnd: new Date(currentPeriodEnd),
    cancelAtPeriodEnd: args.cancelAtPeriodEnd ?? false,
  };
}
function polarCheckout(args: {
  attemptId: string;
  externalCustomerId: string;
  expiresAt?: Date;
  id?: string;
  products?: Array<{ id: string }>;
  returnUrl?: string;
  status?: string;
  successUrl?: string;
  url?: string;
}) {
  return {
    id: args.id ?? "checkout-recovered",
    createdAt: new Date("2026-08-02T11:00:00.000Z"),
    status: args.status ?? "open",
    url: args.url ?? "https://sandbox.polar.sh/checkout/recovered",
    expiresAt: args.expiresAt ?? checkoutExpiresAt,
    successUrl: args.successUrl ?? "http://localhost:5174/settings?checkout=success",
    returnUrl: args.returnUrl ?? "http://localhost:5174/settings?checkout=cancel",
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
    returnUrl: string;
    successUrl: string;
  },
  id: string,
  url: string,
) {
  return polarCheckout({
    attemptId: request.metadata.samebase_checkout_attempt_id,
    externalCustomerId: request.externalCustomerId,
    id,
    products: [{ id: request.products[0] ?? "" }],
    returnUrl: request.returnUrl,
    successUrl: request.successUrl,
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
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada.member@example.test",
      isApproved,
    });
    const organizationId = await ctx.db.insert("organizations", {});
    await ctx.db.insert("organizationMemberships", { organizationId, userId });
    const billingAccountId = await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      plan: "free",
      status: "inactive",
    });
    return { billingAccountId, userId };
  });
  rememberBillingAccount(t, ids.userId, ids.billingAccountId);
  return ids.userId;
}

async function seedOrganizationMembers(t: ConvexTest) {
  const ids = await t.run(async (ctx) => {
    const firstUserId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada.organization@example.test",
      isApproved: true,
    });
    const secondUserId = await ctx.db.insert("users", {
      name: "Grace",
      email: "grace.organization@example.test",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {});
    await Promise.all([
      ctx.db.insert("organizationMemberships", { organizationId, userId: firstUserId }),
      ctx.db.insert("organizationMemberships", { organizationId, userId: secondUserId }),
    ]);
    const billingAccountId = await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      plan: "free",
      status: "inactive",
    });
    return { billingAccountId, firstUserId, organizationId, secondUserId };
  });
  rememberBillingAccount(t, ids.firstUserId, ids.billingAccountId);
  rememberBillingAccount(t, ids.secondUserId, ids.billingAccountId);
  return ids;
}

async function seedCheckoutAttempt(t: ConvexTest, attempt: CheckoutAttempt) {
  const userId = await seedMember(t);
  await t.run(async (ctx) => {
    await ctx.db.patch(billingAccountIdFor(t, userId), {
      polarExternalCustomerId: externalCustomerId,
      polarCheckoutAttempt: attempt,
    });
  });
  return userId;
}

async function readCheckoutAttempt(t: ConvexTest, userId: Id<"users">) {
  return await t.run(
    async (ctx) => (await ctx.db.get(billingAccountIdFor(t, userId)))?.polarCheckoutAttempt ?? null,
  );
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
  vi.setSystemTime(testNow);
  vi.resetAllMocks();
  polarSdkMocks.subscriptionsList.mockImplementation(() => Promise.resolve(subscriptionPage([])));
});

afterEach(() => {
  vi.useRealTimers();
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

  it("uses one organization billing account for every member", async () => {
    const t = makeConvexTest();
    const { billingAccountId, firstUserId, secondUserId } = await seedOrganizationMembers(t);

    const freeBilling = {
      plan: "free",
      status: "inactive",
      canStartCheckout: true,
    };
    await expect(
      asUser(t, firstUserId).query(api.billing.getViewerBillingStatus, {}),
    ).resolves.toEqual(freeBilling);
    await expect(
      asUser(t, secondUserId).query(api.billing.getViewerBillingStatus, {}),
    ).resolves.toEqual(freeBilling);

    await t.run(async (ctx) => {
      await ctx.db.patch(billingAccountId, {
        provider: "polar",
        plan: "pro",
        status: "past_due",
      });
    });
    const proBilling = {
      provider: "polar",
      plan: "pro",
      status: "past_due",
      canStartCheckout: true,
    };
    await expect(
      asUser(t, firstUserId).query(api.billing.getViewerBillingStatus, {}),
    ).resolves.toEqual(proBilling);
    await expect(
      asUser(t, secondUserId).query(api.billing.getViewerBillingStatus, {}),
    ).resolves.toEqual(proBilling);
  });

  it("fails clearly when organization billing is missing", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada.missing-billing@example.test",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {});
      await ctx.db.insert("organizationMemberships", { organizationId, userId });
      return userId;
    });

    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).rejects.toThrow(
      "Organization billing account is required.",
    );
  });

  it("shares checkout ownership between organization members", async () => {
    const t = makeConvexTest();
    const { billingAccountId, firstUserId, secondUserId } = await seedOrganizationMembers(t);
    configureSandboxBilling();
    polarSdkMocks.checkoutsCreate.mockImplementation((request) => {
      const checkout = polarCheckoutFromCreate(
        request,
        "checkout-organization",
        "https://sandbox.polar.sh/checkout/organization-created",
      );
      polarSdkMocks.checkoutsGet.mockResolvedValue({
        ...checkout,
        url: "https://sandbox.polar.sh/checkout/organization-current",
      });
      return checkout;
    });
    const args = {
      successUrl: "http://localhost:5174/settings?checkout=success",
      returnUrl: "http://localhost:5174/settings?checkout=cancel",
    };

    await expect(
      asUser(t, firstUserId).action(api.billing.createPolarCheckoutSession, args),
    ).resolves.toEqual({ url: "https://sandbox.polar.sh/checkout/organization-created" });
    await expect(
      asUser(t, secondUserId).action(api.billing.createPolarCheckoutSession, args),
    ).resolves.toEqual({ url: "https://sandbox.polar.sh/checkout/organization-current" });

    expect(polarSdkMocks.checkoutsCreate).toHaveBeenCalledOnce();
    const billingAccount = await t.run(async (ctx) => await ctx.db.get(billingAccountId));
    expect(billingAccount?.polarExternalCustomerId).toMatch(/^samebase_/);
    expect(billingAccount?.polarCheckoutAttempt).toEqual({
      state: "open",
      attemptId: expect.stringMatching(/^polar_checkout_/),
      checkoutId: "checkout-organization",
    });
  });

  it("blocks pending members from checkout and subscription management", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t, false);
    await t.run(async (ctx) => {
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        polarExternalCustomerId: "pending-customer",
      });
    });
    configureSandboxBilling();
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
    ).rejects.toThrow("Access denied");
    await expect(
      pendingUser.action(api.billing.reconcileViewerBillingFromPolar, {}),
    ).resolves.toEqual({ state: "observed", plan: "free" });
    expect(polarSdkMocks.checkoutsCreate).not.toHaveBeenCalled();
    expect(polarSdkMocks.customerSessionsCreate).not.toHaveBeenCalled();
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
    ).rejects.toMatchObject({
      name: "ConvexError",
      data: "Pro checkout is not configured yet.",
    });
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

    const user = await t.run(async (ctx) => await ctx.db.get(billingAccountIdFor(t, userId)));
    expect(user?.polarExternalCustomerId).toMatch(/^samebase_/);
  });

  it("reuses the stored open checkout for repeated requests", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        polarExternalCustomerId: "existing-customer",
      });
    });
    configureSandboxBilling();
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
    expect(polarSdkMocks.checkoutsGet).toHaveBeenCalledWith({ id: "checkout-reused" });
    const user = await t.run(async (ctx) => await ctx.db.get(billingAccountIdFor(t, userId)));
    expect(user?.polarCheckoutAttempt).toEqual({
      state: "open",
      attemptId: expect.stringMatching(/^polar_checkout_/),
      checkoutId: "checkout-reused",
    });
  });

  it("fails closed when the stored checkout no longer belongs to the same customer", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    const attemptId = "polar_checkout_stored_customer";
    await t.run(async (ctx) => {
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        polarExternalCustomerId: "existing-customer",
        polarCheckoutAttempt: {
          state: "open",
          attemptId,
          checkoutId: "checkout-stored-customer",
        },
      });
    });
    configureSandboxBilling();
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
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        polarExternalCustomerId: "existing-customer",
        polarCheckoutAttempt: {
          state: "open",
          attemptId,
          checkoutId: "checkout-stored-product",
        },
      });
    });
    configureSandboxBilling();
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

  it.each([
    {
      label: "success URL",
      checkoutUrls: {
        successUrl: "http://localhost:5174/settings",
      },
    },
    {
      label: "return URL",
      checkoutUrls: {
        returnUrl: "http://localhost:5174/settings",
      },
    },
  ])("fails closed when the stored checkout has another $label", async ({ checkoutUrls }) => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    const attemptId = "polar_checkout_stored_redirect";
    await t.run(async (ctx) => {
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        polarExternalCustomerId: "existing-customer",
        polarCheckoutAttempt: {
          state: "open",
          attemptId,
          checkoutId: "checkout-stored-redirect",
        },
      });
    });
    configureSandboxBilling();
    polarSdkMocks.checkoutsGet.mockResolvedValue(
      polarCheckout({
        attemptId,
        externalCustomerId: "existing-customer",
        id: "checkout-stored-redirect",
        ...checkoutUrls,
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
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        polarExternalCustomerId: "existing-customer",
        polarCheckoutAttempt: {
          state: "open",
          attemptId,
          checkoutId: "checkout-stored-expired",
        },
      });
    });
    configureSandboxBilling();
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

  it("keeps a stored open checkout when Polar cannot prove its status", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    const checkoutAttempt = {
      state: "open" as const,
      attemptId: "polar_checkout_unknown_status",
      checkoutId: "checkout-unknown-status",
    };
    await t.run(async (ctx) => {
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        polarExternalCustomerId: "existing-customer",
        polarCheckoutAttempt: checkoutAttempt,
      });
    });
    configureSandboxBilling();
    polarSdkMocks.checkoutsGet.mockRejectedValue(resourceNotFound());

    await expect(
      asUser(t, userId).action(api.billing.createPolarCheckoutSession, {
        successUrl: "http://localhost:5174/settings?checkout=success",
        returnUrl: "http://localhost:5174/settings?checkout=cancel",
      }),
    ).rejects.toThrow("Samebase could not verify your open checkout.");
    await expect(
      t.run(
        async (ctx) => (await ctx.db.get(billingAccountIdFor(t, userId)))?.polarCheckoutAttempt,
      ),
    ).resolves.toEqual(checkoutAttempt);
    expect(polarSdkMocks.checkoutsCreate).not.toHaveBeenCalled();
  });

  it("allows only one concurrent checkout creation", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        polarExternalCustomerId: "existing-customer",
      });
    });
    configureSandboxBilling();
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
      "The previous checkout result must be inspected before another can start.",
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

  it("clears pending after a definitive Polar rejection", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        polarExternalCustomerId: "existing-customer",
      });
    });
    configureSandboxBilling();
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

  it("keeps an ambiguous create result pending and never creates it twice", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        polarExternalCustomerId: "existing-customer",
      });
    });
    configureSandboxBilling();
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
      async (ctx) => (await ctx.db.get(billingAccountIdFor(t, userId)))?.polarCheckoutAttempt,
    );
    expect(firstAttempt).toEqual({
      state: "pending",
      attemptId: expect.stringMatching(/^polar_checkout_/),
    });

    await expect(viewer.action(api.billing.createPolarCheckoutSession, args)).rejects.toThrow(
      "The previous checkout result must be inspected before another can start.",
    );
    await expect(
      t.run(
        async (ctx) => (await ctx.db.get(billingAccountIdFor(t, userId)))?.polarCheckoutAttempt,
      ),
    ).resolves.toEqual(firstAttempt);
    expect(polarSdkMocks.checkoutsCreate).toHaveBeenCalledOnce();
  });

  it("keeps pending when Polar returns an unverified checkout", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        polarExternalCustomerId: "existing-customer",
      });
    });
    configureSandboxBilling();
    polarSdkMocks.checkoutsCreate.mockImplementation((request) =>
      polarCheckoutFromCreate(
        { ...request, returnUrl: "http://localhost:5174/settings" },
        "checkout-unverified",
        "https://sandbox.polar.sh/checkout/unverified",
      ),
    );
    const viewer = asUser(t, userId);
    const args = {
      successUrl: "http://localhost:5174/settings?checkout=success",
      returnUrl: "http://localhost:5174/settings?checkout=cancel",
    };

    await expect(viewer.action(api.billing.createPolarCheckoutSession, args)).rejects.toThrow(
      "Samebase could not verify your open checkout.",
    );
    const attempt = await t.run(
      async (ctx) => (await ctx.db.get(billingAccountIdFor(t, userId)))?.polarCheckoutAttempt,
    );
    expect(attempt).toEqual({
      state: "pending",
      attemptId: expect.stringMatching(/^polar_checkout_/),
    });
    await expect(viewer.action(api.billing.createPolarCheckoutSession, args)).rejects.toThrow(
      "The previous checkout result must be inspected before another can start.",
    );
    expect(polarSdkMocks.checkoutsCreate).toHaveBeenCalledOnce();
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
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        polarExternalCustomerId: "existing-customer",
      });
    });
    configureSandboxBilling();
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

  it.each([
    { polarStatus: "active", storedStatus: "active" },
    { polarStatus: "past_due", storedStatus: "past_due" },
  ])(
    "reconciles Polar before checkout and rejects a $polarStatus Pro subscription",
    async ({ polarStatus, storedStatus }) => {
      const t = makeConvexTest();
      const userId = await seedMember(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(billingAccountIdFor(t, userId), {
          polarExternalCustomerId: "existing-customer",
        });
      });
      configureSandboxBilling();
      polarSdkMocks.subscriptionsList.mockResolvedValue(
        subscriptionPage([
          polarSubscription({ cancelAtPeriodEnd: false, productId, status: polarStatus }),
        ]),
      );

      await expect(
        asUser(t, userId).action(api.billing.createPolarCheckoutSession, {
          successUrl: "http://localhost:5174/settings?checkout=success",
          returnUrl: "http://localhost:5174/settings?checkout=cancel",
        }),
      ).rejects.toThrow("You already have a Pro subscription.");
      expect(polarSdkMocks.checkoutsCreate).not.toHaveBeenCalled();
      await expect(
        asUser(t, userId).query(api.billing.getViewerBillingStatus, {}),
      ).resolves.toEqual({
        provider: "polar",
        plan: "pro",
        status: storedStatus,
        currentPeriodEndAt: Date.parse(currentPeriodEnd),
        cancelAtPeriodEnd: false,
        canStartCheckout: true,
      });
      expect(polarSdkMocks.subscriptionsList).toHaveBeenCalledWith({
        externalCustomerId: "existing-customer",
        productId,
        status: ["active", "trialing", "past_due"],
        page: 1,
        limit: 100,
      });
    },
  );

  it("opens the hosted portal for an existing Polar customer", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        polarExternalCustomerId: "existing-customer",
      });
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
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        polarExternalCustomerId: "existing-customer",
      });
    });
    configureSandboxBilling();
    const firstRead = createDeferred<ReturnType<typeof subscriptionPage>>();
    polarSdkMocks.subscriptionsList
      .mockReturnValueOnce(firstRead.promise)
      .mockRejectedValueOnce(new Error("Later Polar read failed"));
    const viewer = asUser(t, userId);

    const earlierReconciliation = viewer.action(api.billing.reconcileViewerBillingFromPolar, {});
    await vi.waitFor(() => expect(polarSdkMocks.subscriptionsList).toHaveBeenCalledOnce());
    await expect(viewer.action(api.billing.reconcileViewerBillingFromPolar, {})).resolves.toEqual({
      state: "unavailable",
    });
    firstRead.resolve(
      subscriptionPage([
        polarSubscription({ cancelAtPeriodEnd: false, productId, status: "active" }),
      ]),
    );
    await expect(earlierReconciliation).resolves.toEqual({ state: "observed", plan: "pro" });

    const user = await t.run(async (ctx) => await ctx.db.get(billingAccountIdFor(t, userId)));
    expect(user?.polarObservationRevision).toBe(2);
    expect(user?.polarAppliedObservationRevision).toBe(1);
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
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        polarExternalCustomerId: "existing-customer",
      });
    });
    configureSandboxBilling();
    const firstRead = createDeferred<ReturnType<typeof subscriptionPage>>();
    polarSdkMocks.subscriptionsList
      .mockReturnValueOnce(firstRead.promise)
      .mockResolvedValueOnce(subscriptionPage([]));
    const viewer = asUser(t, userId);

    const staleReconciliation = viewer.action(api.billing.reconcileViewerBillingFromPolar, {});
    await vi.waitFor(() => expect(polarSdkMocks.subscriptionsList).toHaveBeenCalledOnce());
    await expect(viewer.action(api.billing.reconcileViewerBillingFromPolar, {})).resolves.toEqual({
      state: "observed",
      plan: "free",
    });
    firstRead.resolve(
      subscriptionPage([
        polarSubscription({ cancelAtPeriodEnd: false, productId, status: "active" }),
      ]),
    );
    await expect(staleReconciliation).resolves.toEqual({ state: "unavailable" });

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
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        polarExternalCustomerId: "existing-customer",
      });
    });
    configureSandboxBilling();
    polarSdkMocks.subscriptionsList.mockResolvedValue(
      subscriptionPage([
        polarSubscription({ cancelAtPeriodEnd: true, productId, status: "past_due" }),
      ]),
    );

    await expect(
      asUser(t, userId).action(api.billing.reconcileViewerBillingFromPolar, {}),
    ).resolves.toEqual({ state: "observed", plan: "pro" });
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
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        provider: "polar",
        plan: "pro",
        status: "active",
        currentPeriodEndAt: Date.parse(currentPeriodEnd),
        cancelAtPeriodEnd: true,
        polarExternalCustomerId: "existing-customer",
      });
    });
    configureSandboxBilling();
    polarSdkMocks.subscriptionsList.mockResolvedValue(subscriptionPage([]));

    await expect(
      asUser(t, userId).action(api.billing.reconcileViewerBillingFromPolar, {}),
    ).resolves.toEqual({ state: "observed", plan: "free" });
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "free",
      status: "inactive",
      canStartCheckout: true,
    });
  });

  it.each([
    { label: "confirmed Pro", status: "confirmed", plan: "pro", clears: true },
    { label: "succeeded Pro", status: "succeeded", plan: "pro", clears: true },
    { label: "expired Free", status: "expired", plan: "free", clears: true },
    { label: "failed Free", status: "failed", plan: "free", clears: true },
    { label: "succeeded Free", status: "succeeded", plan: "free", clears: false },
    { label: "open Pro", status: "open", plan: "pro", clears: true },
    { label: "mismatch", status: "failed", plan: "free", clears: false },
    { label: "unknown status", status: "processing", plan: "free", clears: false },
    { label: "provider error", status: "error", plan: "free", clears: false },
  ])("resolves a stored open checkout for $label", async ({ clears, label, plan, status }) => {
    const t = makeConvexTest();
    const attempt = {
      state: "open" as const,
      attemptId: `polar_checkout_viewer_${label.replace(" ", "_")}`,
      checkoutId: `checkout-viewer-${label.replace(" ", "-")}`,
    };
    const userId = await seedCheckoutAttempt(t, attempt);
    configureSandboxBilling();
    if (plan === "pro") {
      polarSdkMocks.subscriptionsList.mockResolvedValue(
        subscriptionPage([
          polarSubscription({ cancelAtPeriodEnd: false, productId, status: "active" }),
        ]),
      );
    }
    if (status === "error") {
      polarSdkMocks.checkoutsGet.mockRejectedValue(new Error("Polar is unavailable"));
    } else {
      polarSdkMocks.checkoutsGet.mockResolvedValue(
        polarCheckout({
          attemptId: attempt.attemptId,
          externalCustomerId: label === "mismatch" ? "other-customer" : externalCustomerId,
          id: attempt.checkoutId,
          status,
        }),
      );
    }

    await expect(
      asUser(t, userId).action(api.billing.reconcileViewerBillingFromPolar, {}),
    ).resolves.toEqual({ state: "observed", plan });
    await expect(readCheckoutAttempt(t, userId)).resolves.toEqual(clears ? null : attempt);
    expect(polarSdkMocks.checkoutsGet).toHaveBeenCalledWith({ id: attempt.checkoutId });
  });

  it("does not inspect or clear a pending marker during viewer reconciliation", async () => {
    const t = makeConvexTest();
    const attempt = {
      state: "pending" as const,
      attemptId: "polar_checkout_viewer_pending",
    };
    const userId = await seedCheckoutAttempt(t, attempt);
    configureSandboxBilling();
    polarSdkMocks.subscriptionsList.mockResolvedValue(
      subscriptionPage([
        polarSubscription({ cancelAtPeriodEnd: false, productId, status: "active" }),
      ]),
    );

    await expect(
      asUser(t, userId).action(api.billing.reconcileViewerBillingFromPolar, {}),
    ).resolves.toEqual({ state: "observed", plan: "pro" });
    await expect(readCheckoutAttempt(t, userId)).resolves.toEqual(attempt);
    expect(polarSdkMocks.checkoutsGet).not.toHaveBeenCalled();
  });

  it("preserves the stored entitlement when Polar returns malformed data", async () => {
    const t = makeConvexTest();
    const userId = await seedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(billingAccountIdFor(t, userId), {
        provider: "polar",
        plan: "pro",
        status: "active",
        currentPeriodEndAt: Date.parse(currentPeriodEnd),
        cancelAtPeriodEnd: false,
        polarExternalCustomerId: "existing-customer",
      });
    });
    configureSandboxBilling();
    polarSdkMocks.subscriptionsList.mockRejectedValue(new Error("SDK response validation failed"));

    await expect(
      asUser(t, userId).action(api.billing.reconcileViewerBillingFromPolar, {}),
    ).resolves.toEqual({ state: "unavailable" });
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
