import { CustomerState$inboundSchema } from "@polar-sh/sdk/models/components/customerstate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const polarSdkMocks = vi.hoisted(() => ({
  constructorOptions: vi.fn(),
  customersGetStateExternal: vi.fn(),
}));

vi.mock("@polar-sh/sdk", () => ({
  Polar: class {
    readonly customers = { getStateExternal: polarSdkMocks.customersGetStateExternal };

    constructor(options: unknown) {
      polarSdkMocks.constructorOptions(options);
    }
  },
}));

import { bytesToBase64 } from "../shared/base64";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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

function asUser(t: ConvexTest, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
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

function customerStatePayload(subscription?: {
  cancelAtPeriodEnd: boolean;
  productId: string;
  status: string;
}) {
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
    active_subscriptions: subscription
      ? [
          {
            id: "polar-subscription",
            created_at: "2026-08-01T00:00:00.000Z",
            modified_at: null,
            metadata: {},
            status: subscription.status,
            amount: 400,
            currency: "usd",
            recurring_interval: "month",
            current_period_start: "2026-08-01T00:00:00.000Z",
            current_period_end: currentPeriodEnd,
            trial_start: null,
            trial_end: null,
            cancel_at_period_end: subscription.cancelAtPeriodEnd,
            canceled_at: subscription.cancelAtPeriodEnd ? "2026-08-15T00:00:00.000Z" : null,
            started_at: "2026-08-01T00:00:00.000Z",
            ends_at: subscription.cancelAtPeriodEnd ? currentPeriodEnd : null,
            product_id: subscription.productId,
            discount_id: null,
            meters: [],
          },
        ]
      : [],
    granted_benefits: [],
    active_meters: [],
  };
}

function polarCustomerState(subscription?: {
  cancelAtPeriodEnd: boolean;
  productId: string;
  status: string;
}) {
  return CustomerState$inboundSchema.parse(customerStatePayload(subscription));
}

function customerStateChangedBody(args: {
  eventAt: number;
  subscription?: {
    cancelAtPeriodEnd: boolean;
    productId: string;
    status: string;
  };
}): string {
  return JSON.stringify({
    type: "customer.state_changed",
    timestamp: new Date(args.eventAt).toISOString(),
    data: customerStatePayload(args.subscription),
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
    new TextEncoder().encode(`${webhookId}.${timestamp}.${body}`),
  );

  return new Headers({
    "content-type": "application/json",
    "webhook-id": webhookId,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${bytesToBase64(new Uint8Array(signature))}`,
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
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-02T12:00:00.000Z"));
  vi.stubEnv("CONVEX_AGENT_MODE", "anonymous");
  vi.stubEnv("POLAR_ACCESS_TOKEN", "sandbox-token");
  vi.stubEnv("POLAR_PRO_MONTHLY_PRODUCT_ID", productId);
  vi.stubEnv("POLAR_WEBHOOK_SECRET", webhookSecret);
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Polar customer.state_changed webhook", () => {
  it("activates Pro from a signed customer state event", async () => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);
    configureWebhook();
    const body = customerStateChangedBody({
      eventAt: Date.now(),
      subscription: { cancelAtPeriodEnd: false, productId, status: "active" },
    });
    polarSdkMocks.customersGetStateExternal.mockResolvedValue(
      polarCustomerState({ cancelAtPeriodEnd: false, productId, status: "active" }),
    );

    const response = await deliver(t, body);
    expect(response.status).toBe(202);
    expect(polarSdkMocks.customersGetStateExternal).not.toHaveBeenCalled();
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "pro",
      status: "active",
      currentPeriodEndAt: Date.parse(currentPeriodEnd),
      cancelAtPeriodEnd: false,
      canStartCheckout: true,
    });
  });

  it("keeps recoverable past-due and end-of-period cancellation entitled", async () => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);
    configureWebhook();
    const body = customerStateChangedBody({
      eventAt: Date.now(),
      subscription: { cancelAtPeriodEnd: true, productId, status: "past_due" },
    });
    polarSdkMocks.customersGetStateExternal.mockResolvedValue(
      polarCustomerState({ cancelAtPeriodEnd: true, productId, status: "past_due" }),
    );

    const response = await deliver(t, body);
    expect(response.status).toBe(202);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "pro",
      status: "past_due",
      currentPeriodEndAt: Date.parse(currentPeriodEnd),
      cancelAtPeriodEnd: true,
      canStartCheckout: true,
    });
  });

  it("downgrades to Free only after the subscription leaves active customer state", async () => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);
    configureWebhook();
    const activeBody = customerStateChangedBody({
      eventAt: Date.now() - 1_000,
      subscription: { cancelAtPeriodEnd: true, productId, status: "active" },
    });
    const freeBody = customerStateChangedBody({ eventAt: Date.now() });

    polarSdkMocks.customersGetStateExternal.mockResolvedValue(
      polarCustomerState({ cancelAtPeriodEnd: true, productId, status: "active" }),
    );
    expect((await deliver(t, activeBody)).status).toBe(202);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    polarSdkMocks.customersGetStateExternal.mockResolvedValue(polarCustomerState());
    expect((await deliver(t, freeBody)).status).toBe(202);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "free",
      status: "inactive",
      canStartCheckout: true,
    });
  });

  it("converges duplicate and older event snapshots to current Polar state", async () => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);
    configureWebhook();
    const activeBody = customerStateChangedBody({
      eventAt: Date.now(),
      subscription: { cancelAtPeriodEnd: false, productId, status: "active" },
    });
    const olderFreeBody = customerStateChangedBody({ eventAt: Date.now() - 10_000 });
    polarSdkMocks.customersGetStateExternal.mockResolvedValue(
      polarCustomerState({ cancelAtPeriodEnd: false, productId, status: "active" }),
    );

    expect((await deliver(t, activeBody)).status).toBe(202);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect((await deliver(t, activeBody)).status).toBe(202);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect((await deliver(t, olderFreeBody)).status).toBe(202);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "pro",
      status: "active",
      currentPeriodEndAt: Date.parse(currentPeriodEnd),
      cancelAtPeriodEnd: false,
      canStartCheckout: true,
    });
  });

  it("does not let delayed webhooks revert a newer canonical reconciliation", async () => {
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
    const firstWebhook = customerStateChangedBody({
      eventAt: Date.now() - 2_000,
      subscription: { cancelAtPeriodEnd: false, productId, status: "active" },
    });
    const delayedWebhook = customerStateChangedBody({
      eventAt: Date.now() - 1_000,
      subscription: { cancelAtPeriodEnd: false, productId, status: "active" },
    });
    polarSdkMocks.customersGetStateExternal.mockResolvedValue(polarCustomerState());

    expect((await deliver(t, firstWebhook)).status).toBe(202);
    await expect(
      asUser(t, userId).action(api.billing.reconcileViewerBillingFromPolar, {}),
    ).resolves.toBe(true);
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "free",
      status: "inactive",
      canStartCheckout: true,
    });

    expect((await deliver(t, delayedWebhook)).status).toBe(202);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "free",
      status: "inactive",
      canStartCheckout: true,
    });
    expect(polarSdkMocks.customersGetStateExternal).toHaveBeenCalledTimes(2);
  });

  it("resolves conflicting events with the same timestamp from canonical Polar state", async () => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);
    configureWebhook();
    const eventAt = Date.now();
    const activeBody = customerStateChangedBody({
      eventAt,
      subscription: { cancelAtPeriodEnd: false, productId, status: "active" },
    });
    const freeBody = customerStateChangedBody({ eventAt });
    polarSdkMocks.customersGetStateExternal.mockResolvedValue(
      polarCustomerState({ cancelAtPeriodEnd: false, productId, status: "active" }),
    );

    expect((await deliver(t, activeBody)).status).toBe(202);
    expect((await deliver(t, freeBody)).status).toBe(202);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "pro",
      status: "active",
      currentPeriodEndAt: Date.parse(currentPeriodEnd),
      cancelAtPeriodEnd: false,
      canStartCheckout: true,
    });
    expect(polarSdkMocks.customersGetStateExternal).toHaveBeenCalledOnce();
  });

  it("reruns once when a webhook arrives during an active canonical read", async () => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);
    configureWebhook();
    const firstRead = createDeferred<ReturnType<typeof polarCustomerState>>();
    polarSdkMocks.customersGetStateExternal
      .mockReturnValueOnce(firstRead.promise)
      .mockResolvedValueOnce(polarCustomerState());
    const firstBody = customerStateChangedBody({
      eventAt: Date.now() - 1_000,
      subscription: { cancelAtPeriodEnd: false, productId, status: "active" },
    });
    const secondBody = customerStateChangedBody({ eventAt: Date.now() });

    expect((await deliver(t, firstBody)).status).toBe(202);
    const scheduledRun = t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await vi.waitFor(() => expect(polarSdkMocks.customersGetStateExternal).toHaveBeenCalledOnce());
    expect((await deliver(t, secondBody)).status).toBe(202);
    firstRead.resolve(
      polarCustomerState({ cancelAtPeriodEnd: false, productId, status: "active" }),
    );
    await scheduledRun;

    expect(polarSdkMocks.customersGetStateExternal).toHaveBeenCalledTimes(2);
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "free",
      status: "inactive",
      canStartCheckout: true,
    });
  });

  it("retries a failed canonical read and applies the recovered state", async () => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);
    configureWebhook();
    polarSdkMocks.customersGetStateExternal
      .mockRejectedValueOnce(new Error("Temporary Polar failure"))
      .mockResolvedValueOnce(
        polarCustomerState({ cancelAtPeriodEnd: false, productId, status: "active" }),
      );

    expect((await deliver(t, customerStateChangedBody({ eventAt: Date.now() }))).status).toBe(202);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    expect(polarSdkMocks.customersGetStateExternal).toHaveBeenCalledTimes(2);
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "pro",
      status: "active",
      currentPeriodEndAt: Date.parse(currentPeriodEnd),
      cancelAtPeriodEnd: false,
      canStartCheckout: true,
    });
  });

  it("stops retrying after the bounded limit and preserves stored entitlement", async () => {
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
    polarSdkMocks.customersGetStateExternal.mockRejectedValue(new Error("Polar unavailable"));

    expect((await deliver(t, customerStateChangedBody({ eventAt: Date.now() }))).status).toBe(202);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    expect(polarSdkMocks.customersGetStateExternal).toHaveBeenCalledTimes(5);
    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      provider: "polar",
      plan: "pro",
      status: "active",
      canStartCheckout: true,
    });
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
    const body = customerStateChangedBody({ eventAt: Date.now() });
    const response = await t.fetch("/webhooks/polar", {
      method: "POST",
      headers: await signedHeaders(body, "wrong-secret"),
      body,
    });

    expect(response.status).toBe(401);
  });
});
