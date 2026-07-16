import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { AppProvisioningRunTrigger } from "../schema";
import { makeConvexTest } from "../test.setup";
import type { VaultCloudflareConnectedBuilds, VaultWorkerDeploymentWiring } from "./model";

const WEB_ROOT_DIRECTORY = "apps/web";
const CONVEX_ROOT_DIRECTORY = "packages/backend";
const MOBILE_ROOT_DIRECTORY = "apps/mobile";
const CLOUDFLARE_ACCOUNT_ID = "cloudflare-account";

const WEB_ONLY_BUILDS: VaultCloudflareConnectedBuilds = {
  state: "connected",
  buildCommand: "pnpm run build",
  deployCommand: "pnpm run deploy",
  previewDeployCommand: "pnpm run deploy:preview",
  pathIncludes: [
    "apps/web/*",
    ".node-version",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ],
  pathExcludes: [],
  production: {
    triggerUuid: "production-trigger",
    buildTokenUuid: "production-token",
  },
  preview: {
    triggerUuid: "preview-trigger",
    buildTokenUuid: "preview-token",
  },
};

const DEPENDENCY_AWARE_BUILDS: VaultCloudflareConnectedBuilds = {
  ...WEB_ONLY_BUILDS,
  pathIncludes: [...WEB_ONLY_BUILDS.pathIncludes, "packages/backend/*"],
};

async function createVaultFixture() {
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
    const sourceRunId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/monorepo",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 10,
      updatedAt: 20,
      completedAt: 20,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId: sourceRunId,
      ghRepoId: "123",
      ghRepoNodeId: "R_123",
      githubOwner: "ada",
      githubName: "monorepo",
      routeRepositoryKey: "ada/monorepo",
      routeOwner: "ada",
      routeName: "monorepo",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 20,
    });
    const webAppId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory: WEB_ROOT_DIRECTORY,
      createdAt: 30,
    });
    const convexAppId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory: CONVEX_ROOT_DIRECTORY,
      createdAt: 31,
    });
    const mobileAppId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory: MOBILE_ROOT_DIRECTORY,
      createdAt: 32,
    });

    return { convexAppId, mobileAppId, userId, vaultId, webAppId };
  });

  return { ids, t };
}

type TestBackend = ReturnType<typeof makeConvexTest>;
type VaultFixtureIds = Awaited<ReturnType<typeof createVaultFixture>>["ids"];

async function createRun(
  t: TestBackend,
  ids: VaultFixtureIds,
  trigger: AppProvisioningRunTrigger,
): Promise<Id<"appProvisioningRuns">> {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/monorepo",
        trigger,
        state: "queued",
        currentStep: "run_created",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
  );
}

async function attachWorker(
  t: TestBackend,
  ids: VaultFixtureIds,
  workerName: string,
  appId: Id<"vaultApps"> = ids.webAppId,
): Promise<Id<"vaultCloudflareWorkers">> {
  return await t.mutation(internal.vault.cloudflareMutations.attachWorker, {
    vaultId: ids.vaultId,
    userId: ids.userId,
    appId,
    accountId: CLOUDFLARE_ACCOUNT_ID,
    workerName,
    workerTag: `${workerName}-tag`,
    origin: "selected_existing",
  });
}

async function insertConvexDeployment(
  t: TestBackend,
  ids: VaultFixtureIds,
): Promise<Id<"vaultConvexDeployments">> {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.convexAppId,
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "monorepo",
        deploymentName: "monorepo-prod",
        deploymentType: "prod",
        cloudUrl: "https://monorepo.convex.cloud",
        siteUrl: "https://monorepo.convex.site",
        previewDeployment: { state: "not_ensured" },
        origin: "selected_existing",
        upstream: { state: "present" },
        connectedAt: 40,
        lastObservedAt: 40,
      }),
  );
}

async function setWorkerBuilds(
  t: TestBackend,
  workerId: Id<"vaultCloudflareWorkers">,
  builds: VaultCloudflareConnectedBuilds,
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.patch(workerId, { builds });
  });
}

async function insertDependency(
  t: TestBackend,
  ids: VaultFixtureIds,
  workerId: Id<"vaultCloudflareWorkers">,
  convexDeploymentId: Id<"vaultConvexDeployments">,
  wiring: VaultWorkerDeploymentWiring,
): Promise<Id<"vaultWorkerDeploymentDependencies">> {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        workerId,
        convexDeploymentId,
        wiring,
        createdAt: 50,
        updatedAt: 50,
      }),
  );
}

describe("Cloudflare Worker persistence", () => {
  it("attaches provider resources by stable app id and allows multiple Workers on one app", async () => {
    const { ids, t } = await createVaultFixture();
    const runId = await createRun(t, ids, "connect_cloudflare_worker");

    await expect(
      t.query(internal.vault.cloudflareMutations.readCloudflareWorkerDiscoveryContext, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.webAppId,
      }),
    ).resolves.toEqual({
      ghRepoId: "123",
      repositoryFullName: "ada/monorepo",
      expectedRootDirectory: WEB_ROOT_DIRECTORY,
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
        vaultId: ids.vaultId,
        runId,
        userId: ids.userId,
        appId: ids.webAppId,
        accountId: CLOUDFLARE_ACCOUNT_ID,
        workerName: "web-worker",
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ claimed: true });
    const attachment = await t.mutation(internal.vault.cloudflareMutations.attachWorkerForRun, {
      vaultId: ids.vaultId,
      runId,
      userId: ids.userId,
      appId: ids.webAppId,
      accountId: CLOUDFLARE_ACCOUNT_ID,
      workerName: "web-worker",
      workerTag: "web-worker-tag",
      origin: "selected_existing",
    });
    if (attachment.state !== "attached") {
      throw new Error("Expected Worker attachment.");
    }
    await t.mutation(internal.vault.cloudflareMutations.finishCloudflareWorkerConnection, {
      vaultId: ids.vaultId,
      runId,
      userId: ids.userId,
      workerId: attachment.workerId,
    });

    const secondWorkerId = await attachWorker(t, ids, "web-worker-secondary");
    const workers = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultCloudflareWorkers")
          .withIndex("by_app", (q) => q.eq("appId", ids.webAppId))
          .collect(),
    );
    const mobileWorkers = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultCloudflareWorkers")
          .withIndex("by_app", (q) => q.eq("appId", ids.mobileAppId))
          .collect(),
    );

    expect(workers.map((worker) => worker._id)).toEqual(
      expect.arrayContaining([attachment.workerId, secondWorkerId]),
    );
    expect(workers).toHaveLength(2);
    expect(workers.every((worker) => worker.appId === ids.webAppId)).toBe(true);
    expect(workers.every((worker) => worker.builds.state === "not_connected")).toBe(true);
    expect(workers[0]).not.toHaveProperty("rootDirectory");
    expect(mobileWorkers).toEqual([]);

    await expect(attachWorker(t, ids, "web-worker", ids.convexAppId)).rejects.toThrow(
      "Cloudflare Worker is already attached to this vault.",
    );
  });

  it("builds from the Worker root and every explicit Convex dependency root", async () => {
    const { ids, t } = await createVaultFixture();
    const workerId = await attachWorker(t, ids, "web-worker");
    const convexDeploymentId = await insertConvexDeployment(t, ids);
    await insertDependency(t, ids, workerId, convexDeploymentId, {
      state: "not_wired",
      deployKeys: {
        production: { state: "not_created" },
        preview: { state: "not_created" },
      },
    });
    const runId = await createRun(t, ids, "wire_builds");
    const runArgs = {
      vaultId: ids.vaultId,
      runId,
      userId: ids.userId,
      workerId,
    };

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareBuildsWiring, runArgs),
    ).resolves.toEqual({ claimed: true });
    const active = await t.query(
      internal.vault.cloudflareMutations.readActiveCloudflareBuildsWiring,
      runArgs,
    );
    expect(active).toMatchObject({
      active: true,
      hasConvexDeployment: true,
      app: {
        appId: ids.webAppId,
        rootDirectory: WEB_ROOT_DIRECTORY,
      },
      worker: { workerId },
      buildConfig: {
        rootDirectory: WEB_ROOT_DIRECTORY,
        pathIncludes: DEPENDENCY_AWARE_BUILDS.pathIncludes,
      },
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareBuildsForRun, {
        ...runArgs,
        builds: DEPENDENCY_AWARE_BUILDS,
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareBuildsWiring, runArgs),
    ).resolves.toBeNull();

    await expect(t.run(async (ctx) => await ctx.db.get(workerId))).resolves.toMatchObject({
      appId: ids.webAppId,
      builds: DEPENDENCY_AWARE_BUILDS,
    });
  });
});

describe("Worker to Convex deployment dependencies", () => {
  it("stores partial and wired deploy-key state on the explicit cross-root relation", async () => {
    const { ids, t } = await createVaultFixture();
    const workerId = await attachWorker(t, ids, "web-worker");
    await setWorkerBuilds(t, workerId, WEB_ONLY_BUILDS);
    const convexDeploymentId = await insertConvexDeployment(t, ids);
    const runId = await createRun(t, ids, "wire_convex_build_access");
    const runArgs = {
      vaultId: ids.vaultId,
      runId,
      userId: ids.userId,
      workerId,
      convexDeploymentId,
    };

    await expect(
      t.mutation(
        internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring,
        runArgs,
      ),
    ).resolves.toEqual({ claimed: true });
    const active = await t.query(
      internal.vault.cloudflareMutations.readActiveCloudflareConvexBuildAccessWiring,
      runArgs,
    );
    expect(active).toMatchObject({
      active: true,
      workerApp: {
        appId: ids.webAppId,
        rootDirectory: WEB_ROOT_DIRECTORY,
      },
      convexApp: {
        appId: ids.convexAppId,
        rootDirectory: CONVEX_ROOT_DIRECTORY,
      },
      worker: {
        workerId,
        builds: { pathIncludes: DEPENDENCY_AWARE_BUILDS.pathIncludes },
      },
      convex: { convexDeploymentId },
      dependency: {
        wiring: {
          state: "not_wired",
          deployKeys: {
            production: { state: "not_created" },
            preview: { state: "not_created" },
          },
        },
      },
    });

    await t.mutation(
      internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessDeployKey,
      {
        ...runArgs,
        deployment: "production",
        convexDeployKeyName: "production-key-name",
      },
    );
    const partialDependency = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultWorkerDeploymentDependencies")
          .withIndex("by_worker", (q) => q.eq("workerId", workerId))
          .unique(),
    );
    expect(partialDependency).toMatchObject({
      workerId,
      convexDeploymentId,
      wiring: {
        state: "not_wired",
        deployKeys: {
          production: { state: "created", name: "production-key-name" },
          preview: { state: "not_created" },
        },
      },
    });

    await t.mutation(
      internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessDeployKey,
      {
        ...runArgs,
        deployment: "preview",
        convexDeployKeyName: "preview-key-name",
      },
    );
    await t.mutation(internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessForRun, {
      ...runArgs,
      builds: DEPENDENCY_AWARE_BUILDS,
      previewDeployment: {
        state: "ready",
        deploymentName: "monorepo-preview",
        cloudUrl: "https://monorepo-preview.convex.cloud",
      },
    });
    await t.mutation(
      internal.vault.cloudflareMutations.finishCloudflareConvexBuildAccessWiring,
      runArgs,
    );

    const persisted = await t.run(async (ctx) => {
      const dependency = await ctx.db
        .query("vaultWorkerDeploymentDependencies")
        .withIndex("by_worker", (q) => q.eq("workerId", workerId))
        .unique();
      return {
        convexDeployment: await ctx.db.get(convexDeploymentId),
        dependency,
        worker: await ctx.db.get(workerId),
      };
    });
    expect(persisted.dependency).toMatchObject({
      wiring: {
        state: "wired",
        deployKeys: {
          production: { state: "created", name: "production-key-name" },
          preview: { state: "created", name: "preview-key-name" },
        },
      },
    });
    expect(persisted.convexDeployment).toMatchObject({
      appId: ids.convexAppId,
      previewDeployment: {
        state: "ready",
        deploymentName: "monorepo-preview",
      },
    });
    expect(persisted.convexDeployment).not.toHaveProperty("deployKeys");
    expect(persisted.worker).toMatchObject({
      appId: ids.webAppId,
      builds: { pathIncludes: DEPENDENCY_AWARE_BUILDS.pathIncludes },
    });
    expect(persisted.worker).not.toHaveProperty("convexBuildAccess");

    const rotationRunId = await createRun(t, ids, "wire_convex_build_access");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring, {
        ...runArgs,
        runId: rotationRunId,
      }),
    ).resolves.toEqual({ claimed: true });
    const dependencies = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultWorkerDeploymentDependencies")
          .withIndex("by_convex_deployment", (q) => q.eq("convexDeploymentId", convexDeploymentId))
          .collect(),
    );
    expect(dependencies).toHaveLength(1);
    expect(dependencies[0]?.wiring).toEqual({
      state: "not_wired",
      deployKeys: {
        production: {
          state: "created",
          name: "production-key-name",
          deploymentName: "monorepo-prod",
        },
        preview: {
          state: "created",
          name: "preview-key-name",
          projectId: "convex-project",
        },
      },
    });
    await t.mutation(
      internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessDeployKey,
      {
        ...runArgs,
        runId: rotationRunId,
        deployment: "production",
        convexDeployKeyName: "rotated-production-key-name",
      },
    );
    await t.mutation(
      internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessDeployKey,
      {
        ...runArgs,
        runId: rotationRunId,
        deployment: "preview",
        convexDeployKeyName: "rotated-preview-key-name",
      },
    );
    await t.mutation(internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessForRun, {
      ...runArgs,
      runId: rotationRunId,
      builds: DEPENDENCY_AWARE_BUILDS,
      previewDeployment: {
        state: "ready",
        deploymentName: "monorepo-preview",
        cloudUrl: "https://monorepo-preview.convex.cloud",
      },
    });
    await t.mutation(internal.vault.cloudflareMutations.finishCloudflareConvexBuildAccessWiring, {
      ...runArgs,
      runId: rotationRunId,
    });

    const secondWorkerId = await attachWorker(t, ids, "second-web-worker");
    await setWorkerBuilds(t, secondWorkerId, WEB_ONLY_BUILDS);
    const secondRunId = await createRun(t, ids, "wire_convex_build_access");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring, {
        ...runArgs,
        runId: secondRunId,
        workerId: secondWorkerId,
      }),
    ).resolves.toEqual({ claimed: true });
    const sharedDeploymentDependencies = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultWorkerDeploymentDependencies")
          .withIndex("by_convex_deployment", (q) => q.eq("convexDeploymentId", convexDeploymentId))
          .collect(),
    );
    expect(sharedDeploymentDependencies.map((dependency) => dependency.workerId)).toEqual(
      expect.arrayContaining([workerId, secondWorkerId]),
    );
  });

  it("retargets one Worker while preserving old key targets for revocation", async () => {
    const { ids, t } = await createVaultFixture();
    const workerId = await attachWorker(t, ids, "web-worker");
    await setWorkerBuilds(t, workerId, DEPENDENCY_AWARE_BUILDS);
    const firstDeploymentId = await insertConvexDeployment(t, ids);
    const dependencyId = await insertDependency(t, ids, workerId, firstDeploymentId, {
      state: "wired",
      deployKeys: {
        production: {
          state: "created",
          name: "first-production-key",
          deploymentName: "monorepo-prod",
        },
        preview: {
          state: "created",
          name: "first-preview-key",
          projectId: "convex-project",
        },
      },
    });
    const replacementAppId = await t.run(
      async (ctx) =>
        await ctx.db.insert("vaultApps", {
          vaultId: ids.vaultId,
          userId: ids.userId,
          rootDirectory: "packages/replacement-backend",
          createdAt: 60,
        }),
    );
    const replacementDeploymentId = await t.run(
      async (ctx) =>
        await ctx.db.insert("vaultConvexDeployments", {
          vaultId: ids.vaultId,
          userId: ids.userId,
          appId: replacementAppId,
          projectId: "replacement-project",
          teamSlug: "ada-team",
          projectSlug: "replacement",
          deploymentName: "replacement-prod",
          deploymentType: "prod",
          cloudUrl: "https://replacement.convex.cloud",
          siteUrl: "https://replacement.convex.site",
          previewDeployment: { state: "not_ensured" },
          origin: "selected_existing",
          upstream: { state: "present" },
          connectedAt: 60,
          lastObservedAt: 60,
        }),
    );
    const runId = await createRun(t, ids, "wire_convex_build_access");

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring, {
        vaultId: ids.vaultId,
        runId,
        userId: ids.userId,
        workerId,
        convexDeploymentId: replacementDeploymentId,
      }),
    ).resolves.toEqual({ claimed: true });

    await expect(t.run(async (ctx) => await ctx.db.get(dependencyId))).resolves.toMatchObject({
      convexDeploymentId: replacementDeploymentId,
      wiring: {
        state: "not_wired",
        deployKeys: {
          production: {
            state: "created",
            name: "first-production-key",
            deploymentName: "monorepo-prod",
          },
          preview: {
            state: "created",
            name: "first-preview-key",
            projectId: "convex-project",
          },
        },
      },
    });
  });
});

describe("Cloudflare infrastructure verification", () => {
  it("moves build and dependency state back to repairable when provider triggers drift", async () => {
    const { ids, t } = await createVaultFixture();
    const workerId = await attachWorker(t, ids, "web-worker");
    await setWorkerBuilds(t, workerId, DEPENDENCY_AWARE_BUILDS);
    const convexDeploymentId = await insertConvexDeployment(t, ids);
    const dependencyId = await insertDependency(t, ids, workerId, convexDeploymentId, {
      state: "wired",
      deployKeys: {
        production: {
          state: "created",
          name: "production-key-name",
          deploymentName: "convex-prod",
        },
        preview: {
          state: "created",
          name: "preview-key-name",
          projectId: "convex-project-id",
        },
      },
    });
    const runId = await createRun(t, ids, "verify_infrastructure");
    const runArgs = {
      vaultId: ids.vaultId,
      runId,
      userId: ids.userId,
      workerId,
    };

    await expect(
      t.mutation(
        internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification,
        runArgs,
      ),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.query(
        internal.vault.cloudflareMutations.readActiveCloudflareInfrastructureVerification,
        runArgs,
      ),
    ).resolves.toMatchObject({
      active: true,
      worker: { workerId, builds: DEPENDENCY_AWARE_BUILDS },
      workerApp: {
        appId: ids.webAppId,
        rootDirectory: WEB_ROOT_DIRECTORY,
      },
      buildConfig: {
        rootDirectory: WEB_ROOT_DIRECTORY,
        pathIncludes: DEPENDENCY_AWARE_BUILDS.pathIncludes,
      },
      dependency: {
        dependencyId,
        convexApp: {
          appId: ids.convexAppId,
          rootDirectory: CONVEX_ROOT_DIRECTORY,
        },
        convexDeployment: { convexDeploymentId },
      },
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification, {
        ...runArgs,
        providerResult: {
          worker: "confirmed",
          builds: "contradicted",
          convexDeployment: "confirmed",
          convexBuildAccess: "not_checked",
        },
      }),
    ).resolves.toEqual({ applied: true });
    await t.mutation(
      internal.vault.cloudflareMutations.finishCloudflareInfrastructureVerification,
      runArgs,
    );

    const persisted = await t.run(async (ctx) => ({
      dependency: await ctx.db.get(dependencyId),
      run: await ctx.db.get(runId),
      worker: await ctx.db.get(workerId),
    }));
    expect(persisted.worker).toMatchObject({
      upstream: { state: "present" },
      builds: { state: "not_connected" },
    });
    expect(persisted.dependency).toMatchObject({
      wiring: {
        state: "not_wired",
        deployKeys: {
          production: { state: "created", name: "production-key-name" },
          preview: { state: "created", name: "preview-key-name" },
        },
      },
    });
    expect(persisted.run).toMatchObject({ state: "succeeded", currentStep: "finish" });
  });

  it("marks every Worker repairable when a shared Convex deployment is missing", async () => {
    const { ids, t } = await createVaultFixture();
    const convexDeploymentId = await insertConvexDeployment(t, ids);
    const firstWorkerId = await attachWorker(t, ids, "first-worker");
    const secondWorkerId = await attachWorker(t, ids, "second-worker");
    await Promise.all([
      setWorkerBuilds(t, firstWorkerId, DEPENDENCY_AWARE_BUILDS),
      setWorkerBuilds(t, secondWorkerId, DEPENDENCY_AWARE_BUILDS),
    ]);
    const wired = {
      state: "wired",
      deployKeys: {
        production: {
          state: "created",
          name: "production-key",
          deploymentName: "monorepo-prod",
        },
        preview: {
          state: "created",
          name: "preview-key",
          projectId: "convex-project",
        },
      },
    } as const;
    const [firstDependencyId, secondDependencyId] = await Promise.all([
      insertDependency(t, ids, firstWorkerId, convexDeploymentId, wired),
      insertDependency(t, ids, secondWorkerId, convexDeploymentId, wired),
    ]);
    const runId = await createRun(t, ids, "verify_infrastructure");
    const runArgs = {
      vaultId: ids.vaultId,
      runId,
      userId: ids.userId,
      workerId: firstWorkerId,
    };
    await t.mutation(
      internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification,
      runArgs,
    );

    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification, {
        ...runArgs,
        providerResult: {
          worker: "confirmed",
          builds: "confirmed",
          convexDeployment: "missing_upstream",
          convexBuildAccess: "not_checked",
        },
      }),
    ).resolves.toEqual({ applied: true });

    const persisted = await t.run(async (ctx) => ({
      convexDeployment: await ctx.db.get(convexDeploymentId),
      firstDependency: await ctx.db.get(firstDependencyId),
      secondDependency: await ctx.db.get(secondDependencyId),
    }));
    expect(persisted.convexDeployment).toMatchObject({ upstream: { state: "missing_upstream" } });
    expect(persisted.firstDependency).toMatchObject({ wiring: { state: "not_wired" } });
    expect(persisted.secondDependency).toMatchObject({ wiring: { state: "not_wired" } });
  });
});

describe("Cloudflare run ownership", () => {
  it("fences a superseded Builds run before it can persist provider results", async () => {
    const { ids, t } = await createVaultFixture();
    const workerId = await attachWorker(t, ids, "web-worker");
    const runId = await createRun(t, ids, "wire_builds");
    const runArgs = {
      vaultId: ids.vaultId,
      runId,
      userId: ids.userId,
      workerId,
    };
    await t.mutation(internal.vault.cloudflareMutations.claimCloudflareBuildsWiring, runArgs);

    const supersedingRunId = await createRun(t, ids, "wire_builds");
    await t.run(async (ctx) => {
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      if (!ownership) {
        throw new Error("Expected infrastructure ownership.");
      }
      await ctx.db.patch(supersedingRunId, {
        state: "running",
        currentStep: "wire_builds",
        updatedAt: Date.now(),
      });
      await ctx.db.patch(ownership._id, {
        runId: supersedingRunId,
        state: "active",
        updatedAt: Date.now(),
      });
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareBuildsForRun, {
        ...runArgs,
        builds: WEB_ONLY_BUILDS,
      }),
    ).resolves.toEqual({ applied: false });
    const persisted = await t.run(async (ctx) => ({
      run: await ctx.db.get(runId),
      worker: await ctx.db.get(workerId),
    }));
    expect(persisted.worker).toMatchObject({ builds: { state: "not_connected" } });
    expect(persisted.run).toMatchObject({ state: "canceled", currentStep: "claim_infra" });
  });
});
