import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

async function seedOrganizationMembers() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email: "owner@example.com" });
    const memberId = await ctx.db.insert("users", { email: "member@example.com" });
    const outsiderId = await ctx.db.insert("users", { email: "outsider@example.com" });
    const organizationId = await ctx.db.insert("organizations", { name: "Primary organization" });
    const otherOrganizationId = await ctx.db.insert("organizations", {
      name: "Other organization",
    });
    await ctx.db.insert("organizationMemberships", { organizationId, userId: ownerId });
    await ctx.db.insert("organizationMemberships", { organizationId, userId: memberId });
    await ctx.db.insert("organizationMemberships", {
      organizationId: otherOrganizationId,
      userId: outsiderId,
    });
    return { memberId, organizationId, outsiderId, ownerId };
  });
  return { ...ids, t };
}

describe("organization provider connections", () => {
  it("selects one default while exact resource bindings keep using another live row", async () => {
    const { memberId, organizationId, ownerId, t } = await seedOrganizationMembers();
    const firstConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "github",
        auth: { method: "api_key", credential: "first-token" },
        accountId: "101",
        username: "first",
      },
    });
    const selectedConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: memberId,
      connection: {
        kind: "github",
        auth: { method: "api_key", credential: "selected-token" },
        accountId: "202",
        username: "selected",
      },
    });

    await expect(
      t.query(internal.providerConnections.loadCurrentConnectedForOrganization, {
        organizationId,
        kind: "github",
      }),
    ).resolves.toMatchObject({ _id: selectedConnectionId, accountId: "202" });
    await expect(
      t.query(internal.providerConnections.loadConnectedByIdForOrganization, {
        organizationId,
        providerConnectionId: firstConnectionId,
        kind: "github",
      }),
    ).resolves.toMatchObject({ _id: firstConnectionId, accountId: "101" });
  });

  it("keeps a disconnected row selected so reconnect preserves its stable ID", async () => {
    const { organizationId, outsiderId, ownerId, t } = await seedOrganizationMembers();
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "convex",
        auth: { method: "api_key", credential: "convex-token" },
        teamId: "team-1",
      },
    });

    await t.mutation(internal.providerConnections.disconnect, {
      organizationId,
      disconnectedByUserId: ownerId,
      providerConnectionId,
      kind: "convex",
    });
    await expect(
      t.query(internal.providerConnections.loadCurrentConnectedForOrganization, {
        organizationId,
        kind: "convex",
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.providerConnections.loadDefaultForOrganization, {
        organizationId,
        kind: "convex",
      }),
    ).resolves.toMatchObject({ _id: providerConnectionId, state: "disconnected" });

    await expect(
      t.mutation(internal.providerConnections.reauthorizeConnected, {
        organizationId,
        connectedByUserId: outsiderId,
        providerConnectionId,
        connection: {
          kind: "convex",
          auth: { method: "api_key", credential: "other-token" },
          teamId: "team-1",
        },
      }),
    ).rejects.toThrow("Organization membership is required.");

    await expect(
      t.mutation(internal.providerConnections.reauthorizeConnected, {
        organizationId,
        connectedByUserId: ownerId,
        providerConnectionId,
        connection: {
          kind: "convex",
          auth: { method: "api_key", credential: "new-token" },
          teamId: "team-1",
        },
      }),
    ).resolves.toBe(providerConnectionId);
  });
});
