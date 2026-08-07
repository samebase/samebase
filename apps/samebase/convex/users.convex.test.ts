import { describe, expect, it } from "vite-plus/test";

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

async function seedProviderOrganization() {
  const t = makeConvexTest();
  const { organizationId, outsiderId, userId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "owner@example.com",
      isApproved: true,
    });
    const outsiderId = await ctx.db.insert("users", {
      email: "outsider@example.com",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "owner-1",
      githubOwnerType: "organization",
      githubOwnerLogin: "Primary",
      githubOwnerLoginNormalized: "primary",
      githubInstallationId: "installation-1",
      convexTeam: { teamId: "team-1", teamSlug: "team-one" },
      cloudflareAccount: { accountId: "account-1", accountName: "Primary account" },
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId,
      role: "owner",
    });
    const providerCredentialsId = await ctx.db.insert("organizationProviderCredentials", {
      convex: {
        auth: { method: "api_key", credential: "convex-credential" },
        connectedByUserId: userId,
        updatedAt: 1,
      },
      cloudflare: {
        auth: { method: "api_key", credential: "cloudflare-credential" },
        connectedByUserId: userId,
        updatedAt: 1,
      },
    });
    await ctx.db.patch(organizationId, { providerCredentialsId });
    return { organizationId, outsiderId, userId };
  });
  return { organizationId, outsiderId, t, userId };
}

describe("organization provider status", () => {
  it("shows the configured destinations and hides credentials", async () => {
    const { organizationId, outsiderId, t, userId } = await seedProviderOrganization();
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    const asOutsider = t.withIdentity({
      subject: `${outsiderId}|session`,
      tokenIdentifier: `test:${outsiderId}`,
    });

    await expect(
      asOwner.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).resolves.toEqual({
      state: "connected",
      teamId: "team-1",
      teamSlug: "team-one",
      authMethod: "api_key",
    });
    await expect(
      asOwner.query(api.users.getCloudflareConnectionStatus, { organizationId }),
    ).resolves.toEqual({
      state: "connected",
      accountId: "account-1",
      accountName: "Primary account",
      authMethod: "api_key",
    });
    await expect(
      asOutsider.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).rejects.toThrow("Organization membership is required.");
  });

  it("disconnects credentials but preserves both destinations", async () => {
    const { organizationId, t, userId } = await seedProviderOrganization();
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(
      asOwner.action(api.users.disconnectConvex, { organizationId }),
    ).resolves.toBeNull();
    await expect(
      asOwner.action(api.users.disconnectCloudflare, { organizationId }),
    ).resolves.toEqual({ upstreamRevocation: "not_supported" });

    await expect(
      asOwner.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).resolves.toEqual({ state: "disconnected", teamId: "team-1", teamSlug: "team-one" });
    await expect(
      asOwner.query(api.users.getCloudflareConnectionStatus, { organizationId }),
    ).resolves.toEqual({
      state: "disconnected",
      accountId: "account-1",
      accountName: "Primary account",
    });
  });
});
