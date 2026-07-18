import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";
import { isWorkerDeploymentDependencyCurrentlyWired } from "./deploymentDependencies";

const rootDirectory = "/";
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
        case `/client/v4/accounts/${verificationCloudflareAccountId}/workers/workers/manual-cloudflare-worker-tag`:
          return cloudflareApiSuccessResponse({
            created_on: "2026-07-18T00:00:00Z",
            id: "manual-cloudflare-worker-tag",
            logpush: false,
            name: "manual-cloudflare-worker",
            observability: { enabled: false, head_sampling_rate: 1 },
            references: {
              dispatch_namespace_outbounds: [],
              domains: [],
              durable_objects: [],
              queues: [],
              workers: [],
            },
            subdomain: { enabled: false },
            tags: [],
            tail_consumers: [],
            updated_on: "2026-07-18T00:00:00Z",
          });
        case `/client/v4/accounts/${verificationCloudflareAccountId}/workers/scripts/manual-cloudflare-worker/subdomain`:
          return cloudflareApiSuccessResponse({ enabled: false, previews_enabled: false });
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
      owner: "ada",
      name: "manual-cloudflare",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
    });
    const appId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory,
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

    return { appId, runId, userId, vaultId };
  });

  return { ids, t };
}

type TestBackend = ReturnType<typeof makeConvexTest>;
type ConnectionVaultIds = Awaited<ReturnType<typeof createCloudflareConnectionVault>>["ids"];

const rootBuilds = {
  state: "connected" as const,
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

const webRootDirectory = "apps/web";
const backendRootDirectory = "packages/backend";
const webBuilds = {
  ...rootBuilds,
  pathIncludes: [
    "apps/web/*",
    ".node-version",
    ".nvmrc",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ],
};
const dependencyAwareWebBuilds = {
  ...webBuilds,
  pathIncludes: [...webBuilds.pathIncludes, "packages/backend/*"],
};

async function createMonorepoApps(t: TestBackend, ids: ConnectionVaultIds) {
  return await t.run(async (ctx) => {
    const webAppId = await ctx.db.insert("vaultApps", {
      vaultId: ids.vaultId,
      userId: ids.userId,
      rootDirectory: webRootDirectory,
      createdAt: 31,
    });
    const backendAppId = await ctx.db.insert("vaultApps", {
      vaultId: ids.vaultId,
      userId: ids.userId,
      rootDirectory: backendRootDirectory,
      createdAt: 32,
    });
    return { backendAppId, webAppId };
  });
}

async function insertWorkerForApp(
  t: TestBackend,
  ids: ConnectionVaultIds,
  appId: Id<"vaultApps">,
  workerName: string,
): Promise<Id<"vaultCloudflareWorkers">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("vaultCloudflareWorkers", {
      workersDev: { state: "unknown" },
      vaultId: ids.vaultId,
      userId: ids.userId,
      appId,
      accountId: "cloudflare-account",
      workerName,
      workerTag: `${workerName}-tag`,
      origin: "selected_existing",
      upstream: { state: "present" },
      builds: { state: "not_connected" },
      connectedAt: 35,
      lastObservedAt: 35,
    });
  });
}

async function createRecordedCloudflareWorkerClaim(
  t: TestBackend,
  ids: ConnectionVaultIds,
  workerName = "manual-cloudflare-worker",
): Promise<Id<"vaultCloudflareWorkerCreationClaims">> {
  const claim = await t.mutation(internal.vault.cloudflareMutations.beginCloudflareWorkerCreation, {
    ...ids,
    accountId: "cloudflare-account",
    workerName,
  });
  if (claim.lifecycle.state !== "creating") {
    throw new Error("Expected a new Cloudflare Worker creation claim.");
  }
  await t.mutation(internal.vault.cloudflareMutations.recordCreatedCloudflareWorker, {
    ...ids,
    creationClaimId: claim.claimId,
    accountId: "cloudflare-account",
    workerName,
    workerTag: `${workerName}-tag`,
  });
  return claim.claimId;
}

async function attachRootWorker(
  t: TestBackend,
  ids: ConnectionVaultIds,
  args?: {
    workerName?: string;
    builds?: typeof rootBuilds | { state: "not_connected" };
    upstream?: { state: "missing_upstream" } | { state: "present" };
  },
): Promise<Id<"vaultCloudflareWorkers">> {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("vaultCloudflareWorkers", {
        workersDev: { state: "unknown" },
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "cloudflare-account",
        workerName: args?.workerName ?? "manual-cloudflare-worker",
        workerTag: `${args?.workerName ?? "manual-cloudflare-worker"}-tag`,
        origin: "selected_existing",
        upstream: args?.upstream ?? { state: "present" },
        builds: args?.builds ?? { state: "not_connected" },
        connectedAt: 30,
        lastObservedAt: 30,
      }),
  );
}

async function insertRootConvexDeployment(
  t: TestBackend,
  ids: ConnectionVaultIds,
  args?: { upstream?: { state: "missing_upstream" } | { state: "present" } },
): Promise<Id<"vaultConvexDeployments">> {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        teamId: "convex-team",
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "manual-cloudflare",
        deploymentName: "manual-cloudflare-prod",
        deploymentType: "prod",
        cloudUrl: "https://manual-cloudflare.convex.cloud",
        siteUrl: "https://manual-cloudflare.convex.site",
        origin: "selected_existing",
        upstream: args?.upstream ?? { state: "present" },
        connectedAt: 35,
        lastObservedAt: 35,
      }),
  );
}

async function insertConvexDeploymentForApp(
  t: TestBackend,
  ids: ConnectionVaultIds,
  appId: Id<"vaultApps">,
  args?: {
    teamId?: string;
    projectId?: string;
    projectSlug?: string;
    deploymentName?: string;
  },
): Promise<Id<"vaultConvexDeployments">> {
  const projectId = args?.projectId ?? "convex-project";
  const teamId = args?.teamId ?? "convex-team";
  const projectSlug = args?.projectSlug ?? "manual-cloudflare";
  const deploymentName = args?.deploymentName ?? "manual-cloudflare-prod";
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId,
        teamId,
        projectId,
        teamSlug: "ada-team",
        projectSlug,
        deploymentName,
        deploymentType: "prod",
        cloudUrl: `https://${projectSlug}.convex.cloud`,
        siteUrl: `https://${projectSlug}.convex.site`,
        origin: "selected_existing",
        upstream: { state: "present" },
        connectedAt: 35,
        lastObservedAt: 35,
      }),
  );
}

async function insertWorkerDeploymentDependency(
  t: TestBackend,
  ids: ConnectionVaultIds,
  workerId: Id<"vaultCloudflareWorkers">,
  convexDeploymentId: Id<"vaultConvexDeployments">,
  wiring: Doc<"vaultWorkerDeploymentDependencies">["wiring"],
): Promise<Id<"vaultWorkerDeploymentDependencies">> {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        workerId,
        convexDeploymentId,
        wiring,
        createdAt: 35,
        updatedAt: 35,
      }),
  );
}

async function createCloudflareRun(
  t: TestBackend,
  ids: ConnectionVaultIds,
  trigger: "wire_builds" | "wire_convex_build_access" | "verify_infrastructure",
): Promise<Id<"appProvisioningRuns">> {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger,
        state: "queued",
        currentStep: "run_created",
        createdAt: 40,
        updatedAt: 40,
      }),
  );
}

async function beginAndRecordConvexBuildAccessDeployKey(
  t: TestBackend,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    workerId: Id<"vaultCloudflareWorkers">;
    convexDeploymentId: Id<"vaultConvexDeployments">;
  },
  deployment: "production" | "preview",
  convexDeployKeyName: string,
): Promise<void> {
  await expect(
    t.mutation(
      internal.vault.cloudflareMutations.beginCloudflareConvexBuildAccessDeployKeyCreation,
      {
        ...args,
        deployment,
        convexDeployKeyName,
      },
    ),
  ).resolves.toEqual({ applied: true });
  await expect(
    t.mutation(internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessDeployKey, {
      ...args,
      deployment,
      convexDeployKeyName,
    }),
  ).resolves.toEqual({ applied: true });
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
    const convexDeploymentId = await ctx.db.insert("vaultConvexDeployments", {
      vaultId: ids.vaultId,
      userId: ids.userId,
      appId: ids.appId,
      teamId: "convex-team",
      projectId: "123",
      teamSlug: "ada-team",
      projectSlug: "manual-cloudflare",
      deploymentName: "manual-cloudflare-prod",
      deploymentType: "prod",
      cloudUrl: "https://manual-cloudflare.convex.cloud",
      siteUrl: "https://manual-cloudflare.convex.site",
      origin: "selected_existing",
      upstream: { state: "present" },
      connectedAt: 35,
      lastObservedAt: 35,
    });
    const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
      workersDev: { state: "unknown" },
      vaultId: ids.vaultId,
      userId: ids.userId,
      appId: ids.appId,
      accountId: verificationCloudflareAccountId,
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      origin: "selected_existing",
      upstream: { state: "present" },
      builds: { state: "not_connected" },
      connectedAt: 40,
      lastObservedAt: 40,
    });
    const dependencyId = await ctx.db.insert("vaultWorkerDeploymentDependencies", {
      vaultId: ids.vaultId,
      userId: ids.userId,
      workerId,
      convexDeploymentId,
      wiring: {
        state: "not_wired",
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
      },
      createdAt: 45,
      updatedAt: 45,
    });
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId: ids.userId,
      vaultId: ids.vaultId,
      repositoryFullName: "ada/manual-cloudflare",
      trigger: "verify_infrastructure",
      state: "queued",
      currentStep: "run_created",
      createdAt: 50,
      updatedAt: 50,
    });
    return { convexDeploymentId, dependencyId, runId, workerId };
  });
  const verifyIds = { ...ids, ...runId };

  await t.mutation(internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification, {
    vaultId: verifyIds.vaultId,
    runId: verifyIds.runId,
    userId: verifyIds.userId,
    workerId: verifyIds.workerId,
  });

  return { ids: verifyIds, t };
}

describe("vault Cloudflare attachment mutations", () => {
  it("blocks a second Worker create until the vault's first creation claim is consumed", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
        ...ids,
        accountId: "cloudflare-account",
        workerName: "first-worker",
        origin: "provisioned",
      }),
    ).resolves.toEqual({ claimed: true });
    const firstClaim = await t.mutation(
      internal.vault.cloudflareMutations.beginCloudflareWorkerCreation,
      {
        ...ids,
        accountId: "cloudflare-account",
        workerName: "first-worker",
      },
    );
    const second = await t.run(async (ctx) => {
      const appId = await ctx.db.insert("vaultApps", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        rootDirectory: "apps/admin",
        createdAt: 31,
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger: "connect_cloudflare_worker",
        state: "queued",
        currentStep: "run_created",
        createdAt: 32,
        updatedAt: 32,
      });
      return { appId, runId };
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
        vaultId: ids.vaultId,
        runId: second.runId,
        userId: ids.userId,
        appId: second.appId,
        accountId: "cloudflare-account",
        workerName: "second-worker",
        origin: "provisioned",
      }),
    ).resolves.toEqual({ claimed: false });
    await expect(t.run(async (ctx) => await ctx.db.get(firstClaim.claimId))).resolves.toMatchObject(
      {
        appId: ids.appId,
        runId: ids.runId,
        workerName: "first-worker",
        lifecycle: { state: "creating" },
      },
    );
  });

  it("claims, attaches, and finishes a durable Cloudflare Worker connection run", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const connectionArgs = {
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      appId: ids.appId,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      origin: "selected_existing" as const,
    };

    await expect(
      t.mutation(
        internal.vault.cloudflareMutations.claimCloudflareWorkerConnection,
        connectionArgs,
      ),
    ).resolves.toEqual({ claimed: true });
    const attachment = await t.mutation(internal.vault.cloudflareMutations.attachWorkerForRun, {
      workersDev: { state: "unknown" },
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      appId: ids.appId,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      provenance: { state: "selected_existing" },
    });
    if (attachment.state !== "attached") {
      throw new Error("Expected Worker attachment.");
    }
    await expect(
      t.run(async (ctx) => {
        const ownership = await ctx.db
          .query("vaultInfrastructureOwnership")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique();
        return { ownership, run: await ctx.db.get(ids.runId) };
      }),
    ).resolves.toMatchObject({
      ownership: { runId: ids.runId, state: "succeeded" },
      run: { currentStep: "finish", state: "succeeded" },
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareWorkerConnection, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        workerId: attachment.workerId,
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
      const worker = await ctx.db.get(attachment.workerId);
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
      appId: ids.appId,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      origin: "selected_existing",
      builds: { state: "not_connected" },
    });
    expect(result.events.map((event) => event.step)).toEqual([
      "claim_infra",
      "attach_worker",
      "finish",
    ]);
  });

  it("reuses a missing-upstream Worker row during a Cloudflare Worker connection run", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const missingWorkerId = await t.run(async (ctx) => {
      return await ctx.db.insert("vaultCloudflareWorkers", {
        workersDev: { state: "unknown" },
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
        upstream: { state: "missing_upstream" },
        builds: { state: "not_connected" },
        connectedAt: 20,
        lastObservedAt: 20,
      });
    });
    const connectionArgs = {
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      appId: ids.appId,
    };

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
        ...connectionArgs,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.query(internal.vault.cloudflareMutations.readActiveCloudflareWorkerConnection, {
        ...connectionArgs,
      }),
    ).resolves.toEqual({ active: true });
    const attachment = await t.mutation(internal.vault.cloudflareMutations.attachWorkerForRun, {
      workersDev: { state: "unknown" },
      ...connectionArgs,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      provenance: { state: "selected_existing" },
    });
    expect(attachment).toEqual({ state: "attached", workerId: missingWorkerId });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareWorkerConnection, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        workerId: missingWorkerId,
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
    const adminAppId = await t.run(async (ctx) => {
      const appId = await ctx.db.insert("vaultApps", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        rootDirectory: "apps/admin",
        createdAt: 26,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        workersDev: { state: "unknown" },
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "old-account",
        workerName: "old-worker",
        workerTag: "old-worker-tag",
        origin: "selected_existing",
        upstream: { state: "missing_upstream" },
        builds: { state: "not_connected" },
        connectedAt: 20,
        lastObservedAt: 20,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        workersDev: { state: "unknown" },
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
        upstream: { state: "present" },
        builds: { state: "not_connected" },
        connectedAt: 25,
        lastObservedAt: 25,
      });
      return appId;
    });
    expect(adminAppId).not.toBe(ids.appId);

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        appId: ids.appId,
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
      message: "Cloudflare Worker is already attached to another app.",
    });
  });

  it("rejects attaching one Cloudflare Worker to apps in two vaults", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    await insertWorkerForApp(t, ids, ids.appId, "shared-worker");
    const second = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        userId: ids.userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const sourceRunId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId,
        repositoryFullName: "ada/second-cloudflare-vault",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 40,
        updatedAt: 40,
        completedAt: 40,
      });
      await ctx.db.replace(vaultId, {
        userId: ids.userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId: sourceRunId,
        ghRepoId: "456",
        owner: "ada",
        name: "second-cloudflare-vault",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 40,
      });
      const appId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId: ids.userId,
        rootDirectory,
        createdAt: 40,
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId,
        repositoryFullName: "ada/second-cloudflare-vault",
        trigger: "connect_cloudflare_worker",
        state: "queued",
        currentStep: "run_created",
        createdAt: 40,
        updatedAt: 40,
      });
      return { appId, runId, vaultId };
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
        ...second,
        userId: ids.userId,
        accountId: "cloudflare-account",
        workerName: "renamed-shared-worker",
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkerForRun, {
        ...second,
        userId: ids.userId,
        accountId: "cloudflare-account",
        workerName: "renamed-shared-worker",
        workerTag: "shared-worker-tag",
        workersDev: { state: "unknown" },
        provenance: { state: "selected_existing" },
      }),
    ).resolves.toEqual({ state: "not_attached" });

    await expect(
      t.run(async (ctx) => {
        const ownership = await ctx.db
          .query("vaultInfrastructureOwnership")
          .withIndex("by_vault", (q) => q.eq("vaultId", second.vaultId))
          .unique();
        return { ownership, run: await ctx.db.get(second.runId) };
      }),
    ).resolves.toMatchObject({
      ownership: { runId: second.runId, state: "failed" },
      run: { currentStep: "attach_worker", state: "canceled" },
    });
  });

  it("replaces a renamed missing composed Worker without changing its Samebase identity", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const convexDeploymentId = await insertRootConvexDeployment(t, ids);
    const deployKeys = {
      production: {
        state: "created" as const,
        teamId: "convex-team",
        name: "production-key-name",
        deploymentName: "manual-cloudflare-prod",
      },
      preview: {
        state: "created" as const,
        teamId: "convex-team",
        name: "preview-key-name",
        projectId: "convex-project",
      },
    };
    const workerId = await t.run(async (ctx) => {
      await ctx.db.patch(ids.runId, {
        trigger: "retry",
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
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        workersDev: { state: "available", url: "https://renamed-worker.workers.dev" },
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "cloudflare-account",
        workerName: "renamed-worker",
        workerTag: "missing-worker-tag",
        origin: "provisioned",
        upstream: { state: "missing_upstream" },
        builds: rootBuilds,
        connectedAt: 30,
        lastObservedAt: 40,
      });
      await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        workerId,
        convexDeploymentId,
        wiring: { state: "wired", deployKeys },
        createdAt: 35,
        updatedAt: 35,
      });
      await ctx.db.insert("vaultInfrastructureTargets", {
        vaultId: ids.vaultId,
        appId: ids.appId,
        convex: {
          state: "planned",
          teamId: "convex-team",
          projectName: "manual-cloudflare",
        },
        cloudflare: {
          state: "attached",
          accountId: "cloudflare-account",
          workerName: "manual-cloudflare-worker",
          workerId,
        },
        createdAt: 40,
      });
      return workerId;
    });
    const creationClaimId = await createRecordedCloudflareWorkerClaim(t, ids);

    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkerForRun, {
        workersDev: { state: "unknown" },
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        provenance: { state: "provisioned", creationClaimId },
      }),
    ).resolves.toEqual({ state: "attached", workerId });

    const result = await t.run(async (ctx) => {
      const workers = await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
      const dependency = await ctx.db
        .query("vaultWorkerDeploymentDependencies")
        .withIndex("by_worker", (q) => q.eq("workerId", workerId))
        .unique();
      const target = await ctx.db
        .query("vaultInfrastructureTargets")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      return {
        claim: await ctx.db.get(creationClaimId),
        dependency,
        target,
        workers,
      };
    });

    expect(result.workers).toHaveLength(1);
    expect(result.workers[0]).toMatchObject({
      _id: workerId,
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      workersDev: { state: "unknown" },
      upstream: { state: "present" },
      builds: { state: "not_connected" },
    });
    expect(result.dependency).toMatchObject({
      workerId,
      convexDeploymentId,
      wiring: { state: "not_wired", deployKeys },
    });
    expect(result.target?.cloudflare).toEqual({
      state: "attached",
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerId,
    });
    expect(result.claim).toBeNull();
  });

  it("keeps composed create runs active while finishing Cloudflare provider blocks", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
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
      await ctx.db.insert("vaultInfrastructureTargets", {
        vaultId: ids.vaultId,
        appId: ids.appId,
        convex: {
          state: "planned",
          teamId: "convex-team",
          projectName: "manual-cloudflare",
        },
        cloudflare: {
          state: "planned",
          accountId: "cloudflare-account",
          workerName: "manual-cloudflare-worker",
        },
        createdAt: 40,
      });
    });
    const convexDeploymentId = await insertRootConvexDeployment(t, ids);

    const attachment = await t.mutation(internal.vault.cloudflareMutations.attachWorkerForRun, {
      workersDev: { state: "unknown" },
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      appId: ids.appId,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      provenance: {
        state: "provisioned",
        creationClaimId: await createRecordedCloudflareWorkerClaim(t, ids),
      },
    });
    if (attachment.state !== "attached") {
      throw new Error("Expected Worker attachment.");
    }
    const runArgs = {
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      workerId: attachment.workerId,
    };
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareWorkerConnection, {
        ...runArgs,
      }),
    ).resolves.toBeNull();
    await t.mutation(internal.vault.cloudflareMutations.recordCloudflareBuildsForRun, {
      ...runArgs,
      builds: rootBuilds,
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareBuildsWiring, runArgs),
    ).resolves.toBeNull();
    const accessArgs = { ...runArgs, convexDeploymentId };
    await expect(
      t.mutation(
        internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring,
        accessArgs,
      ),
    ).resolves.toEqual({ claimed: true });
    await beginAndRecordConvexBuildAccessDeployKey(
      t,
      accessArgs,
      "production",
      "production-key-name",
    );
    await beginAndRecordConvexBuildAccessDeployKey(t, accessArgs, "preview", "preview-key-name");
    await t.mutation(internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessForRun, {
      ...accessArgs,
      builds: rootBuilds,
    });
    await expect(
      t.mutation(
        internal.vault.cloudflareMutations.finishCloudflareConvexBuildAccessWiring,
        accessArgs,
      ),
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
      const worker = await ctx.db.get(attachment.workerId);
      const dependency = await ctx.db
        .query("vaultWorkerDeploymentDependencies")
        .withIndex("by_worker", (q) => q.eq("workerId", attachment.workerId))
        .unique();
      const target = await ctx.db
        .query("vaultInfrastructureTargets")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      return { dependency, events, ownership, run, target, worker };
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
      builds: rootBuilds,
    });
    expect(result.target?.cloudflare).toEqual({
      state: "attached",
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerId: attachment.workerId,
    });
    expect(result.dependency).toMatchObject({
      workerId: attachment.workerId,
      convexDeploymentId,
      wiring: { state: "wired" },
    });
    expect(result.events.map((event) => event.step)).toEqual([
      "attach_worker",
      "attach_worker",
      "wire_builds",
      "wire_builds",
      "claim_infra",
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
    const oldBuilds = {
      ...rootBuilds,
      production: {
        triggerUuid: "old-production-trigger",
        buildTokenUuid: "build-token",
      },
      preview: {
        triggerUuid: "old-preview-trigger",
        buildTokenUuid: "build-token",
      },
    };
    const workerId = await attachRootWorker(t, ids, { builds: oldBuilds });
    const convexDeploymentId = await insertRootConvexDeployment(t, ids);
    const dependencyId = await insertWorkerDeploymentDependency(
      t,
      ids,
      workerId,
      convexDeploymentId,
      {
        state: "wired",
        deployKeys: {
          production: {
            state: "created",
            teamId: "convex-team",
            name: "production-key-name",
            deploymentName: "manual-cloudflare-prod",
          },
          preview: {
            state: "created",
            teamId: "convex-team",
            name: "preview-key-name",
            projectId: "convex-project",
          },
        },
      },
    );
    const runId = await t.run(async (ctx) => {
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
      ...rootBuilds,
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
        vaultId: ids.vaultId,
        runId,
        userId: ids.userId,
        workerId,
        builds,
      }),
    ).resolves.toEqual({ applied: true });

    await expect(t.run(async (ctx) => await ctx.db.get(dependencyId))).resolves.toMatchObject({
      wiring: { state: testCase.expectedConvexBuildAccess },
    });
  });

  it("claims, records, and finishes Workers Builds wiring for an attached Worker", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const workerId = await insertWorkerForApp(t, ids, ids.appId, "manual-cloudflare-worker");
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
    const buildIds = { vaultId: ids.vaultId, runId, userId: ids.userId, workerId };

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareBuildsWiring, buildIds),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.query(internal.vault.cloudflareMutations.readActiveCloudflareBuildsWiring, buildIds),
    ).resolves.toMatchObject({
      active: true,
      owner: "ada",
      repo: "manual-cloudflare",
      ghRepoId: "123",
      hasConvexDeployment: false,
      app: { appId: ids.appId, rootDirectory },
      worker: {
        workerId,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
      },
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareBuildsForRun, {
        ...buildIds,
        builds: rootBuilds,
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareBuildsWiring, buildIds),
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
      const worker = await ctx.db.get(workerId);
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
      appId: ids.appId,
      builds: rootBuilds,
    });
    expect(result.events.map((event) => event.step)).toEqual([
      "claim_infra",
      "wire_builds",
      "finish",
    ]);
  });

  it("reports an explicit Convex dependency before wiring Workers Builds", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const convexDeploymentId = await insertRootConvexDeployment(t, ids);
    const workerId = await attachRootWorker(t, ids);
    await insertWorkerDeploymentDependency(t, ids, workerId, convexDeploymentId, {
      state: "not_wired",
      deployKeys: {
        production: { state: "not_created" },
        preview: { state: "not_created" },
      },
    });
    const runId = await createCloudflareRun(t, ids, "wire_builds");
    const buildIds = { vaultId: ids.vaultId, runId, userId: ids.userId, workerId };

    await t.mutation(internal.vault.cloudflareMutations.claimCloudflareBuildsWiring, buildIds);

    await expect(
      t.query(internal.vault.cloudflareMutations.readActiveCloudflareBuildsWiring, buildIds),
    ).resolves.toMatchObject({
      active: true,
      hasConvexDeployment: true,
      worker: { workerId },
    });
  });

  it("does not queue Convex build access for a missing-upstream Convex deployment", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const convexDeploymentId = await insertRootConvexDeployment(t, ids, {
      upstream: { state: "missing_upstream" },
    });
    const workerId = await attachRootWorker(t, ids);
    await insertWorkerDeploymentDependency(t, ids, workerId, convexDeploymentId, {
      state: "not_wired",
      deployKeys: {
        production: { state: "not_created" },
        preview: { state: "not_created" },
      },
    });
    const runId = await createCloudflareRun(t, ids, "wire_builds");
    const buildIds = { vaultId: ids.vaultId, runId, userId: ids.userId, workerId };

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareBuildsWiring, buildIds),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.query(internal.vault.cloudflareMutations.readActiveCloudflareBuildsWiring, buildIds),
    ).resolves.toMatchObject({
      active: true,
      hasConvexDeployment: false,
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareBuildsForRun, {
        ...buildIds,
        builds: rootBuilds,
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareBuildsWiring, buildIds),
    ).resolves.toBeNull();

    const run = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(run).toMatchObject({
      state: "succeeded",
      currentStep: "finish",
    });
  });

  it("claims, records, and finishes Convex build access wiring for connected Workers Builds", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const convexDeploymentId = await insertRootConvexDeployment(t, ids);
    const workerId = await attachRootWorker(t, ids, { builds: rootBuilds });
    const runId = await createCloudflareRun(t, ids, "wire_convex_build_access");
    const accessIds = {
      vaultId: ids.vaultId,
      runId,
      userId: ids.userId,
      workerId,
      convexDeploymentId,
    };

    await expect(
      t.mutation(
        internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring,
        accessIds,
      ),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.query(
        internal.vault.cloudflareMutations.readActiveCloudflareConvexBuildAccessWiring,
        accessIds,
      ),
    ).resolves.toMatchObject({
      active: true,
      defaultBranch: "main",
      buildConfig: {
        rootDirectory,
        pathIncludes: rootBuilds.pathIncludes,
      },
      workerApp: { appId: ids.appId, rootDirectory },
      convexApp: { appId: ids.appId, rootDirectory },
      worker: {
        workerId,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
      },
      convex: {
        convexDeploymentId,
        projectId: "convex-project",
        deploymentName: "manual-cloudflare-prod",
        cloudUrl: "https://manual-cloudflare.convex.cloud",
      },
    });
    await beginAndRecordConvexBuildAccessDeployKey(
      t,
      accessIds,
      "production",
      "production-key-name",
    );
    await beginAndRecordConvexBuildAccessDeployKey(t, accessIds, "preview", "preview-key-name");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessForRun, {
        ...accessIds,
        builds: rootBuilds,
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.mutation(
        internal.vault.cloudflareMutations.finishCloudflareConvexBuildAccessWiring,
        accessIds,
      ),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const dependency = await ctx.db
        .query("vaultWorkerDeploymentDependencies")
        .withIndex("by_worker", (q) => q.eq("workerId", workerId))
        .unique();
      return {
        dependency,
        run: await ctx.db.get(runId),
        worker: await ctx.db.get(workerId),
      };
    });

    expect(result.run).toMatchObject({
      state: "succeeded",
      currentStep: "finish",
    });
    expect(result.worker).toMatchObject({
      builds: rootBuilds,
    });
    expect(result.dependency).toMatchObject({
      workerId,
      convexDeploymentId,
      wiring: {
        state: "wired",
        deployKeys: {
          production: { state: "created", name: "production-key-name" },
          preview: { state: "created", name: "preview-key-name" },
        },
      },
    });
  });

  it("claims, records, and finishes Cloudflare infrastructure verification", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const convexDeploymentId = await insertRootConvexDeployment(t, ids);
    const workerId = await attachRootWorker(t, ids, { builds: rootBuilds });
    const dependencyId = await insertWorkerDeploymentDependency(
      t,
      ids,
      workerId,
      convexDeploymentId,
      {
        state: "wired",
        deployKeys: {
          production: {
            state: "created",
            teamId: "convex-team",
            name: "production-key-name",
            deploymentName: "manual-cloudflare-prod",
          },
          preview: {
            state: "created",
            teamId: "convex-team",
            name: "preview-key-name",
            projectId: "convex-project",
          },
        },
      },
    );
    const runId = await createCloudflareRun(t, ids, "verify_infrastructure");
    const verifyIds = { vaultId: ids.vaultId, runId, userId: ids.userId, workerId };

    await expect(
      t.mutation(
        internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification,
        verifyIds,
      ),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.query(
        internal.vault.cloudflareMutations.readActiveCloudflareInfrastructureVerification,
        verifyIds,
      ),
    ).resolves.toMatchObject({
      active: true,
      workerApp: { appId: ids.appId, rootDirectory },
      worker: {
        workerId,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
      },
      dependency: {
        dependencyId,
        currentlyWired: true,
        convexDeployment: { convexDeploymentId },
        wiring: { state: "wired" },
      },
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification, {
        ...verifyIds,
        providerResult: {
          workerName: "renamed-cloudflare-worker",
          workersDev: {
            state: "available",
            url: "https://manual-cloudflare-worker.example.workers.dev",
          },
          worker: "confirmed",
          builds: "confirmed",
          convexDeployment: "confirmed",
          convexBuildAccess: "confirmed",
        },
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.mutation(
        internal.vault.cloudflareMutations.finishCloudflareInfrastructureVerification,
        verifyIds,
      ),
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
      return {
        dependency: await ctx.db.get(dependencyId),
        events,
        ownership,
        run,
        worker: await ctx.db.get(workerId),
      };
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
      builds: rootBuilds,
      workerName: "renamed-cloudflare-worker",
      workersDev: {
        state: "available",
        url: "https://manual-cloudflare-worker.example.workers.dev",
      },
    });
    expect(result.dependency).toMatchObject({ wiring: { state: "wired" } });
    expect(result.worker?.lastObservedAt).toBeGreaterThan(40);
    expect(result.events.map((event) => event.step)).toEqual([
      "claim_infra",
      "verify_infrastructure",
      "finish",
    ]);
  });

  it("marks Worker and Convex deployment rows missing upstream during verification", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const convexDeploymentId = await insertRootConvexDeployment(t, ids);
    const workerId = await attachRootWorker(t, ids, { builds: rootBuilds });
    const dependencyId = await insertWorkerDeploymentDependency(
      t,
      ids,
      workerId,
      convexDeploymentId,
      {
        state: "wired",
        deployKeys: {
          production: {
            state: "created",
            teamId: "convex-team",
            name: "production-key-name",
            deploymentName: "manual-cloudflare-prod",
          },
          preview: {
            state: "created",
            teamId: "convex-team",
            name: "preview-key-name",
            projectId: "convex-project",
          },
        },
      },
    );
    const adminWorkerId = await t.run(async (ctx) => {
      const adminAppId = await ctx.db.insert("vaultApps", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        rootDirectory: "apps/admin",
        createdAt: 36,
      });
      const adminWorkerId = await ctx.db.insert("vaultCloudflareWorkers", {
        workersDev: { state: "unknown" },
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: adminAppId,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-admin",
        workerTag: "manual-cloudflare-admin-tag",
        origin: "selected_existing",
        upstream: { state: "present" },
        builds: { state: "not_connected" },
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
      return adminWorkerId;
    });
    const runId = await createCloudflareRun(t, ids, "verify_infrastructure");
    const verifyIds = { vaultId: ids.vaultId, runId, userId: ids.userId, workerId };

    await t.mutation(
      internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification,
      verifyIds,
    );
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification, {
        ...verifyIds,
        providerResult: {
          workerName: "manual-cloudflare-worker",
          workersDev: { state: "unknown" },
          worker: "missing_upstream",
          builds: "not_checked",
          convexDeployment: "missing_upstream",
          convexBuildAccess: "not_checked",
        },
      }),
    ).resolves.toEqual({ applied: true });

    const result = await t.run(async (ctx) => {
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", runId))
        .collect();
      const domains = await ctx.db
        .query("vaultDomains")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
      return {
        adminWorker: await ctx.db.get(adminWorkerId),
        convexDeployment: await ctx.db.get(convexDeploymentId),
        dependency: await ctx.db.get(dependencyId),
        domains,
        events,
        worker: await ctx.db.get(workerId),
      };
    });

    expect(result.convexDeployment).toMatchObject({
      upstream: { state: "missing_upstream" },
    });
    expect(result.worker).toMatchObject({
      upstream: { state: "missing_upstream" },
      builds: { state: "not_connected" },
    });
    expect(result.dependency).toMatchObject({ wiring: { state: "not_wired" } });
    expect(result.adminWorker).toMatchObject({ upstream: { state: "present" } });
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
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        workerId: ids.workerId,
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      const convexDeployment = await ctx.db.get(ids.convexDeploymentId);
      return { convexDeployment, events };
    });

    expect(result.events.at(-1)).toMatchObject({
      level: "warn",
      message: "Convex deployment could not be verified because the Convex connection is missing.",
      step: "verify_infrastructure",
    });
    expect(result.convexDeployment?.upstream).toEqual({ state: "present" });
  });

  it("does not mark a deployment missing when another Convex team is connected", async () => {
    const { ids, t } = await createClaimedInfrastructureVerification({
      includeConvexConnection: true,
    });
    await t.run(async (ctx) => {
      const connection = await ctx.db
        .query("providerConnections")
        .withIndex("by_user_kind", (q) => q.eq("userId", ids.userId).eq("kind", "convex"))
        .unique();
      if (!connection || connection.kind !== "convex") {
        throw new Error("Expected Convex connection.");
      }
      await ctx.db.patch(connection._id, {
        teamId: "other-convex-team",
        teamSlug: "other-team",
      });
    });
    stubCloudflareInfrastructureVerificationFetch();

    await expect(
      t.action(internal.vault.cloudflare.ensureCloudflareInfrastructureVerification, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        workerId: ids.workerId,
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      return {
        convexDeployment: await ctx.db.get(ids.convexDeploymentId),
        events,
      };
    });
    const fetchMock = vi.mocked(fetch);

    expect(result.convexDeployment).toMatchObject({
      teamId: "convex-team",
      upstream: { state: "present" },
    });
    expect(result.events.at(-1)).toMatchObject({
      level: "info",
      step: "verify_infrastructure",
    });
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = input instanceof Request ? input.url : String(input);
        return new URL(url).pathname.startsWith("/v1/projects/");
      }),
    ).toBe(false);
  });

  it("records infrastructure verification as unverifiable when Convex returns a provider error", async () => {
    const { ids, t } = await createClaimedInfrastructureVerification({
      includeConvexConnection: true,
    });
    stubCloudflareInfrastructureVerificationFetch({ convexProjectStatus: 500 });

    await expect(
      t.action(internal.vault.cloudflare.ensureCloudflareInfrastructureVerification, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        workerId: ids.workerId,
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      const convexDeployment = await ctx.db.get(ids.convexDeploymentId);
      return { convexDeployment, events };
    });

    expect(result.events.at(-1)).toMatchObject({
      level: "warn",
      message:
        "Convex deployment could not be verified because Convex did not return a verifiable response.",
      step: "verify_infrastructure",
    });
    expect(result.convexDeployment?.upstream).toEqual({ state: "present" });
  });

  it.each([
    {
      description: "clears adopted build access without a confirmed Convex deployment",
      convexDeployment: "not_checked" as const,
      expectedDependency: null,
      expectedMessage:
        "Cloudflare Workers Builds already match /; recorded Builds connected but left deploy keys repairable because Samebase lacks complete key identity.",
    },
    {
      description: "keeps adopted build access with a confirmed Convex deployment",
      convexDeployment: "confirmed" as const,
      expectedDependency: "wired" as const,
      expectedMessage: "Cloudflare infrastructure verified for /.",
    },
  ])("$description", async (testCase) => {
    const { ids, t } = await createCloudflareConnectionVault();
    const connectedBuilds = {
      ...rootBuilds,
      production: {
        triggerUuid: "production-trigger",
        buildTokenUuid: "production-build-token",
      },
      preview: {
        triggerUuid: "preview-trigger",
        buildTokenUuid: "preview-build-token",
      },
    };
    const workerId = await attachRootWorker(t, ids);
    const dependencyId =
      testCase.convexDeployment === "confirmed"
        ? await (async () => {
            const convexDeploymentId = await insertRootConvexDeployment(t, ids);
            return await insertWorkerDeploymentDependency(t, ids, workerId, convexDeploymentId, {
              state: "wired",
              deployKeys: {
                production: {
                  state: "created",
                  teamId: "convex-team",
                  name: "production-key-name",
                  deploymentName: "manual-cloudflare-prod",
                },
                preview: {
                  state: "created",
                  teamId: "convex-team",
                  name: "preview-key-name",
                  projectId: "convex-project",
                },
              },
            });
          })()
        : null;
    const runId = await createCloudflareRun(t, ids, "verify_infrastructure");
    const verifyIds = { vaultId: ids.vaultId, runId, userId: ids.userId, workerId };

    await t.mutation(
      internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification,
      verifyIds,
    );
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification, {
        ...verifyIds,
        providerResult: {
          workerName: "manual-cloudflare-worker",
          workersDev: { state: "unknown" },
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
      return {
        dependency: dependencyId ? await ctx.db.get(dependencyId) : null,
        events,
        worker: await ctx.db.get(workerId),
      };
    });

    expect(result.worker).toMatchObject({
      builds: connectedBuilds,
    });
    expect(result.dependency?.wiring.state ?? null).toBe(testCase.expectedDependency);
    expect(result.worker?.lastObservedAt).toBeGreaterThan(40);
    expect(result.events.map((event) => event.message)).toContain(testCase.expectedMessage);
  });

  it("normalizes wired build access when Builds are not connected", async () => {
    const { ids, t } = await createClaimedInfrastructureVerification({
      includeConvexConnection: true,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.dependencyId, {
        wiring: {
          state: "wired",
          deployKeys: {
            production: {
              state: "created",
              teamId: "convex-team",
              name: "production-key-name",
              deploymentName: "manual-cloudflare-prod",
            },
            preview: {
              state: "created",
              teamId: "convex-team",
              name: "preview-key-name",
              projectId: "123",
            },
          },
        },
      });
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        workerId: ids.workerId,
        providerResult: {
          workerName: "manual-cloudflare-worker",
          workersDev: { state: "unknown" },
          worker: "confirmed",
          builds: "not_checked",
          convexDeployment: "confirmed",
          convexBuildAccess: "not_checked",
        },
      }),
    ).resolves.toEqual({ applied: true });

    await expect(t.run(async (ctx) => await ctx.db.get(ids.dependencyId))).resolves.toMatchObject({
      wiring: { state: "not_wired" },
    });
  });

  it("resets Builds and Convex build access when verification contradicts trigger records", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const workerId = await attachRootWorker(t, ids, { builds: rootBuilds });
    const convexDeploymentId = await insertRootConvexDeployment(t, ids);
    const dependencyId = await insertWorkerDeploymentDependency(
      t,
      ids,
      workerId,
      convexDeploymentId,
      {
        state: "wired",
        deployKeys: {
          production: {
            state: "created",
            teamId: "convex-team",
            name: "production-key-name",
            deploymentName: "manual-cloudflare-prod",
          },
          preview: {
            state: "created",
            teamId: "convex-team",
            name: "preview-key-name",
            projectId: "convex-project",
          },
        },
      },
    );
    const runId = await createCloudflareRun(t, ids, "verify_infrastructure");
    const verifyIds = { vaultId: ids.vaultId, runId, userId: ids.userId, workerId };

    await t.mutation(
      internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification,
      verifyIds,
    );
    await t.mutation(
      internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification,
      {
        ...verifyIds,
        providerResult: {
          workerName: "manual-cloudflare-worker",
          workersDev: { state: "unknown" },
          worker: "confirmed",
          builds: "contradicted",
          convexDeployment: "not_checked",
          convexBuildAccess: "not_checked",
        },
      },
    );

    const persisted = await t.run(async (ctx) => ({
      dependency: await ctx.db.get(dependencyId),
      worker: await ctx.db.get(workerId),
    }));

    expect(persisted.worker).toMatchObject({
      builds: { state: "not_connected" },
    });
    expect(persisted.dependency).toMatchObject({ wiring: { state: "not_wired" } });
    expect(persisted.worker?.lastObservedAt).toBeGreaterThan(40);
  });

  it("keeps connected Builds independent when a Worker has no Convex dependency", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const workerId = await attachRootWorker(t, ids, { builds: rootBuilds });
    const runId = await createCloudflareRun(t, ids, "verify_infrastructure");
    const verifyIds = { vaultId: ids.vaultId, runId, userId: ids.userId, workerId };

    await t.mutation(
      internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification,
      verifyIds,
    );
    await t.mutation(
      internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification,
      {
        ...verifyIds,
        providerResult: {
          workerName: "manual-cloudflare-worker",
          workersDev: { state: "unknown" },
          worker: "confirmed",
          builds: "confirmed",
          convexDeployment: "not_checked",
          convexBuildAccess: "not_checked",
        },
      },
    );

    const persisted = await t.run(async (ctx) => ({
      dependencies: await ctx.db
        .query("vaultWorkerDeploymentDependencies")
        .withIndex("by_worker", (q) => q.eq("workerId", workerId))
        .collect(),
      worker: await ctx.db.get(workerId),
    }));

    expect(persisted.worker).toMatchObject({
      builds: rootBuilds,
    });
    expect(persisted.dependencies).toEqual([]);
    expect(persisted.worker?.lastObservedAt).toBeGreaterThan(40);
  });

  it("confirms a missing-upstream Convex row while clearing contradicted deploy-key state", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const convexDeploymentId = await insertRootConvexDeployment(t, ids, {
      upstream: { state: "missing_upstream" },
    });
    const workerId = await attachRootWorker(t, ids, { builds: rootBuilds });
    const dependencyId = await insertWorkerDeploymentDependency(
      t,
      ids,
      workerId,
      convexDeploymentId,
      {
        state: "wired",
        deployKeys: {
          production: {
            state: "created",
            teamId: "convex-team",
            name: "production-key-name",
            deploymentName: "manual-cloudflare-prod",
          },
          preview: {
            state: "created",
            teamId: "convex-team",
            name: "preview-key-name",
            projectId: "convex-project",
          },
        },
      },
    );
    const runId = await createCloudflareRun(t, ids, "verify_infrastructure");
    const verifyIds = { vaultId: ids.vaultId, runId, userId: ids.userId, workerId };

    await expect(
      t.mutation(
        internal.vault.cloudflareMutations.claimCloudflareInfrastructureVerification,
        verifyIds,
      ),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.query(
        internal.vault.cloudflareMutations.readActiveCloudflareInfrastructureVerification,
        verifyIds,
      ),
    ).resolves.toMatchObject({
      active: true,
      dependency: {
        dependencyId,
        currentlyWired: false,
        convexDeployment: {
          convexDeploymentId,
          projectId: "convex-project",
          deploymentName: "manual-cloudflare-prod",
        },
      },
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareInfrastructureVerification, {
        ...verifyIds,
        providerResult: {
          workerName: "manual-cloudflare-worker",
          workersDev: { state: "unknown" },
          worker: "confirmed",
          builds: "confirmed",
          convexDeployment: "confirmed",
          convexBuildAccess: "contradicted",
        },
      }),
    ).resolves.toEqual({ applied: true });

    const result = await t.run(async (ctx) => {
      return {
        convexDeployment: await ctx.db.get(convexDeploymentId),
        dependency: await ctx.db.get(dependencyId),
        worker: await ctx.db.get(workerId),
      };
    });

    expect(result.convexDeployment).toMatchObject({
      upstream: { state: "present" },
    });
    expect(result.worker).toMatchObject({
      upstream: { state: "present" },
      builds: rootBuilds,
    });
    expect(result.dependency).toMatchObject({ wiring: { state: "not_wired" } });
  });

  it("attaches multiple Cloudflare Workers to one vault by stable app identity", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const adminAppId = await t.run(async (ctx) => {
      return await ctx.db.insert("vaultApps", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        rootDirectory: "apps/admin",
        createdAt: 26,
      });
    });

    const rootWorkerId = await insertWorkerForApp(t, ids, ids.appId, "manual-cloudflare-worker");
    const adminWorkerId = await insertWorkerForApp(t, ids, adminAppId, "admin-cloudflare-worker");

    const workers = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
    });

    expect(
      workers
        .map((worker) => ({
          appId: worker.appId,
          workerName: worker.workerName,
          vaultId: worker.vaultId,
        }))
        .sort((left, right) => left.workerName.localeCompare(right.workerName)),
    ).toEqual([
      {
        appId: adminAppId,
        workerName: "admin-cloudflare-worker",
        vaultId: ids.vaultId,
      },
      {
        appId: ids.appId,
        workerName: "manual-cloudflare-worker",
        vaultId: ids.vaultId,
      },
    ]);
    expect(workers.map((worker) => worker._id)).toEqual(
      expect.arrayContaining([rootWorkerId, adminWorkerId]),
    );
  });

  it("requires an app identity belonging to the vault before a Worker can attach", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const foreignAppId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Grace",
        email: "grace@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      return await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "apps/missing",
        createdAt: 30,
      });
    });

    await expect(
      t.query(internal.vault.cloudflareMutations.requireCloudflareWorkerConnectionVault, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: foreignAppId,
      }),
    ).rejects.toThrow("Vault app not found.");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        appId: foreignAppId,
        accountId: "cloudflare-account",
        workerName: "missing-cloudflare-worker",
        origin: "selected_existing",
      }),
    ).rejects.toThrow("Vault app not found.");
  });

  it("does not supersede active ownership based on elapsed time", async () => {
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
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ claimed: false });

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
      runId: staleRunId,
      state: "active",
    });
    expect(result.staleRun).toMatchObject({
      state: "running",
      currentStep: "attach_worker",
    });
  });

  it("retains the created Worker claim when attachment is superseded", async () => {
    const { ids, t } = await createCloudflareConnectionVault();

    await t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      appId: ids.appId,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      origin: "provisioned",
    });
    const creationClaimId = await createRecordedCloudflareWorkerClaim(t, ids);
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
        workersDev: { state: "unknown" },
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        provenance: { state: "provisioned", creationClaimId },
      }),
    ).resolves.toEqual({ state: "not_attached" });

    const result = await t.run(async (ctx) => {
      const [run, creationClaim] = await Promise.all([
        ctx.db.get(ids.runId),
        ctx.db.get(creationClaimId),
      ]);

      return { creationClaim, run };
    });

    expect(result.run).toMatchObject({
      state: "canceled",
      currentStep: "claim_infra",
    });
    expect(result.creationClaim).toMatchObject({
      lifecycle: {
        state: "created",
        workerTag: "manual-cloudflare-worker-tag",
      },
    });
  });

  it("recovers an uncertain Worker as selected existing and consumes its claim", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    await t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
      ...ids,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      origin: "provisioned",
    });
    const claim = await t.mutation(
      internal.vault.cloudflareMutations.beginCloudflareWorkerCreation,
      {
        ...ids,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
      },
    );
    const attachment = await t.mutation(internal.vault.cloudflareMutations.attachWorkerForRun, {
      ...ids,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      workersDev: { state: "unknown" },
      provenance: { state: "recovered_existing", creationClaimId: claim.claimId },
    });
    if (attachment.state !== "attached") {
      throw new Error("Expected recovered Worker attachment.");
    }

    const result = await t.run(async (ctx) => ({
      claim: await ctx.db.get(claim.claimId),
      worker: await ctx.db.get(attachment.workerId),
    }));
    expect(result.claim).toBeNull();
    expect(result.worker).toMatchObject({
      origin: "selected_existing",
      workerTag: "manual-cloudflare-worker-tag",
    });
  });
});

describe("stable app resource ownership", () => {
  it("allows several Workers on one app while keeping provider identity unique", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const { webAppId } = await createMonorepoApps(t, ids);

    await expect(
      t.query(internal.vault.cloudflareMutations.readCloudflareWorkerDiscoveryContext, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: webAppId,
      }),
    ).resolves.toMatchObject({ expectedRootDirectory: webRootDirectory });

    const firstWorkerId = await insertWorkerForApp(t, ids, webAppId, "web-worker");
    const secondWorkerId = await insertWorkerForApp(t, ids, webAppId, "web-worker-secondary");
    const workers = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultCloudflareWorkers")
          .withIndex("by_app", (q) => q.eq("appId", webAppId))
          .collect(),
    );

    expect(workers.map((worker) => worker._id)).toEqual(
      expect.arrayContaining([firstWorkerId, secondWorkerId]),
    );
    expect(workers).toHaveLength(2);
    expect(workers.every((worker) => worker.appId === webAppId)).toBe(true);
    expect(workers.every((worker) => worker.builds.state === "not_connected")).toBe(true);
    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
        ...ids,
        accountId: "cloudflare-account",
        workerName: "web-worker",
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ claimed: false });
    const rejectedConnection = await t.run(async (ctx) => {
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      return { events, run: await ctx.db.get(ids.runId) };
    });
    expect(rejectedConnection.run).toMatchObject({ state: "canceled" });
    expect(rejectedConnection.events.at(-1)).toMatchObject({
      level: "warn",
      step: "claim_infra",
      message: "Cloudflare Worker is already attached to another app.",
    });
  });

  it("builds from the Worker root and its explicit Convex dependency root", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const { backendAppId, webAppId } = await createMonorepoApps(t, ids);
    const workerId = await insertWorkerForApp(t, ids, webAppId, "web-worker");
    const convexDeploymentId = await insertConvexDeploymentForApp(t, ids, backendAppId);
    await insertWorkerDeploymentDependency(t, ids, workerId, convexDeploymentId, {
      state: "not_wired",
      deployKeys: {
        production: { state: "not_created" },
        preview: { state: "not_created" },
      },
    });
    const runId = await createCloudflareRun(t, ids, "wire_builds");
    const runArgs = { vaultId: ids.vaultId, runId, userId: ids.userId, workerId };

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareBuildsWiring, runArgs),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.query(internal.vault.cloudflareMutations.readActiveCloudflareBuildsWiring, runArgs),
    ).resolves.toMatchObject({
      active: true,
      hasConvexDeployment: true,
      app: { appId: webAppId, rootDirectory: webRootDirectory },
      worker: { workerId },
      buildConfig: {
        rootDirectory: webRootDirectory,
        pathIncludes: dependencyAwareWebBuilds.pathIncludes,
      },
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareBuildsForRun, {
        ...runArgs,
        builds: dependencyAwareWebBuilds,
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareBuildsWiring, runArgs),
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => await ctx.db.get(workerId))).resolves.toMatchObject({
      appId: webAppId,
      builds: dependencyAwareWebBuilds,
    });
  });
});

describe("explicit Worker to Convex dependencies", () => {
  it("creates Builds, stores keys on the relation, and lets Workers share a deployment", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const { backendAppId, webAppId } = await createMonorepoApps(t, ids);
    const workerId = await insertWorkerForApp(t, ids, webAppId, "web-worker");
    const convexDeploymentId = await insertConvexDeploymentForApp(t, ids, backendAppId);
    const runId = await createCloudflareRun(t, ids, "wire_convex_build_access");
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
    await expect(
      t.query(
        internal.vault.cloudflareMutations.readActiveCloudflareConvexBuildAccessWiring,
        runArgs,
      ),
    ).resolves.toMatchObject({
      active: true,
      buildConfig: {
        rootDirectory: webRootDirectory,
        pathIncludes: dependencyAwareWebBuilds.pathIncludes,
      },
      workerApp: { appId: webAppId, rootDirectory: webRootDirectory },
      convexApp: { appId: backendAppId, rootDirectory: backendRootDirectory },
      worker: { workerId },
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
    await expect(
      t.mutation(
        internal.vault.cloudflareMutations.finishCloudflareConvexBuildAccessWiring,
        runArgs,
      ),
    ).rejects.toThrow("Convex build access was not recorded.");

    await beginAndRecordConvexBuildAccessDeployKey(t, runArgs, "production", "production-key-name");
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

    await beginAndRecordConvexBuildAccessDeployKey(t, runArgs, "preview", "preview-key-name");
    await t.mutation(internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessForRun, {
      ...runArgs,
      builds: dependencyAwareWebBuilds,
    });
    await t.mutation(
      internal.vault.cloudflareMutations.finishCloudflareConvexBuildAccessWiring,
      runArgs,
    );

    const persistedDependency = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultWorkerDeploymentDependencies")
          .withIndex("by_worker", (q) => q.eq("workerId", workerId))
          .unique(),
    );
    expect(persistedDependency).toMatchObject({
      wiring: {
        state: "wired",
        deployKeys: {
          production: { state: "created", name: "production-key-name" },
          preview: { state: "created", name: "preview-key-name" },
        },
      },
    });

    const secondWorkerId = await insertWorkerForApp(t, ids, webAppId, "second-web-worker");
    await t.run(async (ctx) => await ctx.db.patch(secondWorkerId, { builds: webBuilds }));
    const secondRunId = await createCloudflareRun(t, ids, "wire_convex_build_access");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring, {
        ...runArgs,
        runId: secondRunId,
        workerId: secondWorkerId,
      }),
    ).resolves.toEqual({ claimed: true });
    const sharedDependencies = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultWorkerDeploymentDependencies")
          .withIndex("by_convex_deployment", (q) => q.eq("convexDeploymentId", convexDeploymentId))
          .collect(),
    );
    expect(sharedDependencies.map((dependency) => dependency.workerId)).toEqual(
      expect.arrayContaining([workerId, secondWorkerId]),
    );
  });

  it("recovers production and preview keys whose provider creation outcome is unknown", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const { backendAppId, webAppId } = await createMonorepoApps(t, ids);
    const workerId = await insertWorkerForApp(t, ids, webAppId, "web-worker");
    const convexDeploymentId = await insertConvexDeploymentForApp(t, ids, backendAppId);
    const runId = await createCloudflareRun(t, ids, "wire_convex_build_access");
    const runArgs = {
      vaultId: ids.vaultId,
      runId,
      userId: ids.userId,
      workerId,
      convexDeploymentId,
    };
    await t.mutation(
      internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring,
      runArgs,
    );
    await expect(
      t.mutation(
        internal.vault.cloudflareMutations.beginCloudflareConvexBuildAccessDeployKeyCreation,
        {
          ...runArgs,
          deployment: "production",
          convexDeployKeyName: "creating-production-key",
        },
      ),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.mutation(
        internal.vault.cloudflareMutations.beginCloudflareConvexBuildAccessDeployKeyCreation,
        {
          ...runArgs,
          deployment: "preview",
          convexDeployKeyName: "creating-preview-key",
        },
      ),
    ).resolves.toEqual({ applied: true });

    const creatingDependency = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultWorkerDeploymentDependencies")
          .withIndex("by_worker", (q) => q.eq("workerId", workerId))
          .unique(),
    );
    expect(creatingDependency).toMatchObject({
      wiring: {
        state: "not_wired",
        deployKeys: {
          production: {
            state: "creating",
            runId,
            teamId: "convex-team",
            name: "creating-production-key",
            deploymentName: "manual-cloudflare-prod",
          },
          preview: {
            state: "creating",
            runId,
            teamId: "convex-team",
            name: "creating-preview-key",
            projectId: "convex-project",
          },
        },
      },
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.clearCloudflareConvexBuildAccessDeployKey, {
        ...runArgs,
        deployKey: {
          deployment: "production",
          value: {
            teamId: "convex-team",
            name: "creating-production-key",
            deploymentName: "manual-cloudflare-prod",
          },
        },
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.clearCloudflareConvexBuildAccessDeployKey, {
        ...runArgs,
        deployKey: {
          deployment: "preview",
          value: {
            teamId: "convex-team",
            name: "creating-preview-key",
            projectId: "convex-project",
          },
        },
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("vaultWorkerDeploymentDependencies")
            .withIndex("by_worker", (q) => q.eq("workerId", workerId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      wiring: {
        state: "not_wired",
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
      },
    });
  });

  it("keeps a creating key when completion or cleanup identities do not match", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const { backendAppId, webAppId } = await createMonorepoApps(t, ids);
    const workerId = await insertWorkerForApp(t, ids, webAppId, "web-worker");
    const convexDeploymentId = await insertConvexDeploymentForApp(t, ids, backendAppId);
    const runId = await createCloudflareRun(t, ids, "wire_convex_build_access");
    const runArgs = {
      vaultId: ids.vaultId,
      runId,
      userId: ids.userId,
      workerId,
      convexDeploymentId,
    };
    await t.mutation(
      internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring,
      runArgs,
    );
    await t.mutation(
      internal.vault.cloudflareMutations.beginCloudflareConvexBuildAccessDeployKeyCreation,
      {
        ...runArgs,
        deployment: "production",
        convexDeployKeyName: "creating-production-key",
      },
    );

    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessDeployKey, {
        ...runArgs,
        deployment: "production",
        convexDeployKeyName: "different-production-key",
      }),
    ).resolves.toEqual({ applied: false });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.clearCloudflareConvexBuildAccessDeployKey, {
        ...runArgs,
        deployKey: {
          deployment: "production",
          value: {
            teamId: "convex-team",
            name: "creating-production-key",
            deploymentName: "different-production-target",
          },
        },
      }),
    ).resolves.toEqual({ applied: false });
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("vaultWorkerDeploymentDependencies")
            .withIndex("by_worker", (q) => q.eq("workerId", workerId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      wiring: {
        deployKeys: {
          production: {
            state: "creating",
            runId,
            teamId: "convex-team",
            name: "creating-production-key",
            deploymentName: "manual-cloudflare-prod",
          },
        },
      },
    });
  });

  it("does not let another run overlap a deploy-key creation", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const { backendAppId, webAppId } = await createMonorepoApps(t, ids);
    const workerId = await insertWorkerForApp(t, ids, webAppId, "web-worker");
    const convexDeploymentId = await insertConvexDeploymentForApp(t, ids, backendAppId);
    const firstRunId = await createCloudflareRun(t, ids, "wire_convex_build_access");
    const firstRunArgs = {
      vaultId: ids.vaultId,
      runId: firstRunId,
      userId: ids.userId,
      workerId,
      convexDeploymentId,
    };
    await t.mutation(
      internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring,
      firstRunArgs,
    );
    await t.mutation(
      internal.vault.cloudflareMutations.beginCloudflareConvexBuildAccessDeployKeyCreation,
      {
        ...firstRunArgs,
        deployment: "production",
        convexDeployKeyName: "first-run-production-key",
      },
    );

    await t.run(async (ctx) => {
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      if (!ownership) {
        throw new Error("Expected infrastructure ownership.");
      }
      await ctx.db.patch(ownership._id, { updatedAt: 0 });
    });
    const secondRunId = await createCloudflareRun(t, ids, "wire_convex_build_access");
    const secondRunArgs = { ...firstRunArgs, runId: secondRunId };
    await expect(
      t.mutation(
        internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring,
        secondRunArgs,
      ),
    ).resolves.toEqual({ claimed: false });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordCloudflareConvexBuildAccessDeployKey, {
        ...firstRunArgs,
        deployment: "production",
        convexDeployKeyName: "first-run-production-key",
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("vaultWorkerDeploymentDependencies")
            .withIndex("by_worker", (q) => q.eq("workerId", workerId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      wiring: {
        deployKeys: {
          production: {
            state: "created",
            teamId: "convex-team",
            name: "first-run-production-key",
            deploymentName: "manual-cloudflare-prod",
          },
        },
      },
    });
  });

  it("keeps both key axes truthful when preview key creation fails during rotation", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const { backendAppId, webAppId } = await createMonorepoApps(t, ids);
    const workerId = await insertWorkerForApp(t, ids, webAppId, "web-worker");
    const convexDeploymentId = await insertConvexDeploymentForApp(t, ids, backendAppId);
    const dependencyId = await insertWorkerDeploymentDependency(
      t,
      ids,
      workerId,
      convexDeploymentId,
      {
        state: "wired",
        deployKeys: {
          production: {
            state: "created",
            teamId: "convex-team",
            name: "old-production-key",
            deploymentName: "manual-cloudflare-prod",
          },
          preview: {
            state: "created",
            teamId: "convex-team",
            name: "old-preview-key",
            projectId: "convex-project",
          },
        },
      },
    );
    const runId = await createCloudflareRun(t, ids, "wire_convex_build_access");
    const runArgs = {
      vaultId: ids.vaultId,
      runId,
      userId: ids.userId,
      workerId,
      convexDeploymentId,
    };
    await t.mutation(
      internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring,
      runArgs,
    );

    await expect(
      t.mutation(internal.vault.cloudflareMutations.clearCloudflareConvexBuildAccessDeployKey, {
        ...runArgs,
        deployKey: {
          deployment: "production",
          value: {
            teamId: "convex-team",
            name: "old-production-key",
            deploymentName: "manual-cloudflare-prod",
          },
        },
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.clearCloudflareConvexBuildAccessDeployKey, {
        ...runArgs,
        deployKey: {
          deployment: "preview",
          value: {
            teamId: "convex-team",
            name: "old-preview-key",
            projectId: "convex-project",
          },
        },
      }),
    ).resolves.toEqual({ applied: true });
    await beginAndRecordConvexBuildAccessDeployKey(
      t,
      runArgs,
      "production",
      "replacement-production-key",
    );

    await expect(
      t.mutation(internal.vault.cloudflareMutations.clearCloudflareConvexBuildAccessDeployKey, {
        ...runArgs,
        deployKey: {
          deployment: "production",
          value: {
            teamId: "convex-team",
            name: "replacement-production-key",
            deploymentName: "manual-cloudflare-prod",
          },
        },
      }),
    ).resolves.toEqual({ applied: true });
    await expect(t.run(async (ctx) => await ctx.db.get(dependencyId))).resolves.toMatchObject({
      wiring: {
        state: "not_wired",
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
      },
    });
  });

  it("clears recorded replacement keys after a post-secret failure without clearing another key", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const { backendAppId, webAppId } = await createMonorepoApps(t, ids);
    const workerId = await insertWorkerForApp(t, ids, webAppId, "web-worker");
    const convexDeploymentId = await insertConvexDeploymentForApp(t, ids, backendAppId);
    const runId = await createCloudflareRun(t, ids, "wire_convex_build_access");
    const runArgs = {
      vaultId: ids.vaultId,
      runId,
      userId: ids.userId,
      workerId,
      convexDeploymentId,
    };
    await t.mutation(
      internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring,
      runArgs,
    );
    await beginAndRecordConvexBuildAccessDeployKey(
      t,
      runArgs,
      "production",
      "replacement-production-key",
    );
    await beginAndRecordConvexBuildAccessDeployKey(
      t,
      runArgs,
      "preview",
      "replacement-preview-key",
    );

    await expect(
      t.mutation(internal.vault.cloudflareMutations.clearCloudflareConvexBuildAccessDeployKey, {
        ...runArgs,
        deployKey: {
          deployment: "production",
          value: {
            teamId: "convex-team",
            name: "different-production-key",
            deploymentName: "manual-cloudflare-prod",
          },
        },
      }),
    ).resolves.toEqual({ applied: false });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.clearCloudflareConvexBuildAccessDeployKey, {
        ...runArgs,
        deployKey: {
          deployment: "production",
          value: {
            teamId: "convex-team",
            name: "replacement-production-key",
            deploymentName: "manual-cloudflare-prod",
          },
        },
      }),
    ).resolves.toEqual({ applied: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.clearCloudflareConvexBuildAccessDeployKey, {
        ...runArgs,
        deployKey: {
          deployment: "preview",
          value: {
            teamId: "convex-team",
            name: "replacement-preview-key",
            projectId: "convex-project",
          },
        },
      }),
    ).resolves.toEqual({ applied: true });

    const dependency = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultWorkerDeploymentDependencies")
          .withIndex("by_worker", (q) => q.eq("workerId", workerId))
          .unique(),
    );
    expect(dependency).toMatchObject({
      wiring: {
        state: "not_wired",
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
      },
    });
  });

  it("retargets one Worker while preserving old key targets for revocation", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const { backendAppId, webAppId } = await createMonorepoApps(t, ids);
    const workerId = await insertWorkerForApp(t, ids, webAppId, "web-worker");
    await t.run(async (ctx) => await ctx.db.patch(workerId, { builds: dependencyAwareWebBuilds }));
    const firstDeploymentId = await insertConvexDeploymentForApp(t, ids, backendAppId);
    const dependencyId = await insertWorkerDeploymentDependency(
      t,
      ids,
      workerId,
      firstDeploymentId,
      {
        state: "wired",
        deployKeys: {
          production: {
            state: "created",
            teamId: "convex-team",
            name: "first-production-key",
            deploymentName: "manual-cloudflare-prod",
          },
          preview: {
            state: "created",
            teamId: "convex-team",
            name: "first-preview-key",
            projectId: "convex-project",
          },
        },
      },
    );
    const replacementAppId = await t.run(
      async (ctx) =>
        await ctx.db.insert("vaultApps", {
          vaultId: ids.vaultId,
          userId: ids.userId,
          rootDirectory: "packages/replacement-backend",
          createdAt: 60,
        }),
    );
    const replacementDeploymentId = await insertConvexDeploymentForApp(t, ids, replacementAppId, {
      projectId: "replacement-project",
      projectSlug: "replacement",
      deploymentName: "replacement-prod",
    });
    const runId = await createCloudflareRun(t, ids, "wire_convex_build_access");

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
            teamId: "convex-team",
            name: "first-production-key",
            deploymentName: "manual-cloudflare-prod",
          },
          preview: {
            state: "created",
            teamId: "convex-team",
            name: "first-preview-key",
            projectId: "convex-project",
          },
        },
      },
    });
  });

  it("does not retarget a Worker while deploy keys from another team remain", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const { backendAppId, webAppId } = await createMonorepoApps(t, ids);
    const workerId = await insertWorkerForApp(t, ids, webAppId, "web-worker");
    const firstDeploymentId = await insertConvexDeploymentForApp(t, ids, backendAppId);
    const dependencyId = await insertWorkerDeploymentDependency(
      t,
      ids,
      workerId,
      firstDeploymentId,
      {
        state: "wired",
        deployKeys: {
          production: {
            state: "created",
            teamId: "convex-team",
            name: "first-production-key",
            deploymentName: "manual-cloudflare-prod",
          },
          preview: {
            state: "created",
            teamId: "convex-team",
            name: "first-preview-key",
            projectId: "convex-project",
          },
        },
      },
    );
    const replacementAppId = await t.run(
      async (ctx) =>
        await ctx.db.insert("vaultApps", {
          vaultId: ids.vaultId,
          userId: ids.userId,
          rootDirectory: "packages/replacement-backend",
          createdAt: 60,
        }),
    );
    const replacementDeploymentId = await insertConvexDeploymentForApp(t, ids, replacementAppId, {
      teamId: "other-team",
      projectId: "replacement-project",
      projectSlug: "replacement",
      deploymentName: "replacement-prod",
    });
    const runId = await createCloudflareRun(t, ids, "wire_convex_build_access");

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareConvexBuildAccessWiring, {
        vaultId: ids.vaultId,
        runId,
        userId: ids.userId,
        workerId,
        convexDeploymentId: replacementDeploymentId,
      }),
    ).rejects.toThrow("remove them before changing teams");
    await expect(t.run(async (ctx) => await ctx.db.get(dependencyId))).resolves.toMatchObject({
      convexDeploymentId: firstDeploymentId,
      wiring: {
        state: "wired",
        deployKeys: {
          production: {
            state: "created",
            teamId: "convex-team",
            name: "first-production-key",
          },
          preview: {
            state: "created",
            teamId: "convex-team",
            name: "first-preview-key",
          },
        },
      },
    });
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("vaultInfrastructureOwnership")
            .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
            .unique(),
      ),
    ).resolves.toBeNull();
  });

  it("makes no provider call when retained deploy keys contradict the target team", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const { backendAppId, webAppId } = await createMonorepoApps(t, ids);
    const workerId = await insertWorkerForApp(t, ids, webAppId, "web-worker");
    const replacementDeploymentId = await insertConvexDeploymentForApp(t, ids, backendAppId, {
      teamId: "other-team",
      projectId: "replacement-project",
      projectSlug: "replacement",
      deploymentName: "replacement-prod",
    });
    await insertWorkerDeploymentDependency(t, ids, workerId, replacementDeploymentId, {
      state: "wired",
      deployKeys: {
        production: {
          state: "created",
          teamId: "convex-team",
          name: "old-production-key",
          deploymentName: "old-prod",
        },
        preview: {
          state: "created",
          teamId: "convex-team",
          name: "old-preview-key",
          projectId: "old-project",
        },
      },
    });
    const runId = await createCloudflareRun(t, ids, "wire_convex_build_access");
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId: ids.vaultId,
        runId,
        state: "active",
        updatedAt: 70,
      });
    });
    const fetch = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      t.action(internal.vault.cloudflare.ensureCloudflareConvexBuildAccessWiring, {
        vaultId: ids.vaultId,
        runId,
        userId: ids.userId,
        workerId,
        convexDeploymentId: replacementDeploymentId,
      }),
    ).rejects.toThrow("remove them before rewiring access");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("dependency verification and run ownership", () => {
  it("derives shared Workers as repairable without rewriting their wiring rows", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const { backendAppId, webAppId } = await createMonorepoApps(t, ids);
    const convexDeploymentId = await insertConvexDeploymentForApp(t, ids, backendAppId);
    const firstWorkerId = await insertWorkerForApp(t, ids, webAppId, "first-worker");
    const secondWorkerId = await insertWorkerForApp(t, ids, webAppId, "second-worker");
    await t.run(async (ctx) => {
      await ctx.db.patch(firstWorkerId, { builds: dependencyAwareWebBuilds });
      await ctx.db.patch(secondWorkerId, { builds: dependencyAwareWebBuilds });
    });
    const wiring = {
      state: "wired" as const,
      deployKeys: {
        production: {
          state: "created" as const,
          teamId: "convex-team",
          name: "production-key",
          deploymentName: "manual-cloudflare-prod",
        },
        preview: {
          state: "created" as const,
          teamId: "convex-team",
          name: "preview-key",
          projectId: "convex-project",
        },
      },
    };
    const [firstDependencyId, secondDependencyId] = await Promise.all([
      insertWorkerDeploymentDependency(t, ids, firstWorkerId, convexDeploymentId, wiring),
      insertWorkerDeploymentDependency(t, ids, secondWorkerId, convexDeploymentId, wiring),
    ]);
    const runId = await createCloudflareRun(t, ids, "verify_infrastructure");
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
          workerName: "manual-cloudflare-worker",
          workersDev: { state: "unknown" },
          worker: "confirmed",
          builds: "confirmed",
          convexDeployment: "missing_upstream",
          convexBuildAccess: "not_checked",
        },
      }),
    ).resolves.toEqual({ applied: true });

    const persisted = await t.run(async (ctx) => {
      const [convexDeployment, firstDependency, secondDependency] = await Promise.all([
        ctx.db.get(convexDeploymentId),
        ctx.db.get(firstDependencyId),
        ctx.db.get(secondDependencyId),
      ]);
      return {
        convexDeployment,
        firstCurrentlyWired:
          convexDeployment && firstDependency
            ? isWorkerDeploymentDependencyCurrentlyWired(firstDependency, convexDeployment)
            : null,
        firstDependency,
        secondCurrentlyWired:
          convexDeployment && secondDependency
            ? isWorkerDeploymentDependencyCurrentlyWired(secondDependency, convexDeployment)
            : null,
        secondDependency,
      };
    });
    expect(persisted.convexDeployment).toMatchObject({ upstream: { state: "missing_upstream" } });
    expect(persisted.firstDependency).toMatchObject({ wiring: { state: "wired" } });
    expect(persisted.secondDependency).toMatchObject({ wiring: { state: "wired" } });
    expect(persisted.firstCurrentlyWired).toBe(false);
    expect(persisted.secondCurrentlyWired).toBe(false);
  });

  it("fences a superseded Builds run before it can persist provider results", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const { webAppId } = await createMonorepoApps(t, ids);
    const workerId = await insertWorkerForApp(t, ids, webAppId, "web-worker");
    const runId = await createCloudflareRun(t, ids, "wire_builds");
    const runArgs = { vaultId: ids.vaultId, runId, userId: ids.userId, workerId };
    await t.mutation(internal.vault.cloudflareMutations.claimCloudflareBuildsWiring, runArgs);

    const supersedingRunId = await createCloudflareRun(t, ids, "wire_builds");
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
        builds: webBuilds,
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
