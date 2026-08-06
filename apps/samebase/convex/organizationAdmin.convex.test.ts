import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("organization membership administration", () => {
  it("rejects missing, unapproved, and deleting users", async () => {
    const t = makeConvexTest();
    const organizationId = await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "membership-target-organization",
        githubOwnerType: "organization",
        githubOwnerLogin: "membership-target",
        githubOwnerLoginNormalized: "membership-target",
        githubInstallationId: "membership-target-installation",
      });
      await ctx.db.insert("users", {
        email: "pending-member@example.invalid",
        isApproved: false,
      });
      const deletingUserId = await ctx.db.insert("users", {
        email: "deleting-member@example.invalid",
        isApproved: true,
      });
      const initiatingSessionId = await ctx.db.insert("authSessions", {
        userId: deletingUserId,
        expirationTime: 2_000_000_000_000,
      });
      const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
        state: "running",
        identity: {
          state: "active",
          userId: deletingUserId,
          email: "deleting-member@example.invalid",
        },
        completionCapability: "c".repeat(64),
        currentStep: "request_accepted",
        requestedAt: 1,
        updatedAt: 1,
        initiatingSessionId,
        retryCount: 0,
        outcomes: {
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
        workflow: { state: "started", workflowId: "membership-target-deletion", attempt: 1 },
      });
      await ctx.db.patch(deletingUserId, {
        accountDeletion: { state: "deleting", runId, requestedAt: 1 },
      });
      return organizationId;
    });

    await expect(
      t.mutation(internal.organizationAdmin.addExistingUserToOrganization, {
        organizationId,
        role: "member",
        userEmail: "missing-member@example.invalid",
      }),
    ).rejects.toThrowError("User not found.");
    await expect(
      t.mutation(internal.organizationAdmin.addExistingUserToOrganization, {
        organizationId,
        role: "member",
        userEmail: "pending-member@example.invalid",
      }),
    ).rejects.toThrowError("An unapproved user cannot join an organization.");
    await expect(
      t.mutation(internal.organizationAdmin.addExistingUserToOrganization, {
        organizationId,
        role: "member",
        userEmail: "deleting-member@example.invalid",
      }),
    ).rejects.toThrowError("A deleting user cannot join an organization.");

    await expect(
      t.run(async (ctx) => await ctx.db.query("organizationMemberships").collect()),
    ).resolves.toEqual([]);
  });
});
