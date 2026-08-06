import { describe, expect, it } from "vite-plus/test";

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("organization billing access", () => {
  it("denies direct billing reads and reconciliation to a pending user with a membership", async () => {
    const t = makeConvexTest();
    const { organizationId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "pending-billing@example.invalid",
        isApproved: false,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "pending-billing-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "pending-billing-owner",
        githubOwnerLoginNormalized: "pending-billing-owner",
        githubInstallationId: "pending-billing-installation",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
        role: "owner",
      });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      return { organizationId, userId };
    });
    const asPendingUser = t.withIdentity({
      subject: `${userId}|pending-billing-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(
      asPendingUser.query(api.billing.getViewerBillingStatus, { organizationId }),
    ).rejects.toThrowError("Access denied");
    await expect(
      asPendingUser.query(api.billingResourceQuotas.getViewerBillingResourceUsage, {
        organizationId,
      }),
    ).rejects.toThrowError("Access denied");
    await expect(
      asPendingUser.action(api.billing.reconcileViewerBillingFromPolar, { organizationId }),
    ).rejects.toThrowError("Access denied");
  });
});
