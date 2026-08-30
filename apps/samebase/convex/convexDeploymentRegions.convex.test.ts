import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const providerMocks = vi.hoisted(() => ({
  listConvexManagementDeploymentRegions: vi.fn(),
  requireAvailableConvexDeploymentRegion: vi.fn(),
}));

vi.mock("./convexManagementApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./convexManagementApi/client")>();
  return {
    ...actual,
    listConvexManagementDeploymentRegions: providerMocks.listConvexManagementDeploymentRegions,
    requireAvailableConvexDeploymentRegion: providerMocks.requireAvailableConvexDeploymentRegion,
  };
});

import { api } from "./_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "./test.setup";

async function createRegionDefaultFixture(initialRegion?: "aws-us-east-1") {
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
      convexTeam: {
        teamId: "convex-team",
        teamSlug: "convex-team",
        ...(initialRegion ? { defaultDeploymentRegion: initialRegion } : {}),
      },
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
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      convex: {
        auth: { method: "api_key", credential: "convex-token" },
        connectedByUserId: ownerUserId,
        updatedAt: 1,
      },
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

beforeEach(() => {
  providerMocks.listConvexManagementDeploymentRegions.mockReset();
  providerMocks.requireAvailableConvexDeploymentRegion.mockReset();
  providerMocks.requireAvailableConvexDeploymentRegion.mockResolvedValue(undefined);
});

describe("organization Convex deployment region defaults", () => {
  it("lets an owner save and clear a default while a member can only read it", async () => {
    const { asMember, asOwner, organizationId, t } = await createRegionDefaultFixture();

    await expect(
      asOwner.action(api.convexDeploymentRegions.setDefault, {
        organizationId,
        deploymentRegion: "aws-eu-west-1",
      }),
    ).resolves.toBeNull();
    expect(providerMocks.requireAvailableConvexDeploymentRegion).toHaveBeenCalledWith({
      token: "convex-token",
      teamId: "convex-team",
      region: "aws-eu-west-1",
    });
    await expect(
      asMember.query(api.convexDeploymentRegions.getDefault, { organizationId }),
    ).resolves.toBe("aws-eu-west-1");

    await expect(
      asMember.action(api.convexDeploymentRegions.setDefault, {
        organizationId,
        deploymentRegion: "aws-us-east-1",
      }),
    ).rejects.toThrow("Organization owner access is required.");
    await expect(
      asOwner.query(api.convexDeploymentRegions.getDefault, { organizationId }),
    ).resolves.toBe("aws-eu-west-1");

    await expect(
      asOwner.action(api.convexDeploymentRegions.setDefault, {
        organizationId,
        deploymentRegion: null,
      }),
    ).resolves.toBeNull();
    await expect(
      asMember.query(api.convexDeploymentRegions.getDefault, { organizationId }),
    ).resolves.toBeNull();
    await expect(
      t.run(async (ctx) => (await ctx.db.get(organizationId))?.convexTeam),
    ).resolves.toEqual({
      teamId: "convex-team",
      teamSlug: "convex-team",
    });
  });

  it("keeps the saved default when Convex reports the new region as unavailable", async () => {
    const { asOwner, organizationId } = await createRegionDefaultFixture("aws-us-east-1");
    providerMocks.requireAvailableConvexDeploymentRegion.mockRejectedValueOnce(
      new Error(
        "Convex production region EU West (Ireland) is not available for this team. Choose another region.",
      ),
    );

    await expect(
      asOwner.action(api.convexDeploymentRegions.setDefault, {
        organizationId,
        deploymentRegion: "aws-eu-west-1",
      }),
    ).rejects.toThrow("EU West (Ireland) is not available for this team");
    await expect(
      asOwner.query(api.convexDeploymentRegions.getDefault, { organizationId }),
    ).resolves.toBe("aws-us-east-1");
  });

  it("lists the saved default and provider region availability only for organization members", async () => {
    const { asMember, organizationId, t } = await createRegionDefaultFixture("aws-us-east-1");
    const otherOrganizationId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("organizations", {
        githubOwnerId: "other-region-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "other-region-owner",
        githubOwnerLoginNormalized: "other-region-owner",
        githubInstallationId: "other-region-installation",
        convexTeam: { teamId: "other-convex-team" },
      });
      await insertTestOrganizationBillingAccount(ctx.db, id);
      return id;
    });
    providerMocks.listConvexManagementDeploymentRegions.mockResolvedValue([
      { name: "aws-us-east-1", displayName: "US East (N. Virginia)", available: true },
      { name: "aws-eu-west-1", displayName: "EU West (Ireland)", available: false },
    ]);

    await expect(
      asMember.action(api.convexDeploymentRegions.list, { organizationId }),
    ).resolves.toEqual({
      defaultRegion: "aws-us-east-1",
      regions: [
        { name: "aws-us-east-1", displayName: "US East (N. Virginia)", available: true },
        { name: "aws-eu-west-1", displayName: "EU West (Ireland)", available: false },
      ],
    });
    expect(providerMocks.listConvexManagementDeploymentRegions).toHaveBeenCalledWith({
      token: "convex-token",
      teamId: "convex-team",
    });

    await expect(
      asMember.action(api.convexDeploymentRegions.list, {
        organizationId: otherOrganizationId,
      }),
    ).rejects.toThrow("Organization membership is required.");
    expect(providerMocks.listConvexManagementDeploymentRegions).toHaveBeenCalledOnce();
  });
});
