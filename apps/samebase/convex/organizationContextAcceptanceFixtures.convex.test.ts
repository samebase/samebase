import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function insertPasswordAccount(email: string) {
  const t = makeConvexTest();
  const userId = await t.run(async (ctx) => {
    const insertedUserId = await ctx.db.insert("users", { email });
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
        t.mutation(internal.organizationContextAcceptanceFixtures.apply, {
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
    const fixture: (typeof internal.organizationContextAcceptanceFixtures.apply)["_args"] = {
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

    await t.mutation(internal.organizationContextAcceptanceFixtures.apply, fixture);
    await t.mutation(internal.organizationContextAcceptanceFixtures.apply, fixture);

    const snapshot = await t.run(async (ctx) => ({
      billingAccounts: await ctx.db.query("organizationBillingAccounts").collect(),
      branchTrees: await ctx.db.query("observations_vaultRepository_branchTrees").collect(),
      memberships: await ctx.db.query("organizationMemberships").collect(),
      organizations: await ctx.db.query("organizations").collect(),
      runs: await ctx.db.query("workflow_vaultProvisioning_runs").collect(),
      user: await ctx.db.get(userId),
      vaults: await ctx.db.query("vaults").collect(),
    }));

    expect(snapshot.user?.isApproved).toBe(true);
    expect(snapshot.organizations).toHaveLength(3);
    expect(snapshot.billingAccounts).toHaveLength(3);
    expect(snapshot.branchTrees).toHaveLength(2);
    expect(
      snapshot.branchTrees.every(
        (branchTree) =>
          branchTree.branch === "main" && branchTree.treeData.tree[0]?.path === "README.md",
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
    expect(snapshot.vaults).toHaveLength(2);
    expect(snapshot.vaults.every((vault) => vault.state === "connected")).toBe(true);
  });
});
