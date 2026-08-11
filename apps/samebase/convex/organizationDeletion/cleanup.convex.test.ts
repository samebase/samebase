import { describe, expect, it } from "vite-plus/test";

import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";

async function runOrganizationCleanup(
  t: ReturnType<typeof makeConvexTest>,
  runId: Id<"workflow_organizationDeletion_runs">,
) {
  for (let batch = 0; batch < 128; batch += 1) {
    if (
      await t.mutation(internal.organizationDeletion.cleanup.cleanupOrganizationDataBatch, {
        runId,
        executionAttempt: 1,
      })
    ) {
      return;
    }
  }
  throw new Error("Organization cleanup did not finish in the test batch limit.");
}

describe("organization data cleanup", () => {
  it("deletes Samebase organization data and preserves external resources and user data", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const ownerUserId = await ctx.db.insert("users", {
        state: "active",
        email: "cleanup-owner@example.invalid",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "cleanup-owner-id",
        githubOwnerType: "organization",
        githubOwnerLogin: "CleanupOrg",
        githubOwnerLoginNormalized: "cleanuporg",
        githubInstallationId: "cleanup-installation",
      });
      const membershipId = await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: ownerUserId,
        role: "owner",
      });
      const billingId = await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      const invitationId = await ctx.db.insert("organizationInvitations", {
        state: "pending",
        organizationId,
        githubAccountId: "invited-account",
        githubLogin: "invited-user",
        code: "invitation-code",
        createdByUserId: ownerUserId,
        createdAt: 1,
        expiresAt: 2,
      });
      const credentialId = await ctx.db.insert("organizationProviderCredentials", {
        organizationId,
        convex: {
          connectedByUserId: ownerUserId,
          auth: { method: "api_key", credential: "provider-credential" },
          updatedAt: 1,
        },
      });
      const oauthStateId = await ctx.db.insert("providerOAuthCallbackStates", {
        provider: "convex",
        userId: ownerUserId,
        organizationId,
        expectedProviderSnapshotHash: "provider-snapshot",
        state: "oauth-state",
        codeVerifier: "oauth-verifier",
        createdAt: 1,
        expiresAt: 2,
      });
      const githubSetupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId: ownerUserId,
        organizationId,
        state: "github-setup-state",
        purpose: "installation_reconnect",
        createdAt: 1,
        expiresAt: 2,
      });
      const preservedGitHubInstallationStateId = await ctx.db.insert("githubAppSetupStates", {
        userId: ownerUserId,
        state: "other-github-installation",
        purpose: "installation",
        createdAt: 10,
        expiresAt: 20,
      });
      const otherOrganizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "other-owner-id",
        githubOwnerType: "organization",
        githubOwnerLogin: "OtherOrg",
        githubOwnerLoginNormalized: "otherorg",
        githubInstallationId: "other-installation",
      });
      const preservedOtherOrganizationSetupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId: ownerUserId,
        organizationId: otherOrganizationId,
        state: "other-organization-setup-state",
        purpose: "installation_reconnect",
        createdAt: 10,
        expiresAt: 20,
      });
      const preservedUserSettingId = await ctx.db.insert("ui_user_settings", {
        userId: ownerUserId,
        providersPanelOpen: true,
      });

      const vaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        organizationId,
        convexTeamId: "external-convex-team",
        cloudflareAccountId: "external-cloudflare-account",
        deletion: { state: "not_deleting" },
      });
      const folderId = await ctx.db.insert("ui_vaultFolders", {
        userId: ownerUserId,
        organizationId,
        name: "Cleanup folder",
        nameKey: "cleanup folder",
        position: 0,
        collapsed: false,
      });
      const folderAssignmentId = await ctx.db.insert("ui_vaultFolderAssignments", {
        userId: ownerUserId,
        organizationId,
        vaultId,
        folderId,
      });
      const treeSettingId = await ctx.db.insert("ui_vaultOrganizationTree_settings", {
        userId: ownerUserId,
        organizationId,
        collapsed: true,
      });
      const pullRequestFilterId = await ctx.db.insert("ui_vaultPullRequests_filters", {
        userId: ownerUserId,
        vaultId,
        hiddenLabels: ["internal"],
        includeDrafts: false,
        includeNoLabel: true,
      });
      const resourceLinkSettingId = await ctx.db.insert("ui_vaultResourceLinks_settings", {
        userId: ownerUserId,
        vaultId,
        updatedAt: 1,
        resourceLinksOpen: true,
      });
      const fileExpansionId = await ctx.db.insert("ui_vaultFileTree_folderExpansions", {
        userId: ownerUserId,
        vaultId,
        folderPath: "src",
        isExpanded: true,
      });

      const convexProjectId = await ctx.db.insert("vaultConvexProjects", {
        vaultId,
        organizationId,
        teamId: "external-convex-team",
        projectId: "external-convex-project",
        convexConfigPath: "convex.json",
        origin: "provisioned",
      });
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        organizationId,
        accountId: "external-cloudflare-account",
        workerName: "external-worker",
        workerTag: "external-worker-tag",
        origin: "provisioned",
      });
      const schemaSnapshotId = await ctx.db.insert("observations_vaultConvexSchema_snapshots", {
        vaultId,
        convexProjectId,
        deploymentName: "external-deployment",
        schemaHash: "schema-hash",
        graph: { tables: [], relationships: [], warnings: [] },
        fetchedAt: 1,
      });
      const schemaLayoutId = await ctx.db.insert("ui_vaultConvexSchemaGraph_nodeLayouts", {
        userId: ownerUserId,
        vaultId,
        convexProjectId,
        nodeId: "users",
        x: 1,
        y: 2,
        updatedAt: 1,
      });
      const branchTreeId = await ctx.db.insert("observations_vaultRepository_branchTrees", {
        vaultId,
        branch: "main",
        commitSHA: "commit-sha",
        treeData: { sha: "tree-sha", truncated: false, tree: [] },
        lastTreeRefreshAt: 1,
      });

      const storageId = await ctx.storage.store(new Blob(["stored organization data"]));
      const stagedFileId = await ctx.db.insert("vaultStagedFiles", {
        vaultId,
        fileDeleted: false,
        kind: "binary",
        filePath: "asset.bin",
        initialFilePath: "asset.bin",
        content: "",
        initialContent: "",
        storageId,
        parentCommitSha: null,
        lastEditTime: 1,
        lastEditUserId: ownerUserId,
        branch: "main",
        version: 1,
      });
      const observedBlobId = await ctx.db.insert("observations_vaultFiles_blobs", {
        vaultId,
        sha: "blob-sha",
        size: 24,
        storageId,
      });
      const sharedStorageId = await ctx.storage.store(new Blob(["shared stored data"]));
      const sharedObservedBlobId = await ctx.db.insert("observations_vaultFiles_blobs", {
        vaultId,
        sha: "shared-target-blob-sha",
        size: 18,
        storageId: sharedStorageId,
      });
      const preservedOtherVaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        organizationId: otherOrganizationId,
        convexTeamId: "other-external-convex-team",
        cloudflareAccountId: "other-external-cloudflare-account",
        deletion: { state: "not_deleting" },
      });
      const preservedOtherBlobId = await ctx.db.insert("observations_vaultFiles_blobs", {
        vaultId: preservedOtherVaultId,
        sha: "shared-preserved-blob-sha",
        size: 18,
        storageId: sharedStorageId,
      });
      const stagedUpdateId = await ctx.db.insert("vaultStagedFileUpdates", {
        vaultId,
        branch: "main",
        filePath: "asset.bin",
        version: 1,
        clientId: "cleanup-client",
        changes: "[]",
        userId: ownerUserId,
        timestamp: 1,
      });

      const provisioningPlanId = await ctx.db.insert("workflow_vaultProvisioning_plans", {
        vaultId,
        convexConfigPath: "convex.json",
        convex: { state: "planned", projectName: "external-project" },
        cloudflare: {
          state: "planned",
          workerName: "external-worker",
          rootDirectory: "/",
        },
        createdAt: 1,
        updatedAt: 1,
      });
      const provisioningRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        organizationId,
        userId: ownerUserId,
        vaultId,
        repositoryFullName: "CleanupOrg/external-repository",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 2,
      });
      const writeLockId = await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        lastWriteAt: {},
        updatedAt: 2,
        owner: {
          kind: "managed_run",
          runId: provisioningRunId,
        },
        state: "succeeded",
      });
      const provisioningEventId = await ctx.db.insert("workflow_vaultProvisioning_events", {
        userId: ownerUserId,
        vaultId,
        repositoryFullName: "CleanupOrg/external-repository",
        runId: provisioningRunId,
        step: "finish",
        level: "info",
        message: "Provisioning completed.",
        createdAt: 2,
      });
      const vaultDeletionRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "failed",
        organizationId,
        userId: ownerUserId,
        vaultId,
        repositoryFullName: "CleanupOrg/external-repository",
        createdAt: 3,
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
              owner: "CleanupOrg",
              name: "external-repository",
              repositoryFullName: "CleanupOrg/external-repository",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "no_confirmed_identity" },
          },
        },
        lastError: "Expected retained test history.",
        completedAt: 4,
      });
      const vaultDeletionEventId = await ctx.db.insert("workflow_vaultDeletion_events", {
        organizationId,
        userId: ownerUserId,
        vaultId,
        repositoryFullName: "CleanupOrg/external-repository",
        runId: vaultDeletionRunId,
        step: "initialize_deletion",
        level: "error",
        message: "Expected retained test history.",
        createdAt: 4,
      });

      const runId = await ctx.db.insert("workflow_organizationDeletion_runs", {
        state: "running",
        organization: {
          state: "active",
          organizationId,
          githubOwnerLogin: "CleanupOrg",
        },
        requestedByUserId: ownerUserId,
        currentStep: "delete_samebase_data",
        requestedAt: 5,
        updatedAt: 5,
        retryCount: 0,
        executionAttempt: 1,
        automaticRestartCount: 0,
        providerCleanup: { state: "not_required" },
      });
      await ctx.db.patch(organizationId, {
        deletion: { state: "deleting", runId, requestedAt: 5 },
      });
      const organizationDeletionEventId = await ctx.db.insert(
        "workflow_organizationDeletion_events",
        {
          runId,
          step: "delete_samebase_data",
          level: "info",
          message: "Deleting Samebase organization data.",
          createdAt: 5,
        },
      );

      return {
        organizationId,
        ownerUserId,
        preservedUserSettingId,
        preservedGitHubInstallationStateId,
        preservedOtherOrganizationSetupStateId,
        preservedOtherBlobId,
        preservedOtherVaultId,
        sharedStorageId,
        storageId,
        runId,
        provisioningRunId,
        deletedIds: [
          membershipId,
          billingId,
          invitationId,
          credentialId,
          oauthStateId,
          githubSetupStateId,
          vaultId,
          folderId,
          folderAssignmentId,
          treeSettingId,
          pullRequestFilterId,
          resourceLinkSettingId,
          fileExpansionId,
          convexProjectId,
          workerId,
          schemaSnapshotId,
          schemaLayoutId,
          branchTreeId,
          stagedFileId,
          observedBlobId,
          sharedObservedBlobId,
          stagedUpdateId,
          provisioningPlanId,
          provisioningRunId,
          writeLockId,
          provisioningEventId,
          vaultDeletionRunId,
          vaultDeletionEventId,
          organizationDeletionEventId,
        ],
      };
    });

    const componentWorkflowId = await t.mutation(components.workflow.workflow.create, {
      workflowName: "organization-deletion-cleanup-test",
      workflowHandle: "function://;organizationDeletion/cleanup:cleanupOrganizationDataBatch",
      workflowArgs: { organizationId: ids.organizationId },
      createOnly: true,
    });
    await t.mutation(components.workflow.workflow.cancel, {
      workflowId: componentWorkflowId,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.provisioningRunId, { workflowId: componentWorkflowId });
    });

    await runOrganizationCleanup(t, ids.runId);

    const result = await t.run(async (ctx) => ({
      deletedRows: await Promise.all(ids.deletedIds.map(async (rowId) => await ctx.db.get(rowId))),
      organization: await ctx.db.get(ids.organizationId),
      owner: await ctx.db.get(ids.ownerUserId),
      preservedUserSetting: await ctx.db.get(ids.preservedUserSettingId),
      preservedGitHubInstallationState: await ctx.db.get(ids.preservedGitHubInstallationStateId),
      preservedOtherOrganizationSetupState: await ctx.db.get(
        ids.preservedOtherOrganizationSetupStateId,
      ),
      preservedOtherBlob: await ctx.db.get(ids.preservedOtherBlobId),
      preservedOtherVault: await ctx.db.get(ids.preservedOtherVaultId),
      receipt: await ctx.db.get(ids.runId),
      sharedStorageExists: (await ctx.storage.get(ids.sharedStorageId)) !== null,
      storage: await ctx.storage.get(ids.storageId),
    }));
    const componentWorkflows = await t.query(components.workflow.workflow.list, {
      order: "asc",
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(result.deletedRows.every((row) => row === null)).toBe(true);
    expect(result.organization).toBeNull();
    expect(result.owner).not.toBeNull();
    expect(result.preservedUserSetting).not.toBeNull();
    expect(result.preservedGitHubInstallationState).not.toBeNull();
    expect(result.preservedOtherOrganizationSetupState).not.toBeNull();
    expect(result.preservedOtherBlob).not.toBeNull();
    expect(result.preservedOtherVault).not.toBeNull();
    expect(result.sharedStorageExists).toBe(true);
    expect(result.storage).toBeNull();
    expect(componentWorkflows.page).not.toContainEqual(
      expect.objectContaining({ workflowId: componentWorkflowId }),
    );
    expect(result.receipt).toMatchObject({
      state: "succeeded",
      organization: { state: "scrubbed" },
      currentStep: "finish",
      providerCleanup: { state: "not_required" },
    });
    expect(result.receipt).not.toHaveProperty("requestedByUserId");
    expect(result.receipt).not.toHaveProperty("executionAttempt");
  });

  it("removes active vault references before workflow rows and commits storage compensation", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const ownerUserId = await ctx.db.insert("users", {
        state: "active",
        email: "partial-cleanup-owner@example.invalid",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "partial-cleanup-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "PartialCleanup",
        githubOwnerLoginNormalized: "partialcleanup",
        githubInstallationId: "partial-cleanup-installation",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: ownerUserId,
        role: "owner",
      });
      const vaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        organizationId,
        convexTeamId: "external-convex-team",
        cloudflareAccountId: "external-cloudflare-account",
        deletion: { state: "not_deleting" },
      });
      const provisioningRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        organizationId,
        userId: ownerUserId,
        vaultId,
        repositoryFullName: "PartialCleanup/external-repository",
        trigger: "create",
        state: "failed",
        currentStep: "validate_connections",
        lastError: "Expected test failure.",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 2,
      });
      await ctx.db.replace(vaultId, {
        state: "failed",
        githubMode: "create_repository",
        organizationId,
        convexTeamId: "external-convex-team",
        cloudflareAccountId: "external-cloudflare-account",
        deletion: { state: "not_deleting" },
        runId: provisioningRunId,
        failedAt: 2,
        name: "external-repository",
        visibility: "private",
      });
      const runId = await ctx.db.insert("workflow_organizationDeletion_runs", {
        state: "running",
        organization: {
          state: "active",
          organizationId,
          githubOwnerLogin: "PartialCleanup",
        },
        requestedByUserId: ownerUserId,
        currentStep: "delete_samebase_data",
        requestedAt: 3,
        updatedAt: 3,
        retryCount: 0,
        executionAttempt: 1,
        automaticRestartCount: 0,
        providerCleanup: { state: "not_required" },
      });
      await ctx.db.patch(organizationId, {
        deletion: { state: "deleting", runId, requestedAt: 3 },
      });
      const eventId = await ctx.db.insert("workflow_organizationDeletion_events", {
        runId,
        step: "delete_samebase_data",
        level: "info",
        message: "Safe progress must survive vault cleanup.",
        createdAt: 3,
      });
      return { eventId, organizationId, provisioningRunId, runId, vaultId };
    });

    const disposableStorageId = await t.run(
      async (ctx) => await ctx.storage.store(new Blob(["late organization blob"])),
    );
    await expect(
      t.mutation(internal.gitOperations.saveFileBlob, {
        vaultId: ids.vaultId,
        sha: "late-blob-sha",
        size: 22,
        text: undefined,
        storageId: disposableStorageId,
        storageIdIsDisposable: true,
        ext: "bin",
        mime: "application/octet-stream",
      }),
    ).resolves.toBeNull();
    await expect(
      t.run(async (ctx) => await ctx.storage.get(disposableStorageId)),
    ).resolves.toBeNull();

    await expect(
      t.mutation(internal.organizationDeletion.cleanup.cleanupOrganizationDataBatch, {
        runId: ids.runId,
        executionAttempt: 1,
      }),
    ).resolves.toBe(false);
    const partial = await t.run(async (ctx) => ({
      event: await ctx.db.get(ids.eventId),
      provisioningRun: await ctx.db.get(ids.provisioningRunId),
      vault: await ctx.db.get(ids.vaultId),
    }));
    expect(partial.event).not.toBeNull();
    expect(partial.provisioningRun).not.toBeNull();
    expect(partial.vault).toMatchObject({
      state: "not_connected",
      deletion: { state: "not_deleting" },
    });
    expect(partial.vault).not.toHaveProperty("runId");
  });

  it("keeps progress history when the final membership invariant fails", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const ownerUserId = await ctx.db.insert("users", {
        state: "active",
        email: "finalization-owner@example.invalid",
        isApproved: true,
      });
      const otherUserId = await ctx.db.insert("users", {
        state: "active",
        email: "finalization-member@example.invalid",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "finalization-owner-id",
        githubOwnerType: "organization",
        githubOwnerLogin: "FinalizationOrg",
        githubOwnerLoginNormalized: "finalizationorg",
        githubInstallationId: "finalization-installation",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: ownerUserId,
        role: "owner",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: otherUserId,
        role: "member",
      });
      const runId = await ctx.db.insert("workflow_organizationDeletion_runs", {
        state: "running",
        organization: {
          state: "active",
          organizationId,
          githubOwnerLogin: "FinalizationOrg",
        },
        requestedByUserId: ownerUserId,
        currentStep: "delete_samebase_data",
        requestedAt: 1,
        updatedAt: 1,
        retryCount: 0,
        executionAttempt: 1,
        automaticRestartCount: 0,
        providerCleanup: { state: "not_required" },
      });
      await ctx.db.patch(organizationId, {
        deletion: { state: "deleting", runId, requestedAt: 1 },
      });
      const eventId = await ctx.db.insert("workflow_organizationDeletion_events", {
        runId,
        step: "delete_samebase_data",
        level: "info",
        message: "Progress remains until finalization succeeds.",
        createdAt: 1,
      });
      return { eventId, organizationId, runId };
    });

    await expect(
      t.mutation(internal.organizationDeletion.cleanup.cleanupOrganizationDataBatch, {
        runId: ids.runId,
        executionAttempt: 1,
      }),
    ).rejects.toThrow("Organization membership changed before deletion finished.");
    const result = await t.run(async (ctx) => ({
      event: await ctx.db.get(ids.eventId),
      organization: await ctx.db.get(ids.organizationId),
    }));
    expect(result.event).not.toBeNull();
    expect(result.organization).not.toBeNull();
  });
});
