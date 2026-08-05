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
    });
  });
  return { ...users, organizationId, otherOrganizationId, t };
}

describe("organization provider connections", () => {
  it("keeps multiple connections of one kind and resolves selected and exact rows", async () => {
    const { memberId, organizationId, ownerId, t } = await seedOrganizationMembers();
    const firstConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "convex",
        auth: { method: "api_key", credential: "credential-a" },
        teamId: "team-a",
      },
    });
    const selectedConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: memberId,
      connection: {
        kind: "convex",
        auth: { method: "api_key", credential: "credential-b" },
        teamId: "team-b",
      },
    });

    await expect(
      t.query(internal.providerConnections.loadSelectedForOrganization, {
        organizationId,
        userId: ownerId,
        kind: "convex",
      }),
    ).resolves.toMatchObject({ _id: selectedConnectionId, teamId: "team-b" });
    await expect(
      t.query(internal.providerConnections.loadByIdForOrganization, {
        organizationId,
        userId: memberId,
        providerConnectionId: firstConnectionId,
        kind: "convex",
      }),
    ).resolves.toMatchObject({ _id: firstConnectionId, teamId: "team-a" });

    const connections = await t.run(async (ctx) => {
      return await ctx.db
        .query("providerConnections")
        .withIndex("by_organization_and_kind", (query) =>
          query.eq("organizationId", organizationId).eq("kind", "convex"),
        )
        .collect();
    });
    expect(connections).toHaveLength(2);
  });

  it("checks membership and deletes a disconnected row and its selected pointer", async () => {
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
      t.mutation(internal.providerConnections.setSelected, {
        organizationId,
        userId: outsiderId,
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
    const selectedConnection = await t.query(
      internal.providerConnections.loadSelectedForOrganization,
      {
        organizationId,
        userId: ownerId,
        kind: "cloudflare",
      },
    );
    expect({ connection, selectedConnection }).toEqual({
      connection: null,
      selectedConnection: null,
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
