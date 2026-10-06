import { x25519 } from "@noble/curves/ed25519";
import { Octokit } from "@octokit/rest";
import sodium from "libsodium-wrappers";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubMocks = vi.hoisted(() => ({
  createRepositoryOctokit: vi.fn(),
  resolveAppAccess: vi.fn(),
  seedRepository: vi.fn<typeof import("./starterSeed").seedRepositoryWithStarter>(),
}));

vi.mock("./githubApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./githubApp")>();
  return {
    ...actual,
    createGitHubRepositoryInstallationOctokit: githubMocks.createRepositoryOctokit,
  };
});

vi.mock("./githubAppAccess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./githubAppAccess")>();
  return {
    ...actual,
    resolveGitHubAppAccessForProvisioningRun: githubMocks.resolveAppAccess,
  };
});

vi.mock("./starterSeed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./starterSeed")>();
  return {
    ...actual,
    seedRepositoryWithStarter: githubMocks.seedRepository,
  };
});

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { formatMissingGitHubAppPermissionMessage } from "./githubActionsSecrets";
import { actionsStarterTemplateManifest } from "./starterSeedManifest.actions.generated";
import { isSamebaseProvisioningPlan } from "./repository/provisioningPlan";
import { startRepositoryInfrastructureProvisioningWorkflow } from "./repositoryProvisioningWorkflow";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "./test.setup";

async function createComposedRepository(buildTokenUuid: string | null = "build-token") {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "composed-app-installation",
      githubOwnerId: "composed-app-owner",
      githubOwnerLogin: "ada",
      githubOwnerLoginNormalized: "ada",
      githubOwnerType: "user",
      convexTeam: { teamId: "convex-team" },
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
      },
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId,
      repositoryId,
      githubRepositoryFullName: "ada/composed-app",
      trigger: "create",
      state: "running",
      currentStep: "sync_tree",
      createdAt: 10,
      updatedAt: 20,
    });
    await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
      repositoryId,
      owner: { kind: "managed_run", runId },
      state: "active",
      lastWriteAt: {},
      updatedAt: 20,
    });
    await ctx.db.replace(repositoryId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "connected",
      githubMode: "create_repository",
      runId,
      githubRepositoryDatabaseId: "123",
      githubRepositoryName: "composed-app",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
    });
    const planId = await ctx.db.insert("workflow_repositoryProvisioning_plans", {
      repositoryId,
      convexConfigPath: "convex.json",
      convex: {
        state: "planned",
        projectName: "composed-app",
        deploymentRegion: "aws-eu-west-1",
      },
      cloudflare: {
        state: "planned",
        workerName: "composed-app",
        rootDirectory: "/",
        buildTokenUuid,
      },
      createdAt: 30,
      updatedAt: 30,
    });
    return {
      organizationId,
      planId,
      runId,
      userId,
      repositoryId,
    };
  });
  return { ids, t };
}

async function attachComposedResources({
  ids,
  t,
}: Awaited<ReturnType<typeof createComposedRepository>>) {
  return await t.run(async (ctx) => {
    const plan = await ctx.db.get(ids.planId);
    if (!isSamebaseProvisioningPlan(plan)) {
      throw new Error("Expected a samebase provisioning plan.");
    }
    await ctx.db.patch(plan._id, {
      convex: {
        state: "created",
        projectName: "composed-app",
        deploymentRegion: "aws-eu-west-1",
        projectId: "convex-project",
      },
      cloudflare: {
        state: "created",
        workerName: "composed-app",
        workerTag: "composed-worker-tag",
        rootDirectory: plan.cloudflare.rootDirectory,
        buildTokenUuid: "build-token",
      },
    });
    const convexProjectId = await ctx.db.insert("repositoryConvexProjects", {
      repositoryId: ids.repositoryId,
      organizationId: ids.organizationId,
      teamId: "convex-team",
      projectId: "convex-project",
      convexConfigPath: "convex.json",
      origin: "provisioned",
    });
    const workerId = await ctx.db.insert("repositoryCloudflareWorkers", {
      repositoryId: ids.repositoryId,
      organizationId: ids.organizationId,
      accountId: "cloudflare-account",
      workerName: "composed-app",
      workerTag: "composed-worker-tag",
      rootDirectory: plan.cloudflare.rootDirectory,
      origin: "provisioned",
    });
    return { convexProjectId, workerId };
  });
}

describe("app provisioning workflow composition", () => {
  it("maps the provisioning root to the Convex config path and reads exact attachments", async () => {
    const { ids, t } = await createComposedRepository();

    await expect(
      t.query(internal.repositoryProvisioningWorkflow.readComposedInfrastructureState, {
        runId: ids.runId,
        userId: ids.userId,
        repositoryId: ids.repositoryId,
      }),
    ).resolves.toEqual({
      convexConfigPath: "convex.json",
      convex: {
        state: "missing",
        projectName: "composed-app",
      },
      cloudflare: {
        state: "missing",
        accountId: "cloudflare-account",
        workerName: "composed-app",
        buildTokenUuid: "build-token",
      },
    });

    const attachments = await attachComposedResources({ ids, t });

    await expect(
      t.query(internal.repositoryProvisioningWorkflow.readComposedInfrastructureState, {
        runId: ids.runId,
        userId: ids.userId,
        repositoryId: ids.repositoryId,
      }),
    ).resolves.toMatchObject({
      convex: { state: "attached", convexProjectId: attachments.convexProjectId },
      cloudflare: { state: "attached", workerId: attachments.workerId },
    });
  });

  it("skips Cloudflare setup when the confirmed token list was empty", async () => {
    const { ids, t } = await createComposedRepository(null);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.planId, {
        convex: {
          state: "created",
          projectName: "composed-app",
          deploymentRegion: "aws-eu-west-1",
          projectId: "convex-project",
        },
      });
      await ctx.db.insert("repositoryConvexProjects", {
        repositoryId: ids.repositoryId,
        organizationId: ids.organizationId,
        teamId: "convex-team",
        projectId: "convex-project",
        convexConfigPath: "convex.json",
        origin: "provisioned",
      });
    });

    vi.useFakeTimers();
    try {
      const workflowId = await t.run(async (ctx) => {
        return await startRepositoryInfrastructureProvisioningWorkflow(ctx, {
          repositoryId: ids.repositoryId,
          runId: ids.runId,
        });
      });
      await t.run(async (ctx) => await ctx.db.patch(ids.runId, { workflowId }));
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const result = await t.run(async (ctx) => {
        const events = await ctx.db
          .query("workflow_repositoryProvisioning_events")
          .withIndex("by_run_and_created_at_and_source_order", (q) => q.eq("runId", ids.runId))
          .collect();
        return {
          run: await ctx.db.get(ids.runId),
          steps: events.map((event) => event.step),
          write: await ctx.db
            .query("workflow_repositoryProvisioning_writeLocks")
            .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
            .unique(),
          plan: await ctx.db.get(ids.planId),
          workers: await ctx.db.query("repositoryCloudflareWorkers").take(1),
        };
      });

      expect(result.run).toMatchObject({ state: "succeeded", currentStep: "finish" });
      expect(result.write).toMatchObject({
        owner: { kind: "managed_run", runId: ids.runId },
        state: "succeeded",
      });
      expect(result.steps).toContain("claim_infra");
      expect(result.steps).toContain("finish");
      expect(result.steps).not.toContain("attach_worker");
      expect(result.steps).not.toContain("configure_workers_builds_for_github");
      expect(result.steps).not.toContain("rotate_convex_deploy_keys_for_workers_builds");
      expect(result.plan).toMatchObject({
        convex: { state: "created", projectId: "convex-project" },
        cloudflare: { state: "planned", buildTokenUuid: null },
      });
      expect(result.workers).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps managed provider freshness when infrastructure ownership completes", async () => {
    const { ids, t } = await createComposedRepository();
    await attachComposedResources({ ids, t });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      await t.mutation(
        internal.repositoryProvisioningWorkflow.claimComposedInfrastructureProvisioning,
        {
          userId: ids.userId,
          repositoryId: ids.repositoryId,
          runId: ids.runId,
        },
      );
      vi.setSystemTime(2_000);
      await t.mutation(internal.repository.infrastructureOperation.recordManagedProviderWrites, {
        repositoryId: ids.repositoryId,
        runId: ids.runId,
        providers: ["cloudflare"],
        lastUsedBuildTokenUuid: "  build-token  ",
      });
      vi.setSystemTime(3_000);
      await t.mutation(internal.repository.infrastructureOperation.recordManagedProviderWrites, {
        repositoryId: ids.repositoryId,
        runId: ids.runId,
        providers: ["convex", "cloudflare"],
      });
      vi.setSystemTime(4_000);
      await t.mutation(
        internal.repositoryProvisioningWorkflow.finishComposedInfrastructureProvisioning,
        {
          userId: ids.userId,
          repositoryId: ids.repositoryId,
          runId: ids.runId,
        },
      );
    } finally {
      vi.useRealTimers();
    }

    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_repositoryProvisioning_writeLocks")
            .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      owner: { kind: "managed_run", runId: ids.runId },
      state: "succeeded",
      lastWriteAt: {
        convex: 3_000,
        cloudflare: 3_000,
      },
      updatedAt: 4_000,
    });
    await expect(
      t.run(async (ctx) => (await ctx.db.get(ids.organizationId))?.cloudflareAccount),
    ).resolves.toEqual({
      accountId: "cloudflare-account",
      accountName: "Cloudflare account",
      lastUsedBuildTokenUuid: "build-token",
    });
  });

  it("does not finish a managed lock owned by a newer run", async () => {
    const { ids, t } = await createComposedRepository();
    const newerRunId = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId: ids.organizationId,
        userId: ids.userId,
        repositoryId: ids.repositoryId,
        githubRepositoryFullName: "ada/composed-app",
        trigger: "retry",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 40,
        updatedAt: 40,
      });
      const writeLock = await ctx.db
        .query("workflow_repositoryProvisioning_writeLocks")
        .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
        .unique();
      if (!writeLock) {
        throw new Error("Expected managed write lock.");
      }
      await ctx.db.replace(writeLock._id, {
        repositoryId: ids.repositoryId,
        owner: { kind: "managed_run", runId },
        state: "active",
        lastWriteAt: { cloudflare: 41 },
        updatedAt: 42,
      });
      return runId;
    });

    await expect(
      t.mutation(internal.repositoryProvisioningWorkflow.finishComposedInfrastructureProvisioning, {
        userId: ids.userId,
        repositoryId: ids.repositoryId,
        runId: ids.runId,
      }),
    ).rejects.toThrow("Composed infrastructure run no longer holds the provisioning write lock.");
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_repositoryProvisioning_writeLocks")
            .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      owner: { kind: "managed_run", runId: newerRunId },
      state: "active",
      lastWriteAt: { cloudflare: 41 },
      updatedAt: 42,
    });
  });

  it("records a managed provider failure without a finish event", async () => {
    const { ids, t } = await createComposedRepository();
    await attachComposedResources({ ids, t });
    await t.mutation(
      internal.repositoryProvisioningWorkflow.claimComposedInfrastructureProvisioning,
      {
        userId: ids.userId,
        repositoryId: ids.repositoryId,
        runId: ids.runId,
      },
    );
    await t.mutation(internal.repositoryProvisioningRuns.appendRunEvent, {
      runId: ids.runId,
      step: "rotate_convex_deploy_keys_for_workers_builds",
      level: "info",
      message: "Rotating Convex deploy keys for Workers Builds.",
      state: "running",
    });
    await t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow",
      message: "Could not set build variables.",
    });

    const result = await t.run(async (ctx) => {
      const events = await ctx.db
        .query("workflow_repositoryProvisioning_events")
        .withIndex("by_run_and_created_at_and_source_order", (q) => q.eq("runId", ids.runId))
        .collect();
      return {
        run: await ctx.db.get(ids.runId),
        write: await ctx.db
          .query("workflow_repositoryProvisioning_writeLocks")
          .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
          .unique(),
        steps: events.map((event) => event.step),
      };
    });
    expect(result.run).toMatchObject({
      state: "failed",
      currentStep: "rotate_convex_deploy_keys_for_workers_builds",
    });
    expect(result.write).toMatchObject({
      owner: { kind: "managed_run", runId: ids.runId },
      state: "failed",
    });
    expect(result.steps).not.toContain("finish");
  });

  it("never takes an active provisioning lock from another run", async () => {
    const { ids, t } = await createComposedRepository();
    const retryRunId = await t.run(async (ctx) => {
      return await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId: ids.organizationId,
        userId: ids.userId,
        repositoryId: ids.repositoryId,
        githubRepositoryFullName: "ada/composed-app",
        trigger: "retry",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 100,
        updatedAt: 100,
      });
    });

    await expect(
      t.mutation(internal.repositoryProvisioningWorkflow.claimComposedInfrastructureProvisioning, {
        userId: ids.userId,
        repositoryId: ids.repositoryId,
        runId: retryRunId,
      }),
    ).resolves.toEqual({ claimed: false });

    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_repositoryProvisioning_writeLocks")
            .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      owner: { kind: "managed_run", runId: ids.runId },
      state: "active",
    });
  });
});

const actionsRepositorySecretKey = new Uint8Array(32).fill(7);
const actionsRepositoryPublicKey = btoa(
  String.fromCharCode(...x25519.getPublicKey(actionsRepositorySecretKey)),
);

/** Opens a secret that write_actions_secrets sealed for the fake repository's public key. */
async function openActionsSecret(request: FakeGitHubRequest | undefined): Promise<string> {
  const body = request?.body;
  if (
    typeof body !== "object" ||
    body === null ||
    !("encrypted_value" in body) ||
    typeof body.encrypted_value !== "string"
  ) {
    throw new Error("Expected a sealed secret.");
  }
  await sodium.ready;
  return sodium.crypto_box_seal_open(
    sodium.from_base64(body.encrypted_value, sodium.base64_variants.ORIGINAL),
    x25519.getPublicKey(actionsRepositorySecretKey),
    actionsRepositorySecretKey,
    "text",
  );
}

type FakeGitHubRequest = { method: string; path: string; body: unknown };

/** A commit of the fake repository's main: its tree and the paths in that tree. */
type FakeCommit = { sha: string; treeSha: string; paths: string[] };

const BOOTSTRAP_COMMIT: FakeCommit = {
  sha: "bootstrap-commit",
  treeSha: "bootstrap-tree",
  paths: [".samebase-seed-bootstrap"],
};
const SEED_COMMIT: FakeCommit = { sha: "seed-commit", treeSha: "seed-tree", paths: [] };
const FOREIGN_COMMIT: FakeCommit = {
  sha: "foreign-commit",
  treeSha: "foreign-tree",
  paths: [".samebase-seed-bootstrap", "notes.md"],
};

/**
An Octokit whose fetch answers like GitHub for one new repository, created with the owner's
`defaultBranch`; a PATCH of the repository changes it. `denySecrets` answers the secrets 403, and
`failTreeSync` answers the tree read of sync_tree 500. `mainHistory` is main, newest commit first,
and empty while main does not exist. `seedStops` makes the next starter seeds stop: before_push
after the seeder recorded the starter tree, after_push once GitHub accepted the starter, and
foreign_commit_before_push like before_push while someone else pushes to main. `calls` records the
requests and the starter seeds in order.
*/
function createFakeGitHub(options: {
  defaultBranch: string;
  denySecrets: boolean;
  failTreeSync: boolean;
  seedStops?: Array<"before_push" | "after_push" | "foreign_commit_before_push">;
}) {
  const requests: FakeGitHubRequest[] = [];
  const calls: string[] = [];
  const mainHistory: FakeCommit[] = [];
  const seedStops = [...(options.seedStops ?? [])];
  // The seeder points main at the bootstrap commit (no starter files), runs the step before the
  // starter push with the starter tree, then fast-forwards main to the starter.
  githubMocks.seedRepository.mockImplementation(async (args) => {
    calls.push("branch without starter");
    if (mainHistory.length === 0) {
      mainHistory.push(BOOTSTRAP_COMMIT);
    }
    await args.branchFirst?.beforeStarterPush({ treeSha: SEED_COMMIT.treeSha });
    const stop = seedStops.shift();
    if (stop === "foreign_commit_before_push") {
      mainHistory.unshift(FOREIGN_COMMIT);
    }
    if (stop === "before_push" || stop === "foreign_commit_before_push") {
      throw new Error("The connection to GitHub was reset.");
    }
    mainHistory.unshift(SEED_COMMIT);
    calls.push("seed");
    if (stop === "after_push") {
      throw new Error("The connection to GitHub was reset.");
    }
    return { defaultBranch: "main", headCommitSha: SEED_COMMIT.sha };
  });
  // GitHub's REST shape of the repository.
  const actionsRepository = {
    id: 9001,
    name: "actions-app",
    full_name: "samebase/actions-app",
    private: true,
    default_branch: options.defaultBranch,
    owner: { id: 1, login: "samebase" },
  };
  const respond = (request: FakeGitHubRequest): { status: number; body?: unknown } => {
    const repositoryPath = `/repos/${actionsRepository.full_name}`;
    if (request.method === "POST" && request.path === "/orgs/samebase/repos") {
      return { status: 201, body: actionsRepository };
    }
    if (request.path === "/installation/repositories") {
      return { status: 200, body: { total_count: 1, repositories: [actionsRepository] } };
    }
    if (request.method === "GET" && request.path === repositoryPath) {
      return { status: 200, body: actionsRepository };
    }
    if (request.method === "PATCH" && request.path === repositoryPath) {
      const body = request.body;
      if (
        typeof body === "object" &&
        body !== null &&
        "default_branch" in body &&
        typeof body.default_branch === "string"
      ) {
        actionsRepository.default_branch = body.default_branch;
      }
      return { status: 200, body: actionsRepository };
    }
    if (request.path === `${repositoryPath}/actions/secrets/public-key`) {
      return options.denySecrets
        ? { status: 403, body: { message: "Resource not accessible by integration" } }
        : { status: 200, body: { key_id: "test-key-id", key: actionsRepositoryPublicKey } };
    }
    if (request.method === "PUT" && request.path.startsWith(`${repositoryPath}/actions/secrets/`)) {
      return { status: 201, body: {} };
    }
    if (
      request.method === "GET" &&
      request.path.startsWith(`${repositoryPath}/actions/variables/`)
    ) {
      return { status: 404, body: { message: "Not Found" } };
    }
    if (request.method === "POST" && request.path === `${repositoryPath}/actions/variables`) {
      return { status: 201, body: {} };
    }
    const head = mainHistory.at(0);
    if (request.path === `${repositoryPath}/branches/main`) {
      return head === undefined
        ? { status: 404, body: { message: "Branch not found" } }
        : {
            status: 200,
            body: {
              name: "main",
              commit: {
                sha: head.sha,
                commit: { tree: { sha: head.treeSha } },
                parents: mainHistory.slice(1, 2).map((parent) => ({ sha: parent.sha })),
              },
            },
          };
    }
    if (request.method === "GET" && request.path === `${repositoryPath}/commits`) {
      return {
        status: 200,
        body: mainHistory.map((commit) => ({
          sha: commit.sha,
          commit: { tree: { sha: commit.treeSha } },
        })),
      };
    }
    if (request.path === `${repositoryPath}/git/trees/seed-tree`) {
      return options.failTreeSync
        ? { status: 500, body: { message: "Server Error" } }
        : { status: 200, body: { sha: "seed-tree", truncated: false, tree: [] } };
    }
    const tree = [BOOTSTRAP_COMMIT, FOREIGN_COMMIT].find(
      (commit) => request.path === `${repositoryPath}/git/trees/${commit.treeSha}`,
    );
    if (tree) {
      return {
        status: 200,
        body: {
          sha: tree.treeSha,
          truncated: false,
          tree: tree.paths.map((path) => ({ path, mode: "100644", type: "blob", sha: "blob" })),
        },
      };
    }
    return { status: 404, body: { message: `Unexpected ${request.method} ${request.path}` } };
  };
  const octokit = new Octokit({
    request: {
      fetch: async (url: string, init: RequestInit) => {
        const request = {
          method: init.method ?? "GET",
          path: new URL(url).pathname,
          body: typeof init.body === "string" ? JSON.parse(init.body) : null,
        };
        requests.push(request);
        calls.push(`${request.method} ${request.path}`);
        const response = respond(request);
        return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
          status: response.status,
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
  return { calls, mainHistory, octokit, requests, options };
}

/** The GitHub requests between the seeded branch's creation and the starter push. */
function readCallsBeforeStarterPush(github: ReturnType<typeof createFakeGitHub>): string[] {
  return github.calls.slice(
    github.calls.indexOf("branch without starter") + 1,
    github.calls.indexOf("seed"),
  );
}

async function createRepositoryActionsRepository(github: ReturnType<typeof createFakeGitHub>) {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      name: "Ada",
      email: "repository-actions@example.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "1001",
      githubOwnerId: "1",
      githubOwnerLogin: "samebase",
      githubOwnerLoginNormalized: "samebase",
      githubOwnerType: "organization",
      convexTeam: { teamId: "41" },
      cloudflareAccount: { accountId: "cloudflare-account", accountName: "Samebase" },
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      convex: {
        auth: { method: "api_key", credential: "samebase-convex-test-token" },
        connectedByUserId: userId,
        updatedAt: 1,
      },
      cloudflare: {
        auth: { method: "api_key", credential: "samebase-cloudflare-test-token" },
        connectedByUserId: userId,
        updatedAt: 1,
      },
    });
    await ctx.db.insert("organizationCiCredentials", {
      organizationId,
      cloudflare: {
        apiToken: "cloudflare-ci-test-token",
        accountId: "cloudflare-account",
        connectedByUserId: userId,
        updatedAt: 20,
      },
      convex: {
        accessToken: "convex-ci-test-token",
        teamId: "41",
        connectedByUserId: userId,
        updatedAt: 30,
      },
    });
    return { organizationId, userId };
  });
  githubMocks.resolveAppAccess.mockResolvedValue({
    organizationId: ids.organizationId,
    githubInstallationId: "1001",
    githubOwnerId: "1",
    githubOwnerType: "organization",
    githubOwnerLogin: "samebase",
    octokit: github.octokit,
  });
  githubMocks.createRepositoryOctokit.mockResolvedValue(github.octokit);

  vi.useFakeTimers();
  try {
    const created = await t.mutation(
      internal.repository.records.createInitializingSamebaseManagedRepositoryForUser,
      {
        userId: ids.userId,
        organizationId: ids.organizationId,
        githubOwnerLogin: "samebase",
        githubRepositoryName: "actions-app",
        visibility: "private",
        description: null,
        convexTeamId: "41",
        cloudflareAccountId: "cloudflare-account",
        plan: { provisioning: "repository_actions" },
      },
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return { ...ids, ...created, t };
  } finally {
    vi.useRealTimers();
  }
}

async function readRepositoryActionsState(
  t: ReturnType<typeof makeConvexTest>,
  args: { repositoryId: Id<"repositories">; runId: Id<"workflow_repositoryProvisioning_runs"> },
) {
  return await t.run(async (ctx) => {
    const events = await ctx.db
      .query("workflow_repositoryProvisioning_events")
      .withIndex("by_run_and_created_at_and_source_order", (q) => q.eq("runId", args.runId))
      .collect();
    return {
      repository: await ctx.db.get(args.repositoryId),
      run: await ctx.db.get(args.runId),
      messages: events.map((event) => event.message),
      steps: [...new Set(events.map((event) => event.step))],
      plan: await ctx.db
        .query("workflow_repositoryProvisioning_plans")
        .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
        .unique(),
      writeLock: await ctx.db
        .query("workflow_repositoryProvisioning_writeLocks")
        .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
        .unique(),
    };
  });
}

describe("repository_actions provisioning workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes the Actions secrets before the seed and skips every Samebase provider step", async () => {
    const github = createFakeGitHub({
      defaultBranch: "main",
      denySecrets: false,
      failTreeSync: false,
    });
    const { repositoryId, runId, t } = await createRepositoryActionsRepository(github);

    const state = await readRepositoryActionsState(t, { repositoryId, runId });
    expect(state.run).toMatchObject({ state: "succeeded", currentStep: "finish" });
    expect(new Set(state.steps)).toEqual(
      new Set([
        "initialize_repository",
        "validate_connections",
        "create_github_repository",
        "connect_github_repository",
        "write_actions_secrets",
        "seed_starter",
        "sync_tree",
        "finish",
      ]),
    );
    // The seed pushes the starter, which starts the first workflow run: the secrets come first.
    expect(github.calls.indexOf("seed")).toBeGreaterThan(
      github.calls.indexOf("POST /repos/samebase/actions-app/actions/variables"),
    );
    // The step reads main before the seed: it does not exist yet, so the starter may be pushed.
    expect(github.calls.indexOf("GET /repos/samebase/actions-app/branches/main")).toBeLessThan(
      github.calls.indexOf("branch without starter"),
    );
    expect(state.plan).toMatchObject({
      seed: { state: "seeded", manifestVersion: actionsStarterTemplateManifest.version },
    });
    // main is already the default, so the step reads it once more and changes nothing.
    expect(readCallsBeforeStarterPush(github)).toEqual([
      "GET /installation/repositories",
      "GET /repos/samebase/actions-app",
    ]);
    // The pasted CI tokens are the secret values.
    const secretRequest = (name: string) =>
      github.requests.find((request) => request.path.endsWith(`/actions/secrets/${name}`));
    await expect(openActionsSecret(secretRequest("CONVEX_ACCESS_TOKEN"))).resolves.toBe(
      "convex-ci-test-token",
    );
    await expect(openActionsSecret(secretRequest("CLOUDFLARE_API_TOKEN"))).resolves.toBe(
      "cloudflare-ci-test-token",
    );
    expect(state.plan).toMatchObject({
      provisioning: "repository_actions",
      ciSecrets: { state: "written", credentialRevision: 30 },
    });
    expect(state.writeLock).toMatchObject({ owner: { runId }, state: "succeeded" });
    expect(githubMocks.seedRepository).toHaveBeenCalledWith(
      expect.objectContaining({ defaultBranch: "main", manifest: actionsStarterTemplateManifest }),
    );
    // GitHub created the repository with main, so the default branch stays as it is.
    expect(github.requests.filter((request) => request.method === "PATCH")).toEqual([]);
    expect(state.repository).toMatchObject({ defaultBranch: "main" });
    const writes = github.requests
      .filter((request) => request.path.includes("/actions/"))
      .map(({ method, path }) => `${method} ${path}`);
    expect(writes).toEqual([
      "GET /repos/samebase/actions-app/actions/secrets/public-key",
      "PUT /repos/samebase/actions-app/actions/secrets/CLOUDFLARE_API_TOKEN",
      "PUT /repos/samebase/actions-app/actions/secrets/CLOUDFLARE_ACCOUNT_ID",
      "PUT /repos/samebase/actions-app/actions/secrets/CONVEX_ACCESS_TOKEN",
      "GET /repos/samebase/actions-app/actions/variables/CONVEX_TEAM_ID",
      "POST /repos/samebase/actions-app/actions/variables",
    ]);
    expect(
      github.requests.find(
        (request) =>
          request.method === "POST" &&
          request.path === "/repos/samebase/actions-app/actions/variables",
      )?.body,
    ).toEqual({ name: "CONVEX_TEAM_ID", value: "41" });
  });

  it("resumes a write that GitHub refused through the existing retry, then seeds once", async () => {
    const github = createFakeGitHub({
      defaultBranch: "main",
      denySecrets: true,
      failTreeSync: false,
    });
    const { repositoryId, runId, t, userId } = await createRepositoryActionsRepository(github);
    await recordWorkflowFailure(t, {
      runId,
      message: `Error: ${formatMissingGitHubAppPermissionMessage({
        permission: "Secrets",
        repositoryFullName: "samebase/actions-app",
      })}`,
    });

    const failed = await readRepositoryActionsState(t, { repositoryId, runId });
    expect(failed.run).toMatchObject({ state: "failed", currentStep: "write_actions_secrets" });
    expect(failed.run?.lastError).toContain(
      "The Samebase GitHub App is missing the Secrets repository permission",
    );
    expect(failed.plan).toMatchObject({
      ciSecrets: { state: "planned" },
      seed: { state: "planned" },
    });
    expect(failed.writeLock).toMatchObject({ state: "failed" });
    expect(githubMocks.seedRepository).not.toHaveBeenCalled();

    github.options.denySecrets = false;
    const retryRunId = await retryProviderSetup(t, { userId, repositoryId });

    const resumed = await readRepositoryActionsState(t, { repositoryId, runId: retryRunId });
    expect(resumed.run).toMatchObject({ state: "succeeded", currentStep: "finish" });
    expect(new Set(resumed.steps)).toEqual(
      new Set(["write_actions_secrets", "seed_starter", "sync_tree", "finish"]),
    );
    expect(resumed.plan).toMatchObject({
      ciSecrets: { state: "written" },
      seed: { state: "seeded", manifestVersion: actionsStarterTemplateManifest.version },
    });
    expect(resumed.writeLock).toMatchObject({ owner: { runId: retryRunId }, state: "succeeded" });
    expect(githubMocks.seedRepository).toHaveBeenCalledTimes(1);
  });

  it("never seeds again after a retry seeded and then failed in the tree sync", async () => {
    const github = createFakeGitHub({
      defaultBranch: "main",
      denySecrets: true,
      failTreeSync: true,
    });
    const { repositoryId, runId, t, userId } = await createRepositoryActionsRepository(github);
    await recordWorkflowFailure(t, { runId, message: "Error: GitHub refused the secrets." });

    github.options.denySecrets = false;
    const firstRetryRunId = await retryProviderSetup(t, { userId, repositoryId });
    await recordWorkflowFailure(t, { runId: firstRetryRunId, message: "Error: Server Error" });
    const firstRetry = await readRepositoryActionsState(t, {
      repositoryId,
      runId: firstRetryRunId,
    });
    expect(firstRetry.run).toMatchObject({ state: "failed", currentStep: "sync_tree" });
    expect(firstRetry.plan).toMatchObject({ seed: { state: "seeded" } });
    expect(githubMocks.seedRepository).toHaveBeenCalledTimes(1);

    github.options.failTreeSync = false;
    const secondRetryRunId = await retryProviderSetup(t, { userId, repositoryId });

    const secondRetry = await readRepositoryActionsState(t, {
      repositoryId,
      runId: secondRetryRunId,
    });
    expect(secondRetry.run).toMatchObject({ state: "succeeded", currentStep: "finish" });
    expect(secondRetry.messages).toContain("The starter app is already seeded.");
    expect(githubMocks.seedRepository).toHaveBeenCalledTimes(1);
  });

  it("makes main the default branch before the starter push when GitHub created it with master", async () => {
    const github = createFakeGitHub({
      defaultBranch: "master",
      denySecrets: false,
      failTreeSync: false,
    });
    const { repositoryId, runId, t } = await createRepositoryActionsRepository(github);

    const state = await readRepositoryActionsState(t, { repositoryId, runId });
    expect(state.run).toMatchObject({ state: "succeeded", currentStep: "finish" });
    expect(githubMocks.seedRepository).toHaveBeenCalledWith(
      expect.objectContaining({ defaultBranch: "main" }),
    );
    const patches = github.requests.filter((request) => request.method === "PATCH");
    expect(patches).toEqual([
      {
        method: "PATCH",
        path: "/repos/samebase/actions-app",
        body: { default_branch: "main" },
      },
    ]);
    // main exists without starter files, becomes the default, and only then gets the starter, so the
    // first workflow run sees main as the default branch.
    expect(readCallsBeforeStarterPush(github)).toEqual([
      "GET /installation/repositories",
      "GET /repos/samebase/actions-app",
      "PATCH /repos/samebase/actions-app",
    ]);
    expect(state.messages).toContain(
      "Set the default branch of samebase/actions-app to main. GitHub created it with master.",
    );
    // The connect step recorded master; the record now names main, and the tree sync read main.
    expect(state.repository).toMatchObject({ defaultBranch: "main" });
    expect(github.calls).toContain("GET /repos/samebase/actions-app/branches/main");
  });

  it("finds a starter push whose seeded record was lost, without pushing again", async () => {
    // GitHub accepts the starter push, and the step stops before it records the seed.
    const github = createFakeGitHub({
      defaultBranch: "main",
      denySecrets: false,
      failTreeSync: false,
      seedStops: ["after_push"],
    });
    const { repositoryId, runId, t } = await createRepositoryActionsRepository(github);

    const state = await readRepositoryActionsState(t, { repositoryId, runId });
    expect(state.run).toMatchObject({ state: "succeeded", currentStep: "finish" });
    // The step retry found the recorded starter tree at the head of main.
    expect(githubMocks.seedRepository).toHaveBeenCalledTimes(1);
    expect(github.mainHistory).toEqual([SEED_COMMIT, BOOTSTRAP_COMMIT]);
    expect(state.plan).toMatchObject({
      seed: { state: "seeded", manifestVersion: actionsStarterTemplateManifest.version },
    });
    expect(state.messages).toContain(
      "Found the starter app on main; it was pushed before the seed was recorded.",
    );
  });

  it("pushes the starter again when main still holds only the bootstrap commit", async () => {
    // The step records the starter tree and stops before the push.
    const github = createFakeGitHub({
      defaultBranch: "main",
      denySecrets: false,
      failTreeSync: false,
      seedStops: ["before_push"],
    });
    const { repositoryId, runId, t } = await createRepositoryActionsRepository(github);

    const state = await readRepositoryActionsState(t, { repositoryId, runId });
    expect(state.run).toMatchObject({ state: "succeeded", currentStep: "finish" });
    expect(githubMocks.seedRepository).toHaveBeenCalledTimes(2);
    expect(github.mainHistory).toEqual([SEED_COMMIT, BOOTSTRAP_COMMIT]);
    expect(state.plan).toMatchObject({ seed: { state: "seeded" } });
  });

  it("refuses to seed over commits on main that Samebase did not make", async () => {
    const github = createFakeGitHub({
      defaultBranch: "main",
      denySecrets: false,
      failTreeSync: false,
      seedStops: ["foreign_commit_before_push"],
    });
    const { repositoryId, runId, t } = await createRepositoryActionsRepository(github);
    const refusal =
      "main of samebase/actions-app has commits that Samebase did not make, so Samebase cannot seed the starter without dropping them. Push the starter app yourself, or remove the repository from Samebase and create it again.";
    await recordWorkflowFailure(t, { runId, message: `Error: ${refusal}` });

    const failed = await readRepositoryActionsState(t, { repositoryId, runId });
    expect(failed.run).toMatchObject({
      state: "failed",
      currentStep: "seed_starter",
      lastError: refusal,
    });
    // Every step retry read main and stopped; nothing replaced the foreign commit.
    expect(githubMocks.seedRepository).toHaveBeenCalledTimes(1);
    expect(github.mainHistory).toEqual([FOREIGN_COMMIT, BOOTSTRAP_COMMIT]);
    expect(failed.plan).toMatchObject({ seed: { state: "seeding", treeSha: "seed-tree" } });
  });

  it("lists a connected repository at every step of its running create run", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        name: "Ada",
        email: "repository-actions-list@example.test",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubInstallationId: "1001",
        githubOwnerId: "1",
        githubOwnerLogin: "samebase",
        githubOwnerLoginNormalized: "samebase",
        githubOwnerType: "organization",
        convexTeam: { teamId: "41" },
        cloudflareAccount: { accountId: "cloudflare-account", accountName: "Samebase" },
      });
      await insertTestOrganizationBillingAccount(ctx.db, organizationId);
      await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
      const repositoryId = await ctx.db.insert("repositories", {
        organizationId,
        convexTeamId: "41",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        createdAt: 1,
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId,
        userId,
        repositoryId,
        githubRepositoryFullName: "samebase/actions-app",
        trigger: "create",
        state: "running",
        // connect_github_repository has connected the repository; the run has not moved on yet.
        currentStep: "connect_github_repository",
        createdAt: 1,
        updatedAt: 2,
      });
      await ctx.db.replace(repositoryId, {
        organizationId,
        convexTeamId: "41",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        createdAt: 1,
        state: "connected",
        githubMode: "create_repository",
        runId,
        githubRepositoryDatabaseId: "9001",
        githubRepositoryName: "actions-app",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 2,
      });
      await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
        repositoryId,
        owner: { kind: "managed_run", runId },
        state: "active",
        lastWriteAt: {},
        updatedAt: 2,
      });
      await ctx.db.insert("workflow_repositoryProvisioning_plans", {
        provisioning: "repository_actions",
        repositoryId,
        convexConfigPath: "convex.json",
        ciSecrets: { state: "planned" },
        seed: { state: "planned" },
        createdAt: 1,
        updatedAt: 1,
      });
      return { runId, userId };
    });
    const viewer = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });
    const listSetup = async () => {
      const repository = (await viewer.query(api.repository.list, {})).at(0);
      return { sourceSetup: repository?.sourceSetup, providerSetup: repository?.providerSetup };
    };

    await expect(listSetup()).resolves.toMatchObject({
      sourceSetup: { status: "running", step: "connect_github_repository" },
      providerSetup: { status: "not_applicable" },
    });
    for (const step of ["write_actions_secrets", "seed_starter", "sync_tree", "finish"] as const) {
      await t.run(async (ctx) => await ctx.db.patch(ids.runId, { currentStep: step }));
      await expect(listSetup()).resolves.toMatchObject({
        sourceSetup: { status: "ready" },
        providerSetup: { status: "running", provider: "github", step },
      });
    }
  });

  it("retries an initial run that failed in the tree sync, without seeding again", async () => {
    const github = createFakeGitHub({
      defaultBranch: "main",
      denySecrets: false,
      failTreeSync: true,
    });
    const { organizationId, repositoryId, runId, t, userId } =
      await createRepositoryActionsRepository(github);
    await recordWorkflowFailure(t, { runId, message: "Error: Server Error" });

    const failed = await readRepositoryActionsState(t, { repositoryId, runId });
    expect(failed.run).toMatchObject({
      trigger: "create",
      state: "failed",
      currentStep: "sync_tree",
    });
    expect(failed.plan).toMatchObject({ seed: { state: "seeded" } });
    // The dashboard reports the failure as provider setup, which offers the retry.
    const viewer = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });
    const listed = (await viewer.query(api.repository.list, {})).find(
      (repository) => repository.organizationId === organizationId,
    );
    expect(listed).toMatchObject({
      sourceSetup: { status: "ready" },
      providerSetup: { status: "failed", provider: "github", step: "sync_tree" },
    });

    github.options.failTreeSync = false;
    const retryRunId = await retryProviderSetup(t, { userId, repositoryId });

    const resumed = await readRepositoryActionsState(t, { repositoryId, runId: retryRunId });
    expect(resumed.run).toMatchObject({ state: "succeeded", currentStep: "finish" });
    expect(resumed.messages).toContain("The starter app is already seeded.");
    expect(githubMocks.seedRepository).toHaveBeenCalledTimes(1);
  });
});

/**
convex-test cannot run the failure branch of the workflow's onComplete handler (no crypto in the
component context), so the tests record the failure that onComplete records.
*/
async function recordWorkflowFailure(
  t: ReturnType<typeof makeConvexTest>,
  args: { runId: Id<"workflow_repositoryProvisioning_runs">; message: string },
) {
  const run = await t.run(async (ctx) => await ctx.db.get(args.runId));
  if (!run?.workflowId) {
    throw new Error("Expected the run's workflow id.");
  }
  await t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
    runId: args.runId,
    workflowId: run.workflowId,
    message: args.message,
  });
}

/** One confirmed dashboard retry, run to its end; returns the retry run. */
async function retryProviderSetup(
  t: ReturnType<typeof makeConvexTest>,
  args: { userId: Id<"users">; repositoryId: Id<"repositories"> },
): Promise<Id<"workflow_repositoryProvisioning_runs">> {
  const challenge = await t.mutation(internal.repositoryProvisioningRuns.createRetryForRepository, {
    userId: args.userId,
    repositoryId: args.repositoryId,
    surface: { kind: "dashboard" },
  });
  if (!challenge) {
    throw new Error("Expected a confirmation request.");
  }
  vi.useFakeTimers();
  try {
    await t.mutation(internal.repositoryProvisioningRuns.createRetryForRepository, {
      userId: args.userId,
      repositoryId: args.repositoryId,
      surface: { kind: "dashboard" },
      confirmation: { token: challenge.token, acknowledgement: challenge.acknowledgement },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }
  const retryRun = await t.run(
    async (ctx) =>
      await ctx.db
        .query("workflow_repositoryProvisioning_runs")
        .withIndex("by_repository_and_updated_at", (q) => q.eq("repositoryId", args.repositoryId))
        .order("desc")
        .first(),
  );
  if (retryRun?.trigger !== "retry") {
    throw new Error("Expected a retry run.");
  }
  return retryRun._id;
}
