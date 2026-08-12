import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

async function seedDeletableOrganization(t: ReturnType<typeof makeConvexTest>, suffix: string) {
  const seed = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      state: "active",
      email: `owner-${suffix}@example.invalid`,
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: `organization-${suffix}`,
      githubOwnerType: "organization",
      githubOwnerLogin: `organization-${suffix}`,
      githubOwnerLoginNormalized: `organization-${suffix}`,
      githubInstallationId: `installation-${suffix}`,
    });
    const membershipId = await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: ownerId,
      role: "owner",
    });
    const billingId = await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      plan: "free",
      status: "inactive",
    });
    return { billingId, membershipId, organizationId, ownerId };
  });
  return {
    ...seed,
    asOwner: t.withIdentity({
      subject: `${seed.ownerId}|organization-owner`,
      tokenIdentifier: `test:${seed.ownerId}`,
    }),
  };
}

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
        state: "active",
        email: "pending-member@example.invalid",
        isApproved: false,
      });
      const deletingUserId = await ctx.db.insert("users", {
        state: "active",
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
        state: "deleting",
        runId,
        requestedAt: 1,
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

describe("organization deletion", () => {
  it("deletes a vault-free organization and its local organization data", async () => {
    const t = makeConvexTest();
    const seed = await seedDeletableOrganization(t, "delete");
    await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        organizationId: seed.organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
      });
      const folderId = await ctx.db.insert("ui_vaultFolders", {
        userId: seed.ownerId,
        organizationId: seed.organizationId,
        name: "Old folder",
        nameKey: "old folder",
        position: 0,
        collapsed: false,
      });
      await ctx.db.insert("ui_vaultFolderAssignments", {
        userId: seed.ownerId,
        organizationId: seed.organizationId,
        vaultId,
        folderId,
      });
      await ctx.db.insert("ui_vaultOrganizationTree_settings", {
        userId: seed.ownerId,
        organizationId: seed.organizationId,
        collapsed: true,
      });
      await ctx.db.insert("githubAppSetupStates", {
        userId: seed.ownerId,
        state: "setup-state",
        purpose: "organization_connection",
        organizationId: seed.organizationId,
        createdAt: 1,
        expiresAt: 2,
      });
      await ctx.db.insert("organizationInvitations", {
        state: "pending",
        organizationId: seed.organizationId,
        githubAccountId: "invited-account",
        githubLogin: "invited-user",
        code: "invitation-code",
        createdByUserId: seed.ownerId,
        createdAt: 1,
        expiresAt: 2,
      });
      await ctx.db.insert("organizationProviderCredentials", {
        organizationId: seed.organizationId,
        convex: {
          auth: { method: "api_key", credential: "test-credential" },
          connectedByUserId: seed.ownerId,
          updatedAt: 1,
        },
      });
      await ctx.db.insert("providerOAuthCallbackStates", {
        provider: "cloudflare",
        userId: seed.ownerId,
        organizationId: seed.organizationId,
        expectedProviderSnapshotHash: "provider-snapshot",
        state: "oauth-state",
        createdAt: 1,
        expiresAt: 2,
      });
      const deletionRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "succeeded",
        organizationId: seed.organizationId,
        userId: seed.ownerId,
        vaultId,
        repositoryFullName: "organization-delete/old-vault",
        createdAt: 1,
        updatedAt: 2,
        attempt: { kind: "initial" },
        workflow: { state: "started", workflowId: "old-vault-deletion" },
        currentStep: "finish",
        snapshot: { state: "scrubbed_after_success" },
        completedAt: 2,
      });
      await ctx.db.insert("workflow_vaultDeletion_events", {
        organizationId: seed.organizationId,
        userId: seed.ownerId,
        vaultId,
        repositoryFullName: "organization-delete/old-vault",
        runId: deletionRunId,
        step: "finish",
        level: "info",
        message: "Finished vault deletion.",
        createdAt: 2,
      });
      await ctx.db.delete(vaultId);
    });

    await expect(
      seed.asOwner.mutation(api.organizations.deleteOrganization, {
        organizationId: seed.organizationId,
        expectedGithubOwnerLogin: "organization-delete",
      }),
    ).resolves.toBeNull();

    const remaining = await t.run(async (ctx) => ({
      billing: await ctx.db.query("organizationBillingAccounts").collect(),
      deletionEvents: await ctx.db.query("workflow_vaultDeletion_events").collect(),
      deletionRuns: await ctx.db.query("workflow_vaultDeletion_runs").collect(),
      folderAssignments: await ctx.db.query("ui_vaultFolderAssignments").collect(),
      folders: await ctx.db.query("ui_vaultFolders").collect(),
      githubSetupStates: await ctx.db.query("githubAppSetupStates").collect(),
      invitations: await ctx.db.query("organizationInvitations").collect(),
      memberships: await ctx.db.query("organizationMemberships").collect(),
      organization: await ctx.db.get(seed.organizationId),
      organizationTreeSettings: await ctx.db.query("ui_vaultOrganizationTree_settings").collect(),
      owner: await ctx.db.get(seed.ownerId),
      providerCredentials: await ctx.db.query("organizationProviderCredentials").collect(),
      providerOAuthStates: await ctx.db.query("providerOAuthCallbackStates").collect(),
    }));
    expect(remaining).toEqual({
      billing: [],
      deletionEvents: [],
      deletionRuns: [],
      folderAssignments: [],
      folders: [],
      githubSetupStates: [],
      invitations: [],
      memberships: [],
      organization: null,
      organizationTreeSettings: [],
      owner: expect.objectContaining({ _id: seed.ownerId, state: "active" }),
      providerCredentials: [],
      providerOAuthStates: [],
    });
  });

  it("requires the exact GitHub owner login", async () => {
    const t = makeConvexTest();
    const seed = await seedDeletableOrganization(t, "confirmation");

    await expect(
      seed.asOwner.mutation(api.organizations.deleteOrganization, {
        organizationId: seed.organizationId,
        expectedGithubOwnerLogin: "wrong-login",
      }),
    ).rejects.toThrow("Organization confirmation does not match.");
    await expect(
      t.run(async (ctx) => await ctx.db.get(seed.organizationId)),
    ).resolves.not.toBeNull();
  });

  it("rejects an organization with another member", async () => {
    const t = makeConvexTest();
    const seed = await seedDeletableOrganization(t, "shared");
    const memberId = await t.run(async (ctx) => {
      const memberId = await ctx.db.insert("users", {
        state: "active",
        email: "shared-member@example.invalid",
        isApproved: true,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: seed.organizationId,
        userId: memberId,
        role: "member",
      });
      return memberId;
    });

    const asMember = t.withIdentity({
      subject: `${memberId}|organization-member`,
      tokenIdentifier: `test:${memberId}`,
    });
    await expect(
      asMember.mutation(api.organizations.deleteOrganization, {
        organizationId: seed.organizationId,
        expectedGithubOwnerLogin: "organization-shared",
      }),
    ).rejects.toThrow("Organization owner access is required.");

    await expect(
      seed.asOwner.mutation(api.organizations.deleteOrganization, {
        organizationId: seed.organizationId,
        expectedGithubOwnerLogin: "organization-shared",
      }),
    ).rejects.toThrow("Remove every other member before you delete this organization.");
  });

  it("rejects an organization that still has a vault", async () => {
    const t = makeConvexTest();
    const seed = await seedDeletableOrganization(t, "vault");
    await t.run(async (ctx) => {
      await ctx.db.insert("vaults", {
        state: "not_connected",
        organizationId: seed.organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
      });
    });

    await expect(
      seed.asOwner.mutation(api.organizations.deleteOrganization, {
        organizationId: seed.organizationId,
        expectedGithubOwnerLogin: "organization-vault",
      }),
    ).rejects.toThrow("Remove every Samebase vault before you delete this organization.");
  });

  it("rejects paid or pending billing", async () => {
    const t = makeConvexTest();
    const seed = await seedDeletableOrganization(t, "billing");
    await t.run(async (ctx) => {
      await ctx.db.patch(seed.billingId, {
        provider: "polar",
        plan: "pro",
        status: "active",
        polarExternalCustomerId: "polar-customer",
      });
    });

    await expect(
      seed.asOwner.mutation(api.organizations.deleteOrganization, {
        organizationId: seed.organizationId,
        expectedGithubOwnerLogin: "organization-billing",
      }),
    ).rejects.toThrow("Resolve organization billing before you delete this organization.");
  });

  it("rejects unfinished provisioning data", async () => {
    const t = makeConvexTest();
    const seed = await seedDeletableOrganization(t, "provisioning");
    await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        organizationId: seed.organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
      });
      await ctx.db.insert("workflow_vaultProvisioning_runs", {
        organizationId: seed.organizationId,
        userId: seed.ownerId,
        vaultId,
        repositoryFullName: "organization-provisioning/new-vault",
        trigger: "create",
        state: "running",
        currentStep: "create_github_repo",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.delete(vaultId);
    });

    await expect(
      seed.asOwner.mutation(api.organizations.deleteOrganization, {
        organizationId: seed.organizationId,
        expectedGithubOwnerLogin: "organization-provisioning",
      }),
    ).rejects.toThrow("Finish organization vault cleanup before deletion.");
  });
});
