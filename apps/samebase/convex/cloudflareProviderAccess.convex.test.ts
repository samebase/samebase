import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("Cloudflare provider access", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not return provider failure text", async () => {
    const t = makeConvexTest();
    const { organizationId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        name: "Cloudflare provider organization",
      });
      await ctx.db.insert("organizationMemberships", { organizationId, userId });
      const providerConnectionId = await ctx.db.insert("providerConnections", {
        state: "connected",
        kind: "cloudflare",
        organizationId,
        connectedByUserId: userId,
        auth: {
          method: "api_key",
          credential: "test-cloudflare-api-key",
        },
        defaultAccount: { state: "not_selected" },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(organizationId, {
        selectedCloudflareProviderConnectionId: providerConnectionId,
      });
      return { organizationId, userId };
    });
    const asUser = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("provider-secret-sentinel");
      }),
    );

    const access = await asUser.action(
      api.cloudflareProviderAccess.checkCloudflareConnectionAccess,
      { organizationId },
    );

    expect(access.checks).toContainEqual({
      key: "token",
      label: "API token",
      status: "error",
      message: "Cloudflare access check failed. Reconnect Cloudflare and retry.",
    });
    expect(JSON.stringify(access)).not.toContain("provider-secret-sentinel");
  });
});
