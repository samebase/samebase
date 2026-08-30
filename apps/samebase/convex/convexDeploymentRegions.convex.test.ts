import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const providerMocks = vi.hoisted(() => ({
  listConvexManagementDeploymentRegions: vi.fn(),
}));

vi.mock("./convexManagementApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./convexManagementApi/client")>();
  return {
    ...actual,
    listConvexManagementDeploymentRegions: providerMocks.listConvexManagementDeploymentRegions,
  };
});

import { api } from "./_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "./test.setup";

async function createRegionDefaultFixture({
  connected = true,
  initialRegion,
}: {
  connected?: boolean;
  initialRegion?: "aws-us-east-1";
} = {}) {
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
      ...(initialRegion ? { defaultConvexDeploymentRegion: initialRegion } : {}),
      ...(connected ? { convexTeam: { teamId: "convex-team", teamSlug: "convex-team" } } : {}),
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
    if (connected) {
      await ctx.db.insert("organizationProviderCredentials", {
        organizationId,
        convex: {
          auth: { method: "api_key", credential: "convex-token" },
          connectedByUserId: ownerUserId,
          updatedAt: 1,
        },
      });
    }
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
});

describe("organization Convex deployment region defaults", () => {
  it("uses US when no value is saved and lets only an owner change the default", async () => {
    const { asMember, asOwner, organizationId, t } = await createRegionDefaultFixture({
      connected: false,
    });

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
    await expect(
      asOwner.query(api.convexDeploymentRegions.getDefault, { organizationId }),
    ).resolves.toBe("aws-eu-west-1");

    await expect(
      asOwner.mutation(api.convexDeploymentRegions.setDefault, {
        organizationId,
        deploymentRegion: "aws-us-east-1",
      }),
    ).resolves.toBeNull();
    await expect(
      asMember.query(api.convexDeploymentRegions.getDefault, { organizationId }),
    ).resolves.toBe("aws-us-east-1");
    await expect(
      t.run(async (ctx) => (await ctx.db.get(organizationId))?.defaultConvexDeploymentRegion),
    ).resolves.toBe("aws-us-east-1");
    expect(providerMocks.listConvexManagementDeploymentRegions).not.toHaveBeenCalled();
  });

  it("lists the effective US default and provider availability only for organization members", async () => {
    const { asMember, organizationId, t } = await createRegionDefaultFixture();
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
