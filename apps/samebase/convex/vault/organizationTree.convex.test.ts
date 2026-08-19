import { describe, expect, it } from "vite-plus/test";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

async function seedUser(t: ReturnType<typeof makeConvexTest>, email: string) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      state: "active",
      email,
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
  });
}

async function seedOrganization(
  t: ReturnType<typeof makeConvexTest>,
  args: { owner: string; userId: Id<"users"> },
) {
  return await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: `installation-${args.owner}`,
      githubOwnerId: `owner-${args.owner}`,
      githubOwnerLogin: args.owner,
      githubOwnerLoginNormalized: args.owner.toLowerCase(),
      githubOwnerType: "organization",
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      role: "member",
      userId: args.userId,
    });
    return organizationId;
  });
}

function asUser(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

describe("vault organization tree settings", () => {
  it("keeps disclosure choices personal and updates one setting", async () => {
    const t = makeConvexTest();
    const firstUserId = await seedUser(t, "ada@example.com");
    const secondUserId = await seedUser(t, "grace@example.com");
    const organizationId = await seedOrganization(t, { owner: "samebase", userId: firstUserId });
    await t.run(async (ctx) => {
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        role: "member",
        userId: secondUserId,
      });
    });
    const firstViewer = asUser(t, firstUserId);
    const secondViewer = asUser(t, secondUserId);

    await firstViewer.mutation(api.vault.organizationTree.setVaultOrganizationCollapsed, {
      collapsed: true,
      organizationId,
    });
    await firstViewer.mutation(api.vault.organizationTree.setVaultOrganizationCollapsed, {
      collapsed: false,
      organizationId,
    });

    await expect(
      firstViewer.query(api.vault.organizationTree.getVaultOrganizationTreeSettings),
    ).resolves.toEqual([{ collapsed: false, organizationId }]);
    await expect(
      secondViewer.query(api.vault.organizationTree.getVaultOrganizationTreeSettings),
    ).resolves.toEqual([]);
    await t.run(async (ctx) => {
      const rows = [];
      for await (const row of ctx.db
        .query("ui_vaultOrganizationTree_settings")
        .withIndex("by_userId_and_organizationId", (query) =>
          query.eq("userId", firstUserId).eq("organizationId", organizationId),
        )) {
        rows.push(row);
      }
      expect(rows).toHaveLength(1);
    });
  });

  it("hides a saved choice and rejects updates after organization access is lost", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const organizationId = await seedOrganization(t, { owner: "samebase", userId });
    const viewer = asUser(t, userId);
    await viewer.mutation(api.vault.organizationTree.setVaultOrganizationCollapsed, {
      collapsed: true,
      organizationId,
    });

    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", organizationId).eq("userId", userId),
        )
        .unique();
      if (!membership) {
        throw new Error("Membership not found");
      }
      await ctx.db.delete(membership._id);
    });

    await expect(
      viewer.query(api.vault.organizationTree.getVaultOrganizationTreeSettings),
    ).resolves.toEqual([]);
    await expect(
      viewer.mutation(api.vault.organizationTree.setVaultOrganizationCollapsed, {
        collapsed: false,
        organizationId,
      }),
    ).rejects.toThrow("Organization membership is required.");
    await t.run(async (ctx) => {
      expect(
        await ctx.db
          .query("ui_vaultOrganizationTree_settings")
          .withIndex("by_userId_and_organizationId", (query) =>
            query.eq("userId", userId).eq("organizationId", organizationId),
          )
          .unique(),
      ).not.toBeNull();
    });
  });
});
