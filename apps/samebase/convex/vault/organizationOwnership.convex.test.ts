import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

async function createUser(t: ConvexTest, email: string): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      email,
      isApproved: true,
    });
  });
}

async function createOrganization(
  t: ConvexTest,
  args: {
    userId: Id<"users">;
    ownerId: string;
    ownerLogin: string;
  },
): Promise<Id<"organizations">> {
  const result = await t.mutation(internal.organizations.createOrReconnectVerifiedOrganization, {
    userId: args.userId,
    githubOwnerId: args.ownerId,
    githubOwnerType: "organization",
    githubOwnerLogin: args.ownerLogin,
    githubInstallationId: `installation-${args.ownerId}`,
  });
  return result.organizationId;
}

async function createConnectedVault(
  t: ConvexTest,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    owner: string;
    name: string;
    ghRepoId: string;
  },
) {
  const ids = await t.mutation(
    internal.vault.records.createInitializingExistingRepositoryVaultForUser,
    {
      organizationId: args.organizationId,
      userId: args.userId,
      ghRepoOwner: args.owner,
      ghRepoName: args.name,
    },
  );
  await t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
    ...ids,
    userId: args.userId,
    ghRepoId: args.ghRepoId,
    ghRepoOwner: args.owner,
    ghRepoName: args.name,
    defaultBranch: "main",
    visibility: "private",
  });
  return ids;
}

describe("organization-owned vaults", () => {
  it("requires membership and the organization GitHub owner for root creation", async () => {
    const t = makeConvexTest();
    const ownerUserId = await createUser(t, "owner@example.com");
    const outsiderUserId = await createUser(t, "outsider@example.com");
    const organizationId = await createOrganization(t, {
      userId: ownerUserId,
      ownerId: "101",
      ownerLogin: "Samebase",
    });

    await expect(
      t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
        organizationId,
        userId: outsiderUserId,
        ghRepoOwner: "Samebase",
        ghRepoName: "app",
      }),
    ).rejects.toThrow("Organization membership is required.");
    await expect(
      t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
        organizationId,
        userId: ownerUserId,
        ghRepoOwner: "another-owner",
        ghRepoName: "app",
      }),
    ).rejects.toThrow("Repository owner does not match the organization GitHub owner.");

    const { vaultId } = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        organizationId,
        userId: ownerUserId,
        ghRepoOwner: " samebase ",
        ghRepoName: "app",
      },
    );
    const snapshot = await t.run(async (ctx) => {
      const vault = await ctx.db.get(vaultId);
      const preference = await ctx.db
        .query("ui_vaultResourceLinks_settings")
        .withIndex("by_user_and_vault", (query) =>
          query.eq("userId", ownerUserId).eq("vaultId", vaultId),
        )
        .unique();
      return { preference, vault };
    });

    expect(snapshot.vault).toMatchObject({
      organizationId,
      owner: "Samebase",
      name: "app",
    });
    expect(snapshot.vault).not.toHaveProperty("userId");
    expect(snapshot.preference).toMatchObject({ userId: ownerUserId, vaultId });
  });

  it("resolves global routes and lists every current membership in stable order", async () => {
    const t = makeConvexTest();
    const memberUserId = await createUser(t, "nicu@samebase.com");
    const otherMemberUserId = await createUser(t, "other-member@example.com");
    const outsiderUserId = await createUser(t, "nicuchiciuc@gmail.com");
    const zetaOrganizationId = await createOrganization(t, {
      userId: memberUserId,
      ownerId: "201",
      ownerLogin: "zeta",
    });
    const alphaOrganizationId = await createOrganization(t, {
      userId: memberUserId,
      ownerId: "202",
      ownerLogin: "alpha",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("organizationMemberships", {
        organizationId: zetaOrganizationId,
        userId: otherMemberUserId,
      });
    });
    const zetaVault = await createConnectedVault(t, {
      organizationId: zetaOrganizationId,
      userId: memberUserId,
      owner: "zeta",
      name: "app-z",
      ghRepoId: "repository-201",
    });
    const alphaVault = await createConnectedVault(t, {
      organizationId: alphaOrganizationId,
      userId: memberUserId,
      owner: "alpha",
      name: "app-a",
      ghRepoId: "repository-202",
    });

    const repositories = await t.query(internal.vault.records.listConnectedRepositoriesForUser, {
      userId: memberUserId,
    });
    expect(repositories.map((repository) => `${repository.owner}/${repository.name}`)).toEqual([
      "alpha/app-a",
      "zeta/app-z",
    ]);

    const asMember = t.withIdentity({
      subject: `${memberUserId}|test-session`,
      tokenIdentifier: `test:${memberUserId}`,
    });
    const asOtherMember = t.withIdentity({
      subject: `${otherMemberUserId}|test-session`,
      tokenIdentifier: `test:${otherMemberUserId}`,
    });
    const asOutsider = t.withIdentity({
      subject: `${outsiderUserId}|test-session`,
      tokenIdentifier: `test:${outsiderUserId}`,
    });

    await expect(
      asMember.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "alpha/app-a",
      }),
    ).resolves.toMatchObject({ _id: alphaVault.vaultId });
    await expect(
      asOutsider.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "alpha/app-a",
      }),
    ).resolves.toBeNull();
    await expect(asOtherMember.query(api.vault.dashboard.getUserVaults)).resolves.toMatchObject([
      { _id: zetaVault.vaultId, repositoryFullName: "zeta/app-z" },
    ]);

    const firstDashboardRead = await asMember.query(api.vault.dashboard.getUserVaults);
    const secondDashboardRead = await asMember.query(api.vault.dashboard.getUserVaults);
    expect(secondDashboardRead).toEqual(firstDashboardRead);
    expect(firstDashboardRead.map((vault) => vault._id).sort()).toEqual(
      [alphaVault.vaultId, zetaVault.vaultId].sort(),
    );
  });

  it("enforces stable GitHub repository identity across organizations", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "member@example.com");
    const firstOrganizationId = await createOrganization(t, {
      userId,
      ownerId: "301",
      ownerLogin: "first-owner",
    });
    const secondOrganizationId = await createOrganization(t, {
      userId,
      ownerId: "302",
      ownerLogin: "second-owner",
    });
    await createConnectedVault(t, {
      organizationId: firstOrganizationId,
      userId,
      owner: "first-owner",
      name: "first-repository",
      ghRepoId: "stable-repository-id",
    });
    const secondVault = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        organizationId: secondOrganizationId,
        userId,
        ghRepoOwner: "second-owner",
        ghRepoName: "second-repository",
      },
    );

    await expect(
      t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
        ...secondVault,
        userId,
        ghRepoId: "stable-repository-id",
        ghRepoOwner: "second-owner",
        ghRepoName: "second-repository",
        defaultBranch: "main",
        visibility: "private",
      }),
    ).rejects.toThrow("Vault already exists for this GitHub repository.");
  });

  it("stores the exact Convex and Cloudflare connection IDs in managed plans", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "owner@example.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "401",
      ownerLogin: "managed-owner",
    });
    const convexProviderConnectionId = await t.mutation(
      internal.providerConnections.createConnected,
      {
        organizationId,
        connectedByUserId: userId,
        connection: {
          kind: "convex",
          auth: { method: "api_key", credential: "convex-credential" },
          teamId: "convex-team",
        },
      },
    );
    const cloudflareProviderConnectionId = await t.mutation(
      internal.providerConnections.createConnected,
      {
        organizationId,
        connectedByUserId: userId,
        connection: {
          kind: "cloudflare",
          auth: { method: "api_key", credential: "cloudflare-credential" },
          defaultAccount: { state: "not_selected" },
        },
      },
    );

    const { vaultId } = await t.mutation(
      internal.vault.records.createInitializingSamebaseManagedVaultForUser,
      {
        organizationId,
        userId,
        ghRepoOwner: "managed-owner",
        ghRepoName: "managed-app",
        visibility: "private",
        description: null,
        convexProjectName: "managed-app",
        convexTeamId: "convex-team",
        convexProviderConnectionId,
        cloudflareAccountId: "cloudflare-account",
        cloudflareWorkerName: "managed-app",
        cloudflareProviderConnectionId,
      },
    );
    const plan = await t.run(async (ctx) => {
      return await ctx.db
        .query("workflow_vaultProvisioning_plans")
        .withIndex("by_vault", (query) => query.eq("vaultId", vaultId))
        .unique();
    });

    expect(plan).toMatchObject({
      vaultId,
      convexProviderConnectionId,
      cloudflareProviderConnectionId,
    });
    expect(plan).not.toHaveProperty("userId");
    expect(plan).not.toHaveProperty("githubProviderConnectionId");
  });
});
