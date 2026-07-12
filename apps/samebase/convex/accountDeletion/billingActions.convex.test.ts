import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

const workflowId = "account-deletion-workflow-1";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
    const runId = await ctx.db.insert("accountDeletionRuns", {
      identity: { state: "active", userId, email: "test@example.invalid" },
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
    return { runId, userId };
  });
  return { t, ...ids };
}

function polarSubscriptionList(items: Array<{ id: string; status?: string }>, maxPage = 1) {
  return new Response(
    JSON.stringify({
      items: items.map((item) => ({ status: "active", ...item })),
      pagination: {
        total_count: items.length,
        max_page: maxPage,
      },
    }),
    { status: 200 },
  );
}

function readRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

describe("account deletion billing actions", () => {
  it("rejects a scrubbed deletion run before reading billing identity", async () => {
    const { t, runId } = await seedUser("external-customer-test");
    await t.run(async (ctx) => {
      await ctx.db.replace(runId, {
        identity: { state: "scrubbed" },
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
    const fetch = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).rejects.toThrow("Account deletion workflow is not running.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not call Polar when the user has no Polar customer", async () => {
    const { t, runId } = await seedUser();
    const fetch = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({ state: "not_applicable" });
    expect(fetch).not.toHaveBeenCalled();
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
    const fetch = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({
      state: "failed",
      safeError: "Polar subscription cancellation could not be confirmed.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("revokes every active subscription and verifies none remain", async () => {
    const { t, runId } = await seedUser("external-customer-test");
    vi.stubEnv("POLAR_ACCESS_TOKEN", "test-polar-credential");
    const requests: Array<{ method: string; url: string }> = [];
    let listRequestCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = readRequestUrl(input);
        const method = init?.method ?? "GET";
        requests.push({ method, url });
        if (method === "GET") {
          listRequestCount += 1;
          return listRequestCount === 1
            ? polarSubscriptionList([
                { id: "subscription-a" },
                { id: "subscription-b", status: "past_due" },
                { id: "subscription-canceled", status: "canceled" },
              ])
            : polarSubscriptionList([]);
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    await expect(
      t.action(internal.accountDeletion.billingActions.cancelForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({ state: "succeeded" });
    expect(requests).toHaveLength(4);
    expect(requests[0]?.url).toContain("/subscriptions/?");
    expect(requests[0]?.url).toContain("external_customer_id=external-customer-test");
    expect(requests[0]?.url).not.toContain("active=");
    expect(requests.slice(1, 3)).toEqual([
      {
        method: "DELETE",
        url: "https://sandbox-api.polar.sh/v1/subscriptions/subscription-a",
      },
      {
        method: "DELETE",
        url: "https://sandbox-api.polar.sh/v1/subscriptions/subscription-b",
      },
    ]);
    expect(requests[3]?.method).toBe("GET");
  });

  it("fails closed when active subscriptions remain after revocation", async () => {
    const { t, runId } = await seedUser("external-customer-test");
    vi.stubEnv("POLAR_ACCESS_TOKEN", "test-polar-credential");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return polarSubscriptionList([{ id: "subscription-a" }]);
      }),
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
  });

  it("does not expose Polar response details in the failure outcome", async () => {
    const { t, runId } = await seedUser("external-customer-test");
    vi.stubEnv("POLAR_ACCESS_TOKEN", "test-polar-credential");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "provider-owned-sensitive-marker" }), {
            status: 503,
          }),
      ),
    );

    const result = await t.action(
      internal.accountDeletion.billingActions.cancelForAccountDeletion,
      { runId, workflowId },
    );
    expect(result).toEqual({
      state: "failed",
      safeError: "Polar subscription cancellation could not be confirmed.",
    });
    expect(JSON.stringify(result)).not.toContain("provider-owned-sensitive-marker");
  });
});
