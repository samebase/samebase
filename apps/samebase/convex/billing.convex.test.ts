import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

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
    });
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("billing access", () => {
  it("lets approved members read their billing status", async () => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);

    await expect(asUser(t, userId).query(api.billing.getViewerBillingStatus, {})).resolves.toEqual({
      plan: "free",
      status: "inactive",
    });
  });

  it("lets approved members reach the checkout handler", async () => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);

    await expect(
      asUser(t, userId).action(api.billing.createPolarCheckoutSession, {
        interval: "monthly",
        successUrl: "http://localhost:5174/pricing?checkout=success",
        returnUrl: "http://localhost:5174/pricing?checkout=cancel",
      }),
    ).rejects.toThrow("Pro checkout is not configured yet.");
  });

  it("lets approved members create a portal session for their own customer id", async () => {
    const t = makeConvexTest();
    const userId = await seedApprovedMember(t);
    vi.stubEnv("POLAR_ACCESS_TOKEN", "polar-token");
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({
          customer_portal_url: "https://sandbox.polar.sh/portal/customer-session",
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetch);

    await expect(
      asUser(t, userId).action(api.billing.createPolarCustomerPortalSession, {
        returnUrl: "http://localhost:5174/pricing",
      }),
    ).resolves.toEqual({
      url: "https://sandbox.polar.sh/portal/customer-session",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
