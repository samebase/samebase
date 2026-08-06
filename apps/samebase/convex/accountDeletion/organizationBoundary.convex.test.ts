import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";

const workflowId = "account-deletion-organization-boundary";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function seedRunningDeletion() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const deletingUserId = await ctx.db.insert("users", {
      email: "deleting@example.invalid",
      isApproved: true,
    });
    const teammateUserId = await ctx.db.insert("users", {
      email: "teammate@example.invalid",
      isApproved: true,
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
      userId: deletingUserId,
      role: "owner",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
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
      accountDeletion: { state: "deleting", runId, requestedAt: 1 },
    });
    const vaultId = await ctx.db.insert("vaults", {
      state: "not_connected",
      organizationId,
      deletion: { state: "not_deleting" },
    });
    const stagedFileId = await ctx.db.insert("vaultStagedFiles", {
      vaultId,
      fileDeleted: false,
      filePath: "README.md",
      initialFilePath: "README.md",
      content: "shared edit",
      initialContent: "",
      parentCommitSha: null,
      lastEditTime: 1,
      lastEditUserId: deletingUserId,
      branch: "main",
      version: 1,
    });
    await ctx.db.insert("providerConnections", {
      kind: "convex",
      organizationId,
      connectedByUserId: deletingUserId,
      auth: { method: "oauth", credential: "convex-token" },
      teamId: "convex-team",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("providerConnections", {
      kind: "cloudflare",
      organizationId,
      connectedByUserId: deletingUserId,
      auth: {
        method: "oauth",
        credential: "cloudflare-access-token",
        refreshCredential: "cloudflare-refresh-token",
        credentialExpiresAt: 2_000_000_000_000,
      },
      defaultAccount: { state: "not_selected" },
      createdAt: 1,
      updatedAt: 1,
    });
    const teammateConnectionId = await ctx.db.insert("providerConnections", {
      kind: "convex",
      organizationId,
      connectedByUserId: teammateUserId,
      auth: { method: "api_key", credential: "teammate-token" },
      teamId: "teammate-team",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("providerOAuthCallbackStates", {
      provider: "convex",
      userId: deletingUserId,
      organizationId,
      state: "provider-state",
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
    await ctx.db.insert("mcpGrants", {
      grantId: "grant-1",
      userId: deletingUserId,
      clientId: "client-1",
      resource: "https://api.example.invalid",
      scope: "vault:read",
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
      scope: "vault:read",
      createdAt: 1,
      expiresAt: 2_000_000_000_000,
    });

    return {
      deletingUserId,
      teammateUserId,
      organizationId,
      organizationBillingId,
      runId,
      vaultId,
      stagedFileId,
      teammateConnectionId,
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

describe("account deletion organization boundary", () => {
  it("waits for the deleting member's active vault work", async () => {
    const { ids, t } = await seedRunningDeletion();
    const provisioningRunId = await t.run(async (ctx) => {
      return await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ids.deletingUserId,
        vaultId: ids.vaultId,
        repositoryFullName: "example/shared",
        trigger: "connect_existing_repository",
        state: "running",
        currentStep: "fetch_github_repo",
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
      return await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "queued",
        organizationId: ids.organizationId,
        userId: ids.deletingUserId,
        vaultId: ids.vaultId,
        repositoryFullName: "example/shared",
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
              owner: "example",
              name: "shared",
              repositoryFullName: "example/shared",
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
    ).resolves.toEqual({ state: "waiting", blocker: "active_vault_deletion" });

    await t.run(async (ctx) => {
      await ctx.db.patch(deletionRunId, {
        state: "failed",
        updatedAt: 5,
        lastError: "Expected test failure.",
        completedAt: 5,
      });
      await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ids.teammateUserId,
        vaultId: ids.vaultId,
        repositoryFullName: "example/shared",
        trigger: "retry",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 6,
        updatedAt: 6,
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
      const deletingFolderId = await ctx.db.insert("ui_vaultFolders", {
        collapsed: false,
        name: "Deleting user's folder",
        nameKey: "deleting user's folder",
        organizationId: ids.organizationId,
        position: 0,
        userId: ids.deletingUserId,
      });
      const deletingAssignmentId = await ctx.db.insert("ui_vaultFolderAssignments", {
        folderId: deletingFolderId,
        organizationId: ids.organizationId,
        userId: ids.deletingUserId,
        vaultId: ids.vaultId,
      });
      const teammateFolderId = await ctx.db.insert("ui_vaultFolders", {
        collapsed: true,
        name: "Teammate's folder",
        nameKey: "teammate's folder",
        organizationId: ids.organizationId,
        position: 0,
        userId: ids.teammateUserId,
      });
      const teammateAssignmentId = await ctx.db.insert("ui_vaultFolderAssignments", {
        folderId: teammateFolderId,
        organizationId: ids.organizationId,
        userId: ids.teammateUserId,
        vaultId: ids.vaultId,
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

  it("removes the member's credentials and personal access but preserves shared data", async () => {
    const { ids, t } = await seedRunningDeletion();
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID", "cloudflare-client");
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET", "cloudflare-secret");
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);

    await t.mutation(internal.accountDeletion.workflow.startProviderRevocation, {
      runId: ids.runId,
      workflowId,
    });
    const providerResult = await t.action(
      internal.accountDeletion.providerActions.revokeConnectionBatch,
      {
        runId: ids.runId,
        workflowId,
      },
    );
    expect(providerResult).toEqual({
      done: true,
      convexManualRevocationRequired: true,
    });
    await t.mutation(internal.accountDeletion.workflow.recordProviderBatch, {
      runId: ids.runId,
      workflowId,
      convexManualRevocationRequired: providerResult.convexManualRevocationRequired,
    });
    await t.mutation(internal.accountDeletion.workflow.finishProviderRevocation, {
      runId: ids.runId,
      workflowId,
    });
    await t.mutation(internal.accountDeletion.workflow.recordCompletionEmailOutcome, {
      runId: ids.runId,
      workflowId,
      outcome: { state: "sent" },
    });
    await cleanAccountData(t, ids.runId);
    await t.mutation(internal.accountDeletion.workflow.markFinalizing, {
      runId: ids.runId,
      workflowId,
    });
    await t.mutation(internal.accountDeletion.authCleanup.finishIdentityDeletion, {
      runId: ids.runId,
      workflowId,
    });

    const snapshot = await t.run(async (ctx) => ({
      deletingUser: await ctx.db.get(ids.deletingUserId),
      organization: await ctx.db.get(ids.organizationId),
      organizationBilling: await ctx.db.get(ids.organizationBillingId),
      vault: await ctx.db.get(ids.vaultId),
      stagedFile: await ctx.db.get(ids.stagedFileId),
      teammateConnection: await ctx.db.get(ids.teammateConnectionId),
      memberships: await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", ids.organizationId),
        )
        .collect(),
      deletingUserConnections: await ctx.db
        .query("providerConnections")
        .withIndex("by_connected_by_user", (query) =>
          query.eq("connectedByUserId", ids.deletingUserId),
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
      grant: await ctx.db
        .query("mcpGrants")
        .withIndex("by_user_id", (query) => query.eq("userId", ids.deletingUserId))
        .first(),
      accessToken: await ctx.db
        .query("mcpAccessTokens")
        .withIndex("by_user_id", (query) => query.eq("userId", ids.deletingUserId))
        .first(),
      run: await ctx.db.get(ids.runId),
    }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(snapshot.deletingUser).toBeNull();
    expect(snapshot.organizationBilling).not.toBeNull();
    expect(snapshot.vault).not.toBeNull();
    expect(snapshot.stagedFile).not.toBeNull();
    expect(snapshot.teammateConnection).not.toBeNull();
    expect(snapshot.memberships).toEqual([expect.objectContaining({ userId: ids.teammateUserId })]);
    expect(snapshot.deletingUserConnections).toEqual([]);
    expect(snapshot.oauthState).toBeNull();
    expect(snapshot.setupState).toBeNull();
    expect(snapshot.preferences).toBeNull();
    expect(snapshot.grant).toBeNull();
    expect(snapshot.accessToken).toBeNull();
    expect(snapshot.run).toMatchObject({
      state: "succeeded",
      identity: { state: "scrubbed" },
      outcomes: {
        providerRevocation: {
          state: "completed",
          convexConnections: { state: "manual_revocation_required" },
        },
      },
    });
  });

  it("lets the remaining member edit the shared staged file", async () => {
    const { ids, t } = await seedRunningDeletion();
    await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ids.teammateUserId,
        vaultId: ids.vaultId,
        repositoryFullName: "example/shared",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
      await ctx.db.replace(ids.vaultId, {
        state: "connected",
        githubMode: "connect_existing_repository",
        organizationId: ids.organizationId,
        deletion: { state: "not_deleting" },
        runId,
        ghRepoId: "701",
        defaultBranch: "main",
        connectedAt: 3,
        name: "shared",
        visibility: "private",
      });
    });

    const stagedFile = await t.mutation(internal.fileStaging.saveToStaging, {
      vaultId: ids.vaultId,
      initialFilePath: "README.md",
      content: "teammate edit",
      initialContent: "",
      parentCommitSha: null,
      branch: "main",
      userId: ids.teammateUserId,
    });

    expect(stagedFile.content).toBe("teammate edit");
    expect(stagedFile.lastEditUserId).toBe(ids.teammateUserId);
  });

  it("keeps a Cloudflare credential when remote revocation fails", async () => {
    const { ids, t } = await seedRunningDeletion();
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID", "cloudflare-client");
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET", "cloudflare-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );

    await t.mutation(internal.accountDeletion.workflow.startProviderRevocation, {
      runId: ids.runId,
      workflowId,
    });
    await expect(
      t.action(internal.accountDeletion.providerActions.revokeConnectionBatch, {
        runId: ids.runId,
        workflowId,
      }),
    ).rejects.toThrow("Cloudflare OAuth revocation could not be confirmed.");

    const snapshot = await t.run(async (ctx) => {
      const connections = await ctx.db
        .query("providerConnections")
        .withIndex("by_connected_by_user", (query) =>
          query.eq("connectedByUserId", ids.deletingUserId),
        )
        .collect();
      return {
        cloudflareConnection: connections.find(({ kind }) => kind === "cloudflare") ?? null,
        run: await ctx.db.get(ids.runId),
      };
    });
    expect(snapshot.cloudflareConnection).not.toBeNull();
    expect(snapshot.run?.outcomes.providerRevocation).toEqual({
      state: "in_progress",
      convexManualRevocationRequired: true,
    });
  });
});
