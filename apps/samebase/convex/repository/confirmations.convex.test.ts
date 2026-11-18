import { describe, expect, it } from "vite-plus/test";

import type { Id } from "../_generated/dataModel";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";
import { checkActionConfirmation } from "./confirmations";
import type { ActionConfirmationSurface } from "./contracts/actionConfirmation";

/** scout-owner/scout and scout-owner/admin, an owner, and a second member. */
async function createFixture() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      state: "active",
      email: "scout-owner@example.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const memberId = await ctx.db.insert("users", {
      state: "active",
      email: "scout-member@example.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "scout-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "scout-owner",
      githubOwnerLoginNormalized: "scout-owner",
      githubInstallationId: "scout-installation",
      convexTeam: { teamId: "convex-team" },
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: ownerId,
      role: "owner",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: memberId,
      role: "member",
    });
    const insertConnectedRepository = async (githubRepositoryName: string) => {
      const repositoryId = await ctx.db.insert("repositories", {
        organizationId,
        convexTeamId: "convex-team",
        deletion: { state: "not_deleting" },
        createdAt: 1,
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId,
        userId: ownerId,
        repositoryId,
        githubRepositoryFullName: `scout-owner/${githubRepositoryName}`,
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 1,
        completedAt: 1,
      });
      await ctx.db.replace(repositoryId, {
        organizationId,
        convexTeamId: "convex-team",
        deletion: { state: "not_deleting" },
        createdAt: 1,
        state: "connected",
        githubMode: "connect_existing_repository",
        runId,
        githubRepositoryDatabaseId: `github-${githubRepositoryName}`,
        githubRepositoryName,
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 1,
      });
      return repositoryId;
    };
    return {
      memberId,
      organizationId,
      ownerId,
      otherRepositoryId: await insertConnectedRepository("admin"),
      repositoryId: await insertConnectedRepository("scout"),
    };
  });

  const check = async (args: {
    repositoryId?: Id<"repositories">;
    surface?: ActionConfirmationSurface;
    confirmation?: { acknowledgement: string };
  }) =>
    await t.run(
      async (ctx) =>
        await checkActionConfirmation(ctx, {
          userId: ids.ownerId,
          repositoryId: args.repositoryId ?? ids.repositoryId,
          surface: args.surface ?? "dashboard",
          confirmation: args.confirmation,
        }),
    );
  const issue = async (repositoryId?: Id<"repositories">) => {
    const challenge = await check({ repositoryId });
    if (challenge.state !== "needs_confirmation") {
      throw new Error("Expected a confirmation request.");
    }
    return challenge;
  };

  return { check, ids, issue };
}

describe("action confirmation check", () => {
  it("returns the effect and the acknowledgement", async () => {
    const { issue } = await createFixture();

    const { acknowledgement, effect } = await issue();

    for (const name of ["scout-owner/scout", "CONVEX_ACCESS_TOKEN", "CONVEX_TEAM_ID"]) {
      expect(effect).toContain(name);
    }
    expect(acknowledgement).toMatch(/^I approve .*scout-owner\/scout\b/);
  });

  it("asks an MCP caller to state the user's approval", async () => {
    const { check, issue } = await createFixture();
    const { effect } = await issue();

    await expect(check({ surface: "mcp" })).resolves.toEqual({
      state: "needs_confirmation",
      effect,
      acknowledgement: expect.stringMatching(/user approved .*scout-owner\/scout\b/),
    });
  });

  it("confirms with the exact sentence", async () => {
    const { check, issue } = await createFixture();
    const { acknowledgement } = await issue();

    await expect(check({ confirmation: { acknowledgement } })).resolves.toEqual({
      state: "confirmed",
    });
  });

  it("rejects a wrong sentence", async () => {
    const { check, issue } = await createFixture();
    const { acknowledgement } = await issue();

    await expect(check({ confirmation: { acknowledgement: "I approve" } })).rejects.toMatchObject({
      data: expect.stringContaining(acknowledgement),
    });
  });

  it("rejects the sentence of another repository", async () => {
    const { check, ids, issue } = await createFixture();
    const { acknowledgement } = await issue(ids.otherRepositoryId);

    await expect(check({ confirmation: { acknowledgement } })).rejects.toThrow(
      "The acknowledgement does not match",
    );
  });

  it("rejects the dashboard sentence over MCP", async () => {
    const { check, issue } = await createFixture();
    const { acknowledgement } = await issue();

    await expect(check({ surface: "mcp", confirmation: { acknowledgement } })).rejects.toThrow(
      "The acknowledgement does not match",
    );
  });
});
