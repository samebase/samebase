import { describe, expect, it } from "vite-plus/test";

import {
  hasPhaseOneUserOwnership,
  hasPhaseOneVaultChildOwnership,
  readPhaseOneOwnershipContext,
} from "./phaseOneOwnership";
import { makeConvexTest } from "./test.setup";

describe("Phase 1 ownership consistency", () => {
  it("keeps legacy ownership and rejects organization or user conflicts", async () => {
    const t = makeConvexTest();
    const result = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { email: "owner@example.com" });
      const otherUserId = await ctx.db.insert("users", { email: "other@example.com" });
      const organizationId = await ctx.db.insert("organizations", {});
      const otherOrganizationId = await ctx.db.insert("organizations", {});

      const legacyOwnership = await readPhaseOneOwnershipContext(ctx.db, ownerId);
      const legacyFallback = hasPhaseOneUserOwnership(legacyOwnership, { userId: ownerId });
      const preparedWithoutMembership = hasPhaseOneUserOwnership(legacyOwnership, {
        userId: ownerId,
        organizationId,
      });

      await ctx.db.insert("organizationMemberships", { organizationId, userId: ownerId });
      await ctx.db.insert("organizationMemberships", { organizationId, userId: otherUserId });
      const ownership = await readPhaseOneOwnershipContext(ctx.db, ownerId);

      return {
        legacyFallback,
        legacyAfterMembership: hasPhaseOneUserOwnership(ownership, { userId: ownerId }),
        matchingOrganization: hasPhaseOneUserOwnership(ownership, {
          userId: ownerId,
          organizationId,
        }),
        mismatchedOrganization: hasPhaseOneUserOwnership(ownership, {
          userId: ownerId,
          organizationId: otherOrganizationId,
        }),
        sameOrganizationDifferentUser: hasPhaseOneUserOwnership(ownership, {
          userId: otherUserId,
          organizationId,
        }),
        preparedWithoutMembership,
      };
    });

    expect(result).toEqual({
      legacyFallback: true,
      legacyAfterMembership: true,
      matchingOrganization: true,
      mismatchedOrganization: false,
      sameOrganizationDifferentUser: false,
      preparedWithoutMembership: false,
    });
  });

  it("derives child access from the vault and treats child keys as consistency data", async () => {
    const t = makeConvexTest();
    const result = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "owner@example.com" });
      const organizationId = await ctx.db.insert("organizations", {});
      const otherOrganizationId = await ctx.db.insert("organizations", {});
      await ctx.db.insert("organizationMemberships", { organizationId, userId });
      const ownership = await readPhaseOneOwnershipContext(ctx.db, userId);
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        organizationId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const vault = await ctx.db.get(vaultId);
      if (!vault) {
        throw new Error("Expected the vault fixture.");
      }

      return {
        legacyChild: hasPhaseOneVaultChildOwnership(ownership, vault, {
          userId,
          vaultId,
        }),
        matchingChild: hasPhaseOneVaultChildOwnership(ownership, vault, {
          userId,
          organizationId,
          vaultId,
        }),
        mismatchedOrganization: hasPhaseOneVaultChildOwnership(ownership, vault, {
          userId,
          organizationId: otherOrganizationId,
          vaultId,
        }),
      };
    });

    expect(result).toEqual({
      legacyChild: true,
      matchingChild: true,
      mismatchedOrganization: false,
    });
  });
});
