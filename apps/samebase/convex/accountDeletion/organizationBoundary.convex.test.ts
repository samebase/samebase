import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { GITHUB_USER_TOKEN_REFRESH_STALE_LOCK_MS } from "../../shared/githubUserTokenRefresh";
import { makeConvexTest } from "../test.setup";
import { cleanupAccountDataBatchForUser } from "./cleanup";

const workflowId = "account-deletion-organization-boundary";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function seedRunningDeletion() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const deletingUserId = await ctx.db.insert("users", {
      state: "active",
      email: "deleting@example.invalid",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const teammateUserId = await ctx.db.insert("users", {
      state: "active",
      email: "teammate@example.invalid",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const initiatingSessionId = await ctx.db.insert("authSessions", {
      userId: deletingUserId,
      expirationTime: 2_000_000_000_000,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "501",
      githubOwnerType: "organization",
      githubOwnerLogin: "example",
      githubOwnerLoginNormalized: "example",
      githubInstallationId: "601",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: teammateUserId,
      role: "owner",
    });
    const teammateOrganizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "502",
      githubOwnerType: "organization",
      githubOwnerLogin: "teammate-example",
      githubOwnerLoginNormalized: "teammate-example",
      githubInstallationId: "602",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId: teammateOrganizationId,
      userId: teammateUserId,
      role: "owner",
    });
    const organizationBillingId = await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      plan: "free",
      status: "inactive",
    });
    const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
      state: "running",
      identity: {
        state: "active",
        userId: deletingUserId,
        email: "deleting@example.invalid",
      },
      completionCapability: "b".repeat(64),
      currentStep: "request_accepted",
      requestedAt: 1,
      deletionStartsAt: 1,
      updatedAt: 1,
      initiatingSessionId,
      retryCount: 0,
      outcomes: {
        providerRevocation: { state: "not_started" },
        completionEmail: { state: "not_started" },
      },
      workflow: { state: "started", workflowId, attempt: 1 },
    });
    await ctx.db.patch(deletingUserId, {
      state: "deleting",
      runId,
      requestedAt: 1,
    });
    const repositoryId = await ctx.db.insert("repositories", {
      createdAt: 1,
      state: "not_connected",
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
    });
    const stagedFile = await ctx.runMutation(components.gitWorkspace.staging.saveToStaging, {
      repositoryId,
      initialFilePath: "README.md",
      content: "shared edit",
      initialContent: "",
      parentCommitSha: null,
      userId: deletingUserId,
      branch: "main",
    });
    const stagedFileId = stagedFile._id;
    const organizationProviderCredentialsId = await ctx.db.insert(
      "organizationProviderCredentials",
      {
        organizationId,
        convex: {
          connectedByUserId: deletingUserId,
          auth: { method: "oauth", credential: "convex-token" },
          updatedAt: 1,
        },
        cloudflare: {
          connectedByUserId: deletingUserId,
          auth: {
            method: "oauth",
            credential: "cloudflare-access-token",
            refreshCredential: "cloudflare-refresh-token",
            credentialExpiresAt: 2_000_000_000_000,
          },
          updatedAt: 1,
        },
      },
    );
    await ctx.db.patch(organizationId, {
      convexTeam: { teamId: "convex-team" },
    });
    const teammateProviderCredentialsId = await ctx.db.insert("organizationProviderCredentials", {
      organizationId: teammateOrganizationId,
      convex: {
        connectedByUserId: teammateUserId,
        auth: { method: "api_key", credential: "teammate-token" },
        updatedAt: 1,
      },
    });
    await ctx.db.patch(teammateOrganizationId, {
      convexTeam: { teamId: "teammate-team" },
    });
    await ctx.db.insert("providerOAuthCallbackStates", {
      provider: "convex",
      userId: deletingUserId,
      organizationId,
      expectedProviderSnapshotHash: "snapshot-hash",
      state: "provider-state",
      codeVerifier: "code-verifier",
      createdAt: 1,
      expiresAt: 2_000_000_000_000,
    });
    await ctx.db.insert("githubAppSetupStates", {
      userId: deletingUserId,
      state: "github-state",
      createdAt: 1,
      expiresAt: 2_000_000_000_000,
    });
    await ctx.db.insert("ui_user_settings", {
      userId: deletingUserId,
      providersPanelOpen: true,
    });
    const organizationTreeSettingId = await ctx.db.insert(
      "ui_repositoryTree_organizationSettings",
      {
        collapsed: true,
        organizationId,
        userId: deletingUserId,
      },
    );
    await ctx.db.insert("mcpGrants", {
      grantId: "grant-1",
      userId: deletingUserId,
      clientId: "client-1",
      resource: "https://api.example.invalid",
      scope: "repository:read",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("mcpAccessTokens", {
      tokenHash: "token-hash",
      grantId: "grant-1",
      clientId: "client-1",
      userId: deletingUserId,
      resource: "https://api.example.invalid",
      scope: "repository:read",
      createdAt: 1,
      expiresAt: 2_000_000_000_000,
    });
    await ctx.db.insert("mcpFeedbackRateLimits", {
      userId: deletingUserId,
      count: 2,
    });
    const deletingUser = await ctx.db.get(deletingUserId);
    if (deletingUser === null) {
      throw new Error("Deleting user is missing.");
    }

    return {
      deletingUserCreationTime: deletingUser._creationTime,
      deletingUserId,
      initiatingSessionId,
      teammateUserId,
      organizationId,
      organizationBillingId,
      runId,
      repositoryId,
      stagedFileId,
      organizationProviderCredentialsId,
      organizationTreeSettingId,
      teammateProviderCredentialsId,
    };
  });
  return { ids, t };
}

async function cleanAccountData(
  t: ReturnType<typeof makeConvexTest>,
  runId: Id<"workflow_accountDeletion_runs">,
) {
  for (let batch = 0; batch < 32; batch += 1) {
    if (
      await t.mutation(internal.accountDeletion.cleanup.cleanupAccountDataBatch, {
        runId,
        workflowId,
      })
    ) {
      return;
    }
  }
  throw new Error("Account data cleanup did not finish.");
}

async function prepareIdentityDeletionData(
  t: ReturnType<typeof makeConvexTest>,
  runId: Id<"workflow_accountDeletion_runs">,
) {
  await t.mutation(internal.accountDeletion.workflow.startProviderRevocation, {
    runId,
    workflowId,
  });
  const providerResult = await t.action(
    internal.accountDeletion.providerActions.revokeConnectionBatch,
    {
      runId,
      workflowId,
    },
  );
  await t.mutation(internal.accountDeletion.workflow.recordProviderBatch, {
    runId,
    workflowId,
    convexManualRevocationRequired: providerResult.convexManualRevocationRequired,
  });
  await t.mutation(internal.accountDeletion.workflow.finishProviderRevocation, {
    runId,
    workflowId,
  });
  await t.mutation(internal.accountDeletion.workflow.recordCompletionEmailOutcome, {
    runId,
    workflowId,
    outcome: { state: "sent" },
  });
  await cleanAccountData(t, runId);
  return providerResult;
}

describe("account deletion organization boundary", () => {
  it("keeps the workflow claim result free of user identity", async () => {
    const { ids, t } = await seedRunningDeletion();

    await expect(
      t.mutation(internal.accountDeletion.workflow.claimWorkflowRun, {
        runId: ids.runId,
        workflowId,
      }),
    ).resolves.toEqual({
      outcomes: {
        providerRevocation: { state: "not_started" },
        completionEmail: { state: "not_started" },
      },
    });
  });

  it("preserves creator attribution and scrubs an accepted recipient after they leave", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const deletingUserId = await ctx.db.insert("users", {
        state: "active",
        email: "invitation-deleting@example.invalid",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const ownerUserId = await ctx.db.insert("users", {
        state: "active",
        email: "invitation-owner@example.invalid",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "invitation-cleanup-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "invitation-cleanup-owner",
        githubOwnerLoginNormalized: "invitation-cleanup-owner",
        githubInstallationId: "invitation-cleanup-installation",
      });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: ownerUserId,
        role: "owner",
      });
      const createdInvitationId = await ctx.db.insert("organizationInvitations", {
        organizationId,
        githubAccountId: "801",
        githubLogin: "created-target",
        code: "d".repeat(64),
        createdByUserId: deletingUserId,
        createdAt: 1,
        expiresAt: 2,
        state: "pending",
      });
      const acceptedInvitationId = await ctx.db.insert("organizationInvitations", {
        organizationId,
        githubAccountId: "802",
        githubLogin: "accepted-target",
        code: "e".repeat(64),
        createdByUserId: ownerUserId,
        createdAt: 1,
        expiresAt: 2,
        state: "accepted",
        acceptedByUserId: deletingUserId,
        acceptedAt: 2,
      });
      const retainedInvitationId = await ctx.db.insert("organizationInvitations", {
        organizationId,
        githubAccountId: "803",
        githubLogin: "retained-target",
        code: "f".repeat(64),
        createdByUserId: ownerUserId,
        createdAt: 1,
        expiresAt: 2,
        state: "pending",
      });
      return {
        deletingUserId,
        ownerUserId,
        organizationId,
        createdInvitationId,
        acceptedInvitationId,
        retainedInvitationId,
      };
    });

    const firstCleanupDone = await t.run(async (ctx) =>
      cleanupAccountDataBatchForUser(ctx, { userId: ids.deletingUserId }),
    );
    expect(firstCleanupDone).toBe(false);
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("organizationMemberships")
          .withIndex("by_organization_and_user", (query) =>
            query.eq("organizationId", ids.organizationId).eq("userId", ids.deletingUserId),
          )
          .unique(),
      ),
    ).resolves.toBeNull();
    await expect(
      t.run(async (ctx) => await ctx.db.get(ids.acceptedInvitationId)),
    ).resolves.toMatchObject({ state: "accepted_recipient_deleted" });

    const reissued = await t.mutation(internal.organizationMembers.commitInvitation, {
      userId: ids.ownerUserId,
      organizationId: ids.organizationId,
      expectedGithubAccountId: "802",
      githubLogin: "accepted-target",
      proposedCode: "a".repeat(64),
    });
    expect(reissued).toMatchObject({ state: "created", code: "a".repeat(64) });
    expect(reissued.invitationId).not.toBe(ids.acceptedInvitationId);

    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt += 1) {
      done = await t.run(async (ctx) =>
        cleanupAccountDataBatchForUser(ctx, { userId: ids.deletingUserId }),
      );
    }
    expect(done).toBe(true);
    const snapshot = await t.run(async (ctx) => ({
      created: await ctx.db.get(ids.createdInvitationId),
      accepted: await ctx.db.get(ids.acceptedInvitationId),
      retained: await ctx.db.get(ids.retainedInvitationId),
      acceptedCodeOwner: await ctx.db
        .query("organizationInvitations")
        .withIndex("by_code", (query) => query.eq("code", "e".repeat(64)))
        .unique(),
      reissued: await ctx.db.get(reissued.invitationId),
    }));
    expect(snapshot.created).toMatchObject({
      state: "pending",
      createdByUserId: ids.deletingUserId,
      githubAccountId: "801",
    });
    expect(snapshot.accepted).toMatchObject({
      state: "accepted_recipient_deleted",
      organizationId: ids.organizationId,
      createdByUserId: ids.ownerUserId,
      acceptedByUserId: ids.deletingUserId,
      createdAt: 1,
      acceptedAt: 2,
    });
    expect(Object.keys(snapshot.accepted ?? {}).sort()).toEqual([
      "_creationTime",
      "_id",
      "acceptedAt",
      "acceptedByUserId",
      "createdAt",
      "createdByUserId",
      "organizationId",
      "state",
    ]);
    expect(snapshot.retained).toMatchObject({ githubAccountId: "803" });
    expect(snapshot.acceptedCodeOwner).toBeNull();
    expect(snapshot.reissued).toMatchObject({
      state: "pending",
      githubAccountId: "802",
      code: "a".repeat(64),
    });
  });

  it("waits for the deleting user's active work and a fresh GitHub refresh", async () => {
    const { ids, t } = await seedRunningDeletion();
    const provisioningRunId = await t.run(async (ctx) => {
      return await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId: ids.organizationId,
        userId: ids.deletingUserId,
        repositoryId: ids.repositoryId,
        githubRepositoryFullName: "example/shared",
        trigger: "connect_existing_repository",
        state: "running",
        currentStep: "fetch_github_repository",
        createdAt: 2,
        updatedAt: 2,
      });
    });

    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, {
        runId: ids.runId,
        workflowId,
      }),
    ).resolves.toEqual({ state: "waiting", blocker: "active_app_provisioning" });

    const deletionRunId = await t.run(async (ctx) => {
      await ctx.db.patch(provisioningRunId, {
        state: "succeeded",
        currentStep: "finish",
        updatedAt: 3,
        completedAt: 3,
      });
      return await ctx.db.insert("workflow_repositoryDeletion_runs", {
        state: "queued",
        organizationId: ids.organizationId,
        userId: ids.deletingUserId,
        repositoryId: ids.repositoryId,
        githubRepositoryFullName: "example/shared",
        createdAt: 4,
        updatedAt: 4,
        attempt: { kind: "initial" },
        workflow: { state: "not_started" },
        currentStep: "initialize_deletion",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "failed_repository_setup",
              githubMode: "connect_existing_repository",
              githubOwnerLogin: "example",
              githubRepositoryName: "shared",
              githubRepositoryFullName: "example/shared",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "no_confirmed_identity" },
          },
        },
      });
    });

    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, {
        runId: ids.runId,
        workflowId,
      }),
    ).resolves.toEqual({ state: "waiting", blocker: "active_repository_deletion" });

    const { githubAuthorizationId, manualWriteId } = await t.run(async (ctx) => {
      await ctx.db.patch(deletionRunId, {
        state: "failed",
        updatedAt: 5,
        lastError: "Expected test failure.",
        completedAt: 5,
      });
      await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId: ids.organizationId,
        userId: ids.teammateUserId,
        repositoryId: ids.repositoryId,
        githubRepositoryFullName: "example/shared",
        trigger: "retry",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 6,
        updatedAt: 6,
      });
      const manualWriteId = await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
        repositoryId: ids.repositoryId,
        owner: {
          kind: "manual_provider_write",
          userId: ids.deletingUserId,
          actionId: "deleting-user-provider-write",
          action: "create_convex_project",
          expiresAt: 60_000,
        },
        state: "active",
        lastWriteAt: {},
        updatedAt: 6,
      });
      const now = Date.now();
      const githubAuthorizationId = await ctx.db.insert("githubUserAuthorizations", {
        userId: ids.deletingUserId,
        githubUserId: "deleting-user-github-id",
        githubUserLogin: "deleting-user",
        accessToken: "old-access-token",
        accessTokenExpiresAt: now - 1,
        refreshToken: "old-refresh-token",
        refreshTokenExpiresAt: now + 120_000,
        refreshStartedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return { githubAuthorizationId, manualWriteId };
    });

    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, {
        runId: ids.runId,
        workflowId,
      }),
    ).resolves.toEqual({ state: "waiting", blocker: "active_manual_provider_write" });

    await t.run(async (ctx) => {
      await ctx.db.patch(manualWriteId, { state: "succeeded", updatedAt: 7 });
    });
    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, {
        runId: ids.runId,
        workflowId,
      }),
    ).resolves.toEqual({
      state: "waiting",
      blocker: "active_github_user_authorization_refresh",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(githubAuthorizationId, {
        refreshStartedAt: Date.now() - GITHUB_USER_TOKEN_REFRESH_STALE_LOCK_MS,
      });
    });
    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, {
        runId: ids.runId,
        workflowId,
      }),
    ).resolves.toEqual({ state: "done" });
  });

  it("removes personal folder assignments before folders and preserves teammate state", async () => {
    const { ids, t } = await seedRunningDeletion();
    const folderStateIds = await t.run(async (ctx) => {
      const deletingFolderId = await ctx.db.insert("ui_repositoryTree_folders", {
        collapsed: false,
        name: "Deleting user's folder",
        nameKey: "deleting user's folder",
        organizationId: ids.organizationId,
        position: 0,
        userId: ids.deletingUserId,
      });
      const deletingAssignmentId = await ctx.db.insert("ui_repositoryTree_folderAssignments", {
        folderId: deletingFolderId,
        organizationId: ids.organizationId,
        userId: ids.deletingUserId,
        repositoryId: ids.repositoryId,
      });
      const teammateFolderId = await ctx.db.insert("ui_repositoryTree_folders", {
        collapsed: true,
        name: "Teammate's folder",
        nameKey: "teammate's folder",
        organizationId: ids.organizationId,
        position: 0,
        userId: ids.teammateUserId,
      });
      const teammateAssignmentId = await ctx.db.insert("ui_repositoryTree_folderAssignments", {
        folderId: teammateFolderId,
        organizationId: ids.organizationId,
        userId: ids.teammateUserId,
        repositoryId: ids.repositoryId,
      });
      return {
        deletingAssignmentId,
        deletingFolderId,
        teammateAssignmentId,
        teammateFolderId,
      };
    });

    let cleanupFinished = false;
    let observedAssignmentFirstState = false;
    for (let batch = 0; batch < 32; batch += 1) {
      cleanupFinished = await t.mutation(internal.accountDeletion.cleanup.cleanupAccountDataBatch, {
        runId: ids.runId,
        workflowId,
      });
      const folderState = await t.run(async (ctx) => ({
        deletingAssignment: await ctx.db.get(folderStateIds.deletingAssignmentId),
        deletingFolder: await ctx.db.get(folderStateIds.deletingFolderId),
        teammateAssignment: await ctx.db.get(folderStateIds.teammateAssignmentId),
        teammateFolder: await ctx.db.get(folderStateIds.teammateFolderId),
      }));

      if (folderState.deletingAssignment === null && folderState.deletingFolder !== null) {
        observedAssignmentFirstState = true;
      }
      if (folderState.deletingFolder === null) {
        expect(folderState.deletingAssignment).toBeNull();
      }
      expect(folderState.teammateAssignment).not.toBeNull();
      expect(folderState.teammateFolder).not.toBeNull();

      if (cleanupFinished) {
        break;
      }
    }

    expect(cleanupFinished).toBe(true);
    expect(observedAssignmentFirstState).toBe(true);
    await t.run(async (ctx) => {
      expect(await ctx.db.get(folderStateIds.deletingAssignmentId)).toBeNull();
      expect(await ctx.db.get(folderStateIds.deletingFolderId)).toBeNull();
      expect(await ctx.db.get(folderStateIds.teammateAssignmentId)).not.toBeNull();
      expect(await ctx.db.get(folderStateIds.teammateFolderId)).not.toBeNull();
    });
  });

  it("removes the former member's credentials and personal access but preserves shared data", async () => {
    const { ids, t } = await seedRunningDeletion();
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID", "cloudflare-client");
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET", "cloudflare-secret");
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);

    const providerResult = await prepareIdentityDeletionData(t, ids.runId);
    expect(providerResult).toEqual({
      done: true,
      convexManualRevocationRequired: true,
    });
    await t.mutation(internal.accountDeletion.workflow.recordIdentityDeletionStart, {
      runId: ids.runId,
      workflowId,
    });
    const beforeFinalMutation = await t.run(async (ctx) => ({
      run: await ctx.db.get(ids.runId),
      user: await ctx.db.get(ids.deletingUserId),
    }));
    expect(beforeFinalMutation.user).toMatchObject({
      state: "deleting",
      runId: ids.runId,
    });
    expect(beforeFinalMutation.run).toMatchObject({
      state: "running",
      currentStep: "delete_identity",
    });
    await t.mutation(internal.accountDeletion.authCleanup.finishIdentityDeletion, {
      runId: ids.runId,
      workflowId,
    });

    const snapshot = await t.run(async (ctx) => ({
      deletingUser: await ctx.db.get(ids.deletingUserId),
      initiatingSession: await ctx.db.get(ids.initiatingSessionId),
      organization: await ctx.db.get(ids.organizationId),
      organizationBilling: await ctx.db.get(ids.organizationBillingId),
      repository: await ctx.db.get(ids.repositoryId),
      stagedFile: await ctx.runQuery(components.gitWorkspace.staging.getById, {
        repositoryId: ids.repositoryId,
        branch: "main",
        stagingId: ids.stagedFileId,
      }),
      organizationProviderCredentials: await ctx.db.get(ids.organizationProviderCredentialsId),
      teammateProviderCredentials: await ctx.db.get(ids.teammateProviderCredentialsId),
      memberships: await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", ids.organizationId),
        )
        .collect(),
      oauthState: await ctx.db
        .query("providerOAuthCallbackStates")
        .withIndex("by_user", (query) => query.eq("userId", ids.deletingUserId))
        .first(),
      setupState: await ctx.db
        .query("githubAppSetupStates")
        .withIndex("by_user", (query) => query.eq("userId", ids.deletingUserId))
        .first(),
      preferences: await ctx.db
        .query("ui_user_settings")
        .withIndex("by_user", (query) => query.eq("userId", ids.deletingUserId))
        .first(),
      organizationTreeSetting: await ctx.db.get(ids.organizationTreeSettingId),
      grant: await ctx.db
        .query("mcpGrants")
        .withIndex("by_user_id", (query) => query.eq("userId", ids.deletingUserId))
        .first(),
      accessToken: await ctx.db
        .query("mcpAccessTokens")
        .withIndex("by_user_id", (query) => query.eq("userId", ids.deletingUserId))
        .first(),
      feedbackRateLimit: await ctx.db
        .query("mcpFeedbackRateLimits")
        .withIndex("by_user_id", (query) => query.eq("userId", ids.deletingUserId))
        .first(),
      run: await ctx.db.get(ids.runId),
    }));

    expect(fetch).not.toHaveBeenCalled();
    expect(snapshot.deletingUser).toMatchObject({
      _creationTime: ids.deletingUserCreationTime,
      _id: ids.deletingUserId,
      state: "deleted",
      deletedAt: expect.any(Number),
    });
    expect(Object.keys(snapshot.deletingUser ?? {}).sort()).toEqual([
      "_creationTime",
      "_id",
      "deletedAt",
      "state",
    ]);
    expect(snapshot.initiatingSession).toBeNull();
    expect(snapshot.organizationBilling).not.toBeNull();
    expect(snapshot.repository).not.toBeNull();
    expect(snapshot.stagedFile).not.toBeNull();
    expect(snapshot.organization).toMatchObject({
      convexTeam: { teamId: "convex-team" },
    });
    expect(snapshot.organizationProviderCredentials).toBeNull();
    expect(snapshot.teammateProviderCredentials).not.toBeNull();
    expect(snapshot.memberships).toEqual([expect.objectContaining({ userId: ids.teammateUserId })]);
    expect(snapshot.oauthState).toBeNull();
    expect(snapshot.setupState).toBeNull();
    expect(snapshot.preferences).toBeNull();
    expect(snapshot.organizationTreeSetting).toBeNull();
    expect(snapshot.grant).toBeNull();
    expect(snapshot.accessToken).toBeNull();
    expect(snapshot.feedbackRateLimit).toBeNull();
    expect(snapshot.run).toMatchObject({
      state: "succeeded",
      identity: { state: "scrubbed" },
      deletionStartsAt: 1,
      outcomes: {
        providerRevocation: {
          state: "completed",
          convexConnections: { state: "manual_revocation_required" },
        },
      },
    });
    const deletedUser = snapshot.deletingUser;
    if (deletedUser?.state !== "deleted" || snapshot.run?.state !== "succeeded") {
      throw new Error("Account deletion did not reach its terminal state.");
    }
    expect(deletedUser.deletedAt).toBe(snapshot.run.completedAt);
  });

  it.each(["accepted", "rejected", "queued"] as const)(
    "finalizes a staff-requested deletion after %s email and keeps its history",
    async (delivery) => {
      // Convex uses V8; the edge-runtime test host lacks the SDK's Node process metadata.
      vi.stubGlobal("EdgeRuntime", undefined);
      if (delivery === "queued") {
        vi.useFakeTimers();
      }
      const { ids, t } = await seedRunningDeletion();
      const authIds = await t.run(async (ctx) => {
        await ctx.db.patch(ids.runId, { initiatingSessionId: undefined });
        const verifierId = await ctx.db.insert("authVerifiers", {
          sessionId: ids.initiatingSessionId,
        });
        const refreshTokenId = await ctx.db.insert("authRefreshTokens", {
          sessionId: ids.initiatingSessionId,
          expirationTime: 2_000_000_000_000,
        });
        const accountId = await ctx.db.insert("authAccounts", {
          userId: ids.deletingUserId,
          provider: "google",
          providerAccountId: "staff-requested-deletion",
        });
        const verificationCodeId = await ctx.db.insert("authVerificationCodes", {
          accountId,
          provider: "google",
          code: "unused",
          expirationTime: 2_000_000_000_000,
          verifier: "unused",
        });
        return { accountId, refreshTokenId, verificationCodeId, verifierId };
      });

      await prepareIdentityDeletionData(t, ids.runId);
      vi.stubEnv("CONVEX_DEPLOYMENT", "prod:samebase");
      vi.stubEnv("CLOUDFLARE_EMAIL_ACCOUNT_ID", "account-id");
      vi.stubEnv("CLOUDFLARE_EMAIL_API_TOKEN", "email-token");
      // Cloudflare REST response fields, checked 2026-10-01:
      // https://developers.cloudflare.com/api/resources/email_sending/methods/send/
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              JSON.stringify(
                delivery === "accepted"
                  ? {
                      success: true,
                      errors: [],
                      messages: [],
                      result: {
                        delivered: ["deleting@example.invalid"],
                        message_id: "<deletion@samebase.com>",
                        permanent_bounces: [],
                        queued: [],
                        suppressed_recipients: [],
                      },
                    }
                  : {
                      success: false,
                      errors: [
                        { code: 10001, message: "email.sending.error.invalid_request_schema" },
                      ],
                      messages: [],
                      result: null,
                    },
              ),
              { status: { accepted: 200, rejected: 400, queued: 429 }[delivery] },
            ),
        ),
      );
      const email = await t.action(
        internal.accountDeletion.completionEmail.sendForAccountDeletion,
        {
          runId: ids.runId,
          workflowId,
        },
      );
      expect(email).toEqual(
        delivery === "accepted"
          ? { state: "sent" }
          : {
              state: "delivery_failed",
              safeError:
                delivery === "queued"
                  ? "Completion email is queued for automatic delivery. Delivery is not yet confirmed."
                  : "Completion email delivery could not be confirmed.",
            },
      );
      await t.mutation(internal.accountDeletion.workflow.recordCompletionEmailOutcome, {
        runId: ids.runId,
        workflowId,
        outcome: email,
      });

      let sessionsRemoved = false;
      for (let batch = 0; batch < 8; batch += 1) {
        sessionsRemoved = await t.mutation(
          internal.accountDeletion.authCleanup.deleteOtherSessionBatch,
          { runId: ids.runId, workflowId },
        );
        if (sessionsRemoved) {
          break;
        }
      }
      expect(sessionsRemoved).toBe(true);

      let accountsRemoved = false;
      for (let batch = 0; batch < 8; batch += 1) {
        accountsRemoved = await t.mutation(
          internal.accountDeletion.authCleanup.deleteAuthAccountBatch,
          { runId: ids.runId, workflowId },
        );
        if (accountsRemoved) {
          break;
        }
      }
      expect(accountsRemoved).toBe(true);
      await t.mutation(internal.accountDeletion.authCleanup.deleteIdentityRateLimit, {
        runId: ids.runId,
        workflowId,
      });
      await expect(
        t.mutation(internal.accountDeletion.authCleanup.deleteInitiatingSessionBatch, {
          runId: ids.runId,
          workflowId,
        }),
      ).resolves.toBe(true);
      await expect(
        t.mutation(internal.accountDeletion.authCleanup.deleteEventBatch, {
          runId: ids.runId,
          workflowId,
        }),
      ).resolves.toBe(true);
      await t.mutation(internal.accountDeletion.workflow.recordIdentityDeletionStart, {
        runId: ids.runId,
        workflowId,
      });
      await t.mutation(internal.accountDeletion.authCleanup.finishIdentityDeletion, {
        runId: ids.runId,
        workflowId,
      });

      await expect(
        t.run(async (ctx) => ({
          account: await ctx.db.get(authIds.accountId),
          refreshToken: await ctx.db.get(authIds.refreshTokenId),
          run: await ctx.db.get(ids.runId),
          session: await ctx.db.get(ids.initiatingSessionId),
          user: await ctx.db.get(ids.deletingUserId),
          verificationCode: await ctx.db.get(authIds.verificationCodeId),
          verifier: await ctx.db.get(authIds.verifierId),
        })),
      ).resolves.toMatchObject({
        account: null,
        refreshToken: null,
        run: {
          state: "succeeded",
          identity: { state: "scrubbed" },
          outcomes: { completionEmail: email },
        },
        session: null,
        user: { state: "deleted" },
        verificationCode: null,
        verifier: null,
      });
      const threads = await t.query(components.mail.mail.listThreads, {
        inboxId: null,
        paginationOpts: { numItems: 10, cursor: null },
      });
      const messages = await t.query(components.mail.mail.listMessages, {
        threadId: threads.page[0]._id,
        paginationOpts: { numItems: 10, cursor: null },
      });
      expect(messages.page).toMatchObject([
        {
          status: delivery,
          to: ["deleting@example.invalid"],
          bodyText: expect.stringContaining(`Deletion reference: ${ids.runId}`),
        },
      ]);
      if (delivery === "queued") {
        await t.finishAllScheduledFunctions(() => vi.runAllTimers());
        await expect(
          t.query(components.mail.mail.getMessage, { messageId: messages.page[0]._id }),
        ).resolves.toMatchObject({ status: "rejected" });
      }
    },
  );

  it("rejects final identity deletion when an older run still has an organization membership", async () => {
    const { ids, t } = await seedRunningDeletion();
    const membershipId = await t.run(async (ctx) => {
      return await ctx.db.insert("organizationMemberships", {
        organizationId: ids.organizationId,
        userId: ids.deletingUserId,
        role: "member",
      });
    });
    await prepareIdentityDeletionData(t, ids.runId);
    await t.mutation(internal.accountDeletion.workflow.recordIdentityDeletionStart, {
      runId: ids.runId,
      workflowId,
    });

    await expect(
      t.mutation(internal.accountDeletion.authCleanup.finishIdentityDeletion, {
        runId: ids.runId,
        workflowId,
      }),
    ).rejects.toThrow("Organization membership remains during account deletion.");

    await expect(
      t.run(async (ctx) => ({
        membership: await ctx.db.get(membershipId),
        run: await ctx.db.get(ids.runId),
        user: await ctx.db.get(ids.deletingUserId),
      })),
    ).resolves.toMatchObject({
      membership: { userId: ids.deletingUserId },
      run: { state: "running", currentStep: "delete_identity" },
      user: { state: "deleting", runId: ids.runId },
    });
  });

  it("rejects final identity deletion when the user is not deleting", async () => {
    const { ids, t } = await seedRunningDeletion();
    await t.mutation(internal.accountDeletion.workflow.recordIdentityDeletionStart, {
      runId: ids.runId,
      workflowId,
    });
    await t.run(async (ctx) => {
      await ctx.db.replace(ids.deletingUserId, {
        state: "active",
        email: "deleting@example.invalid",
        isApproved: true,
      });
    });

    await expect(
      t.mutation(internal.accountDeletion.authCleanup.finishIdentityDeletion, {
        runId: ids.runId,
        workflowId,
      }),
    ).rejects.toThrow("Account deletion is not ready to finalize.");

    const snapshot = await t.run(async (ctx) => ({
      initiatingSession: await ctx.db.get(ids.initiatingSessionId),
      run: await ctx.db.get(ids.runId),
      user: await ctx.db.get(ids.deletingUserId),
    }));
    expect(snapshot.user).toMatchObject({ state: "active" });
    expect(snapshot.initiatingSession).not.toBeNull();
    expect(snapshot.run).toMatchObject({
      state: "running",
      currentStep: "delete_identity",
      identity: { state: "active", userId: ids.deletingUserId },
    });
  });

  it("rejects final identity deletion atomically when a refresh token remains", async () => {
    const { ids, t } = await seedRunningDeletion();
    await prepareIdentityDeletionData(t, ids.runId);
    const refreshTokenId = await t.run(async (ctx) => {
      return await ctx.db.insert("authRefreshTokens", {
        sessionId: ids.initiatingSessionId,
        expirationTime: 2_000_000_000_000,
      });
    });
    await t.mutation(internal.accountDeletion.workflow.recordIdentityDeletionStart, {
      runId: ids.runId,
      workflowId,
    });

    await expect(
      t.mutation(internal.accountDeletion.authCleanup.finishIdentityDeletion, {
        runId: ids.runId,
        workflowId,
      }),
    ).rejects.toThrow("Initiating auth session children remain during finalization.");

    const snapshot = await t.run(async (ctx) => ({
      initiatingSession: await ctx.db.get(ids.initiatingSessionId),
      refreshToken: await ctx.db.get(refreshTokenId),
      run: await ctx.db.get(ids.runId),
      user: await ctx.db.get(ids.deletingUserId),
    }));
    expect(snapshot.user).toMatchObject({
      state: "deleting",
      runId: ids.runId,
    });
    expect(snapshot.run).toMatchObject({
      state: "running",
      currentStep: "delete_identity",
      identity: { state: "active", userId: ids.deletingUserId },
    });
    expect(snapshot.initiatingSession).not.toBeNull();
    expect(snapshot.refreshToken).not.toBeNull();
  });

  it("keeps the user deleting after failure and retries the same run", async () => {
    const { ids, t } = await seedRunningDeletion();

    await t.mutation(internal.accountDeletion.workflow.handleWorkflowComplete, {
      workflowId,
      context: { runId: ids.runId },
      result: { kind: "failed", error: "Private workflow failure details" },
    });

    const failed = await t.run(async (ctx) => ({
      run: await ctx.db.get(ids.runId),
      user: await ctx.db.get(ids.deletingUserId),
      events: await ctx.db
        .query("workflow_accountDeletion_events")
        .withIndex("by_run_and_created_at", (query) => query.eq("runId", ids.runId))
        .collect(),
    }));
    expect(failed.user).toMatchObject({
      state: "deleting",
      runId: ids.runId,
      requestedAt: 1,
    });
    expect(failed.run).toMatchObject({
      state: "needs_attention",
      deletionStartsAt: 1,
      latestSafeError: "Account deletion needs staff attention.",
    });
    expect(failed.events.at(-1)).toMatchObject({
      message: "Account deletion needs staff attention.",
    });

    const staffUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "nicu@samebase.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
    });
    const asStaff = t.withIdentity({
      subject: staffUserId,
      tokenIdentifier: `test:${staffUserId}`,
    });
    await expect(
      asStaff.mutation(api.accountDeletion.index.retry, { runId: ids.runId }),
    ).resolves.toMatchObject({
      runId: ids.runId,
      state: "running",
    });
    await expect(t.run(async (ctx) => await ctx.db.get(ids.runId))).resolves.toMatchObject({
      state: "running",
      deletionStartsAt: 1,
      retryCount: 1,
      workflow: { attempt: 2 },
    });
    await expect(t.run(async (ctx) => await ctx.db.get(ids.deletingUserId))).resolves.toMatchObject(
      { state: "deleting", runId: ids.runId },
    );
  });

  it("lets the remaining member edit the shared staged file", async () => {
    const { ids, t } = await seedRunningDeletion();
    await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId: ids.organizationId,
        userId: ids.teammateUserId,
        repositoryId: ids.repositoryId,
        githubRepositoryFullName: "example/shared",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
      await ctx.db.replace(ids.repositoryId, {
        createdAt: 1,
        state: "connected",
        githubMode: "connect_existing_repository",
        organizationId: ids.organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        runId,
        githubRepositoryDatabaseId: "701",
        defaultBranch: "main",
        connectedAt: 3,
        githubRepositoryName: "shared",
        visibility: "private",
      });
    });

    await t.mutation(internal.collaborative.pushContentUpdate, {
      repositoryId: ids.repositoryId,
      filePath: "README.md",
      newContent: "teammate edit",
      expectedVersion: 0,
      branch: "main",
      userId: ids.teammateUserId,
    });
    const stagedFile = await t.query(internal.fileStaging.getByOriginalPath, {
      repositoryId: ids.repositoryId,
      originalFilePath: "README.md",
      branch: "main",
    });
    if (!stagedFile) throw new Error("Shared staging disappeared.");

    expect(stagedFile.content).toBe("teammate edit");
    expect(stagedFile.lastEditUserId).toBe(ids.teammateUserId);
  });

  it.each(["oauth", "mcp_oauth"] as const)(
    "removes local Cloudflare $method access without an upstream request",
    async (cloudflareAuthMethod) => {
      const { ids, t } = await seedRunningDeletion();
      if (cloudflareAuthMethod === "mcp_oauth") {
        await t.run(async (ctx) => {
          const credentials = await ctx.db.get(ids.organizationProviderCredentialsId);
          if (credentials?.cloudflare === undefined) {
            throw new Error("Expected Cloudflare credentials.");
          }
          await ctx.db.patch(credentials._id, {
            cloudflare: {
              ...credentials.cloudflare,
              auth: {
                method: "mcp_oauth",
                credential: "cloudflare-mcp-access-token",
                refreshCredential: "cloudflare-mcp-refresh-token",
                credentialExpiresAt: 2_000_000_000_000,
                clientId: "cloudflare-mcp-client",
              },
            },
          });
        });
      }
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);

      await t.mutation(internal.accountDeletion.workflow.startProviderRevocation, {
        runId: ids.runId,
        workflowId,
      });
      await expect(
        t.action(internal.accountDeletion.providerActions.revokeConnectionBatch, {
          runId: ids.runId,
          workflowId,
        }),
      ).resolves.toEqual({ done: true, convexManualRevocationRequired: true });

      const snapshot = await t.run(async (ctx) => {
        return {
          credentials: await ctx.db.get(ids.organizationProviderCredentialsId),
          run: await ctx.db.get(ids.runId),
        };
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(snapshot.credentials).toBeNull();
      expect(snapshot.run?.outcomes.providerRevocation).toEqual({
        state: "in_progress",
        convexManualRevocationRequired: true,
      });
    },
  );
});
