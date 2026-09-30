import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const providerMocks = vi.hoisted(() => ({
  createRepositoryOctokit: vi.fn(),
  getRepository: vi.fn(),
  requestCloudflareApiOrThrow: vi.fn(),
}));

vi.mock("../cloudflareApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cloudflareApi/client")>();
  return {
    ...actual,
    requestCloudflareApiOrThrow: providerMocks.requestCloudflareApiOrThrow,
  };
});

vi.mock("../githubApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../githubApp")>();
  return {
    ...actual,
    createGitHubRepositoryInstallationOctokit: providerMocks.createRepositoryOctokit,
  };
});

import { api, internal } from "../_generated/api";
import { CloudflareApiError } from "../cloudflareApi/client";
import { observedNativeWorkerBuildSettings } from "../cloudflareApi/fixtures/observedWorkerBuildSettings";
import { WORKER_PREVIEWS_MIGRATION_REQUIRED_MESSAGE } from "../../shared/cloudflareWorkerPreviews";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

function workerResponse(args: { workerName: string; workerTag?: string }) {
  return {
    id: args.workerTag ?? "worker-tag",
    name: args.workerName,
    references: { domains: [] },
    subdomain: { enabled: false, previews_enabled: false },
  };
}

function workerBuildSettings(args: { repoId?: string; rootDirectory: string; workerTag?: string }) {
  return {
    ...observedNativeWorkerBuildSettings,
    script_tag: args.workerTag ?? "worker-tag",
    git_repository: {
      ...observedNativeWorkerBuildSettings.git_repository,
      repo_id: args.repoId ?? "github-repository",
    },
    production_settings: {
      ...observedNativeWorkerBuildSettings.production_settings,
      root_directory: args.rootDirectory,
    },
    previews_base_config: {
      ...observedNativeWorkerBuildSettings.previews_base_config,
      root_directory: args.rootDirectory,
    },
  };
}

type CloudflareTestRequest = {
  method: string;
  path: string;
  token: string;
  params?: { path?: Record<string, string> };
};

function useCloudflareReadFixture(args: {
  workerName: string;
  workerTag?: string;
  settings?: ReturnType<typeof workerBuildSettings>;
}) {
  const workerTag = args.workerTag ?? "worker-tag";
  providerMocks.requestCloudflareApiOrThrow.mockImplementation(
    async (request: CloudflareTestRequest) => {
      if (request.path === "/accounts") {
        return [{ id: "cloudflare-account", name: "Cloudflare account" }];
      }
      if (request.path === "/accounts/{account_id}/workers/workers/{worker_id}") {
        return workerResponse({ workerName: args.workerName, workerTag });
      }
      if (request.path === "/accounts/{account_id}/builds/workers/{script_tag}") {
        return args.settings ?? null;
      }
      throw new Error(`Unexpected Cloudflare request: ${request.method} ${request.path}`);
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  providerMocks.getRepository.mockResolvedValue({
    data: {
      id: "github-repository",
      default_branch: "main",
      owner: { id: "github-owner" },
    },
  });
  providerMocks.createRepositoryOctokit.mockResolvedValue({
    rest: { repos: { get: providerMocks.getRepository } },
  });
});

async function createFixture() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      state: "active",
      email: "worker-owner@example.invalid",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const memberId = await ctx.db.insert("users", {
      state: "active",
      email: "worker-member@example.invalid",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "github-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "samebase",
      githubOwnerLoginNormalized: "samebase",
      githubInstallationId: "github-installation",
      convexTeam: { teamId: "convex-team" },
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
      },
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: ownerId,
      role: "owner",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: memberId,
      role: "member",
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    const now = Date.now();
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      cloudflare: {
        auth: { method: "api_key", credential: "cloudflare-token" },
        connectedByUserId: ownerId,
        updatedAt: now,
      },
    });
    const repositoryId = await ctx.db.insert("repositories", {
      createdAt: 1,
      state: "not_connected",
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId: ownerId,
      repositoryId,
      githubRepositoryFullName: "samebase/app",
      trigger: "create",
      state: "succeeded",
      currentStep: "finish",
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });
    await ctx.db.replace(repositoryId, {
      createdAt: 1,
      state: "connected",
      githubMode: "create_repository",
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      runId,
      githubRepositoryDatabaseId: "github-repository",
      defaultBranch: "main",
      connectedAt: now,
      githubRepositoryName: "app",
      visibility: "private",
    });
    const planId = await ctx.db.insert("workflow_repositoryProvisioning_plans", {
      repositoryId,
      convexConfigPath: "apps/app/convex.json",
      convex: {
        state: "created",
        projectName: "app",
        deploymentRegion: "aws-us-east-1",
        projectId: "convex-project",
      },
      cloudflare: {
        state: "created",
        workerName: "old-worker",
        workerTag: "worker-tag",
        rootDirectory: "apps/old",
        buildTokenUuid: "build-token",
      },
      createdAt: now,
      updatedAt: now,
    });
    const workerId = await ctx.db.insert("repositoryCloudflareWorkers", {
      repositoryId,
      organizationId,
      accountId: "cloudflare-account",
      workerName: "old-worker",
      workerTag: "worker-tag",
      rootDirectory: "apps/old",
      origin: "provisioned",
    });
    return { memberId, organizationId, ownerId, planId, repositoryId, runId, workerId };
  });
  return {
    ids,
    member: t.withIdentity({
      subject: `${ids.memberId}|test-session`,
      tokenIdentifier: `test:${ids.memberId}`,
    }),
    owner: t.withIdentity({
      subject: `${ids.ownerId}|test-session`,
      tokenIdentifier: `test:${ids.ownerId}`,
    }),
    t,
  };
}

async function readStoredCoordinates(fixture: Awaited<ReturnType<typeof createFixture>>) {
  return await fixture.t.run(async (ctx) => ({
    worker: await ctx.db.get(fixture.ids.workerId),
    plan: await ctx.db.get(fixture.ids.planId),
  }));
}

describe("Cloudflare Worker stored coordinates", () => {
  it("stops an old creation retry before it can migrate Worker Previews", async () => {
    const fixture = await createFixture();
    await fixture.t.run(async (ctx) => {
      await ctx.db.patch(fixture.ids.runId, { state: "running" });
      await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
        repositoryId: fixture.ids.repositoryId,
        owner: { kind: "managed_run", runId: fixture.ids.runId },
        state: "active",
        lastWriteAt: {},
        updatedAt: Date.now(),
      });
    });
    await expect(
      fixture.t.action(internal.repository.cloudflare.configureWorkersBuildsForGitHubForWorkflow, {
        repositoryId: fixture.ids.repositoryId,
        runId: fixture.ids.runId,
        userId: fixture.ids.ownerId,
        workerId: fixture.ids.workerId,
      }),
    ).rejects.toThrow(WORKER_PREVIEWS_MIGRATION_REQUIRED_MESSAGE);
    expect(providerMocks.requestCloudflareApiOrThrow).not.toHaveBeenCalled();

    await fixture.t.run(async (ctx) => {
      await ctx.db.patch(fixture.ids.planId, { starterBuildContract: "native_worker_previews" });
    });
    await expect(
      fixture.t.query(
        internal.repository.cloudflareMutations.readManagedWorkerConfigurationContext,
        {
          repositoryId: fixture.ids.repositoryId,
          runId: fixture.ids.runId,
          userId: fixture.ids.ownerId,
          workerId: fixture.ids.workerId,
        },
      ),
    ).resolves.toMatchObject({ workerTag: "worker-tag", buildTokenUuid: "build-token" });
  });

  it("returns an existing Worker name conflict to the client", async () => {
    const fixture = await createFixture();
    providerMocks.requestCloudflareApiOrThrow.mockImplementation(
      async (request: CloudflareTestRequest) => {
        if (request.path === "/accounts") {
          return [{ id: "cloudflare-account", name: "Cloudflare account" }];
        }
        if (request.path === "/accounts/{account_id}/builds/tokens") {
          return [{ build_token_uuid: "build-token", build_token_name: "Build token" }];
        }
        if (request.path === "/accounts/{account_id}/workers/workers/{worker_id}") {
          return workerResponse({ workerName: "tmp-some-new-app" });
        }
        throw new Error(`Unexpected Cloudflare request: ${request.method} ${request.path}`);
      },
    );

    await expect(
      fixture.owner.action(api.repository.cloudflare.createWorker, {
        repositoryId: fixture.ids.repositoryId,
        accountId: "cloudflare-account",
        workerName: "tmp_some_new_app",
        rootDirectory: "/",
        buildTokenUuid: "build-token",
      }),
    ).rejects.toMatchObject({
      name: "ConvexError",
      data: "A Cloudflare Worker named tmp-some-new-app already exists.",
    });
  });

  it("returns a public name conflict when Worker creation loses a race", async () => {
    const fixture = await createFixture();
    providerMocks.requestCloudflareApiOrThrow.mockImplementation(
      async (request: CloudflareTestRequest) => {
        if (request.path === "/accounts") {
          return [{ id: "cloudflare-account", name: "Cloudflare account" }];
        }
        if (request.path === "/accounts/{account_id}/builds/tokens") {
          return [{ build_token_uuid: "build-token", build_token_name: "Build token" }];
        }
        if (request.path === "/accounts/{account_id}/workers/workers/{worker_id}") {
          throw new CloudflareApiError({
            method: "GET",
            path: request.path,
            details: [{ code: "10007", message: "Worker not found" }],
          });
        }
        if (request.path === "/accounts/{account_id}/workers/workers") {
          throw new CloudflareApiError({
            method: "POST",
            path: "/accounts/cloudflare-account/workers/workers",
            details: [{ code: "10040", message: "Raw provider conflict detail." }],
          });
        }
        throw new Error(`Unexpected Cloudflare request: ${request.method} ${request.path}`);
      },
    );

    await expect(
      fixture.owner.action(api.repository.cloudflare.createWorker, {
        repositoryId: fixture.ids.repositoryId,
        accountId: "cloudflare-account",
        workerName: "tmp_race_app",
        rootDirectory: "/",
        buildTokenUuid: "build-token",
      }),
    ).rejects.toMatchObject({
      name: "ConvexError",
      data: "A Cloudflare Worker named tmp-race-app already exists.",
    });
    await expect(
      fixture.t.run(async (ctx) => {
        const workers = await ctx.db
          .query("repositoryCloudflareWorkers")
          .withIndex("by_repository", (query) => query.eq("repositoryId", fixture.ids.repositoryId))
          .collect();
        return workers.some((worker) => worker.workerName === "tmp-race-app");
      }),
    ).resolves.toBe(false);
  });

  it("updates a Worker name through the public action after a stable-tag reread", async () => {
    const fixture = await createFixture();
    useCloudflareReadFixture({ workerName: "provider-current-worker" });

    await expect(
      fixture.member.action(api.repository.cloudflare.updateWorkerName, {
        repositoryId: fixture.ids.repositoryId,
        workerId: fixture.ids.workerId,
        expectedWorkerName: "provider-current-worker",
      }),
    ).resolves.toBeNull();

    expect(providerMocks.requestCloudflareApiOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/accounts/{account_id}/workers/workers/{worker_id}",
        params: expect.objectContaining({
          path: expect.objectContaining({ worker_id: "worker-tag" }),
        }),
      }),
    );
    await expect(readStoredCoordinates(fixture)).resolves.toMatchObject({
      worker: { workerName: "provider-current-worker", rootDirectory: "apps/old" },
      plan: {
        cloudflare: { workerName: "provider-current-worker", rootDirectory: "apps/old" },
      },
    });

    await expect(
      fixture.t.mutation(internal.repository.cloudflareMutations.updateWorkerName, {
        repositoryId: fixture.ids.repositoryId,
        userId: fixture.ids.memberId,
        workerId: fixture.ids.workerId,
        accountId: "cloudflare-account",
        workerTag: "worker-tag",
        expectedStoredWorkerName: "old-worker",
        workerName: "stale-overwrite",
      }),
    ).rejects.toThrow("attachment changed before the name update");
  });

  it("rejects a stale provider name approval without changing stored coordinates", async () => {
    const fixture = await createFixture();
    const before = await readStoredCoordinates(fixture);
    useCloudflareReadFixture({ workerName: "provider-current-worker" });

    await expect(
      fixture.member.action(api.repository.cloudflare.updateWorkerName, {
        repositoryId: fixture.ids.repositoryId,
        workerId: fixture.ids.workerId,
        expectedWorkerName: "stale-provider-name",
      }),
    ).rejects.toThrow("name changed before the update was approved");
    await expect(readStoredCoordinates(fixture)).resolves.toEqual(before);
  });

  it("rejects the wrong saved Cloudflare account before the name provider read", async () => {
    const fixture = await createFixture();
    const before = await readStoredCoordinates(fixture);
    await fixture.t.run(async (ctx) => {
      await ctx.db.patch(fixture.ids.organizationId, {
        cloudflareAccount: { accountId: "other-account", accountName: "Other account" },
      });
    });

    await expect(
      fixture.member.action(api.repository.cloudflare.updateWorkerName, {
        repositoryId: fixture.ids.repositoryId,
        workerId: fixture.ids.workerId,
        expectedWorkerName: "provider-current-worker",
      }),
    ).rejects.toThrow("connection is required for this account");
    expect(providerMocks.requestCloudflareApiOrThrow).not.toHaveBeenCalled();
    await expect(readStoredCoordinates(fixture)).resolves.toEqual(before);
  });

  it("updates a Worker root after exact repository verification", async () => {
    const fixture = await createFixture();
    useCloudflareReadFixture({
      workerName: "provider-current-worker",
      settings: workerBuildSettings({ rootDirectory: "apps/new" }),
    });

    await expect(
      fixture.member.action(api.repository.cloudflare.updateWorkerRootDirectory, {
        repositoryId: fixture.ids.repositoryId,
        workerId: fixture.ids.workerId,
        expectedRootDirectory: "apps/new",
      }),
    ).resolves.toBeNull();
    const updated = await readStoredCoordinates(fixture);
    expect(updated).toMatchObject({
      worker: { workerName: "old-worker", rootDirectory: "apps/new" },
      plan: { cloudflare: { workerName: "old-worker", rootDirectory: "apps/new" } },
    });

    await expect(
      fixture.t.mutation(internal.repository.cloudflareMutations.updateWorkerRootDirectory, {
        repositoryId: fixture.ids.repositoryId,
        userId: fixture.ids.memberId,
        workerId: fixture.ids.workerId,
        accountId: "cloudflare-account",
        workerTag: "worker-tag",
        expectedStoredRootDirectory: "apps/old",
        rootDirectory: "apps/stale-overwrite",
      }),
    ).rejects.toThrow("attachment changed before the root update");
    await expect(readStoredCoordinates(fixture)).resolves.toEqual(updated);
  });

  it("rejects a Worker root connected to another repository without changing storage", async () => {
    const fixture = await createFixture();
    const before = await readStoredCoordinates(fixture);
    useCloudflareReadFixture({
      workerName: "provider-current-worker",
      settings: workerBuildSettings({ repoId: "other-repository", rootDirectory: "apps/new" }),
    });

    await expect(
      fixture.member.action(api.repository.cloudflare.updateWorkerRootDirectory, {
        repositoryId: fixture.ids.repositoryId,
        workerId: fixture.ids.workerId,
        expectedRootDirectory: "apps/new",
      }),
    ).rejects.toThrow("does not have one verified root for this repository");
    await expect(readStoredCoordinates(fixture)).resolves.toEqual(before);
  });

  it("rejects a stale provider root approval without changing stored coordinates", async () => {
    const fixture = await createFixture();
    const before = await readStoredCoordinates(fixture);
    useCloudflareReadFixture({
      workerName: "provider-current-worker",
      settings: workerBuildSettings({ rootDirectory: "apps/provider-current" }),
    });

    await expect(
      fixture.member.action(api.repository.cloudflare.updateWorkerRootDirectory, {
        repositoryId: fixture.ids.repositoryId,
        workerId: fixture.ids.workerId,
        expectedRootDirectory: "apps/stale",
      }),
    ).rejects.toThrow("root changed before the update was approved");
    await expect(readStoredCoordinates(fixture)).resolves.toEqual(before);
  });

  it("rejects a Builds repair root that differs from the stored root", async () => {
    const fixture = await createFixture();
    await expect(
      fixture.member.action(api.repository.cloudflare.configureWorkersBuildsForGitHub, {
        repositoryId: fixture.ids.repositoryId,
        workerId: fixture.ids.workerId,
        rootDirectory: "apps/different",
        buildTokenUuid: "build-token",
      }),
    ).rejects.toThrow("root changed before Workers Builds configuration");
    expect(providerMocks.requestCloudflareApiOrThrow).not.toHaveBeenCalled();
    await expect(readStoredCoordinates(fixture)).resolves.toMatchObject({
      worker: { rootDirectory: "apps/old" },
      plan: { cloudflare: { rootDirectory: "apps/old" } },
    });
  });

  it("stores the current provider name when it attaches an existing Worker", async () => {
    const fixture = await createFixture();
    useCloudflareReadFixture({
      workerName: "provider-current-worker",
      workerTag: "drift-worker-tag",
      settings: workerBuildSettings({ rootDirectory: "apps/drift", workerTag: "drift-worker-tag" }),
    });

    const [attachedWorkerId] = await fixture.owner.action(api.repository.cloudflare.attachWorkers, {
      repositoryId: fixture.ids.repositoryId,
      accountId: "cloudflare-account",
      workers: [{ workerName: "stale-discovery-name", workerTag: "drift-worker-tag" }],
    });
    await expect(
      fixture.t.run(async (ctx) => (attachedWorkerId ? await ctx.db.get(attachedWorkerId) : null)),
    ).resolves.toMatchObject({
      workerName: "provider-current-worker",
      workerTag: "drift-worker-tag",
      rootDirectory: "apps/drift",
    });
  });

  it("stores the current provider name when it connects an existing Worker", async () => {
    const fixture = await createFixture();
    providerMocks.requestCloudflareApiOrThrow.mockImplementation(
      async (request: CloudflareTestRequest) => {
        if (request.path === "/accounts") {
          return [{ id: "cloudflare-account", name: "Cloudflare account" }];
        }
        if (request.path === "/accounts/{account_id}/builds/tokens") {
          return [{ build_token_uuid: "build-token", build_token_name: "Build token" }];
        }
        if (request.path === "/accounts/{account_id}/workers/workers/{worker_id}") {
          return workerResponse({
            workerName: "provider-current-worker",
            workerTag: "connect-worker-tag",
          });
        }
        if (request.path === "/accounts/{account_id}/builds/workers/{script_tag}") {
          return null;
        }
        if (request.method === "POST" && request.path === "/accounts/{account_id}/builds/workers") {
          throw new Error("stop after attachment");
        }
        throw new Error(`Unexpected Cloudflare request: ${request.method} ${request.path}`);
      },
    );

    const result = await fixture.owner.action(api.repository.cloudflare.connectWorker, {
      repositoryId: fixture.ids.repositoryId,
      accountId: "cloudflare-account",
      workerName: "stale-discovery-name",
      workerTag: "connect-worker-tag",
      rootDirectory: "apps/connect",
      buildTokenUuid: "build-token",
    });
    expect(result.state).toBe("added_with_notice");
    await expect(
      fixture.t.run(async (ctx) => await ctx.db.get(result.workerId)),
    ).resolves.toMatchObject({
      workerName: "provider-current-worker",
      workerTag: "connect-worker-tag",
      rootDirectory: "apps/connect",
    });
  });
});
