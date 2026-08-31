import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "./test.setup";
import { resolveUserReferencePresentation } from "./userLifecycle";

type TestBackend = ReturnType<typeof makeConvexTest>;
type LifecycleState = "active" | "deleting" | "deleted";

async function insertDeletionRun(
  ctx: MutationCtx,
  args: { email: string; userId: Id<"users"> },
): Promise<Id<"workflow_accountDeletion_runs">> {
  const initiatingSessionId = await ctx.db.insert("authSessions", {
    userId: args.userId,
    expirationTime: Date.now() + 60_000,
  });
  return await ctx.db.insert("workflow_accountDeletion_runs", {
    state: "running",
    identity: { state: "active", userId: args.userId, email: args.email },
    completionCapability: "a".repeat(64),
    currentStep: "request_accepted",
    requestedAt: 1,
    updatedAt: 1,
    initiatingSessionId,
    retryCount: 0,
    outcomes: {
      providerRevocation: { state: "not_started" },
      completionEmail: { state: "not_started" },
    },
    workflow: { state: "started", workflowId: `lifecycle-${args.userId}`, attempt: 1 },
  });
}

async function seedLifecycleUser(args: {
  email: string;
  isApproved: boolean;
  state: LifecycleState;
  termsAccepted?: boolean;
}): Promise<{ t: TestBackend; userId: Id<"users"> }> {
  const t = makeConvexTest();
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: args.email,
      isApproved: args.isApproved,
      ...(args.termsAccepted === false ? {} : { termsVersion: "2026-08-12", termsAcceptedAt: 1 }),
    });
    switch (args.state) {
      case "active":
        return userId;
      case "deleting": {
        const runId = await insertDeletionRun(ctx, { userId, email: args.email });
        await ctx.db.replace(userId, {
          state: args.state,
          email: args.email,
          isApproved: args.isApproved,
          ...(args.termsAccepted === false
            ? {}
            : { termsVersion: "2026-08-12", termsAcceptedAt: 1 }),
          runId,
          requestedAt: 1,
        });
        return userId;
      }
      case "deleted":
        await ctx.db.replace(userId, { state: "deleted", deletedAt: 2 });
        return userId;
      default:
        args.state satisfies never;
        throw new Error("Test user lifecycle is invalid.");
    }
  });
  return { t, userId };
}

function asUser(t: TestBackend, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|stale-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

async function insertOrganizationVaultForUser(
  t: TestBackend,
  userId: Id<"users">,
): Promise<{ organizationId: Id<"organizations">; vaultId: Id<"vaults"> }> {
  return await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: `owner-${userId}`,
      githubOwnerType: "organization",
      githubOwnerLogin: `owner-${userId}`,
      githubOwnerLoginNormalized: `owner-${userId}`,
      githubInstallationId: `installation-${userId}`,
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId,
      role: "member",
    });
    const vaultId = await ctx.db.insert("vaults", {
      state: "not_connected",
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
    });
    return { organizationId, vaultId };
  });
}

async function insertProviderConfiguration(
  t: TestBackend,
  args: { organizationId: Id<"organizations">; userId: Id<"users"> },
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.patch(args.organizationId, {
      convexTeam: { teamId: "convex-team", teamSlug: "convex-team" },
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
      },
    });
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId: args.organizationId,
      convex: {
        auth: { method: "api_key", credential: "convex-test-credential" },
        connectedByUserId: args.userId,
        updatedAt: 1,
      },
      cloudflare: {
        auth: { method: "api_key", credential: "cloudflare-test-credential" },
        connectedByUserId: args.userId,
        updatedAt: 1,
      },
    });
  });
}

describe("user lifecycle authorization", () => {
  it("maps only active users to normal account roles", async () => {
    const cases = [
      {
        state: "active" as const,
        email: "nicu@samebase.com",
        isApproved: false,
        role: "role_staff",
      },
      {
        state: "active" as const,
        email: "nicu@samebase.com",
        isApproved: false,
        termsAccepted: false,
        role: "role_terms_pending",
      },
      {
        state: "active" as const,
        email: "member@example.test",
        isApproved: true,
        role: "role_member",
      },
      {
        state: "active" as const,
        email: "terms@example.test",
        isApproved: true,
        termsAccepted: false,
        role: "role_terms_pending",
      },
      {
        state: "active" as const,
        email: "pending@example.test",
        isApproved: false,
        role: "role_pending_access",
      },
      {
        state: "deleting" as const,
        email: "nicu@samebase.com",
        isApproved: true,
        role: "role_deleting",
      },
    ];

    for (const testCase of cases) {
      const { t, userId } = await seedLifecycleUser({
        state: testCase.state,
        email: testCase.email,
        isApproved: testCase.isApproved,
        termsAccepted: testCase.termsAccepted,
      });
      await expect(
        asUser(t, userId).query(api.users.currentViewerAccess, {}),
      ).resolves.toMatchObject({
        role: testCase.role,
        termsAccepted: testCase.termsAccepted !== false,
      });
    }
  });

  it("blocks member operations until an approved user accepts the Terms", async () => {
    const { t, userId } = await seedLifecycleUser({
      state: "active",
      email: "terms-boundary@example.test",
      isApproved: true,
      termsAccepted: false,
    });
    const { organizationId, vaultId } = await insertOrganizationVaultForUser(t, userId);
    await insertProviderConfiguration(t, { organizationId, userId });
    const sessionId = await t.run(async (ctx) => {
      return await ctx.db.insert("authSessions", {
        userId,
        expirationTime: Date.now() + 60_000,
      });
    });
    const viewer = t.withIdentity({
      subject: `${userId}|${sessionId}`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(viewer.query(api.users.currentViewerAccess, {})).resolves.toEqual({
      role: "role_terms_pending",
      accessKeys: ["access_public", "access_account_deletion", "access_account_settings"],
      termsAccepted: false,
    });
    await expect(viewer.query(api.users.getUserSettings, {})).rejects.toThrow("Access denied");
    await expect(viewer.query(api.accountDeletion.index.status, {})).resolves.toBeNull();
    await expect(
      viewer.mutation(api.accountDeletion.index.request, {
        completionCapability: "a".repeat(64),
        deletionConfirmationText: "keep my account",
      }),
    ).resolves.toEqual({ state: "confirmation_mismatch" });

    await expect(viewer.query(api.organizations.listForViewer, {})).rejects.toThrow(
      "Access denied",
    );
    await expect(
      viewer.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).rejects.toThrow("Access denied");
    await expect(
      viewer.query(api.vault.organizationTree.getVaultOrganizationTreeSettings, {}),
    ).rejects.toThrow("Access denied");
    await expect(
      viewer.query(api.billingResourceQuotas.getViewerBillingResourceUsage, { organizationId }),
    ).rejects.toThrow("Access denied");
    await expect(
      viewer.query(api.mcp.grants.listCurrentUserGrants, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow("Access denied");
    await expect(viewer.query(api.appProvisioningEvents.listForVault, { vaultId })).rejects.toThrow(
      "Access denied",
    );

    await expect(
      viewer.mutation(api.users.acceptCurrentTerms, {
        termsAccepted: true,
        productUpdateEmailConsent: "denied",
      }),
    ).resolves.toBeNull();

    await expect(viewer.query(api.users.currentViewerAccess, {})).resolves.toMatchObject({
      role: "role_member",
      termsAccepted: true,
    });
    await expect(viewer.query(api.organizations.listForViewer, {})).resolves.toHaveLength(1);
    await expect(
      viewer.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).resolves.toMatchObject({ state: "connected" });
    await expect(
      viewer.query(api.vault.organizationTree.getVaultOrganizationTreeSettings, {}),
    ).resolves.toEqual([]);
    await expect(
      viewer.query(api.billingResourceQuotas.getViewerBillingResourceUsage, { organizationId }),
    ).resolves.toHaveProperty("connections");
    await expect(
      viewer.query(api.mcp.grants.listCurrentUserGrants, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toMatchObject({ page: [] });
    await expect(
      viewer.query(api.appProvisioningEvents.listForVault, { vaultId }),
    ).resolves.toEqual([]);
  });

  it("stores current session recording consent after approval and Terms acceptance", async () => {
    const { t, userId } = await seedLifecycleUser({
      state: "active",
      email: "session-recording-consent@example.test",
      isApproved: false,
      termsAccepted: false,
    });
    const viewer = asUser(t, userId);

    await expect(viewer.query(api.users.getSessionRecordingConsent, {})).rejects.toThrow(
      "Access denied",
    );
    await expect(
      viewer.mutation(api.users.setSessionRecordingConsent, { decision: "granted" }),
    ).rejects.toThrow("Access denied");

    await t.run(async (ctx) => {
      await ctx.db.patch("users", userId, { isApproved: true });
    });
    await expect(viewer.query(api.users.getSessionRecordingConsent, {})).rejects.toThrow(
      "Access denied",
    );
    await viewer.mutation(api.users.acceptCurrentTerms, {
      termsAccepted: true,
      productUpdateEmailConsent: "denied",
    });
    await expect(viewer.query(api.users.getSessionRecordingConsent, {})).resolves.toEqual({
      state: "not_decided",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch("users", userId, {
        sessionRecordingConsent: {
          decision: "granted",
          policyVersion: "old-policy",
          decidedAt: 1,
        },
      });
    });
    await expect(viewer.query(api.users.getSessionRecordingConsent, {})).resolves.toEqual({
      state: "not_decided",
    });

    await viewer.mutation(api.users.setSessionRecordingConsent, { decision: "granted" });
    await expect(viewer.query(api.users.getSessionRecordingConsent, {})).resolves.toEqual({
      state: "granted",
    });
    await expect(
      t.run(async (ctx) => {
        const user = await ctx.db.get(userId);
        return user?.state === "deleted" ? undefined : user?.sessionRecordingConsent;
      }),
    ).resolves.toEqual({
      decision: "granted",
      policyVersion: "2026-08-20",
      decidedAt: expect.any(Number),
    });

    await viewer.mutation(api.users.setSessionRecordingConsent, { decision: "denied" });
    await expect(viewer.query(api.users.getSessionRecordingConsent, {})).resolves.toEqual({
      state: "denied",
    });
  });

  it("stores product-update email consent during Terms acceptance and in Account settings", async () => {
    const { t, userId } = await seedLifecycleUser({
      state: "active",
      email: "product-updates@example.test",
      isApproved: true,
      termsAccepted: false,
    });
    const viewer = asUser(t, userId);

    await viewer.mutation(api.users.acceptCurrentTerms, {
      termsAccepted: true,
      productUpdateEmailConsent: "granted",
    });
    await expect(viewer.query(api.users.getProductUpdateEmailConsent, {})).resolves.toEqual({
      state: "granted",
    });
    await expect(
      t.run(async (ctx) => {
        const user = await ctx.db.get(userId);
        return user?.state === "deleted" ? undefined : user?.productUpdateEmailConsent;
      }),
    ).resolves.toEqual({
      decision: "granted",
      email: "product-updates@example.test",
      policyVersion: "2026-08-30",
      decidedAt: expect.any(Number),
      source: "terms_acceptance",
    });

    await viewer.mutation(api.users.setProductUpdateEmailConsent, {
      decision: "denied",
      source: "account_settings",
    });
    await expect(viewer.query(api.users.getProductUpdateEmailConsent, {})).resolves.toEqual({
      state: "denied",
    });
    await expect(
      t.run(async (ctx) => {
        const user = await ctx.db.get(userId);
        return user?.state === "deleted" ? undefined : user?.productUpdateEmailConsent;
      }),
    ).resolves.toMatchObject({
      decision: "denied",
      source: "account_settings",
    });

    await viewer.mutation(api.users.setProductUpdateEmailConsent, {
      decision: "granted",
      source: "right_sidebar",
    });
    await expect(
      t.run(async (ctx) => {
        const user = await ctx.db.get(userId);
        return user?.state === "deleted" ? undefined : user?.productUpdateEmailConsent;
      }),
    ).resolves.toMatchObject({
      decision: "granted",
      source: "right_sidebar",
    });
  });

  it("keeps existing accounts unsubscribed until they choose product-update emails", async () => {
    const { t, userId } = await seedLifecycleUser({
      state: "active",
      email: "existing-account@example.test",
      isApproved: true,
      termsAccepted: true,
    });
    const viewer = asUser(t, userId);

    await expect(viewer.query(api.users.getProductUpdateEmailConsent, {})).resolves.toEqual({
      state: "not_decided",
    });
    await expect(
      t.run(async (ctx) => {
        const user = await ctx.db.get(userId);
        return user?.state !== "deleted" && user?.productUpdateEmailConsent === undefined;
      }),
    ).resolves.toBe(true);
  });

  it("rejects stale authenticated identities for deleted and missing users", async () => {
    const deleted = await seedLifecycleUser({
      state: "deleted",
      email: "deleted@example.test",
      isApproved: true,
    });
    await expect(
      asUser(deleted.t, deleted.userId).query(api.users.currentViewerAccess, {}),
    ).rejects.toMatchObject({ data: "authenticated-account-deleted" });

    const missing = await seedLifecycleUser({
      state: "active",
      email: "missing@example.test",
      isApproved: true,
    });
    await missing.t.run(async (ctx) => await ctx.db.delete(missing.userId));
    await expect(
      asUser(missing.t, missing.userId).query(api.users.currentViewerAccess, {}),
    ).rejects.toMatchObject({ data: "authenticated-account-reference-invalid" });
  });

  it("requires an active user at delayed vault and provider boundaries", async () => {
    const states = ["active", "deleting", "deleted"] as const;
    for (const state of states) {
      const { t, userId } = await seedLifecycleUser({
        state,
        email: `${state}-delayed-work@example.test`,
        isApproved: true,
      });
      const { organizationId, vaultId } = await insertOrganizationVaultForUser(t, userId);
      await insertProviderConfiguration(t, { organizationId, userId });
      const vaultRead = t.query(internal.vault.records.getByIdForUser, {
        userId,
        vaultId,
      });
      const githubRead = t.query(internal.githubAppAccess.loadInstallationAccess, {
        userId,
        target: { kind: "vault", vaultId },
      });
      const providerRead = t.query(internal.organizationProviderCredentials.loadForOrganization, {
        organizationId,
        userId,
      });
      if (state === "active") {
        await expect(vaultRead).resolves.toMatchObject({ _id: vaultId });
        await expect(githubRead).resolves.toMatchObject({
          githubInstallationId: `installation-${userId}`,
        });
        await expect(providerRead).resolves.toMatchObject({
          convexTeam: { teamId: "convex-team" },
          cloudflareAccount: { accountId: "cloudflare-account" },
        });
      } else {
        await expect(vaultRead).rejects.toThrow("An active Samebase user is required.");
        await expect(githubRead).rejects.toThrow("An active Samebase user is required.");
        await expect(providerRead).rejects.toThrow(
          "Provider credentials are unavailable during account deletion.",
        );
      }
    }

    const missing = await seedLifecycleUser({
      state: "active",
      email: "missing-delayed-work@example.test",
      isApproved: true,
    });
    const { organizationId, vaultId } = await insertOrganizationVaultForUser(
      missing.t,
      missing.userId,
    );
    await insertProviderConfiguration(missing.t, { organizationId, userId: missing.userId });
    await missing.t.run(async (ctx) => await ctx.db.delete(missing.userId));
    await expect(
      missing.t.query(internal.vault.records.getByIdForUser, {
        userId: missing.userId,
        vaultId,
      }),
    ).rejects.toThrow("Organization actor user reference is invalid.");
    await expect(
      missing.t.query(internal.githubAppAccess.loadInstallationAccess, {
        userId: missing.userId,
        target: { kind: "vault", vaultId },
      }),
    ).rejects.toThrow("Organization actor user reference is invalid.");
    await expect(
      missing.t.query(internal.organizationProviderCredentials.loadForOrganization, {
        organizationId,
        userId: missing.userId,
      }),
    ).rejects.toThrow("Provider credentials are unavailable during account deletion.");
  });

  it("uses a live provisioning run instead of user lifecycle as workflow authority", async () => {
    const { t, userId } = await seedLifecycleUser({
      state: "deleting",
      email: "provisioning-workflow@example.test",
      isApproved: true,
    });
    const { organizationId, vaultId } = await insertOrganizationVaultForUser(t, userId);
    await insertProviderConfiguration(t, { organizationId, userId });
    const runId = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        organizationId,
        userId,
        vaultId,
        repositoryFullName: "owner/repository",
        trigger: "create",
        state: "running",
        currentStep: "sync_tree",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.replace(vaultId, {
        state: "connected",
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        githubMode: "create_repository",
        runId,
        ghRepoId: "repository-id",
        name: "repository",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 1,
      });
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        owner: { kind: "managed_run", runId },
        state: "active",
        lastWriteAt: {},
        updatedAt: 1,
      });
      await ctx.db.insert("workflow_vaultProvisioning_plans", {
        vaultId,
        convexConfigPath: "convex.json",
        convex: {
          state: "creating",
          projectName: "repository",
          deploymentRegion: "aws-us-east-1",
        },
        cloudflare: {
          state: "creating",
          workerName: "repository",
          rootDirectory: "/",
          buildTokenUuid: "build-token",
        },
        createdAt: 1,
        updatedAt: 1,
      });
      return runId;
    });

    const mismatchedOrganizationId = await t.run(async (ctx) => {
      const mismatchedOrganizationId = await ctx.db.insert("organizations", {
        githubInstallationId: "mismatched-installation",
        githubOwnerId: "mismatched-owner",
        githubOwnerLogin: "mismatched-owner",
        githubOwnerLoginNormalized: "mismatched-owner",
        githubOwnerType: "organization",
      });
      await ctx.db.patch(runId, { organizationId: mismatchedOrganizationId });
      return mismatchedOrganizationId;
    });
    await expect(
      t.query(internal.githubAppAccess.loadInstallationAccessForProvisioningRun, {
        runId,
        userId,
        vaultId,
      }),
    ).rejects.toThrow("Provisioning run does not match its vault.");
    await t.run(async (ctx) => {
      await ctx.db.patch(runId, { organizationId });
      await ctx.db.delete(mismatchedOrganizationId);
    });

    await expect(
      t.query(internal.githubAppAccess.loadInstallationAccessForProvisioningRun, {
        runId,
        userId,
        vaultId,
      }),
    ).resolves.toMatchObject({ githubInstallationId: `installation-${userId}` });
    await expect(
      t.query(internal.organizationProviderCredentials.loadForVaultProviderWorkflow, {
        authority: { kind: "provisioning", runId, userId, vaultId },
      }),
    ).resolves.toMatchObject({
      organizationId,
      configuration: {
        convexTeam: { teamId: "convex-team" },
        cloudflareAccount: { accountId: "cloudflare-account" },
      },
    });

    await expect(
      t.mutation(internal.vault.convexMutations.recordManagedProjectCreated, {
        runId,
        userId,
        vaultId,
        convexConfigPath: "convex.json",
        projectName: "repository",
        teamId: "convex-team",
        projectId: "convex-project",
      }),
    ).resolves.toBeDefined();
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordManagedWorkerCreated, {
        runId,
        userId,
        vaultId,
        accountId: "cloudflare-account",
        workerName: "repository",
        workerTag: "cloudflare-worker",
      }),
    ).resolves.toBeDefined();

    await t.run(async (ctx) => await ctx.db.patch(runId, { state: "succeeded" }));
    await expect(
      t.query(internal.githubAppAccess.loadInstallationAccessForProvisioningRun, {
        runId,
        userId,
        vaultId,
      }),
    ).rejects.toThrow("Provisioning run does not authorize vault access.");
    await expect(
      t.query(internal.organizationProviderCredentials.loadForVaultProviderWorkflow, {
        authority: { kind: "provisioning", runId, userId, vaultId },
      }),
    ).rejects.toThrow("Provisioning run does not authorize vault access.");
    await expect(
      t.mutation(internal.vault.convexMutations.recordManagedProjectCreated, {
        runId,
        userId,
        vaultId,
        convexConfigPath: "convex.json",
        projectName: "repository",
        teamId: "convex-team",
        projectId: "convex-project",
      }),
    ).rejects.toThrow("Provisioning run does not authorize vault access.");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordManagedWorkerCreated, {
        runId,
        userId,
        vaultId,
        accountId: "cloudflare-account",
        workerName: "repository",
        workerTag: "cloudflare-worker",
      }),
    ).rejects.toThrow("Provisioning run does not authorize vault access.");
  });

  it("keeps personal GitHub access scoped to a live provisioning run", async () => {
    const { t, userId } = await seedLifecycleUser({
      state: "deleting",
      email: "provisioning-github-user@example.test",
      isApproved: true,
    });
    const { organizationId, vaultId } = await insertOrganizationVaultForUser(t, userId);
    const runId = await t.run(async (ctx) => {
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "github",
        providerAccountId: "github-user-id",
        emailVerified: "provisioning-github-user@example.test",
        githubLogin: "provisioning-github-user",
      });
      await ctx.db.insert("githubUserAuthorizations", {
        userId,
        githubUserId: "github-user-id",
        githubUserLogin: "provisioning-github-user",
        accessToken: "github-access-token",
        accessTokenExpiresAt: Date.now() + 120_000,
        refreshToken: "github-refresh-token",
        refreshTokenExpiresAt: Date.now() + 240_000,
        createdAt: 1,
        updatedAt: 1,
      });
      return await ctx.db.insert("workflow_vaultProvisioning_runs", {
        organizationId,
        userId,
        vaultId,
        repositoryFullName: "owner/repository",
        trigger: "create",
        state: "running",
        currentStep: "create_github_repo",
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await expect(
      t.mutation(internal.githubUserAuthorizations.claimForUse, {
        userId,
        githubUserId: "github-user-id",
      }),
    ).rejects.toThrow("An active Samebase user is required.");
    await expect(
      t.mutation(internal.githubUserAuthorizations.claimForProvisioningRun, {
        runId,
        userId,
        vaultId,
        githubUserId: "github-user-id",
      }),
    ).resolves.toMatchObject({
      kind: "ready",
      authorization: { githubUserId: "github-user-id", userId },
    });

    await t.run(async (ctx) => await ctx.db.patch(runId, { state: "succeeded" }));
    await expect(
      t.mutation(internal.githubUserAuthorizations.claimForProvisioningRun, {
        runId,
        userId,
        vaultId,
        githubUserId: "github-user-id",
      }),
    ).rejects.toThrow("Provisioning run does not authorize vault access.");
  });

  it("uses only a live vault-deletion run as provider authority", async () => {
    const { t, userId } = await seedLifecycleUser({
      state: "deleting",
      email: "vault-deletion-workflow@example.test",
      isApproved: true,
    });
    const { organizationId, vaultId } = await insertOrganizationVaultForUser(t, userId);
    await insertProviderConfiguration(t, { organizationId, userId });
    const runId = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "running",
        organizationId,
        userId,
        vaultId,
        repositoryFullName: "owner/repository",
        createdAt: 1,
        updatedAt: 1,
        attempt: { kind: "initial" },
        workflow: { state: "started", workflowId: "vault-deletion-lifecycle-test" },
        currentStep: "delete_cloudflare",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "samebase_managed_repository",
              ghRepoId: "repository-id",
              owner: "owner",
              name: "repository",
              repositoryFullName: "owner/repository",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });
      await ctx.db.patch(vaultId, {
        deletion: { state: "deleting", runId, requestedAt: 1 },
      });
      return runId;
    });

    await expect(
      t.query(internal.githubAppAccess.loadInstallationAccessForVaultDeletionRun, { runId }),
    ).resolves.toMatchObject({ githubInstallationId: `installation-${userId}` });
    await expect(
      t.query(internal.organizationProviderCredentials.loadForVaultProviderWorkflow, {
        authority: { kind: "deletion", runId },
      }),
    ).resolves.toMatchObject({
      organizationId,
      configuration: {
        convexTeam: { teamId: "convex-team" },
        cloudflareAccount: { accountId: "cloudflare-account" },
      },
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(runId, {
        state: "failed",
        currentStep: "finish",
        updatedAt: 2,
        completedAt: 2,
        lastError: "Expected test failure.",
      });
    });
    await expect(
      t.query(internal.githubAppAccess.loadInstallationAccessForVaultDeletionRun, { runId }),
    ).rejects.toThrow("Vault deletion run does not authorize vault access.");
    await expect(
      t.query(internal.organizationProviderCredentials.loadForVaultProviderWorkflow, {
        authority: { kind: "deletion", runId },
      }),
    ).rejects.toThrow("Vault deletion run does not authorize vault access.");
  });

  it("presents a deleted durable reference and rejects a missing reference", async () => {
    const { t, userId } = await seedLifecycleUser({
      state: "deleted",
      email: "attribution@example.test",
      isApproved: true,
    });
    await expect(
      t.run(async (ctx) => resolveUserReferencePresentation(await ctx.db.get(userId))),
    ).resolves.toEqual({
      kind: "deleted",
      label: "Deleted Samebase account",
    });
    expect(() => resolveUserReferencePresentation(null)).toThrow(
      "Samebase user reference is invalid.",
    );
  });
});
