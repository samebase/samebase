import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

type ActiveOperation = "active_managed_lock" | "deletion";

async function createGuardedAttachmentFixture(operation: ActiveOperation) {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {});
    await ctx.db.insert("organizationMemberships", { organizationId, userId });
    const githubProviderConnectionId = await ctx.db.insert("providerConnections", {
      kind: "github",
      state: "connected",
      organizationId,
      connectedByUserId: userId,
      auth: { method: "api_key", credential: "github-token" },
      accountId: "github-ada",
      createdAt: 1,
      updatedAt: 1,
    });
    const convexProviderConnectionId = await ctx.db.insert("providerConnections", {
      kind: "convex",
      state: "connected",
      organizationId,
      connectedByUserId: userId,
      auth: { method: "api_key", credential: "convex-token" },
      teamId: "team-1",
      createdAt: 1,
      updatedAt: 1,
    });
    const cloudflareProviderConnectionId = await ctx.db.insert("providerConnections", {
      kind: "cloudflare",
      state: "connected",
      organizationId,
      connectedByUserId: userId,
      auth: { method: "api_key", credential: "cloudflare-token" },
      defaultAccount: { state: "not_selected" },
      createdAt: 1,
      updatedAt: 1,
    });
    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const completedRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      requestedByUserId: userId,
      vaultId,
      repositoryFullName: "ada/guarded-attachments",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 2,
    });
    await ctx.db.replace(vaultId, {
      organizationId,
      githubProviderConnectionId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId: completedRunId,
      ghRepoId: "github-repository",
      owner: "ada",
      name: "guarded-attachments",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 3,
    });
    const convexProjectId = await ctx.db.insert("vaultConvexProjects", {
      vaultId,
      organizationId,
      providerConnectionId: convexProviderConnectionId,
      teamId: "team-1",
      projectId: "project-1",
      convexConfigPath: "convex.json",
      origin: "selected_existing",
    });
    const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId,
      organizationId,
      providerConnectionId: cloudflareProviderConnectionId,
      accountId: "account-1",
      workerName: "worker-1",
      workerTag: "worker-tag-1",
      origin: "selected_existing",
    });

    switch (operation) {
      case "active_managed_lock":
        {
          const managedRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
            requestedByUserId: userId,
            vaultId,
            repositoryFullName: "ada/guarded-attachments",
            trigger: "retry",
            state: "running",
            currentStep: "claim_infra",
            createdAt: 10,
            updatedAt: 10,
          });
          await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
            vaultId,
            owner: { kind: "managed_run", runId: managedRunId },
            state: "active",
            lastWriteAt: {},
            updatedAt: 10,
          });
        }
        break;
      case "deletion": {
        const deletionRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
          state: "queued",
          requestedByUserId: userId,
          vaultId,
          repositoryFullName: "ada/guarded-attachments",
          createdAt: 10,
          updatedAt: 10,
          attempt: { kind: "initial" },
          workflow: { state: "not_started" },
          currentStep: "initialize_deletion",
          snapshot: {
            state: "retained_for_retry",
            plan: {
              target: {
                kind: "existing_repository",
                ghRepoId: "github-repository",
                owner: "ada",
                name: "guarded-attachments",
                repositoryFullName: "ada/guarded-attachments",
              },
              convex: { action: "skip", reason: "not_requested" },
              cloudflare: { action: "skip", reason: "not_requested" },
              githubRepository: { action: "skip", reason: "not_requested" },
            },
          },
        });
        await ctx.db.patch(vaultId, {
          deletion: {
            state: "deleting",
            runId: deletionRunId,
            requestedAt: 10,
          },
        });
        break;
      }
      default:
        operation satisfies never;
    }

    return {
      cloudflareProviderConnectionId,
      convexProjectId,
      convexProviderConnectionId,
      userId,
      vaultId,
      workerId,
    };
  });

  return { ids, t };
}

describe.each([
  [
    "an active managed lock",
    "active_managed_lock",
    "Another vault infrastructure operation is active.",
  ],
  ["vault deletion", "deletion", "Vault deletion is in progress."],
] as const)("provider attachment guards with %s", (_label, operation, expectedError) => {
  it("rejects all Convex and Cloudflare attachment changes", async () => {
    const { ids, t } = await createGuardedAttachmentFixture(operation);

    await expect(
      t.mutation(internal.vault.convexMutations.attachProjects, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        providerConnectionId: ids.convexProviderConnectionId,
        projects: [
          {
            teamId: "team-2",
            projectId: "project-2",
            codeLocation: { kind: "config", convexConfigPath: "apps/web/convex.json" },
            origin: "selected_existing",
          },
        ],
      }),
    ).rejects.toThrow(expectedError);
    await expect(
      t.mutation(internal.vault.convexMutations.reconcileProjectTeam, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        convexProjectId: ids.convexProjectId,
        projectId: "project-1",
        expectedTeamId: "team-1",
        nextTeamId: "team-2",
      }),
    ).rejects.toThrow(expectedError);
    await expect(
      t.mutation(internal.vault.convexMutations.reconcileProjectCodeLocation, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        convexProjectId: ids.convexProjectId,
        projectId: "project-1",
        expectedCodeLocation: { kind: "config", convexConfigPath: "convex.json" },
        nextCodeLocation: { kind: "config", convexConfigPath: "apps/web/convex.json" },
      }),
    ).rejects.toThrow(expectedError);
    await expect(
      t.mutation(internal.vault.convexMutations.detachProject, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        convexProjectId: ids.convexProjectId,
        teamId: "team-1",
        projectId: "project-1",
        codeLocation: { kind: "config", convexConfigPath: "convex.json" },
      }),
    ).rejects.toThrow(expectedError);
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        providerConnectionId: ids.cloudflareProviderConnectionId,
        workers: [
          {
            accountId: "account-1",
            workerName: "worker-2",
            workerTag: "worker-tag-2",
            origin: "selected_existing",
          },
        ],
      }),
    ).rejects.toThrow(expectedError);
    await expect(
      t.mutation(internal.vault.cloudflareMutations.detachWorker, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        workerId: ids.workerId,
        accountId: "account-1",
        workerName: "worker-1",
        workerTag: "worker-tag-1",
      }),
    ).rejects.toThrow(expectedError);
  });
});
