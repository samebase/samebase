import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { components, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function insertPasswordAccount(email: string) {
  const t = makeConvexTest();
  const userId = await t.run(async (ctx) => {
    const insertedUserId = await ctx.db.insert("users", { state: "active", email });
    await ctx.db.insert("authAccounts", {
      userId: insertedUserId,
      provider: "password",
      providerAccountId: email,
    });
    return insertedUserId;
  });
  return { t, userId };
}

describe("organization context acceptance fixtures", () => {
  it("fails closed outside a local worktree deployment", async () => {
    for (const deployment of ["local:test", "preview:test", "dev:test", "prod:test"]) {
      vi.stubEnv("CONVEX_AGENT_MODE", "");
      vi.stubEnv("CONVEX_DEPLOYMENT", deployment);
      const t = makeConvexTest();

      await expect(
        t.mutation(internal.devAuth.applyOrganizationContextAcceptanceFixture, {
          email: "",
          organizations: [
            {
              access: "retain",
              ownerLogin: "invalid-owner",
              repositories: [],
            },
          ],
        }),
      ).rejects.toThrowError("Organization context acceptance fixtures require a local worktree.");
      await expect(
        t.run(async (ctx) => ({
          organizations: await ctx.db.query("organizations").collect(),
          users: await ctx.db.query("users").collect(),
        })),
      ).resolves.toEqual({ organizations: [], users: [] });
    }
  });

  it("seeds repeat-safe organizations and removes only the requested membership", async () => {
    vi.stubEnv("CONVEX_AGENT_MODE", "anonymous");
    const email = "organization-context@example.com";
    const { t, userId } = await insertPasswordAccount(email);
    const fixture: (typeof internal.devAuth.applyOrganizationContextAcceptanceFixture)["_args"] = {
      email,
      organizations: [
        {
          access: "retain",
          ownerLogin: "org-context-alpha",
          repositories: [],
        },
        {
          access: "retain",
          ownerLogin: "org-context-beta",
          repositories: ["inventory-app"],
        },
        {
          access: "remove",
          ownerLogin: "org-context-gamma",
          repositories: ["private-app"],
        },
      ],
    };

    await t.mutation(internal.devAuth.applyOrganizationContextAcceptanceFixture, fixture);
    await t.mutation(internal.devAuth.applyOrganizationContextAcceptanceFixture, fixture);

    const snapshot = await t.run(async (ctx) => ({
      billingAccounts: await ctx.db.query("organizationBillingAccounts").collect(),
      memberships: await ctx.db.query("organizationMemberships").collect(),
      organizations: await ctx.db.query("organizations").collect(),
      repositories: await ctx.db.query("repositories").collect(),
      runs: await ctx.db.query("workflow_repositoryProvisioning_runs").collect(),
      user: await ctx.db.get(userId),
    }));

    const branchTrees = await Promise.all(
      snapshot.repositories.flatMap((repository) =>
        repository.state === "connected"
          ? [
              t.query(components.gitEditor.branches.get, {
                repositoryId: repository._id,
                branch: repository.defaultBranch,
              }),
            ]
          : [],
      ),
    );

    expect(snapshot.user).toMatchObject({
      isApproved: true,
      termsAcceptedAt: expect.any(Number),
      termsVersion: "2026-08-12",
    });
    expect(snapshot.organizations).toHaveLength(3);
    for (const organization of snapshot.organizations) {
      expect(organization.convexTeam).toEqual({
        teamId: `acceptance-convex-team:${organization.githubOwnerLogin}`,
      });
      expect(organization.cloudflareAccount).toEqual({
        accountId: `acceptance-cloudflare-account:${organization.githubOwnerLogin}`,
        accountName: `${organization.githubOwnerLogin} acceptance account`,
      });
    }
    expect(snapshot.billingAccounts).toHaveLength(3);
    expect(branchTrees).toHaveLength(2);
    expect(
      branchTrees.every(
        (branchTree) =>
          branchTree !== null &&
          branchTree.branch === "main" &&
          branchTree.treeData.tree[0]?.path === "README.md",
      ),
    ).toBe(true);
    expect(snapshot.memberships).toHaveLength(2);
    expect(snapshot.memberships.every((membership) => membership.userId === userId)).toBe(true);
    expect(snapshot.runs).toHaveLength(2);
    expect(
      snapshot.runs.every(
        (run) =>
          run.state === "succeeded" &&
          run.currentStep === "finish" &&
          run.completedAt !== undefined,
      ),
    ).toBe(true);
    expect(snapshot.repositories).toHaveLength(2);
    expect(snapshot.repositories.every((repository) => repository.state === "connected")).toBe(
      true,
    );
    for (const repository of snapshot.repositories) {
      if (repository.state !== "connected") {
        throw new Error("Acceptance repository must be connected.");
      }
      const organization = snapshot.organizations.find(
        (candidate) => candidate._id === repository.organizationId,
      );
      expect(repository.convexTeamId).toBe(organization?.convexTeam?.teamId);
      expect(repository.cloudflareAccountId).toBe(organization?.cloudflareAccount?.accountId);
    }
  });
});
