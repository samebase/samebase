import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

async function seedOrganizationMembers() {
  const t = makeConvexTest();
  const users = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email: "owner@example.com" });
    const memberId = await ctx.db.insert("users", { email: "member@example.com" });
    const outsiderId = await ctx.db.insert("users", { email: "outsider@example.com" });
    return { memberId, outsiderId, ownerId };
  });
  const { organizationId } = await t.mutation(
    internal.organizations.createOrReconnectVerifiedOrganization,
    {
      userId: users.ownerId,
      githubOwnerId: "owner-1",
      githubOwnerType: "organization",
      githubOwnerLogin: "Primary",
      githubInstallationId: "installation-1",
    },
  );
  const { organizationId: otherOrganizationId } = await t.mutation(
    internal.organizations.createOrReconnectVerifiedOrganization,
    {
      userId: users.outsiderId,
      githubOwnerId: "owner-2",
      githubOwnerType: "organization",
      githubOwnerLogin: "Other",
      githubInstallationId: "installation-2",
    },
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: users.memberId,
      role: "member",
    });
  });
  return { ...users, organizationId, otherOrganizationId, t };
}

describe("organization provider connections", () => {
  it("rejects a second connection of each provider kind", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const convexConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "convex",
        auth: { method: "api_key", credential: "credential-a" },
        teamId: "team-a",
      },
    });
    await expect(
      t.mutation(internal.providerConnections.createConnected, {
        organizationId,
        connectedByUserId: ownerId,
        connection: {
          kind: "convex",
          auth: { method: "api_key", credential: "credential-b" },
          teamId: "team-a",
        },
      }),
    ).rejects.toThrow("Provider connection already exists.");

    const cloudflareConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "credential-a" },
        defaultAccount: { state: "not_selected" },
      },
    });
    await expect(
      t.mutation(internal.providerConnections.createConnected, {
        organizationId,
        connectedByUserId: ownerId,
        connection: {
          kind: "cloudflare",
          auth: { method: "api_key", credential: "credential-b" },
          defaultAccount: { state: "not_selected" },
        },
      }),
    ).rejects.toThrow("Provider connection already exists.");

    const [convexConnection, cloudflareConnection] = await Promise.all([
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId: ownerId,
        kind: "convex",
      }),
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId: ownerId,
        kind: "cloudflare",
      }),
    ]);
    expect({ cloudflareConnection, convexConnection }).toMatchObject({
      cloudflareConnection: { _id: cloudflareConnectionId },
      convexConnection: { _id: convexConnectionId },
    });
  });

  it("reauthorizes the same targets without changing row IDs", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const convexConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "convex",
        auth: { method: "api_key", credential: "convex-a" },
        teamId: "team-a",
      },
    });
    const cloudflareConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "cloudflare-a" },
        defaultAccount: {
          state: "selected",
          accountId: "account-a",
          accountName: "Account A",
        },
      },
    });

    await expect(
      t.mutation(internal.providerConnections.reauthorizeConnected, {
        organizationId,
        connectedByUserId: ownerId,
        providerConnectionId: convexConnectionId,
        connection: {
          kind: "convex",
          auth: { method: "oauth", credential: "convex-b" },
          teamId: "team-a",
        },
      }),
    ).resolves.toBe(convexConnectionId);
    await expect(
      t.mutation(internal.providerConnections.reauthorizeConnected, {
        organizationId,
        connectedByUserId: ownerId,
        providerConnectionId: cloudflareConnectionId,
        connection: {
          kind: "cloudflare",
          auth: { method: "api_key", credential: "cloudflare-b" },
          defaultAccount: {
            state: "selected",
            accountId: "account-a",
            accountName: "Account A renamed",
          },
        },
      }),
    ).resolves.toBe(cloudflareConnectionId);

    await expect(
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId: ownerId,
        kind: "convex",
      }),
    ).resolves.toMatchObject({
      _id: convexConnectionId,
      auth: { method: "oauth", credential: "convex-b" },
      teamId: "team-a",
    });
    await expect(
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId: ownerId,
        kind: "cloudflare",
      }),
    ).resolves.toMatchObject({
      _id: cloudflareConnectionId,
      auth: { credential: "cloudflare-b" },
      defaultAccount: { state: "selected", accountId: "account-a" },
    });
  });

  it("rejects a Convex team change", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "convex",
        auth: { method: "api_key", credential: "credential-a" },
        teamId: "team-a",
      },
    });

    await expect(
      t.mutation(internal.providerConnections.reauthorizeConnected, {
        organizationId,
        connectedByUserId: ownerId,
        providerConnectionId,
        connection: {
          kind: "convex",
          auth: { method: "api_key", credential: "credential-b" },
          teamId: "team-b",
        },
      }),
    ).rejects.toThrow("Convex connection team cannot change.");
  });

  it("rejects a Cloudflare account change", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "credential-a" },
        defaultAccount: { state: "not_selected" },
      },
    });

    await expect(
      t.mutation(internal.providerConnections.updateCloudflareConnected, {
        organizationId,
        userId: ownerId,
        providerConnectionId,
        expectedCredential: "credential-a",
        auth: { method: "api_key", credential: "credential-a" },
        defaultAccount: {
          state: "selected",
          accountId: "account-a",
          accountName: "Account A",
        },
      }),
    ).resolves.toBeNull();

    await expect(
      t.mutation(internal.providerConnections.reauthorizeConnected, {
        organizationId,
        connectedByUserId: ownerId,
        providerConnectionId,
        connection: {
          kind: "cloudflare",
          auth: { method: "api_key", credential: "credential-b" },
          defaultAccount: {
            state: "selected",
            accountId: "account-b",
            accountName: "Account B",
          },
        },
      }),
    ).rejects.toThrow("Cloudflare connection account cannot change.");
    await expect(
      t.mutation(internal.providerConnections.updateCloudflareConnected, {
        organizationId,
        userId: ownerId,
        providerConnectionId,
        expectedCredential: "credential-a",
        auth: { method: "api_key", credential: "credential-a" },
        defaultAccount: {
          state: "selected",
          accountId: "account-b",
          accountName: "Account B",
        },
      }),
    ).rejects.toThrow("Cloudflare connection account cannot change.");
  });

  it("preserves a selected Cloudflare account when reauthorization cannot select one", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "credential-a" },
        defaultAccount: {
          state: "selected",
          accountId: "account-a",
          accountName: "Account A",
        },
      },
    });

    await t.mutation(internal.providerConnections.reauthorizeConnected, {
      organizationId,
      connectedByUserId: ownerId,
      providerConnectionId,
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "credential-b" },
        defaultAccount: { state: "not_selected" },
      },
    });

    await expect(
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId: ownerId,
        kind: "cloudflare",
      }),
    ).resolves.toMatchObject({
      _id: providerConnectionId,
      auth: { credential: "credential-b" },
      defaultAccount: {
        state: "selected",
        accountId: "account-a",
        accountName: "Account A",
      },
    });
  });

  it("rejects stale Cloudflare updates after reauthorization", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "credential-a" },
        defaultAccount: { state: "not_selected" },
      },
    });
    await t.mutation(internal.providerConnections.reauthorizeConnected, {
      organizationId,
      connectedByUserId: ownerId,
      providerConnectionId,
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "credential-b" },
        defaultAccount: { state: "not_selected" },
      },
    });

    await expect(
      t.mutation(internal.providerConnections.updateCloudflareConnected, {
        organizationId,
        userId: ownerId,
        providerConnectionId,
        expectedCredential: "credential-a",
        auth: { method: "api_key", credential: "credential-a" },
        defaultAccount: {
          state: "selected",
          accountId: "account-a",
          accountName: "Account A",
        },
      }),
    ).rejects.toThrow("Cloudflare connection changed before the update completed.");
  });

  it("lets members use connections but not manage them", async () => {
    const { memberId, organizationId, ownerId, t } = await seedOrganizationMembers();
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "convex",
        auth: { method: "api_key", credential: "credential-a" },
        teamId: "team-a",
      },
    });

    await expect(
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId: memberId,
        kind: "convex",
      }),
    ).resolves.toMatchObject({ _id: providerConnectionId });
    await expect(
      t.mutation(internal.providerConnections.createConnected, {
        organizationId,
        connectedByUserId: memberId,
        connection: {
          kind: "cloudflare",
          auth: { method: "api_key", credential: "credential-b" },
          defaultAccount: { state: "not_selected" },
        },
      }),
    ).rejects.toThrow("Organization owner access is required.");
    await expect(
      t.mutation(internal.providerConnections.reauthorizeConnected, {
        organizationId,
        connectedByUserId: memberId,
        providerConnectionId,
        connection: {
          kind: "convex",
          auth: { method: "api_key", credential: "credential-b" },
          teamId: "team-a",
        },
      }),
    ).rejects.toThrow("Organization owner access is required.");
    await expect(
      t.mutation(internal.providerConnections.disconnect, {
        organizationId,
        disconnectedByUserId: memberId,
        providerConnectionId,
        kind: "convex",
      }),
    ).rejects.toThrow("Organization owner access is required.");
  });

  it("fails closed when legacy rows contain duplicate provider kinds", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    await t.run(async (ctx) => {
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        organizationId,
        connectedByUserId: ownerId,
        auth: { method: "api_key", credential: "credential-a" },
        teamId: "team-a",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        organizationId,
        connectedByUserId: ownerId,
        auth: { method: "api_key", credential: "credential-b" },
        teamId: "team-a",
        createdAt: 2,
        updatedAt: 2,
      });
    });

    await expect(
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId: ownerId,
        kind: "convex",
      }),
    ).rejects.toThrow("Organization has multiple convex provider connections.");
  });

  it("checks membership and deletes only the organization row", async () => {
    const { organizationId, otherOrganizationId, outsiderId, ownerId, t } =
      await seedOrganizationMembers();
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "credential-a" },
        defaultAccount: { state: "not_selected" },
      },
    });

    await expect(
      t.mutation(internal.providerConnections.disconnect, {
        organizationId,
        disconnectedByUserId: outsiderId,
        providerConnectionId,
        kind: "cloudflare",
      }),
    ).rejects.toThrow("Organization membership is required.");
    await expect(
      t.query(internal.providerConnections.loadByIdForOrganization, {
        organizationId: otherOrganizationId,
        userId: outsiderId,
        providerConnectionId,
        kind: "cloudflare",
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.providerConnections.loadByIdForOrganization, {
        organizationId,
        userId: ownerId,
        providerConnectionId,
        kind: "convex",
      }),
    ).resolves.toBeNull();

    await t.mutation(internal.providerConnections.disconnect, {
      organizationId,
      disconnectedByUserId: ownerId,
      providerConnectionId,
      kind: "cloudflare",
    });

    const connection = await t.run(async (ctx) => await ctx.db.get(providerConnectionId));
    const organizationConnection = await t.query(internal.providerConnections.loadForOrganization, {
      organizationId,
      userId: ownerId,
      kind: "cloudflare",
    });
    expect({ connection, organizationConnection }).toEqual({
      connection: null,
      organizationConnection: null,
    });
  });

  it("targets OAuth state to an organization and validates an existing connection", async () => {
    const { organizationId, outsiderId, ownerId, t } = await seedOrganizationMembers();
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "convex",
        auth: { method: "api_key", credential: "credential-a" },
        teamId: "team-a",
      },
    });
    const oauthStateId = await t.mutation(internal.oauthState.createOauthState, {
      provider: "convex",
      userId: ownerId,
      organizationId,
      providerConnectionId,
      state: "state-a",
      createdAt: 1,
      expiresAt: 2,
    });

    await expect(
      t.query(internal.oauthState.getOauthStateByState, {
        provider: "convex",
        state: "state-a",
      }),
    ).resolves.toMatchObject({
      _id: oauthStateId,
      organizationId,
      providerConnectionId,
    });
    await expect(
      t.mutation(internal.oauthState.createOauthState, {
        provider: "cloudflare",
        userId: ownerId,
        organizationId,
        providerConnectionId,
        state: "state-b",
        createdAt: 1,
        expiresAt: 2,
      }),
    ).rejects.toThrow("Provider connection not found.");
    await expect(
      t.mutation(internal.oauthState.createOauthState, {
        provider: "convex",
        userId: outsiderId,
        organizationId,
        state: "state-c",
        createdAt: 1,
        expiresAt: 2,
      }),
    ).rejects.toThrow("Organization membership is required.");
  });
});
