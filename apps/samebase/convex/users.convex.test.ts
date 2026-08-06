import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

async function seedProviderOrganizations() {
  const t = makeConvexTest();
  const { outsiderId, userId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "member@example.com",
      isApproved: true,
    });
    const outsiderId = await ctx.db.insert("users", {
      email: "outsider@example.com",
      isApproved: true,
    });
    return { outsiderId, userId };
  });
  const { organizationId } = await t.mutation(
    internal.organizations.createOrReconnectVerifiedOrganization,
    {
      userId,
      githubOwnerId: "owner-1",
      githubOwnerType: "organization",
      githubOwnerLogin: "Primary",
      githubInstallationId: "installation-1",
    },
  );
  const { organizationId: otherOrganizationId } = await t.mutation(
    internal.organizations.createOrReconnectVerifiedOrganization,
    {
      userId,
      githubOwnerId: "owner-2",
      githubOwnerType: "organization",
      githubOwnerLogin: "Other",
      githubInstallationId: "installation-2",
    },
  );
  const convexConnectionId = await t.mutation(internal.providerConnections.createConnected, {
    organizationId,
    connectedByUserId: userId,
    connection: {
      kind: "convex",
      auth: { method: "api_key", credential: "convex-credential" },
      teamId: "team-1",
      teamSlug: "team-one",
    },
  });
  const cloudflareConnectionId = await t.mutation(internal.providerConnections.createConnected, {
    organizationId,
    connectedByUserId: userId,
    connection: {
      kind: "cloudflare",
      auth: { method: "api_key", credential: "cloudflare-credential" },
      defaultAccount: {
        state: "selected",
        accountId: "account-1",
        accountName: "Primary account",
      },
    },
  });
  return {
    cloudflareConnectionId,
    convexConnectionId,
    organizationId,
    otherOrganizationId,
    outsiderId,
    t,
    userId,
  };
}

describe("organization provider status", () => {
  it("isolates selected connections by organization and checks membership", async () => {
    const { organizationId, otherOrganizationId, outsiderId, t, userId } =
      await seedProviderOrganizations();
    const asUser = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    const asOutsider = t.withIdentity({
      subject: `${outsiderId}|session`,
      tokenIdentifier: `test:${outsiderId}`,
    });

    await expect(
      asUser.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).resolves.toEqual({
      connected: true,
      teamId: "team-1",
      teamSlug: "team-one",
      authMethod: "api_key",
    });
    await expect(
      asUser.query(api.users.getCloudflareConnectionStatus, { organizationId }),
    ).resolves.toEqual({
      connected: true,
      accountId: "account-1",
      accountName: "Primary account",
      authMethod: "api_key",
    });
    await expect(
      asUser.query(api.users.getConvexConnectionStatus, {
        organizationId: otherOrganizationId,
      }),
    ).resolves.toEqual({ connected: false });
    await expect(
      asOutsider.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).rejects.toThrow("Organization membership is required.");
  });

  it("deletes API-key connections only from the requested organization", async () => {
    const {
      cloudflareConnectionId,
      convexConnectionId,
      organizationId,
      otherOrganizationId,
      t,
      userId,
    } = await seedProviderOrganizations();
    const asUser = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });

    await asUser.action(api.users.disconnectConvex, { organizationId });
    await asUser.action(api.users.disconnectCloudflare, { organizationId });

    const state = await t.run(async (ctx) => {
      const [cloudflareConnection, convexConnection, otherOrganization] = await Promise.all([
        ctx.db.get(cloudflareConnectionId),
        ctx.db.get(convexConnectionId),
        ctx.db.get(otherOrganizationId),
      ]);
      return {
        cloudflareConnection,
        convexConnection,
        otherOrganizationExists: otherOrganization !== null,
      };
    });
    const [selectedCloudflareConnection, selectedConvexConnection] = await Promise.all([
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId,
        kind: "cloudflare",
      }),
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId,
        kind: "convex",
      }),
    ]);
    expect({ ...state, selectedCloudflareConnection, selectedConvexConnection }).toEqual({
      cloudflareConnection: null,
      convexConnection: null,
      otherOrganizationExists: true,
      selectedCloudflareConnection: null,
      selectedConvexConnection: null,
    });
  });
});
