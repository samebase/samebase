import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

const primaryCloudflareAccountId = "a".repeat(32);
const secondaryCloudflareAccountId = "b".repeat(32);

afterEach(() => {
  vi.unstubAllGlobals();
});

function cloudflareAccountsResponse(
  accounts: Array<{ id: string; name: string; type: "standard" }>,
): Response {
  return new Response(
    JSON.stringify({ success: true, errors: [], messages: [], result: accounts }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

async function seedProviderOrganization(options?: { cloudflareTarget?: "configured" | "pending" }) {
  const t = makeConvexTest();
  const { memberId, organizationId, outsiderId, providerCredentialsId, userId } = await t.run(
    async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "owner@example.com",
        isApproved: true,
      });
      const memberId = await ctx.db.insert("users", {
        email: "member@example.com",
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
        ...(options?.cloudflareTarget === "pending"
          ? {}
          : {
              cloudflareAccount: {
                accountId: primaryCloudflareAccountId,
                accountName: "Primary account",
              },
            }),
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
        role: "owner",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: memberId,
        role: "member",
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
      return { memberId, organizationId, outsiderId, providerCredentialsId, userId };
    },
  );
  return { memberId, organizationId, outsiderId, providerCredentialsId, t, userId };
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
      accountId: primaryCloudflareAccountId,
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

    await expect(asOwner.action(api.users.disconnectConvex, { organizationId })).resolves.toEqual({
      upstreamRevocation: "not_supported",
    });
    await expect(asOwner.action(api.users.disconnectConvex, { organizationId })).resolves.toEqual({
      upstreamRevocation: "confirmed",
    });
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
      accountId: primaryCloudflareAccountId,
      accountName: "Primary account",
    });
  });

  it("lets an owner list visible accounts and select the stable target", async () => {
    const { organizationId, t, userId } = await seedProviderOrganization({
      cloudflareTarget: "pending",
    });
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    const fetch = vi.fn(async () =>
      cloudflareAccountsResponse([
        { id: secondaryCloudflareAccountId, name: "Secondary account", type: "standard" },
        { id: primaryCloudflareAccountId, name: "Primary account", type: "standard" },
      ]),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      asOwner.action(api.users.listCloudflareAccounts, { organizationId }),
    ).resolves.toEqual([
      { accountId: primaryCloudflareAccountId, accountName: "Primary account" },
      { accountId: secondaryCloudflareAccountId, accountName: "Secondary account" },
    ]);
    await expect(
      asOwner.action(api.users.selectCloudflareAccount, {
        organizationId,
        accountId: secondaryCloudflareAccountId,
      }),
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => await ctx.db.get(organizationId))).resolves.toMatchObject({
      cloudflareAccount: {
        accountId: secondaryCloudflareAccountId,
        accountName: "Secondary account",
      },
    });
  });

  it("does not expose pending account choices or selection to a member", async () => {
    const { memberId, organizationId, t } = await seedProviderOrganization({
      cloudflareTarget: "pending",
    });
    const asMember = t.withIdentity({
      subject: `${memberId}|session`,
      tokenIdentifier: `test:${memberId}`,
    });

    await expect(
      asMember.action(api.users.listCloudflareAccounts, { organizationId }),
    ).resolves.toEqual([]);
    await expect(
      asMember.action(api.users.selectCloudflareAccount, {
        organizationId,
        accountId: primaryCloudflareAccountId,
      }),
    ).rejects.toThrow("Organization owner access is required.");
  });

  it("rejects account selection when the credential changes during discovery", async () => {
    const { organizationId, providerCredentialsId, t, userId } = await seedProviderOrganization({
      cloudflareTarget: "pending",
    });
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await t.run(async (ctx) => {
          const credentials = await ctx.db.get(providerCredentialsId);
          if (credentials?.cloudflare === undefined) {
            throw new Error("Expected a Cloudflare credential.");
          }
          await ctx.db.patch(providerCredentialsId, {
            cloudflare: {
              ...credentials.cloudflare,
              auth: { method: "api_key", credential: "replacement-credential" },
              updatedAt: 2,
            },
          });
        });
        return cloudflareAccountsResponse([
          { id: primaryCloudflareAccountId, name: "Primary account", type: "standard" },
        ]);
      }),
    );

    await expect(
      asOwner.action(api.users.selectCloudflareAccount, {
        organizationId,
        accountId: primaryCloudflareAccountId,
      }),
    ).rejects.toThrow("Cloudflare credential changed before account selection completed.");
    await expect(
      t.run(async (ctx) => await ctx.db.get(organizationId)),
    ).resolves.not.toHaveProperty("cloudflareAccount");
  });

  it("returns only the stable target and rejects a second target selection", async () => {
    const { memberId, organizationId, t, userId } = await seedProviderOrganization();
    const asMember = t.withIdentity({
      subject: `${memberId}|session`,
      tokenIdentifier: `test:${memberId}`,
    });
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      asMember.action(api.users.listCloudflareAccounts, { organizationId }),
    ).resolves.toEqual([{ accountId: primaryCloudflareAccountId, accountName: "Primary account" }]);
    await expect(
      asOwner.action(api.users.selectCloudflareAccount, {
        organizationId,
        accountId: secondaryCloudflareAccountId,
      }),
    ).rejects.toThrow("Cloudflare account is already configured.");
    expect(fetch).not.toHaveBeenCalled();
  });
});
