import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const polarSdkMocks = vi.hoisted(() => ({
  constructorOptions: vi.fn(),
  subscriptionsList: vi.fn(),
  subscriptionsRevoke: vi.fn(),
}));

vi.mock("@polar-sh/sdk", () => ({
  Polar: class {
    readonly subscriptions = {
      list: polarSdkMocks.subscriptionsList,
      revoke: polarSdkMocks.subscriptionsRevoke,
    };

    constructor(options: unknown) {
      polarSdkMocks.constructorOptions(options);
    }
  },
}));

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

const workflowId = "account-deletion-workflow-1";

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function seedUser(billingPolarExternalCustomerId?: string) {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "test@example.invalid",
      isApproved: true,
      billingPolarExternalCustomerId,
    });
    const initiatingSessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: 2_000_000_000_000,
    });
    const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
      identity: { state: "active", userId, email: "test@example.invalid" },
      completionCapability: "billing-actions-test",
      state: "running",
      workflow: { state: "started", workflowId, attempt: 1 },
      currentStep: "request_accepted",
      requestedAt: 1,
      updatedAt: 1,
      initiatingSessionId,
      retryCount: 0,
      outcomes: {
        billing: { state: "not_started" },
        providerRevocation: { state: "not_started" },
        completionEmail: { state: "not_started" },
      },
    });
    await ctx.db.patch(userId, {
      accountDeletion: { state: "deleting", runId, requestedAt: 1 },
    });
    return { runId, userId };
  });
  return { t, ...ids };
}

function subscriptionPages(
  items: Array<{ id: string; status: string; customerExternalId?: string }>,
  totalCount = items.length,
) {
  return {
    [Symbol.asyncIterator]: async function* () {
      yield {
        result: {
          items: items.map(({ customerExternalId = "external-customer-test", ...item }) => ({
            ...item,
            customer: { externalId: customerExternalId },
          })),
          pagination: {
            totalCount,
            maxPage: Math.ceil(totalCount / 100),
          },
        },
      };
    },
  };
}

function configurePolar(): void {
  vi.stubEnv("CONVEX_AGENT_MODE", "anonymous");
  vi.stubEnv("POLAR_ACCESS_TOKEN", "test-polar-credential");
}

describe("account deletion billing actions", () => {
  it("rejects a scrubbed deletion run before reading billing identity", async () => {
    const { t, runId } = await seedUser("external-customer-test");
    await t.run(async (ctx) => {
      await ctx.db.replace(runId, {
        identity: { state: "scrubbed" },
        completionCapability: "billing-actions-test",
        state: "succeeded",
        currentStep: "finish",
        requestedAt: 1,
        updatedAt: 2,
        retryCount: 0,
        completedAt: 2,
        outcomes: {
          billing: { state: "succeeded" },
          providerRevocation: {
            state: "completed",
            github: { state: "revoked" },
            cloudflare: { state: "not_connected" },
            convex: { state: "not_connected" },
          },
          completionEmail: { state: "sent" },
        },
      });
    });

    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).rejects.toThrow("Account deletion workflow is not running.");
    expect(polarSdkMocks.constructorOptions).not.toHaveBeenCalled();
  });

  it("does not call Polar when the user has no Polar customer", async () => {
    const { t, runId } = await seedUser();

    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({ state: "not_applicable" });
    expect(polarSdkMocks.constructorOptions).not.toHaveBeenCalled();
  });

  it("fails closed when billing is active without a Polar customer identifier", async () => {
    const { t, runId, userId } = await seedUser();
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        billingProvider: "polar",
        billingPlan: "pro",
        billingStatus: "active",
      });
    });

    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({
      state: "failed",
      safeError: "Polar subscription cancellation could not be confirmed.",
    });
    expect(polarSdkMocks.constructorOptions).not.toHaveBeenCalled();
  });

  it("fails closed while a checkout is pending", async () => {
    const { t, runId, userId } = await seedUser();
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        billingPolarCheckoutAttempt: {
          state: "pending",
          attemptId: "polar_checkout_deletion_pending",
        },
      });
    });

    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({
      state: "failed",
      safeError: "Polar subscription cancellation could not be confirmed.",
    });
    expect(polarSdkMocks.constructorOptions).not.toHaveBeenCalled();
  });

  it("fails closed for an open checkout regardless of elapsed time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    const { t, runId, userId } = await seedUser();
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        billingPolarCheckoutAttempt: {
          state: "open",
          attemptId: "polar_checkout_deletion_open",
          checkoutId: "checkout-deletion-open",
        },
      });
    });

    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({
      state: "failed",
      safeError: "Polar subscription cancellation could not be confirmed.",
    });

    vi.advanceTimersByTime(10 * 365 * 24 * 60 * 60 * 1_000);
    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({
      state: "failed",
      safeError: "Polar subscription cancellation could not be confirmed.",
    });
    expect(polarSdkMocks.constructorOptions).not.toHaveBeenCalled();
  });

  it("preserves billing when another organization member remains", async () => {
    const { t, runId, userId } = await seedUser("legacy-customer");
    const billingAccountId = await t.run(async (ctx) => {
      const remainingUserId = await ctx.db.insert("users", {
        email: "remaining@example.invalid",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {});
      await ctx.db.insert("organizationMemberships", { organizationId, userId });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: remainingUserId,
      });
      return await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        provider: "polar",
        plan: "pro",
        status: "active",
        polarExternalCustomerId: "shared-customer",
        polarCheckoutAttempt: {
          state: "pending",
          attemptId: "shared-checkout",
        },
      });
    });

    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({ state: "not_applicable" });
    expect(polarSdkMocks.constructorOptions).not.toHaveBeenCalled();
    await expect(t.run(async (ctx) => await ctx.db.get(billingAccountId))).resolves.not.toBeNull();
  });

  it("uses sole-member organization billing instead of legacy user billing", async () => {
    const { t, runId, userId } = await seedUser("legacy-customer");
    await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", {});
      await ctx.db.insert("organizationMemberships", { organizationId, userId });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        provider: "polar",
        plan: "pro",
        status: "active",
        polarExternalCustomerId: "external-customer-test",
      });
    });
    configurePolar();
    polarSdkMocks.subscriptionsList.mockResolvedValue(subscriptionPages([]));

    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({ state: "succeeded" });
    expect(polarSdkMocks.subscriptionsList).toHaveBeenCalledWith({
      externalCustomerId: "external-customer-test",
      limit: 100,
    });
    expect(polarSdkMocks.subscriptionsList).not.toHaveBeenCalledWith({
      externalCustomerId: "legacy-customer",
      limit: 100,
    });
  });

  it("uses legacy user billing before membership backfill and revokes every subscription", async () => {
    const { t, runId } = await seedUser("external-customer-test");
    configurePolar();
    polarSdkMocks.subscriptionsList
      .mockResolvedValueOnce(
        subscriptionPages([
          { id: "subscription-a", status: "active" },
          { id: "subscription-b", status: "past_due" },
          { id: "subscription-paused", status: "paused" },
          { id: "subscription-canceled", status: "canceled" },
        ]),
      )
      .mockResolvedValueOnce(subscriptionPages([]));
    polarSdkMocks.subscriptionsRevoke.mockResolvedValue({});

    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({ state: "succeeded" });
    expect(polarSdkMocks.constructorOptions).toHaveBeenCalledWith({
      accessToken: "test-polar-credential",
      server: "sandbox",
      timeoutMs: 10_000,
    });
    expect(polarSdkMocks.subscriptionsList).toHaveBeenNthCalledWith(1, {
      externalCustomerId: "external-customer-test",
      limit: 100,
    });
    expect(polarSdkMocks.subscriptionsRevoke.mock.calls).toEqual([
      [{ id: "subscription-a" }],
      [{ id: "subscription-b" }],
      [{ id: "subscription-paused" }],
    ]);
    expect(polarSdkMocks.subscriptionsList).toHaveBeenCalledTimes(2);
  });

  it("fails closed when cancelable subscriptions remain after revocation", async () => {
    const { t, runId } = await seedUser("external-customer-test");
    configurePolar();
    polarSdkMocks.subscriptionsList.mockResolvedValue(
      subscriptionPages([{ id: "subscription-a", status: "active" }]),
    );
    polarSdkMocks.subscriptionsRevoke.mockResolvedValue({});

    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({
      state: "failed",
      safeError: "Polar subscription cancellation could not be confirmed.",
    });
  });

  it("fails closed when the first subscription-list pass omits reported items", async () => {
    const { t, runId } = await seedUser("external-customer-test");
    configurePolar();
    polarSdkMocks.subscriptionsList.mockResolvedValue(subscriptionPages([], 1));

    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({
      state: "failed",
      safeError: "Polar subscription cancellation could not be confirmed.",
    });
    expect(polarSdkMocks.subscriptionsRevoke).not.toHaveBeenCalled();
    expect(polarSdkMocks.subscriptionsList).toHaveBeenCalledOnce();
  });

  it("does not revoke a subscription that belongs to another Polar customer", async () => {
    const { t, runId } = await seedUser("external-customer-test");
    configurePolar();
    polarSdkMocks.subscriptionsList.mockResolvedValue(
      subscriptionPages([
        {
          id: "subscription-other-customer",
          status: "active",
          customerExternalId: "other-customer",
        },
      ]),
    );

    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({
      state: "failed",
      safeError: "Polar subscription cancellation could not be confirmed.",
    });
    expect(polarSdkMocks.subscriptionsRevoke).not.toHaveBeenCalled();
    expect(polarSdkMocks.subscriptionsList).toHaveBeenCalledOnce();
  });

  it("fails closed when the verification subscription-list pass omits reported items", async () => {
    const { t, runId } = await seedUser("external-customer-test");
    configurePolar();
    polarSdkMocks.subscriptionsList
      .mockResolvedValueOnce(subscriptionPages([{ id: "subscription-a", status: "active" }]))
      .mockResolvedValueOnce(subscriptionPages([], 1));
    polarSdkMocks.subscriptionsRevoke.mockResolvedValue({});

    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({
      state: "failed",
      safeError: "Polar subscription cancellation could not be confirmed.",
    });
    expect(polarSdkMocks.subscriptionsRevoke).toHaveBeenCalledWith({ id: "subscription-a" });
    expect(polarSdkMocks.subscriptionsList).toHaveBeenCalledTimes(2);
  });

  it("does not expose Polar response details in the failure outcome", async () => {
    const { t, runId } = await seedUser("external-customer-test");
    configurePolar();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    polarSdkMocks.subscriptionsList.mockRejectedValue(new Error("provider-owned-sensitive-marker"));

    const result = await t.action(
      internal.accountDeletion.billingActions.cancelForAccountDeletion,
      { runId, workflowId },
    );
    expect(result).toEqual({
      state: "failed",
      safeError: "Polar subscription cancellation could not be confirmed.",
    });
    expect(JSON.stringify(result)).not.toContain("provider-owned-sensitive-marker");
    expect(consoleError).toHaveBeenCalledWith(
      "billing:polar:account_deletion_cancellation_failed",
      {
        errorName: "Error",
        runId,
      },
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "provider-owned-sensitive-marker",
    );
  });
});
