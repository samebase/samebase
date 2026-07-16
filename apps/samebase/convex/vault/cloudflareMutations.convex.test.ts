import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

const appRoot = ".";
const verificationCloudflareAccountId = "0123456789abcdef0123456789abcdef";

function cloudflareApiSuccessResponse(result: unknown): Response {
  return new Response(JSON.stringify({ success: true, errors: [], messages: [], result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function stubCloudflareInfrastructureVerificationFetch(args?: {
  convexProjectStatus?: number;
}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      const endpoint = new URL(url).pathname;
      switch (endpoint) {
        case "/client/v4/accounts":
          return cloudflareApiSuccessResponse([
            {
              id: verificationCloudflareAccountId,
              name: "Ada Cloudflare",
              type: "standard",
            },
          ]);
        case `/client/v4/accounts/${verificationCloudflareAccountId}/builds/workers/manual-cloudflare-worker-tag/triggers`:
          return cloudflareApiSuccessResponse([]);
        case "/v1/projects/123":
          return new Response("provider failure", { status: args?.convexProjectStatus ?? 500 });
      }
      return new Response(`Unexpected endpoint ${endpoint}`, { status: 500 });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function createAttachableVaultWithOwnership(args: { ownershipState: "active" | "failed" }) {
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
    const runState = args.ownershipState === "active" ? "running" : "failed";
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/manual-cloudflare",
      trigger: "retry",
      state: runState,
      currentStep: "attach_worker",
      createdAt: 10,
      updatedAt: 20,
      ...(runState === "failed" ? { lastError: "Cloudflare provisioning failed." } : {}),
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "create_repository",
      runId,
      ghRepoId: "123",
      ghRepoNodeId: "R_123",
      owner: "ada",
      name: "manual-cloudflare",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
    });
    await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      appRoot,
      createdAt: 25,
    });
    await ctx.db.insert("vaultInfrastructureOwnership", {
      vaultId,
      runId,
      state: args.ownershipState,
      updatedAt: 20,
    });

    return { userId, vaultId };
  });

  return { ids, t };
}

async function createCloudflareConnectionVault() {
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
      repositoryFullName: "ada/manual-cloudflare",
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
      owner: "ada",
      name: "manual-cloudflare",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
    });
    await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      appRoot,
      createdAt: 25,
    });
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/manual-cloudflare",
      trigger: "connect_cloudflare_worker",
      state: "queued",
      currentStep: "run_created",
      createdAt: 30,
      updatedAt: 30,
    });

    return { runId, userId, vaultId };
  });

  return { ids, t };
}

async function createClaimedInfrastructureVerification(args: { includeConvexConnection: boolean }) {
  const { ids, t } = await createCloudflareConnectionVault();
  const runId = await t.run(async (ctx) => {
    await ctx.db.insert("providerConnections", {
      kind: "cloudflare",
      userId: ids.userId,
      auth: {
        method: "oauth",
        credential: "cloudflare-token",
        refreshCredential: "cloudflare-refresh-token",
        credentialExpiresAt: 4_102_444_800_000,
      },
      defaultAccount: {
        state: "selected",
        accountId: verificationCloudflareAccountId,
        accountName: "Ada Cloudflare",
      },
      createdAt: 1,
      updatedAt: 1,
    });
    if (args.includeConvexConnection) {
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        userId: ids.userId,
        auth: {
          method: "api_key",
          credential: "convex-token",
        },
        teamId: "convex-team",
        teamSlug: "ada-team",
        createdAt: 1,
        updatedAt: 1,
      });
    }
    await ctx.db.insert("vaultConvexDeployments", {
      vaultId: ids.vaultId,
      userId: ids.userId,
      appRoot,
      projectId: "123",
      teamSlug: "ada-team",
      projectSlug: "manual-cloudflare",
      deploymentName: "manual-cloudflare-prod",
      deploymentType: "prod",
      cloudUrl: "https://manual-cloudflare.convex.cloud",
      siteUrl: "https://manual-cloudflare.convex.site",
      previewDeployment: { state: "not_ensured" },
      deployKeys: {
        production: { state: "not_created" },
        preview: { state: "not_created" },
      },
      origin: "selected_existing",
      connectedAt: 35,
      lastObservedAt: 35,
    });
    await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId: ids.vaultId,
      userId: ids.userId,
      appRoot,
      accountId: verificationCloudflareAccountId,
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      origin: "selected_existing",
      deployment: {
        builds: { state: "not_connected" },
        convexBuildAccess: { state: "not_wired" },
      },
      connectedAt: 40,
      lastObservedAt: 40,
    });
    return await ctx.db.insert("appProvisioningRuns", {
      userId: ids.userId,
      vaultId: ids.vaultId,
      repositoryFullName: "ada/manual-cloudflare",
      trigger: "verify_infrastructure",
      state: "queued",
      currentStep: "run_created",
      createdAt: 50,
      updatedAt: 50,
    });
  });
  const verifyIds = { ...ids, runId };

  await t.mutation(internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification, {
    ...verifyIds,
    appRoot,
  });

  return { ids: verifyIds, t };
}

describe("vault Cloudflare attachment mutations", () => {
  it("claims, attaches, and finishes a durable Cloudflare Worker connection run", async () => {
    const { ids, t } = await createCloudflareConnectionVault();

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkerForRun, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ attached: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareWorkerConnection, {
        ...ids,
        appRoot,
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(ids.runId);
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      const worker = await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
      return { events, ownership, run, worker };
    });

    expect(result.ownership).toMatchObject({
      runId: ids.runId,
      state: "succeeded",
    });
    expect(result.run).toMatchObject({
      state: "succeeded",
      currentStep: "finish",
    });
    expect(result.worker).toMatchObject({
      appRoot,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      origin: "selected_existing",
      deployment: {
        builds: { state: "not_connected" },
        convexBuildAccess: { state: "not_wired" },
      },
    });
    expect(result.events.map((event) => event.step)).toEqual([
      "claim_infra",
      "attach_worker",
      "finish",
    ]);
  });

  it("replaces a missing-upstream Worker row during a Cloudflare Worker connection run", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        accountId: "old-account",
        workerName: "old-worker",
        workerTag: "old-worker-tag",
        origin: "selected_existing",
        upstream: { state: "missing_upstream" },
        deployment: {
          builds: { state: "not_connected" },
          convexBuildAccess: { state: "not_wired" },
        },
        connectedAt: 20,
        lastObservedAt: 20,
      });
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.query(internal.vault.cloudflareMutations.readActiveCloudflareWorkerConnection, {
        ...ids,
        appRoot,
      }),
    ).resolves.toEqual({ active: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkerForRun, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ attached: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareWorkerConnection, {
        ...ids,
        appRoot,
      }),
    ).resolves.toBeNull();

    const workers = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
    });

    expect(workers).toHaveLength(1);
    expect(workers[0]).toMatchObject({
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      upstream: { state: "present" },
    });
  });

  it("rejects reconnecting a missing-upstream Worker row to a target held by a present row", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultApps", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot: "apps/admin",
        createdAt: 26,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        accountId: "old-account",
        workerName: "old-worker",
        workerTag: "old-worker-tag",
        origin: "selected_existing",
        upstream: { state: "missing_upstream" },
        deployment: {
          builds: { state: "not_connected" },
          convexBuildAccess: { state: "not_wired" },
        },
        connectedAt: 20,
        lastObservedAt: 20,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot: "apps/admin",
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
        upstream: { state: "present" },
        deployment: {
          builds: { state: "not_connected" },
          convexBuildAccess: { state: "not_wired" },
        },
        connectedAt: 25,
        lastObservedAt: 25,
      });
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ claimed: false });

    const events = await t.run(async (ctx) => {
      return await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
    });
    expect(events.at(-1)).toMatchObject({
      level: "warn",
      message: "Cloudflare Worker is already attached to this vault.",
    });
  });

  it("keeps composed create runs active while finishing Cloudflare provider blocks", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const builds = {
      state: "connected" as const,
      rootDirectory: "/",
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
    };
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.runId, {
        trigger: "create",
        state: "running",
        currentStep: "attach_worker",
        updatedAt: 40,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId: ids.vaultId,
        runId: ids.runId,
        state: "active",
        updatedAt: 40,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "manual-cloudflare",
        deploymentName: "manual-cloudflare-prod",
        deploymentType: "prod",
        cloudUrl: "https://manual-cloudflare.convex.cloud",
        siteUrl: "https://manual-cloudflare.convex.site",
        previewDeployment: { state: "not_ensured" },
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
        origin: "provisioned",
        connectedAt: 35,
        lastObservedAt: 35,
      });
    });

    await t.mutation(internal.vault.cloudflareMutations.attachWorkerForRun, {
      ...ids,
      appRoot,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      origin: "provisioned",
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareWorkerConnection, {
        ...ids,
        appRoot,
      }),
    ).resolves.toBeNull();
    await t.mutation(internal.vault.cloudflareMutations.recordCloudflareBuildsForRun, {
      ...ids,
      appRoot,
      builds,
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareBuildsWiring, {
        ...ids,
        appRoot,
      }),
    ).resolves.toEqual({ convexBuildAccessRunId: null });
    await t.mutation(
      internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessDeployKey,
      {
        ...ids,
        appRoot,
        deployment: "production",
        convexDeployKeyId: "prod:key-id",
      },
    );
    await t.mutation(
      internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessDeployKey,
      {
        ...ids,
        appRoot,
        deployment: "preview",
        convexDeployKeyId: "preview:key-id",
      },
    );
    await t.mutation(internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessForRun, {
      ...ids,
      appRoot,
      previewDeployment: {
        state: "ready",
        deploymentName: "manual-cloudflare-dev",
        cloudUrl: "https://manual-cloudflare-dev.convex.cloud",
      },
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareConvexBuildAccessWiring, {
        ...ids,
        appRoot,
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(ids.runId);
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      const worker = await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
      return { events, ownership, run, worker };
    });

    expect(result.ownership).toMatchObject({
      runId: ids.runId,
      state: "active",
    });
    expect(result.run).toMatchObject({
      state: "running",
      currentStep: "wire_convex_build_access",
    });
    expect(result.worker).toMatchObject({
      deployment: {
        builds,
        convexBuildAccess: { state: "wired" },
      },
    });
    expect(result.events.map((event) => event.step)).toEqual([
      "attach_worker",
      "attach_worker",
      "wire_builds",
      "wire_builds",
      "wire_convex_build_access",
      "wire_convex_build_access",
      "wire_convex_build_access",
      "wire_convex_build_access",
    ]);
  });

  it.each([
    {
      behavior: "preserves",
      productionTriggerUuid: "old-production-trigger",
      previewTriggerUuid: "old-preview-trigger",
      expectedConvexBuildAccess: "wired" as const,
    },
    {
      behavior: "invalidates",
      productionTriggerUuid: "new-production-trigger",
      previewTriggerUuid: "new-preview-trigger",
      expectedConvexBuildAccess: "not_wired" as const,
    },
  ])("$behavior Convex build access based on Builds trigger identity", async (testCase) => {
    const { ids, t } = await createCloudflareConnectionVault();
    const runId = await t.run(async (ctx) => {
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
        deployment: {
          builds: {
            state: "connected",
            rootDirectory: "/",
            buildCommand: "pnpm run build",
            deployCommand: "pnpm run deploy",
            previewDeployCommand: "pnpm run deploy:preview",
            pathIncludes: ["*"],
            pathExcludes: [],
            production: {
              triggerUuid: "old-production-trigger",
              buildTokenUuid: "build-token",
            },
            preview: {
              triggerUuid: "old-preview-trigger",
              buildTokenUuid: "build-token",
            },
          },
          convexBuildAccess: { state: "wired" },
        },
        connectedAt: 30,
        lastObservedAt: 30,
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger: "wire_builds",
        state: "running",
        currentStep: "wire_builds",
        createdAt: 40,
        updatedAt: 40,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId: ids.vaultId,
        runId,
        state: "active",
        updatedAt: 40,
      });
      return runId;
    });
    const builds = {
      state: "connected" as const,
      rootDirectory: "/",
      buildCommand: "pnpm run build",
      deployCommand: "pnpm run deploy",
      previewDeployCommand: "pnpm run deploy:preview",
      pathIncludes: ["*"],
      pathExcludes: [],
      production: {
        triggerUuid: testCase.productionTriggerUuid,
        buildTokenUuid: "build-token",
      },
      preview: {
        triggerUuid: testCase.previewTriggerUuid,
        buildTokenUuid: "build-token",
      },
    };

    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareBuildsForRun, {
        ...ids,
        runId,
        appRoot,
        builds,
      }),
    ).resolves.toEqual({ applied: true });

    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("vaultCloudflareWorkers")
            .withIndex("by_vault_and_appRoot", (q) =>
              q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
            )
            .first(),
      ),
    ).resolves.toMatchObject({
      deployment: {
        builds,
        convexBuildAccess: { state: testCase.expectedConvexBuildAccess },
      },
    });
  });

  it("claims, records, and finishes Workers Builds wiring for an attached Worker", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    await t.mutation(internal.vault.cloudflareMutations.attachWorker, {
      vaultId: ids.vaultId,
      userId: ids.userId,
      appRoot,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      origin: "selected_existing",
    });
    const runId = await t.run(async (ctx) => {
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger: "wire_builds",
        state: "queued",
        currentStep: "run_created",
        createdAt: 40,
        updatedAt: 40,
      });
    });
    const buildIds = { ...ids, runId };
    const builds = {
      state: "connected" as const,
      rootDirectory: "/",
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
    };

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareBuildsWiring, {
        ...buildIds,
        appRoot,
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.query(internal.vault.cloudflareMutations.readActiveCloudflareBuildsWiring, {
        ...buildIds,
        appRoot,
      }),
    ).resolves.toMatchObject({
      active: true,
      owner: "ada",
      repo: "manual-cloudflare",
      ghRepoId: "123",
      hasConvexDeployment: false,
      worker: {
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
      },
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareBuildsForRun, {
        ...buildIds,
        appRoot,
        builds,
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareBuildsWiring, {
        ...buildIds,
        appRoot,
      }),
    ).resolves.toEqual({ convexBuildAccessRunId: null });

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", runId))
        .collect();
      const worker = await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
      return { events, ownership, run, worker };
    });

    expect(result.ownership).toMatchObject({
      runId,
      state: "succeeded",
    });
    expect(result.run).toMatchObject({
      state: "succeeded",
      currentStep: "finish",
    });
    expect(result.worker).toMatchObject({
      deployment: {
        builds,
        convexBuildAccess: { state: "not_wired" },
      },
    });
    expect(result.events.map((event) => event.step)).toEqual([
      "claim_infra",
      "wire_builds",
      "finish",
    ]);
  });

  it("reports an attached Convex deployment before wiring Workers Builds", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "manual-cloudflare",
        deploymentName: "manual-cloudflare-prod",
        deploymentType: "prod",
        cloudUrl: "https://manual-cloudflare.convex.cloud",
        siteUrl: "https://manual-cloudflare.convex.site",
        previewDeployment: { state: "not_ensured" },
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
        origin: "selected_existing",
        connectedAt: 35,
        lastObservedAt: 35,
      });
    });
    await t.mutation(internal.vault.cloudflareMutations.attachWorker, {
      vaultId: ids.vaultId,
      userId: ids.userId,
      appRoot,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      origin: "selected_existing",
    });
    const runId = await t.run(async (ctx) => {
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger: "wire_builds",
        state: "queued",
        currentStep: "run_created",
        createdAt: 40,
        updatedAt: 40,
      });
    });
    const buildIds = { ...ids, runId };

    await t.mutation(internal.vault.cloudflareMutations.claimCloudflareBuildsWiring, {
      ...buildIds,
      appRoot,
    });

    await expect(
      t.query(internal.vault.cloudflareMutations.readActiveCloudflareBuildsWiring, {
        ...buildIds,
        appRoot,
      }),
    ).resolves.toMatchObject({
      active: true,
      hasConvexDeployment: true,
    });
  });

  it("does not queue Convex build access for a missing-upstream Convex deployment", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const builds = {
      state: "connected" as const,
      rootDirectory: "/",
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
    };
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "manual-cloudflare",
        deploymentName: "manual-cloudflare-prod",
        deploymentType: "prod",
        cloudUrl: "https://manual-cloudflare.convex.cloud",
        siteUrl: "https://manual-cloudflare.convex.site",
        upstream: { state: "missing_upstream" },
        previewDeployment: { state: "not_ensured" },
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
        origin: "selected_existing",
        connectedAt: 35,
        lastObservedAt: 35,
      });
    });
    await t.mutation(internal.vault.cloudflareMutations.attachWorker, {
      vaultId: ids.vaultId,
      userId: ids.userId,
      appRoot,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      origin: "selected_existing",
    });
    const runId = await t.run(async (ctx) => {
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger: "wire_builds",
        state: "queued",
        currentStep: "run_created",
        createdAt: 40,
        updatedAt: 40,
      });
    });
    const buildIds = { ...ids, runId };

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareBuildsWiring, {
        ...buildIds,
        appRoot,
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.query(internal.vault.cloudflareMutations.readActiveCloudflareBuildsWiring, {
        ...buildIds,
        appRoot,
      }),
    ).resolves.toMatchObject({
      active: true,
      hasConvexDeployment: false,
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareBuildsForRun, {
        ...buildIds,
        appRoot,
        builds,
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareBuildsWiring, {
        ...buildIds,
        appRoot,
      }),
    ).resolves.toEqual({ convexBuildAccessRunId: null });

    const run = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(run).toMatchObject({
      state: "succeeded",
      currentStep: "finish",
    });
  });

  it("claims, records, and finishes Convex build access wiring for connected Workers Builds", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "manual-cloudflare",
        deploymentName: "manual-cloudflare-prod",
        deploymentType: "prod",
        cloudUrl: "https://manual-cloudflare.convex.cloud",
        siteUrl: "https://manual-cloudflare.convex.site",
        previewDeployment: { state: "not_ensured" },
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
        origin: "selected_existing",
        connectedAt: 35,
        lastObservedAt: 35,
      });
    });
    await t.mutation(internal.vault.cloudflareMutations.attachWorker, {
      vaultId: ids.vaultId,
      userId: ids.userId,
      appRoot,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      origin: "selected_existing",
    });
    const wireBuildsRunId = await t.run(async (ctx) => {
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger: "wire_builds",
        state: "queued",
        currentStep: "run_created",
        createdAt: 40,
        updatedAt: 40,
      });
    });
    const builds = {
      state: "connected" as const,
      rootDirectory: "/",
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
    };
    const buildIds = { ...ids, runId: wireBuildsRunId };

    await t.mutation(internal.vault.cloudflareMutations.claimCloudflareBuildsWiring, {
      ...buildIds,
      appRoot,
    });
    await t.mutation(internal.vault.cloudflareMutations.recordCloudflareBuildsForRun, {
      ...buildIds,
      appRoot,
      builds,
    });
    const { convexBuildAccessRunId } = await t.mutation(
      internal.vault.cloudflareMutations.finishCloudflareBuildsWiring,
      {
        ...buildIds,
        appRoot,
      },
    );
    if (!convexBuildAccessRunId) {
      throw new Error("Expected Convex build access run to be queued.");
    }
    const accessIds = { ...ids, runId: convexBuildAccessRunId };

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring, {
        ...accessIds,
        appRoot,
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.query(internal.vault.cloudflareMutations.readActiveCloudflareConvexBuildAccessWiring, {
        ...accessIds,
        appRoot,
      }),
    ).resolves.toMatchObject({
      active: true,
      defaultBranch: "main",
      worker: {
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        build: builds,
      },
      convex: {
        projectId: "convex-project",
        deploymentName: "manual-cloudflare-prod",
        cloudUrl: "https://manual-cloudflare.convex.cloud",
      },
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessDeployKey, {
        ...accessIds,
        appRoot,
        deployment: "production",
        convexDeployKeyId: "prod:key-id",
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessDeployKey, {
        ...accessIds,
        appRoot,
        deployment: "preview",
        convexDeployKeyId: "preview:key-id",
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessForRun, {
        ...accessIds,
        appRoot,
        previewDeployment: {
          state: "ready",
          deploymentName: "manual-cloudflare-dev",
          cloudUrl: "https://manual-cloudflare-dev.convex.cloud",
        },
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareConvexBuildAccessWiring, {
        ...accessIds,
        appRoot,
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const convexDeployment = await ctx.db
        .query("vaultConvexDeployments")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
      const worker = await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
      const run = await ctx.db.get(convexBuildAccessRunId);
      return { convexDeployment, run, worker };
    });

    expect(result.run).toMatchObject({
      state: "succeeded",
      currentStep: "finish",
    });
    expect(result.convexDeployment).toMatchObject({
      deployKeys: {
        production: { state: "created", id: "prod:key-id" },
        preview: { state: "created", id: "preview:key-id" },
      },
      previewDeployment: {
        state: "ready",
        deploymentName: "manual-cloudflare-dev",
        cloudUrl: "https://manual-cloudflare-dev.convex.cloud",
      },
    });
    expect(result.worker).toMatchObject({
      deployment: {
        builds,
        convexBuildAccess: { state: "wired" },
      },
    });
  });

  it("claims, records, and finishes Cloudflare infrastructure verification", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const builds = {
      state: "connected" as const,
      rootDirectory: "/",
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
    };
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "manual-cloudflare",
        deploymentName: "manual-cloudflare-prod",
        deploymentType: "prod",
        cloudUrl: "https://manual-cloudflare.convex.cloud",
        siteUrl: "https://manual-cloudflare.convex.site",
        previewDeployment: { state: "not_ensured" },
        deployKeys: {
          production: { state: "created", id: "prod:key-id" },
          preview: { state: "created", id: "preview:key-id" },
        },
        origin: "selected_existing",
        connectedAt: 35,
        lastObservedAt: 35,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
        deployment: {
          builds,
          convexBuildAccess: { state: "wired" },
        },
        connectedAt: 40,
        lastObservedAt: 40,
      });
    });
    const runId = await t.run(async (ctx) => {
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger: "verify_infrastructure",
        state: "queued",
        currentStep: "run_created",
        createdAt: 50,
        updatedAt: 50,
      });
    });
    const verifyIds = { ...ids, runId };

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification, {
        ...verifyIds,
        appRoot,
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.query(internal.vault.cloudflareMutations.readActiveCloudflareInfrastructureVerification, {
        ...verifyIds,
        appRoot,
      }),
    ).resolves.toMatchObject({
      active: true,
      hasConvexDeployment: true,
      worker: {
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
      },
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification, {
        ...verifyIds,
        appRoot,
        providerResult: {
          worker: "confirmed",
          builds: "confirmed",
          convexDeployment: "confirmed",
          convexBuildAccess: "confirmed",
        },
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareInfrastructureVerification, {
        ...verifyIds,
        appRoot,
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", runId))
        .collect();
      const worker = await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
      return { events, ownership, run, worker };
    });

    expect(result.ownership).toMatchObject({
      runId,
      state: "succeeded",
    });
    expect(result.run).toMatchObject({
      state: "succeeded",
      currentStep: "finish",
    });
    expect(result.worker).toMatchObject({
      deployment: {
        builds,
        convexBuildAccess: { state: "wired" },
      },
    });
    expect(result.worker?.lastObservedAt).toBeGreaterThan(40);
    expect(result.events.map((event) => event.step)).toEqual([
      "claim_infra",
      "verify_infrastructure",
      "finish",
    ]);
  });

  it("marks Worker and Convex deployment rows missing upstream during verification", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "manual-cloudflare",
        deploymentName: "manual-cloudflare-prod",
        deploymentType: "prod",
        cloudUrl: "https://manual-cloudflare.convex.cloud",
        siteUrl: "https://manual-cloudflare.convex.site",
        previewDeployment: { state: "not_ensured" },
        deployKeys: {
          production: { state: "created", id: "prod:key-id" },
          preview: { state: "created", id: "preview:key-id" },
        },
        origin: "selected_existing",
        connectedAt: 35,
        lastObservedAt: 35,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
        deployment: {
          builds: {
            state: "connected",
            rootDirectory: "/",
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
          convexBuildAccess: { state: "wired" },
        },
        connectedAt: 40,
        lastObservedAt: 40,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot: "apps/admin",
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-admin",
        workerTag: "manual-cloudflare-admin-tag",
        origin: "selected_existing",
        deployment: {
          builds: { state: "not_connected" },
          convexBuildAccess: { state: "not_wired" },
        },
        connectedAt: 40,
        lastObservedAt: 40,
      });
      await ctx.db.insert("vaultDomains", {
        vaultId: ids.vaultId,
        branch: "feature/admin",
        kind: "branch_preview",
        url: "https://feature-admin.example.com",
        source: "cloudflare_workers_preview",
        active: true,
        lastSyncedAt: 40,
      });
    });
    const runId = await t.run(async (ctx) => {
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger: "verify_infrastructure",
        state: "queued",
        currentStep: "run_created",
        createdAt: 50,
        updatedAt: 50,
      });
    });
    const verifyIds = { ...ids, runId };

    await t.mutation(internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification, {
      ...verifyIds,
      appRoot,
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification, {
        ...verifyIds,
        appRoot,
        providerResult: {
          worker: "missing_upstream",
          builds: "not_checked",
          convexDeployment: "missing_upstream",
          convexBuildAccess: "not_checked",
        },
      }),
    ).resolves.toEqual({ applied: true });

    const result = await t.run(async (ctx) => {
      const convexDeployment = await ctx.db
        .query("vaultConvexDeployments")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
      const worker = await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", runId))
        .collect();
      const domains = await ctx.db
        .query("vaultDomains")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
      return { convexDeployment, domains, events, worker };
    });

    expect(result.convexDeployment).toMatchObject({
      upstream: { state: "missing_upstream" },
    });
    expect(result.worker).toMatchObject({
      upstream: { state: "missing_upstream" },
      deployment: {
        builds: { state: "not_connected" },
        convexBuildAccess: { state: "not_wired" },
      },
    });
    expect(result.domains).toMatchObject([{ active: true }]);
    expect(result.events.at(-1)?.message).toContain("Worker is missing upstream");
    expect(result.events.at(-1)?.message).toContain("Convex deployment is missing upstream");
  });

  it("records infrastructure verification as unverifiable when the Convex connection is missing", async () => {
    const { ids, t } = await createClaimedInfrastructureVerification({
      includeConvexConnection: false,
    });
    stubCloudflareInfrastructureVerificationFetch();

    await expect(
      t.action(internal.vault.cloudflare.ensureCloudflareInfrastructureVerification, {
        ...ids,
        appRoot,
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      const convexDeployment = await ctx.db
        .query("vaultConvexDeployments")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
      return { convexDeployment, events };
    });

    expect(result.events.at(-1)).toMatchObject({
      level: "warn",
      message: "Convex deployment could not be verified because the Convex connection is missing.",
      step: "verify_infrastructure",
    });
    expect(result.convexDeployment?.upstream).toBeUndefined();
  });

  it("records infrastructure verification as unverifiable when Convex returns a provider error", async () => {
    const { ids, t } = await createClaimedInfrastructureVerification({
      includeConvexConnection: true,
    });
    stubCloudflareInfrastructureVerificationFetch({ convexProjectStatus: 500 });

    await expect(
      t.action(internal.vault.cloudflare.ensureCloudflareInfrastructureVerification, {
        ...ids,
        appRoot,
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      const convexDeployment = await ctx.db
        .query("vaultConvexDeployments")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
      return { convexDeployment, events };
    });

    expect(result.events.at(-1)).toMatchObject({
      level: "warn",
      message:
        "Convex deployment could not be verified because Convex did not return a verifiable response.",
      step: "verify_infrastructure",
    });
    expect(result.convexDeployment?.upstream).toBeUndefined();
  });

  it.each([
    {
      description: "clears adopted build access without a confirmed Convex deployment",
      convexDeployment: "not_checked" as const,
      expectedConvexBuildAccess: "not_wired" as const,
      expectedMessage:
        "Cloudflare Workers Builds already match .; recorded Builds connected and marked deploy keys missing.",
    },
    {
      description: "keeps adopted build access with a confirmed Convex deployment",
      convexDeployment: "confirmed" as const,
      expectedConvexBuildAccess: "wired" as const,
      expectedMessage: "Cloudflare Workers Builds already match .; recorded Builds connected.",
    },
  ])("$description", async (testCase) => {
    const { ids, t } = await createCloudflareConnectionVault();
    const connectedBuilds = {
      state: "connected" as const,
      rootDirectory: "/",
      buildCommand: "pnpm run build",
      deployCommand: "pnpm run deploy",
      previewDeployCommand: "pnpm run deploy:preview",
      pathIncludes: ["*"],
      pathExcludes: [],
      production: {
        triggerUuid: "production-trigger",
        buildTokenUuid: "production-build-token",
      },
      preview: {
        triggerUuid: "preview-trigger",
        buildTokenUuid: "preview-build-token",
      },
    };
    await t.run(async (ctx) => {
      if (testCase.convexDeployment === "confirmed") {
        await ctx.db.insert("vaultConvexDeployments", {
          vaultId: ids.vaultId,
          userId: ids.userId,
          appRoot,
          projectId: "convex-project",
          teamSlug: "ada-team",
          projectSlug: "manual-cloudflare",
          deploymentName: "manual-cloudflare-prod",
          deploymentType: "prod",
          cloudUrl: "https://manual-cloudflare.convex.cloud",
          siteUrl: "https://manual-cloudflare.convex.site",
          previewDeployment: { state: "not_ensured" },
          deployKeys: {
            production: { state: "created", id: "prod:key-id" },
            preview: { state: "created", id: "preview:key-id" },
          },
          origin: "selected_existing",
          connectedAt: 35,
          lastObservedAt: 35,
        });
      }
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
        deployment: {
          builds: { state: "not_connected" },
          convexBuildAccess: { state: "wired" },
        },
        connectedAt: 40,
        lastObservedAt: 40,
      });
    });
    const runId = await t.run(async (ctx) => {
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger: "verify_infrastructure",
        state: "queued",
        currentStep: "run_created",
        createdAt: 50,
        updatedAt: 50,
      });
    });
    const verifyIds = { ...ids, runId };

    await t.mutation(internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification, {
      ...verifyIds,
      appRoot,
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification, {
        ...verifyIds,
        appRoot,
        providerResult: {
          worker: "confirmed",
          builds: "adopted",
          connectedBuilds,
          convexDeployment: testCase.convexDeployment,
          convexBuildAccess: "confirmed",
        },
      }),
    ).resolves.toEqual({ applied: true });

    const result = await t.run(async (ctx) => {
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", runId))
        .collect();
      const worker = await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
      return { events, worker };
    });

    expect(result.worker).toMatchObject({
      deployment: {
        builds: connectedBuilds,
        convexBuildAccess: { state: testCase.expectedConvexBuildAccess },
      },
    });
    expect(result.worker?.lastObservedAt).toBeGreaterThan(40);
    expect(result.events.map((event) => event.message)).toContain(testCase.expectedMessage);
  });

  it("normalizes wired build access when Builds are not connected", async () => {
    const { ids, t } = await createClaimedInfrastructureVerification({
      includeConvexConnection: true,
    });
    await t.run(async (ctx) => {
      const worker = await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .unique();
      if (!worker) {
        throw new Error("Expected Cloudflare Worker.");
      }
      await ctx.db.patch(worker._id, {
        deployment: {
          builds: { state: "not_connected" },
          convexBuildAccess: { state: "wired" },
        },
      });
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification, {
        ...ids,
        appRoot,
        providerResult: {
          worker: "confirmed",
          builds: "not_checked",
          convexDeployment: "confirmed",
          convexBuildAccess: "not_checked",
        },
      }),
    ).resolves.toEqual({ applied: true });

    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("vaultCloudflareWorkers")
          .withIndex("by_vault_and_appRoot", (q) =>
            q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
          )
          .unique(),
      ),
    ).resolves.toMatchObject({
      deployment: {
        builds: { state: "not_connected" },
        convexBuildAccess: { state: "not_wired" },
      },
    });
  });

  it("resets Builds and Convex build access when verification contradicts trigger records", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
        deployment: {
          builds: {
            state: "connected",
            rootDirectory: "/",
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
          convexBuildAccess: { state: "wired" },
        },
        connectedAt: 40,
        lastObservedAt: 40,
      });
    });
    const runId = await t.run(async (ctx) => {
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger: "verify_infrastructure",
        state: "queued",
        currentStep: "run_created",
        createdAt: 50,
        updatedAt: 50,
      });
    });
    const verifyIds = { ...ids, runId };

    await t.mutation(internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification, {
      ...verifyIds,
      appRoot,
    });
    await t.mutation(
      internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification,
      {
        ...verifyIds,
        appRoot,
        providerResult: {
          worker: "confirmed",
          builds: "contradicted",
          convexDeployment: "not_checked",
          convexBuildAccess: "not_checked",
        },
      },
    );

    const worker = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
    });

    expect(worker).toMatchObject({
      deployment: {
        builds: { state: "not_connected" },
        convexBuildAccess: { state: "not_wired" },
      },
    });
    expect(worker?.lastObservedAt).toBeGreaterThan(40);
  });

  it("resets Convex build access when a wired Worker has no Convex deployment row", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const builds = {
      state: "connected" as const,
      rootDirectory: "/",
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
    };
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
        deployment: {
          builds,
          convexBuildAccess: { state: "wired" },
        },
        connectedAt: 40,
        lastObservedAt: 40,
      });
    });
    const runId = await t.run(async (ctx) => {
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger: "verify_infrastructure",
        state: "queued",
        currentStep: "run_created",
        createdAt: 50,
        updatedAt: 50,
      });
    });
    const verifyIds = { ...ids, runId };

    await t.mutation(internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification, {
      ...verifyIds,
      appRoot,
    });
    await t.mutation(
      internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification,
      {
        ...verifyIds,
        appRoot,
        providerResult: {
          worker: "confirmed",
          builds: "confirmed",
          convexDeployment: "not_checked",
          convexBuildAccess: "not_checked",
        },
      },
    );

    const worker = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
    });

    expect(worker).toMatchObject({
      deployment: {
        builds,
        convexBuildAccess: { state: "not_wired" },
      },
    });
    expect(worker?.lastObservedAt).toBeGreaterThan(40);
  });

  it("confirms a missing-upstream Convex row while clearing contradicted deploy-key state", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const builds = {
      state: "connected" as const,
      rootDirectory: "/",
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
    };
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "manual-cloudflare",
        deploymentName: "manual-cloudflare-prod",
        deploymentType: "prod",
        cloudUrl: "https://manual-cloudflare.convex.cloud",
        siteUrl: "https://manual-cloudflare.convex.site",
        upstream: { state: "missing_upstream" },
        previewDeployment: { state: "not_ensured" },
        deployKeys: {
          production: { state: "created", id: "prod:key-id" },
          preview: { state: "created", id: "preview:key-id" },
        },
        origin: "selected_existing",
        connectedAt: 35,
        lastObservedAt: 35,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
        deployment: {
          builds,
          convexBuildAccess: { state: "wired" },
        },
        connectedAt: 40,
        lastObservedAt: 40,
      });
    });
    const runId = await t.run(async (ctx) => {
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger: "verify_infrastructure",
        state: "queued",
        currentStep: "run_created",
        createdAt: 50,
        updatedAt: 50,
      });
    });
    const verifyIds = { ...ids, runId };

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification, {
        ...verifyIds,
        appRoot,
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.query(internal.vault.cloudflareMutations.readActiveCloudflareInfrastructureVerification, {
        ...verifyIds,
        appRoot,
      }),
    ).resolves.toMatchObject({
      active: true,
      hasConvexDeployment: false,
      convexDeployment: {
        projectId: "convex-project",
        deploymentName: "manual-cloudflare-prod",
      },
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification, {
        ...verifyIds,
        appRoot,
        providerResult: {
          worker: "confirmed",
          builds: "confirmed",
          convexDeployment: "confirmed",
          convexBuildAccess: "contradicted",
        },
      }),
    ).resolves.toEqual({ applied: true });

    const result = await t.run(async (ctx) => {
      const convexDeployment = await ctx.db
        .query("vaultConvexDeployments")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
      const worker = await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
      return { convexDeployment, worker };
    });

    expect(result.convexDeployment).toMatchObject({
      upstream: { state: "present" },
    });
    expect(result.worker).toMatchObject({
      upstream: { state: "present" },
      deployment: {
        builds,
        convexBuildAccess: { state: "not_wired" },
      },
    });
  });

  it("attaches multiple Cloudflare Workers to one vault by app root", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultApps", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot: "apps/admin",
        createdAt: 26,
      });
    });

    await t.mutation(internal.vault.cloudflareMutations.attachWorker, {
      vaultId: ids.vaultId,
      userId: ids.userId,
      appRoot,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      origin: "selected_existing",
    });
    await t.mutation(internal.vault.cloudflareMutations.attachWorker, {
      vaultId: ids.vaultId,
      userId: ids.userId,
      appRoot: "apps/admin",
      accountId: "cloudflare-account",
      workerName: "admin-cloudflare-worker",
      workerTag: "admin-cloudflare-worker-tag",
      origin: "selected_existing",
    });

    const workers = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
    });

    expect(
      workers
        .map((worker) => ({
          appRoot: worker.appRoot,
          workerName: worker.workerName,
          vaultId: worker.vaultId,
        }))
        .sort((left, right) => left.appRoot.localeCompare(right.appRoot)),
    ).toEqual([
      {
        appRoot,
        workerName: "manual-cloudflare-worker",
        vaultId: ids.vaultId,
      },
      {
        appRoot: "apps/admin",
        workerName: "admin-cloudflare-worker",
        vaultId: ids.vaultId,
      },
    ]);
  });

  it("requires an app root before a Cloudflare Worker can attach", async () => {
    const { ids, t } = await createCloudflareConnectionVault();

    await expect(
      t.query(internal.vault.cloudflareMutations.requireCloudflareWorkerConnectionVault, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot: "apps/missing",
      }),
    ).rejects.toThrow("Vault app root not found.");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorker, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot: "apps/missing",
        accountId: "cloudflare-account",
        workerName: "missing-cloudflare-worker",
        workerTag: "missing-cloudflare-worker-tag",
        origin: "selected_existing",
      }),
    ).rejects.toThrow("Vault app root not found.");
  });

  it("lets the durable claim supersede stale active ownership", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const staleRunId = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger: "connect_cloudflare_worker",
        state: "running",
        currentStep: "attach_worker",
        createdAt: 10,
        updatedAt: 20,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId: ids.vaultId,
        runId,
        state: "active",
        updatedAt: 1,
      });

      return runId;
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ claimed: true });

    const result = await t.run(async (ctx) => {
      const [staleRun, ownership] = await Promise.all([
        ctx.db.get(staleRunId),
        ctx.db
          .query("vaultInfrastructureOwnership")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .first(),
      ]);

      return { ownership, staleRun };
    });

    expect(result.ownership).toMatchObject({
      runId: ids.runId,
      state: "active",
    });
    expect(result.staleRun).toMatchObject({
      state: "canceled",
      currentStep: "claim_infra",
    });
  });

  it("reports an unattached run so created Workers can be rolled back", async () => {
    const { ids, t } = await createCloudflareConnectionVault();

    await t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
      ...ids,
      appRoot,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      origin: "provisioned",
    });
    await t.run(async (ctx) => {
      const otherRunId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger: "connect_cloudflare_worker",
        state: "running",
        currentStep: "attach_worker",
        createdAt: 40,
        updatedAt: 40,
      });
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      if (!ownership) {
        throw new Error("Expected active ownership.");
      }
      await ctx.db.patch(ownership._id, {
        runId: otherRunId,
        updatedAt: 40,
      });
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkerForRun, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "provisioned",
      }),
    ).resolves.toEqual({ attached: false });

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(ids.runId);

      return { run };
    });

    expect(result.run).toMatchObject({
      state: "canceled",
      currentStep: "claim_infra",
    });
    expect(result.run).toBeTruthy();
  });

  it("keeps rollback from deleting a Worker that became the connected resource", async () => {
    const { ids, t } = await createCloudflareConnectionVault();

    await t.run(async (ctx) => {
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "provisioned",
        deployment: {
          builds: { state: "not_connected" },
          convexBuildAccess: { state: "not_wired" },
        },
        connectedAt: 50,
        lastObservedAt: 50,
      });
    });

    await expect(
      t.query(internal.vault.cloudflareMutations.readCreatedWorkerRollbackSafety, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
      }),
    ).resolves.toEqual({ shouldDelete: false });
    await expect(
      t.query(internal.vault.cloudflareMutations.readCreatedWorkerRollbackSafety, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "different-worker",
      }),
    ).resolves.toEqual({ shouldDelete: true });
  });

  it("rejects manual attachment while infrastructure ownership is active", async () => {
    const { ids, t } = await createAttachableVaultWithOwnership({
      ownershipState: "active",
    });

    await expect(
      t.query(internal.vault.cloudflareMutations.requireCloudflareWorkerConnectionVault, {
        ...ids,
        appRoot,
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.vault.cloudflareMutations.requireAttachableVault, {
        ...ids,
        appRoot,
      }),
    ).rejects.toThrow("Cloudflare provisioning is already running.");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorker, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
      }),
    ).rejects.toThrow("Cloudflare provisioning is already running.");
  });

  it("allows manual recovery after failed infrastructure ownership", async () => {
    const { ids, t } = await createAttachableVaultWithOwnership({
      ownershipState: "failed",
    });

    await expect(
      t.query(internal.vault.cloudflareMutations.requireAttachableVault, {
        ...ids,
        appRoot,
      }),
    ).resolves.toBeNull();
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorker, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
      }),
    ).resolves.toBeNull();

    const worker = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
    });

    expect(worker).toMatchObject({
      appRoot,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      origin: "selected_existing",
    });
  });
});
