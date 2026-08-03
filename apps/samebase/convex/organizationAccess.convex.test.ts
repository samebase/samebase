import { describe, expect, it } from "vite-plus/test";

import {
  findOrganizationAccessContext,
  hasOrganizationAccess,
  hasVaultChildOrganizationAccess,
  requireOrganizationAccessContext,
} from "./organizationAccess";
import { makeConvexTest } from "./test.setup";

describe("organization access", () => {
  it("requires membership and grants access to every member of the resource organization", async () => {
    const t = makeConvexTest();
    const result = await t.run(async (ctx) => {
      const originalOwnerId = await ctx.db.insert("users", { email: "owner@example.com" });
      const memberId = await ctx.db.insert("users", { email: "member@example.com" });
      const organizationId = await ctx.db.insert("organizations", {});
      const otherOrganizationId = await ctx.db.insert("organizations", {});
      await ctx.db.insert("organizationMemberships", { organizationId, userId: originalOwnerId });
      await ctx.db.insert("organizationMemberships", { organizationId, userId: memberId });

      const memberAccess = await requireOrganizationAccessContext(ctx.db, memberId);

      return {
        sameOrganization: hasOrganizationAccess(memberAccess, {
          organizationId,
        }),
        otherOrganization: hasOrganizationAccess(memberAccess, {
          organizationId: otherOrganizationId,
        }),
      };
    });

    expect(result).toEqual({
      sameOrganization: true,
      otherOrganization: false,
    });

    const userWithoutMembershipId = await t.run(
      async (ctx) => await ctx.db.insert("users", { email: "no-membership@example.com" }),
    );
    await expect(
      t.run(async (ctx) => requireOrganizationAccessContext(ctx.db, userWithoutMembershipId)),
    ).rejects.toThrow("Organization membership is required.");
    await expect(
      t.run(async (ctx) => findOrganizationAccessContext(ctx.db, userWithoutMembershipId)),
    ).resolves.toBeNull();
  });

  it("requires the vault and child to have the same organization", async () => {
    const t = makeConvexTest();
    const result = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "member@example.com" });
      const organizationId = await ctx.db.insert("organizations", {});
      const otherOrganizationId = await ctx.db.insert("organizations", {});
      await ctx.db.insert("organizationMemberships", { organizationId, userId });
      const access = await requireOrganizationAccessContext(ctx.db, userId);
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const vault = await ctx.db.get(vaultId);
      if (!vault) {
        throw new Error("Expected the vault fixture.");
      }

      return {
        matching: hasVaultChildOrganizationAccess(access, vault, {
          organizationId,
          vaultId,
        }),
        otherOrganization: hasVaultChildOrganizationAccess(access, vault, {
          organizationId: otherOrganizationId,
          vaultId,
        }),
      };
    });

    expect(result).toEqual({
      matching: true,
      otherOrganization: false,
    });
  });
});
