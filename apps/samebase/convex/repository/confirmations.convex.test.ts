import { describe, expect, it } from "vite-plus/test";

import type { Id } from "../_generated/dataModel";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";
import { checkActionConfirmation } from "./confirmations";
import type { ActionConfirmationSurface } from "./contracts/actionConfirmation";

const retryEffect =
  "Samebase starts a new setup run for scout-owner/scout. It writes the credential of the organization's Convex connection into the repository's GitHub Actions secret CONVEX_ACCESS_TOKEN and the Convex team id into its variable CONVEX_TEAM_ID, replacing their values. If the starter is not seeded yet, it seeds the starter, which starts a deployment in the repository's GitHub Actions. Then it syncs the default branch tree.";
const retryApproval =
  "a new setup run for scout-owner/scout, which replaces its GitHub Actions secret and variable with the organization's Convex connection credential and team id";

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
    const { check } = await createFixture();

    await expect(check({})).resolves.toEqual({
      state: "needs_confirmation",
      effect: retryEffect,
      acknowledgement: `I approve ${retryApproval}`,
    });
  });

  it("describes the retry of the GitHub Actions setup", async () => {
    const { issue } = await createFixture();

    const repositoryActions = await issue();

    const repositoryActionsText = `${repositoryActions.effect} ${repositoryActions.acknowledgement}`;
    for (const samebaseOnly of [
      "Workers Builds",
      "deploy key",
      "Convex and Cloudflare resources",
    ]) {
      expect(repositoryActionsText).not.toContain(samebaseOnly);
    }
  });

  it("asks an MCP caller to state the user's approval", async () => {
    const { check } = await createFixture();

    await expect(check({ surface: "mcp" })).resolves.toMatchObject({
      state: "needs_confirmation",
      effect: retryEffect,
      acknowledgement: `I confirm that the user approved ${retryApproval}`,
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
    const { check } = await createFixture();

    await expect(check({ confirmation: { acknowledgement: "I approve" } })).rejects.toMatchObject({
      data: `The acknowledgement does not match, so nothing changed. Send exactly: I approve ${retryApproval}`,
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
