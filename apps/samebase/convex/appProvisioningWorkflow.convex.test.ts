import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

async function createFinishableComposedInfrastructure() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/composed-finish",
      trigger: "retry",
      state: "running",
      currentStep: "wire_convex_build_access",
      createdAt: 10,
      updatedAt: 20,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "create_repository",
      runId,
      ghRepoId: "123",
      owner: "ada",
      name: "composed-finish",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
    });
    const appId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory: "/",
      createdAt: 12,
    });
    const convexDeploymentId = await ctx.db.insert("vaultConvexDeployments", {
      upstream: { state: "present" },
      vaultId,
      userId,
      appId,
      teamId: "convex-team",
      projectId: "convex-project",
      teamSlug: "ada-team",
      projectSlug: "composed-finish",
      deploymentName: "composed-finish-prod",
      deploymentType: "prod",
      cloudUrl: "https://composed-finish-prod.convex.cloud",
      siteUrl: "https://composed-finish-prod.convex.site",
      origin: "provisioned",
      connectedAt: 30,
      lastObservedAt: 30,
    });
    const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
      upstream: { state: "present" },
      vaultId,
      userId,
      appId,
      accountId: "cloudflare-account",
      workerName: "composed-finish",
      workerTag: "composed-finish-worker-tag",
      workersDev: { state: "available", url: "https://composed-finish.workers.dev" },
      origin: "provisioned",
      builds: {
        state: "connected",
        buildCommand: "pnpm run build",
        deployCommand: "pnpm run deploy",
        previewDeployCommand: "pnpm run deploy:preview",
        pathIncludes: ["*"],
        pathExcludes: [],
        production: {
          triggerUuid: "production-trigger",
          buildTokenUuid: "build-token",
        },
        preview: {
          triggerUuid: "preview-trigger",
          buildTokenUuid: "build-token",
        },
      },
      connectedAt: 30,
      lastObservedAt: 30,
    });
    const dependencyId = await ctx.db.insert("vaultWorkerDeploymentDependencies", {
      vaultId,
      userId,
      workerId,
      convexDeploymentId,
      wiring: {
        state: "wired",
        deployKeys: {
          production: {
            state: "created",
            name: "production-key",
            deploymentName: "composed-finish-prod",
          },
          preview: {
            state: "created",
            name: "preview-key",
            projectId: "convex-project",
          },
        },
      },
      createdAt: 30,
      updatedAt: 30,
    });
    await ctx.db.insert("vaultInfrastructureTargets", {
      vaultId,
      appId,
      convex: { teamId: "convex-team", projectName: "composed-finish" },
      cloudflare: {
        state: "attached",
        accountId: "cloudflare-account",
        workerName: "composed-finish",
        workerId,
      },
      createdAt: 12,
    });
    await ctx.db.insert("vaultInfrastructureOwnership", {
      vaultId,
      runId,
      state: "active",
      updatedAt: 20,
    });
    return { appId, convexDeploymentId, dependencyId, runId, userId, vaultId, workerId };
  });
  return { ids, t };
}

describe("app provisioning workflow composition", () => {
  it("reads the target app and explicit provider dependency state", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/composed-app",
        trigger: "create",
        state: "running",
        currentStep: "sync_tree",
        createdAt: 10,
        updatedAt: 20,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "composed-app",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 12,
      });
      const appId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "/",
        createdAt: 25,
      });
      const targetId = await ctx.db.insert("vaultInfrastructureTargets", {
        vaultId,
        appId,
        convex: {
          teamId: "convex-team",
          projectName: "composed-app",
        },
        cloudflare: {
          state: "planned",
          accountId: "cloudflare-account",
          workerName: "composed-app",
        },
        createdAt: 30,
      });
      return { appId, targetId, userId, vaultId };
    });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      appId: ids.appId,
      convex: {
        state: "not_attached",
        teamId: "convex-team",
        projectName: "composed-app",
      },
      cloudflare: {
        state: "not_attached",
        accountId: "cloudflare-account",
        workerName: "composed-app",
      },
    });

    const providerIds = await t.run(async (ctx) => {
      const convexDeploymentId = await ctx.db.insert("vaultConvexDeployments", {
        upstream: { state: "present" },
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        teamId: "convex-team",
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "composed-app",
        deploymentName: "composed-app-prod",
        deploymentType: "prod",
        cloudUrl: "https://composed-app-prod.convex.cloud",
        siteUrl: "https://composed-app-prod.convex.site",
        origin: "provisioned",
        connectedAt: 40,
        lastObservedAt: 40,
      });
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        upstream: { state: "present" },
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "cloudflare-account",
        workerName: "composed-app",
        workerTag: "composed-worker-tag",
        workersDev: { state: "available", url: "https://composed-app.ada.workers.dev" },
        origin: "provisioned",
        builds: {
          state: "connected",
          buildCommand: "pnpm run build",
          deployCommand: "pnpm run deploy",
          previewDeployCommand: "pnpm run deploy:preview",
          pathIncludes: ["*"],
          pathExcludes: [],
          production: {
            triggerUuid: "production-trigger",
            buildTokenUuid: "build-token",
          },
          preview: {
            triggerUuid: "preview-trigger",
            buildTokenUuid: "build-token",
          },
        },
        connectedAt: 50,
        lastObservedAt: 50,
      });
      await ctx.db.patch(ids.targetId, {
        cloudflare: {
          state: "attached",
          accountId: "cloudflare-account",
          workerName: "composed-app",
          workerId,
        },
      });
      await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        workerId,
        convexDeploymentId,
        wiring: {
          state: "wired",
          deployKeys: {
            production: {
              state: "created",
              name: "prod-key",
              deploymentName: "composed-app-prod",
            },
            preview: {
              state: "created",
              name: "preview-key",
              projectId: "convex-project",
            },
          },
        },
        createdAt: 50,
        updatedAt: 50,
      });
      return { convexDeploymentId, workerId };
    });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      appId: ids.appId,
      convex: {
        state: "attached",
        teamId: "convex-team",
        projectName: "composed-app",
        deploymentId: providerIds.convexDeploymentId,
      },
      cloudflare: {
        state: "attached",
        accountId: "cloudflare-account",
        workerName: "composed-app",
        workerId: providerIds.workerId,
        convexBuildAccessWired: true,
        workersDev: { state: "available", url: "https://composed-app.ada.workers.dev" },
      },
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(providerIds.workerId, {
        workerName: "composed-app-renamed",
      });
    });
    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toMatchObject({
      cloudflare: {
        state: "attached",
        workerId: providerIds.workerId,
        workerName: "composed-app-renamed",
      },
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(providerIds.workerId, {
        workerName: "composed-app",
      });
    });

    await t.run(async (ctx) => {
      const convexDeployment = await ctx.db.get(providerIds.convexDeploymentId);
      if (!convexDeployment) {
        throw new Error("Expected Convex deployment.");
      }
      await ctx.db.patch(convexDeployment._id, {
        upstream: { state: "missing_upstream" },
      });
    });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      appId: ids.appId,
      convex: {
        state: "not_attached",
        teamId: "convex-team",
        projectName: "composed-app",
      },
      cloudflare: {
        state: "attached",
        accountId: "cloudflare-account",
        workerName: "composed-app",
        workerId: providerIds.workerId,
        convexBuildAccessWired: false,
        workersDev: { state: "available", url: "https://composed-app.ada.workers.dev" },
      },
    });

    await t.run(async (ctx) => {
      const worker = await ctx.db.get(providerIds.workerId);
      if (!worker) {
        throw new Error("Expected Cloudflare Worker.");
      }
      await ctx.db.patch(worker._id, {
        upstream: { state: "missing_upstream" },
      });
    });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      appId: ids.appId,
      convex: {
        state: "not_attached",
        teamId: "convex-team",
        projectName: "composed-app",
      },
      cloudflare: {
        state: "not_attached",
        accountId: "cloudflare-account",
        workerName: "composed-app",
      },
    });
  });

  it.each([
    {
      description: "unanswered provider requests",
      cloudflareLifecycle: { state: "creating" } as const,
      convexLifecycle: { state: "creating" } as const,
    },
    {
      description: "response-confirmed provider requests",
      cloudflareLifecycle: { state: "created", workerTag: "created-worker-tag" } as const,
      convexLifecycle: { state: "created", projectId: "created-project-id" } as const,
    },
  ])("transfers $description to a composed retry run", async (testCase) => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const originalRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/composed-retry",
        trigger: "create",
        state: "failed",
        currentStep: "attach_worker",
        lastError: "Provider response was interrupted.",
        createdAt: 10,
        updatedAt: 20,
        completedAt: 20,
      });
      const retryRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/composed-retry",
        trigger: "retry",
        state: "queued",
        currentStep: "run_created",
        createdAt: 30,
        updatedAt: 30,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId: originalRunId,
        ghRepoId: "123",
        owner: "ada",
        name: "composed-retry",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 12,
      });
      const appId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "/",
        createdAt: 12,
      });
      await ctx.db.insert("vaultInfrastructureTargets", {
        vaultId,
        appId,
        convex: { teamId: "convex-team", projectName: "composed-retry" },
        cloudflare: {
          state: "planned",
          accountId: "cloudflare-account",
          workerName: "composed-retry",
        },
        createdAt: 12,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId: originalRunId,
        state: "failed",
        updatedAt: 20,
      });
      await ctx.db.insert("vaultConvexProjectCreationClaims", {
        vaultId,
        userId,
        appId,
        runId: originalRunId,
        teamId: "convex-team",
        projectName: "composed-retry",
        lifecycle: testCase.convexLifecycle,
        createdAt: 15,
        updatedAt: 15,
      });
      await ctx.db.insert("vaultCloudflareWorkerCreationClaims", {
        vaultId,
        userId,
        appId,
        runId: originalRunId,
        accountId: "cloudflare-account",
        workerName: "composed-retry",
        lifecycle: testCase.cloudflareLifecycle,
        createdAt: 15,
        updatedAt: 15,
      });
      return { appId, retryRunId, userId, vaultId };
    });

    await expect(
      t.mutation(internal.appProvisioningWorkflow.claimComposedInfrastructureProvisioning, {
        vaultId: ids.vaultId,
        runId: ids.retryRunId,
        userId: ids.userId,
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      Promise.all([
        t.query(internal.vault.convexMutations.readConvexProjectCreationClaimForRun, {
          vaultId: ids.vaultId,
          runId: ids.retryRunId,
          userId: ids.userId,
          appId: ids.appId,
        }),
        t.query(internal.vault.cloudflareMutations.readCloudflareWorkerCreationClaimForRun, {
          vaultId: ids.vaultId,
          runId: ids.retryRunId,
          userId: ids.userId,
          appId: ids.appId,
        }),
      ]),
    ).resolves.toEqual([
      {
        claimId: expect.any(String),
        lifecycle: testCase.convexLifecycle,
        projectName: "composed-retry",
        teamId: "convex-team",
      },
      {
        accountId: "cloudflare-account",
        claimId: expect.any(String),
        lifecycle: testCase.cloudflareLifecycle,
        workerName: "composed-retry",
      },
    ]);

    await expect(
      t.run(async (ctx) => {
        const ownership = await ctx.db
          .query("vaultInfrastructureOwnership")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique();
        const events = await ctx.db
          .query("appProvisioningEvents")
          .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.retryRunId))
          .collect();
        const convexClaim = await ctx.db
          .query("vaultConvexProjectCreationClaims")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique();
        const cloudflareClaim = await ctx.db
          .query("vaultCloudflareWorkerCreationClaims")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique();
        return {
          cloudflareClaim,
          convexClaim,
          events,
          ownership,
          run: await ctx.db.get(ids.retryRunId),
        };
      }),
    ).resolves.toMatchObject({
      cloudflareClaim: { runId: ids.retryRunId },
      convexClaim: { runId: ids.retryRunId },
      events: [{ step: "claim_infra" }],
      ownership: { runId: ids.retryRunId, state: "active" },
      run: { currentStep: "claim_infra", state: "running" },
    });
  });

  it("finishes a complete composed graph atomically and idempotently", async () => {
    const { ids, t } = await createFinishableComposedInfrastructure();
    const finishArgs = {
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
    };

    await expect(
      t.mutation(
        internal.appProvisioningWorkflow.finishComposedInfrastructureProvisioning,
        finishArgs,
      ),
    ).resolves.toBeNull();
    await expect(
      t.mutation(
        internal.appProvisioningWorkflow.finishComposedInfrastructureProvisioning,
        finishArgs,
      ),
    ).resolves.toBeNull();

    await expect(
      t.run(async (ctx) => {
        const ownership = await ctx.db
          .query("vaultInfrastructureOwnership")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique();
        const events = await ctx.db
          .query("appProvisioningEvents")
          .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
          .collect();
        return { events, ownership, run: await ctx.db.get(ids.runId) };
      }),
    ).resolves.toMatchObject({
      events: [{ message: "App infrastructure is ready.", step: "finish" }],
      ownership: { runId: ids.runId, state: "succeeded" },
      run: { currentStep: "finish", state: "succeeded" },
    });
  });

  it.each([
    ["unconsumed provider claims", "claims"],
    ["a missing Worker", "worker"],
    ["disconnected Worker Builds", "builds"],
    ["a missing Convex deployment", "deployment"],
    ["no Worker deployment dependency", "dependency"],
    ["an unwired Worker deployment dependency", "wiring"],
  ] as const)("rejects completion with %s", async (_description, incompleteState) => {
    const { ids, t } = await createFinishableComposedInfrastructure();
    await t.run(async (ctx) => {
      switch (incompleteState) {
        case "claims":
          await ctx.db.insert("vaultConvexProjectCreationClaims", {
            vaultId: ids.vaultId,
            userId: ids.userId,
            appId: ids.appId,
            runId: ids.runId,
            teamId: "convex-team",
            projectName: "composed-finish",
            lifecycle: { state: "creating" },
            createdAt: 30,
            updatedAt: 30,
          });
          break;
        case "worker":
          await ctx.db.patch(ids.workerId, { upstream: { state: "missing_upstream" } });
          break;
        case "builds":
          await ctx.db.patch(ids.workerId, { builds: { state: "not_connected" } });
          break;
        case "deployment":
          await ctx.db.patch(ids.convexDeploymentId, {
            upstream: { state: "missing_upstream" },
          });
          break;
        case "dependency":
          await ctx.db.delete(ids.dependencyId);
          break;
        case "wiring": {
          const dependency = await ctx.db.get(ids.dependencyId);
          if (!dependency) {
            throw new Error("Expected Worker deployment dependency.");
          }
          await ctx.db.patch(dependency._id, {
            wiring: {
              state: "not_wired",
              deployKeys: dependency.wiring.deployKeys,
            },
          });
          break;
        }
        default:
          incompleteState satisfies never;
      }
    });

    await expect(
      t.mutation(internal.appProvisioningWorkflow.finishComposedInfrastructureProvisioning, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
      }),
    ).rejects.toThrow();
    await expect(
      t.run(async (ctx) => {
        const ownership = await ctx.db
          .query("vaultInfrastructureOwnership")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique();
        const events = await ctx.db
          .query("appProvisioningEvents")
          .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
          .collect();
        return { events, ownership, run: await ctx.db.get(ids.runId) };
      }),
    ).resolves.toMatchObject({
      events: [],
      ownership: { runId: ids.runId, state: "active" },
      run: { currentStep: "wire_convex_build_access", state: "running" },
    });
  });
});
