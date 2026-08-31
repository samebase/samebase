import { describe, expect, it } from "vite-plus/test";

import { api } from "./_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "./test.setup";

async function createRegionDefaultFixture() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const ownerUserId = await ctx.db.insert("users", {
      state: "active",
      email: "region-owner@example.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const memberUserId = await ctx.db.insert("users", {
      state: "active",
      email: "region-member@example.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "region-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "region-owner",
      githubOwnerLoginNormalized: "region-owner",
      githubInstallationId: "region-installation",
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: ownerUserId,
      role: "owner",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: memberUserId,
      role: "member",
    });
    return { memberUserId, organizationId, ownerUserId };
  });

  return {
    ...ids,
    t,
    asMember: t.withIdentity({
      subject: `${ids.memberUserId}|test-session`,
      tokenIdentifier: `test:${ids.memberUserId}`,
    }),
    asOwner: t.withIdentity({
      subject: `${ids.ownerUserId}|test-session`,
      tokenIdentifier: `test:${ids.ownerUserId}`,
    }),
  };
}

describe("organization Convex deployment region defaults", () => {
  it("uses US when no value is saved and lets only an owner change the default", async () => {
    const { asMember, asOwner, organizationId, t } = await createRegionDefaultFixture();

    await expect(
      asMember.query(api.convexDeploymentRegions.getDefault, { organizationId }),
    ).resolves.toBe("aws-us-east-1");
    await expect(
      t.run(
        async (ctx) => (await ctx.db.get(organizationId))?.defaultConvexDeploymentRegion ?? null,
      ),
    ).resolves.toBeNull();

    await expect(
      asOwner.mutation(api.convexDeploymentRegions.setDefault, {
        organizationId,
        deploymentRegion: "aws-eu-west-1",
      }),
    ).resolves.toBeNull();
    await expect(
      asMember.query(api.convexDeploymentRegions.getDefault, { organizationId }),
    ).resolves.toBe("aws-eu-west-1");

    await expect(
      asMember.mutation(api.convexDeploymentRegions.setDefault, {
        organizationId,
        deploymentRegion: "aws-us-east-1",
      }),
    ).rejects.toThrow("Organization owner access is required.");
  });
});
