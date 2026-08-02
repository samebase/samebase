import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const polarSdkMocks = vi.hoisted(() => ({
  constructorOptions: vi.fn(),
  subscriptionsList: vi.fn(),
}));

vi.mock("@polar-sh/sdk", () => ({
  Polar: class {
    readonly subscriptions = { list: polarSdkMocks.subscriptionsList };

    constructor(options: unknown) {
      polarSdkMocks.constructorOptions(options);
    }
  },
}));

import { bytesToBase64 } from "../shared/base64";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { verifyPolarWebhookEvent } from "./polarWebhooks";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

const productId = "samebase-pro-monthly";
const webhookSecret = "polar-webhook-secret";
const currentPeriodEnd = "2026-09-01T00:00:00.000Z";

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
  currentPeriodEnd?: string;
  id?: string;
  productId?: string;
  status: string;
}) {
  return {
    id: args.id ?? "polar-subscription",
    productId: args.productId ?? productId,
    status: args.status,
    currentPeriodEnd: new Date(args.currentPeriodEnd ?? currentPeriodEnd),
    cancelAtPeriodEnd: args.cancelAtPeriodEnd ?? false,
  };
}

function asUser(t: ConvexTest, userId: Id<"users">) {
  return t.withIdentity({
    subject: userId + "|test-session",
    tokenIdentifier: "test:" + userId,
  });
}

async function seedApprovedMember(t: ConvexTest) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Ada",
      email: "ada.member@example.test",
      isApproved: true,
      billingPolarExternalCustomerId: "existing-customer",
    });
  });
}

function customerStatePayload() {
  return {
    id: "polar-customer",
    created_at: "2026-08-01T00:00:00.000Z",
    modified_at: null,
    metadata: {},
    external_id: "existing-customer",
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
    active_subscriptions: [],
    granted_benefits: [],
    active_meters: [],
  };
}

function customerStateChangedBody(): string {
  return JSON.stringify({
    type: "customer.state_changed",
    timestamp: new Date().toISOString(),
    data: customerStatePayload(),
  });
}

async function signedHeaders(body: string, secret = webhookSecret): Promise<Headers> {
  const webhookId = "webhook-delivery-id";
  const timestamp = Math.floor(Date.now() / 1000);
  const signingKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    signingKey,
    new TextEncoder().encode(webhookId + "." + timestamp + "." + body),
  );

  return new Headers({
    "content-type": "application/json",
    "webhook-id": webhookId,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": "v1," + bytesToBase64(new Uint8Array(signature)),
  });
}

async function deliver(t: ConvexTest, body: string): Promise<Response> {
  return await t.fetch("/webhooks/polar", {
    method: "POST",
    headers: await signedHeaders(body),
    body,
  });
}

function configureWebhook(): void {
  vi.stubEnv("CONVEX_AGENT_MODE", "anonymous");
  vi.stubEnv("POLAR_ACCESS_TOKEN", "sandbox-token");
  vi.stubEnv("POLAR_PRO_MONTHLY_PRODUCT_ID", productId);
  vi.stubEnv("POLAR_WEBHOOK_SECRET", webhookSecret);
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Polar customer.state_changed webhook", () => {
  it.each([
    { providerStatus: "active", storedStatus: "active" },
    { providerStatus: "trialing", storedStatus: "active" },
  ])("treats $providerStatus as Pro", async ({ providerStatus, storedStatus }) => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);
    configureWebhook();
    polarSdkMocks.subscriptionsList.mockResolvedValue(
      subscriptionPage([polarSubscription({ status: providerStatus })]),
    );

    const response = await deliver(t, customerStateChangedBody());

    expect(response.status).toBe(204);
    expect(polarSdkMocks.subscriptionsList).toHaveBeenCalledWith({
      externalCustomerId: "existing-customer",
      productId,
      status: ["active", "trialing", "past_due"],
      page: 1,
      limit: 100,
    });
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "pro",
      status: storedStatus,
      currentPeriodEndAt: Date.parse(currentPeriodEnd),
      cancelAtPeriodEnd: false,
      canStartCheckout: true,
    });
  });

  it("keeps past-due Pro entitled from the bounded subscription page", async () => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);
    configureWebhook();
    polarSdkMocks.subscriptionsList.mockResolvedValue(
      subscriptionPage([polarSubscription({ status: "past_due", cancelAtPeriodEnd: true })]),
    );

    const response = await deliver(t, customerStateChangedBody());

    expect(response.status).toBe(204);
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "pro",
      status: "past_due",
      currentPeriodEndAt: Date.parse(currentPeriodEnd),
      cancelAtPeriodEnd: true,
      canStartCheckout: true,
    });
  });

  it.each([
    { providerStatus: "canceled", subscriptions: 1 },
    { providerStatus: "unpaid", subscriptions: 1 },
    { providerStatus: "none", subscriptions: 0 },
  ])("treats $providerStatus as Free", async ({ providerStatus, subscriptions }) => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        billingProvider: "polar",
        billingPlan: "pro",
        billingStatus: "active",
      });
    });
    configureWebhook();
    polarSdkMocks.subscriptionsList.mockResolvedValue(
      subscriptionPage(subscriptions === 0 ? [] : [polarSubscription({ status: providerStatus })]),
    );

    const response = await deliver(t, customerStateChangedBody());

    expect(response.status).toBe(204);
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "free",
      status: "inactive",
      canStartCheckout: true,
    });
  });

  it("does not let a delayed provider response replace a newer observation", async () => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);
    configureWebhook();
    const firstRead = createDeferred<ReturnType<typeof subscriptionPage>>();
    polarSdkMocks.subscriptionsList
      .mockReturnValueOnce(firstRead.promise)
      .mockResolvedValueOnce(subscriptionPage([]));

    const firstDelivery = deliver(t, customerStateChangedBody());
    await vi.waitFor(() => expect(polarSdkMocks.subscriptionsList).toHaveBeenCalledOnce());
    await expect(deliver(t, customerStateChangedBody())).resolves.toMatchObject({ status: 204 });
    firstRead.resolve(subscriptionPage([polarSubscription({ status: "active" })]));
    await expect(firstDelivery).resolves.toMatchObject({ status: 204 });

    const user = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(user?.billingPolarObservationRevision).toBe(2);
    expect(user?.billingPolarAppliedObservationRevision).toBe(2);
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "free",
      status: "inactive",
      canStartCheckout: true,
    });
  });

  it("returns 503 for a provider failure and leaves Polar to retry", async () => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        billingProvider: "polar",
        billingPlan: "pro",
        billingStatus: "active",
      });
    });
    configureWebhook();
    polarSdkMocks.subscriptionsList.mockRejectedValue(new Error("Polar unavailable"));

    const response = await deliver(t, customerStateChangedBody());

    expect(response.status).toBe(503);
    expect(polarSdkMocks.subscriptionsList).toHaveBeenCalledOnce();
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "pro",
      status: "active",
      canStartCheckout: true,
    });
  });

  it("returns 503 when Polar reports more than 100 entitled subscriptions", async () => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        billingProvider: "polar",
        billingPlan: "pro",
        billingStatus: "active",
      });
    });
    configureWebhook();
    polarSdkMocks.subscriptionsList.mockResolvedValue(subscriptionPage([], 101));

    const response = await deliver(t, customerStateChangedBody());

    expect(response.status).toBe(503);
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "pro",
      status: "active",
      canStartCheckout: true,
    });
  });

  it("lets an operator reconcile one Polar customer", async () => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);
    configureWebhook();
    polarSdkMocks.subscriptionsList.mockResolvedValue(
      subscriptionPage([polarSubscription({ status: "past_due", cancelAtPeriodEnd: true })]),
    );

    await expect(
      t.action(internal.polarBillingState.reconcileCustomerFromPolar, {
        externalCustomerId: "existing-customer",
      }),
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

  it("ignores a signed event for an unknown external customer", async () => {
    const t = makeConvexTest();
    configureWebhook();

    const response = await deliver(t, customerStateChangedBody());

    expect(response.status).toBe(204);
    expect(polarSdkMocks.subscriptionsList).not.toHaveBeenCalled();
  });

  it("verifies a signed event in the Buffer-free Convex runtime", async () => {
    configureWebhook();
    const body = customerStateChangedBody();
    const headers: Record<string, string> = {};
    (await signedHeaders(body)).forEach((value, key) => {
      headers[key] = value;
    });
    vi.stubGlobal("Buffer", undefined);

    const event = verifyPolarWebhookEvent({
      secret: webhookSecret,
      headers,
      body,
    });

    expect(event).toMatchObject({ type: "customer.state_changed" });
  });

  it("preserves stored entitlement when a signed payload does not match the SDK schema", async () => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        billingProvider: "polar",
        billingPlan: "pro",
        billingStatus: "active",
      });
    });
    configureWebhook();
    const body = JSON.stringify({
      type: "customer.state_changed",
      timestamp: new Date().toISOString(),
      data: { id: "malformed" },
    });

    const response = await deliver(t, body);

    expect(response.status).toBe(500);
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "pro",
      status: "active",
      canStartCheckout: true,
    });
  });

  it("rejects a request signed with another secret", async () => {
    const t = makeConvexTest();
    await seedApprovedMember(t);
    configureWebhook();
    const body = customerStateChangedBody();
    const response = await t.fetch("/webhooks/polar", {
      method: "POST",
      headers: await signedHeaders(body, "wrong-secret"),
      body,
    });

    expect(response.status).toBe(401);
  });
});
