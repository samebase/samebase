import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubMocks = vi.hoisted(() => ({
  createRepositoryOctokit: vi.fn(),
  getRepository: vi.fn(),
  getRef: vi.fn(),
  getCommit: vi.fn(),
  getTree: vi.fn(),
  request: vi.fn(),
}));

const cloudflareMocks = vi.hoisted(() => ({
  getAccounts: vi.fn(),
  getWorker: vi.fn(),
  getBuildSettings: vi.fn(),
}));

const convexMocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock("../cloudflareApi/generated/sdk.gen", () => ({
  Cloudflare: {
    GET: {
      "/accounts": cloudflareMocks.getAccounts,
      "/accounts/{account_id}/workers/workers/{worker_id}": cloudflareMocks.getWorker,
      "/accounts/{account_id}/builds/workers/{script_tag}": cloudflareMocks.getBuildSettings,
    },
  },
}));

vi.mock("../convexManagementApi/generated/sdk.gen", () => ({
  ConvexManagement: {
    GET: {
      "/projects/{project_id}": convexMocks.getProject,
      "/teams/{team_id}/projects": convexMocks.listProjects,
    },
  },
}));

vi.mock("../githubApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../githubApp")>();
  return {
    ...actual,
    createGitHubRepositoryInstallationOctokit: githubMocks.createRepositoryOctokit,
  };
});

import { RequestError } from "@octokit/request-error";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { observedNativeWorkerBuildSettings } from "../cloudflareApi/fixtures/observedWorkerBuildSettings";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";
import {
  observedSetupOutputArchiveBase64,
  observedSetupOutputArtifactPage,
  observedSetupWorkflowRunPage,
} from "./fixtures/observedSetupOutput";

/*
State axes of the apply mutation, each covered below:
- plan: repository_actions with no applied output, an applied one, or a destroy receipt; a samebase
  plan refuses
- checkpoint: the expected artifact id matches, or another apply moved it
- rows: none, the same identity attached by hand, a setup_stack Worker recreated under a new tag, a
  Worker attached to another repository
- output: deployed with one or several entries per list, or the destroy receipt
- repository: idle or with another provider operation running; the caller a member or not
*/

const ACCOUNT_ID = "fe57d01d7ab41f60d00ba1aade20eb33";
const TEAM_ID = "38516";
const WORKER_TAG = "882b2b3cde394f5d8661075e716eaf58";
const PROJECT_ID = "3161449";
const REPOSITORY_ID = "1407894795";

async function createFixture(options?: { mode?: "samebase"; planCreatedAt?: number }) {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("users", {
      state: "active",
      email: "setup-owner@example.invalid",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const outsiderId = await ctx.db.insert("users", {
      state: "active",
      email: "setup-outsider@example.invalid",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "github-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "samebase",
      githubOwnerLoginNormalized: "samebase",
      githubInstallationId: "12345",
      convexTeam: { teamId: TEAM_ID },
      cloudflareAccount: { accountId: ACCOUNT_ID, accountName: "Cloudflare account" },
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: ownerId,
      role: "owner",
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      convex: {
        auth: { method: "api_key", credential: "convex-token" },
        connectedByUserId: ownerId,
        updatedAt: now,
      },
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
      convexTeamId: TEAM_ID,
      cloudflareAccountId: ACCOUNT_ID,
      deletion: { state: "not_deleting" },
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId: ownerId,
      repositoryId,
      githubRepositoryFullName: "samebase/tmp-alchemy-v2",
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
      convexTeamId: TEAM_ID,
      cloudflareAccountId: ACCOUNT_ID,
      deletion: { state: "not_deleting" },
      runId,
      githubRepositoryDatabaseId: REPOSITORY_ID,
      defaultBranch: "main",
      connectedAt: now,
      githubRepositoryName: "tmp-alchemy-v2",
      visibility: "private",
    });
    const planId =
      options?.mode === "samebase"
        ? await ctx.db.insert("workflow_repositoryProvisioning_plans", {
            repositoryId,
            convexConfigPath: "convex.json",
            convex: {
              state: "planned",
              projectName: "tmp-alchemy-v2",
              deploymentRegion: "aws-us-east-1",
            },
            cloudflare: {
              state: "planned",
              workerName: "tmp-alchemy-v2",
              rootDirectory: "/",
              buildTokenUuid: null,
            },
            createdAt: now,
            updatedAt: now,
          })
        : await ctx.db.insert("workflow_repositoryProvisioning_plans", {
            provisioning: "repository_actions",
            repositoryId,
            convexConfigPath: "convex.json",
            ciSecrets: { state: "written", writtenAt: now, credentialRevision: now },
            seed: { state: "seeded", seededAt: now, manifestVersion: "samebase-base-actions-test" },
            createdAt: options?.planCreatedAt ?? now,
            updatedAt: now,
          });
    await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
      repositoryId,
      owner: { kind: "managed_run", runId },
      state: "succeeded",
      lastWriteAt: {},
      updatedAt: now,
    });
    return { organizationId, outsiderId, ownerId, planId, repositoryId, runId };
  });
  return { ids, t };
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

function asOwner(fixture: Fixture) {
  return fixture.t.withIdentity({
    subject: `${fixture.ids.ownerId}|test-session`,
    tokenIdentifier: `test:${fixture.ids.ownerId}`,
  });
}

const source = {
  runId: 37545425944,
  runAttempt: 2,
  artifactId: 11450791196,
  artifactCreatedAt: "2026-10-06T23:17:16Z",
};

function deployed(overrides?: {
  workers?: Array<{ workerName: string; workerTag: string; rootDirectory: string }>;
  projects?: Array<{
    projectId: string;
    codeLocation: { kind: "config"; convexConfigPath: string };
  }>;
  replacedWorkerIds?: Array<Id<"repositoryCloudflareWorkers">>;
}) {
  return {
    state: "deployed" as const,
    outputVersion: 1 as const,
    accountId: ACCOUNT_ID,
    workers: overrides?.workers ?? [
      { workerName: "tmp-alchemy-v2", workerTag: WORKER_TAG, rootDirectory: "/" },
    ],
    replacedWorkerIds: overrides?.replacedWorkerIds ?? [],
    teamId: TEAM_ID,
    projects: overrides?.projects ?? [
      {
        projectId: PROJECT_ID,
        codeLocation: { kind: "config" as const, convexConfigPath: "convex.json" },
      },
    ],
  };
}

async function readRows(fixture: Fixture) {
  return await fixture.t.run(async (ctx) => ({
    plan: await ctx.db.get(fixture.ids.planId),
    workers: await ctx.db
      .query("repositoryCloudflareWorkers")
      .withIndex("by_repository", (q) => q.eq("repositoryId", fixture.ids.repositoryId))
      .collect(),
    projects: await ctx.db
      .query("repositoryConvexProjects")
      .withIndex("by_repository", (q) => q.eq("repositoryId", fixture.ids.repositoryId))
      .collect(),
  }));
}

describe("setupOutputMutations.apply", () => {
  it("attaches every Worker and Convex project with origin setup_stack and records the artifact", async () => {
    const fixture = await createFixture();
    await fixture.t.mutation(internal.repository.setupOutputMutations.apply, {
      userId: fixture.ids.ownerId,
      repositoryId: fixture.ids.repositoryId,
      expectedArtifactId: null,
      source,
      output: deployed({
        workers: [
          {
            workerName: "shared-convex-monorepo-fixture-admin",
            workerTag: "admin-worker-tag",
            rootDirectory: "apps/admin",
          },
          {
            workerName: "shared-convex-monorepo-fixture-portal",
            workerTag: "portal-worker-tag",
            rootDirectory: "apps/portal",
          },
          {
            workerName: "shared-convex-monorepo-fixture-web",
            workerTag: "web-worker-tag",
            rootDirectory: "apps/web",
          },
        ],
        projects: [
          {
            projectId: "1001",
            codeLocation: { kind: "config", convexConfigPath: "apps/portal/convex.json" },
          },
          {
            projectId: "1002",
            codeLocation: { kind: "config", convexConfigPath: "apps/admin/convex.json" },
          },
        ],
      }),
    });

    const rows = await readRows(fixture);
    expect(
      rows.workers
        .map((worker) => [worker.workerName, worker.rootDirectory, worker.origin])
        .sort(([left], [right]) => left.localeCompare(right)),
    ).toEqual([
      ["shared-convex-monorepo-fixture-admin", "apps/admin", "setup_stack"],
      ["shared-convex-monorepo-fixture-portal", "apps/portal", "setup_stack"],
      ["shared-convex-monorepo-fixture-web", "apps/web", "setup_stack"],
    ]);
    expect(
      rows.projects
        .map((project) => [project.projectId, project.origin])
        .sort(([left], [right]) => left.localeCompare(right)),
    ).toEqual([
      ["1001", "setup_stack"],
      ["1002", "setup_stack"],
    ]);
    expect(rows.plan).toMatchObject({
      setupOutput: { state: "applied", ...source, outputVersion: 1 },
    });
  });

  it("applies a rerun of the same identities without changing a row", async () => {
    const fixture = await createFixture();
    const apply = (expectedArtifactId: number | null, artifactId: number) =>
      fixture.t.mutation(internal.repository.setupOutputMutations.apply, {
        userId: fixture.ids.ownerId,
        repositoryId: fixture.ids.repositoryId,
        expectedArtifactId,
        source: { ...source, artifactId },
        output: deployed(),
      });
    await apply(null, 11450361985);
    const before = await readRows(fixture);
    await apply(11450361985, 11450791196);
    const after = await readRows(fixture);

    expect(after.workers).toEqual(before.workers);
    expect(after.projects).toEqual(before.projects);
    expect(after.plan).toMatchObject({
      setupOutput: { state: "applied", artifactId: 11450791196 },
    });
  });

  it("refuses when another apply moved the checkpoint", async () => {
    const fixture = await createFixture();
    await expect(
      fixture.t.mutation(internal.repository.setupOutputMutations.apply, {
        userId: fixture.ids.ownerId,
        repositoryId: fixture.ids.repositoryId,
        expectedArtifactId: 1,
        source,
        output: deployed(),
      }),
    ).rejects.toThrow("The applied setup output changed");
    expect((await readRows(fixture)).workers).toEqual([]);
  });

  it("moves a Worker and a project that a member attached by hand to setup_stack", async () => {
    const fixture = await createFixture();
    await fixture.t.run(async (ctx) => {
      await ctx.db.insert("repositoryCloudflareWorkers", {
        repositoryId: fixture.ids.repositoryId,
        organizationId: fixture.ids.organizationId,
        accountId: ACCOUNT_ID,
        workerName: "tmp-alchemy-v2",
        workerTag: WORKER_TAG,
        rootDirectory: "/",
        origin: "selected_existing",
      });
      await ctx.db.insert("repositoryConvexProjects", {
        repositoryId: fixture.ids.repositoryId,
        organizationId: fixture.ids.organizationId,
        teamId: TEAM_ID,
        projectId: PROJECT_ID,
        convexConfigPath: "convex.json",
        origin: "selected_existing",
      });
    });
    await fixture.t.mutation(internal.repository.setupOutputMutations.apply, {
      userId: fixture.ids.ownerId,
      repositoryId: fixture.ids.repositoryId,
      expectedArtifactId: null,
      source,
      output: deployed(),
    });

    const rows = await readRows(fixture);
    expect(rows.workers.map((worker) => worker.origin)).toEqual(["setup_stack"]);
    expect(rows.projects.map((project) => project.origin)).toEqual(["setup_stack"]);
  });

  it("replaces a setup_stack Worker that a drift repair recreated under a new tag", async () => {
    const fixture = await createFixture();
    const oldWorkerId = await fixture.t.run(
      async (ctx) =>
        await ctx.db.insert("repositoryCloudflareWorkers", {
          repositoryId: fixture.ids.repositoryId,
          organizationId: fixture.ids.organizationId,
          accountId: ACCOUNT_ID,
          workerName: "tmp-alchemy-v2",
          workerTag: "old-worker-tag",
          rootDirectory: "/",
          origin: "setup_stack",
        }),
    );
    await fixture.t.mutation(internal.repository.setupOutputMutations.apply, {
      userId: fixture.ids.ownerId,
      repositoryId: fixture.ids.repositoryId,
      expectedArtifactId: null,
      source,
      output: deployed({ replacedWorkerIds: [oldWorkerId] }),
    });

    expect((await readRows(fixture)).workers.map((worker) => worker.workerTag)).toEqual([
      WORKER_TAG,
    ]);
  });

  it("refuses to replace a Worker that a member attached, and changes nothing", async () => {
    const fixture = await createFixture();
    const memberWorkerId = await fixture.t.run(
      async (ctx) =>
        await ctx.db.insert("repositoryCloudflareWorkers", {
          repositoryId: fixture.ids.repositoryId,
          organizationId: fixture.ids.organizationId,
          accountId: ACCOUNT_ID,
          workerName: "tmp-alchemy-v2",
          workerTag: "old-worker-tag",
          rootDirectory: "/",
          origin: "selected_existing",
        }),
    );
    await expect(
      fixture.t.mutation(internal.repository.setupOutputMutations.apply, {
        userId: fixture.ids.ownerId,
        repositoryId: fixture.ids.repositoryId,
        expectedArtifactId: null,
        source,
        output: deployed({ replacedWorkerIds: [memberWorkerId] }),
      }),
    ).rejects.toThrow("The Worker that the setup output replaces changed");
    const rows = await readRows(fixture);
    expect(rows.workers.map((worker) => worker.workerTag)).toEqual(["old-worker-tag"]);
    expect(rows.projects).toEqual([]);
  });

  it("refuses a Worker attached to another repository, and changes nothing", async () => {
    const fixture = await createFixture();
    await fixture.t.run(async (ctx) => {
      const otherRepositoryId = await ctx.db.insert("repositories", {
        createdAt: 1,
        state: "not_connected",
        organizationId: fixture.ids.organizationId,
        convexTeamId: TEAM_ID,
        cloudflareAccountId: ACCOUNT_ID,
        deletion: { state: "not_deleting" },
      });
      await ctx.db.insert("repositoryCloudflareWorkers", {
        repositoryId: otherRepositoryId,
        organizationId: fixture.ids.organizationId,
        accountId: ACCOUNT_ID,
        workerName: "tmp-alchemy-v2",
        workerTag: WORKER_TAG,
        rootDirectory: "/",
        origin: "selected_existing",
      });
    });
    await expect(
      fixture.t.mutation(internal.repository.setupOutputMutations.apply, {
        userId: fixture.ids.ownerId,
        repositoryId: fixture.ids.repositoryId,
        expectedArtifactId: null,
        source,
        output: deployed(),
      }),
    ).rejects.toThrow("Cloudflare Worker is already attached.");
    const rows = await readRows(fixture);
    expect(rows.projects).toEqual([]);
    expect(rows.plan).not.toHaveProperty("setupOutput");
  });

  it("records a destroy receipt and keeps the rows", async () => {
    const fixture = await createFixture();
    await fixture.t.mutation(internal.repository.setupOutputMutations.apply, {
      userId: fixture.ids.ownerId,
      repositoryId: fixture.ids.repositoryId,
      expectedArtifactId: null,
      source: { ...source, artifactId: 1 },
      output: deployed(),
    });
    await fixture.t.mutation(internal.repository.setupOutputMutations.apply, {
      userId: fixture.ids.ownerId,
      repositoryId: fixture.ids.repositoryId,
      expectedArtifactId: 1,
      source: { ...source, artifactId: 2 },
      output: { state: "destroyed" },
    });

    const rows = await readRows(fixture);
    expect(rows.workers).toHaveLength(1);
    expect(rows.projects).toHaveLength(1);
    expect(rows.plan).toMatchObject({
      setupOutput: { state: "destroy_reported", artifactId: 2 },
    });
  });

  it("refuses a samebase plan, another running operation, and a caller outside the organization", async () => {
    const samebase = await createFixture({ mode: "samebase" });
    await expect(
      samebase.t.mutation(internal.repository.setupOutputMutations.apply, {
        userId: samebase.ids.ownerId,
        repositoryId: samebase.ids.repositoryId,
        expectedArtifactId: null,
        source,
        output: deployed(),
      }),
    ).rejects.toThrow("only for repositories that their GitHub Actions set up");

    const running = await createFixture();
    await running.t.run(async (ctx) => {
      const lock = await ctx.db
        .query("workflow_repositoryProvisioning_writeLocks")
        .withIndex("by_repository", (q) => q.eq("repositoryId", running.ids.repositoryId))
        .unique();
      if (!lock) {
        throw new Error("The fixture has a write lock.");
      }
      await ctx.db.patch(lock._id, { state: "active" });
      await ctx.db.patch(running.ids.runId, { state: "running" });
    });
    await expect(
      running.t.mutation(internal.repository.setupOutputMutations.apply, {
        userId: running.ids.ownerId,
        repositoryId: running.ids.repositoryId,
        expectedArtifactId: null,
        source,
        output: deployed(),
      }),
    ).rejects.toThrow("Another Samebase setup or provider change is running");

    const outsider = await createFixture();
    await expect(
      outsider.t.mutation(internal.repository.setupOutputMutations.apply, {
        userId: outsider.ids.outsiderId,
        repositoryId: outsider.ids.repositoryId,
        expectedArtifactId: null,
        source,
        output: deployed(),
      }),
    ).rejects.toThrow();
  });
});

function mockGitHub(options?: {
  runs?: unknown;
  artifacts?: unknown;
  runsById?: ReadonlyMap<number, unknown>;
}) {
  githubMocks.getRepository.mockResolvedValue({
    data: {
      id: Number(REPOSITORY_ID),
      default_branch: "main",
      owner: { id: 1, login: "samebase" },
    },
  });
  githubMocks.getRef.mockResolvedValue({ data: { object: { sha: "c".repeat(40) } } });
  githubMocks.getCommit.mockResolvedValue({ data: { tree: { sha: "t".repeat(40) } } });
  githubMocks.getTree.mockResolvedValue({
    data: {
      sha: "t".repeat(40),
      truncated: false,
      tree: [
        { path: "convex.json", mode: "100644", type: "blob", sha: "b".repeat(40) },
        { path: "package.json", mode: "100644", type: "blob", sha: "p".repeat(40) },
      ],
    },
  });
  githubMocks.request.mockImplementation(async (route: string, params: { run_id?: number }) => {
    switch (route) {
      case "GET /repos/{owner}/{repo}/actions/runs/{run_id}": {
        const run = params.run_id === undefined ? undefined : options?.runsById?.get(params.run_id);
        if (!run) {
          throw new RequestError("Not Found", 404, {
            request: { method: "GET", url: "https://api.github.com/run", headers: {} },
          });
        }
        return { data: run };
      }
      case "GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs":
        return { data: options?.runs ?? observedSetupWorkflowRunPage };
      case "GET /repos/{owner}/{repo}/actions/artifacts":
        return { data: options?.artifacts ?? observedSetupOutputArtifactPage };
      case "GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}": {
        const bytes = Buffer.from(observedSetupOutputArchiveBase64, "base64");
        return { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
      }
      default:
        throw new Error(`Unexpected GitHub request ${route}`);
    }
  });
  githubMocks.createRepositoryOctokit.mockResolvedValue({
    request: githubMocks.request,
    rest: {
      repos: { get: githubMocks.getRepository },
      git: {
        getRef: githubMocks.getRef,
        getCommit: githubMocks.getCommit,
        getTree: githubMocks.getTree,
      },
    },
  });
}

/** Worker and project creation times after the plan of a fixture made with planCreatedAt: APP_CREATED_AT. */
const APP_CREATED_AT = Date.parse("2026-10-06T20:00:00Z");
const RESOURCE_CREATED_ON = "2026-10-06T21:00:00Z";

function mockProviders(options?: {
  workerName?: string;
  workerCreatedOn?: string;
  projectCreateTime?: number;
}) {
  cloudflareMocks.getAccounts.mockResolvedValue({
    result: [{ id: ACCOUNT_ID, name: "Cloudflare account" }],
  });
  cloudflareMocks.getWorker.mockResolvedValue({
    result: {
      created_on: options?.workerCreatedOn ?? RESOURCE_CREATED_ON,
      id: WORKER_TAG,
      name: options?.workerName ?? "tmp-alchemy-v2",
      references: { domains: [] },
      subdomain: { enabled: true, previews_enabled: true },
    },
  });
  cloudflareMocks.getBuildSettings.mockResolvedValue({
    result: {
      ...observedNativeWorkerBuildSettings,
      script_tag: WORKER_TAG,
      git_repository: {
        ...observedNativeWorkerBuildSettings.git_repository,
        repo_id: REPOSITORY_ID,
      },
    },
  });
  const project = {
    id: PROJECT_ID,
    name: "tmp-alchemy-v2",
    slug: "tmp-alchemy-v2",
    teamId: TEAM_ID,
    teamSlug: "samebase",
    createTime: options?.projectCreateTime ?? Date.parse(RESOURCE_CREATED_ON),
  };
  convexMocks.getProject.mockResolvedValue(project);
  convexMocks.listProjects.mockResolvedValue({
    items: [project],
    pagination: { hasMore: false },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const mock of [...Object.values(cloudflareMocks), ...Object.values(convexMocks)]) {
    mock.mockReset();
  }
});

describe("setupOutput.apply by a member", () => {
  it("reads the recorded setup output, verifies it, applies it, and then finds nothing new", async () => {
    const fixture = await createFixture();
    mockGitHub();
    mockProviders();
    const apply = () =>
      asOwner(fixture).action(api.repository.setupOutput.apply, {
        repositoryId: fixture.ids.repositoryId,
      });

    expect(await apply()).toMatchObject({
      state: "applied",
      source,
      latestRun: { runId: 37545425944, runAttempt: 2, conclusion: "success" },
      workerCount: 1,
      projectCount: 1,
    });
    const rows = await readRows(fixture);
    expect(rows.workers).toMatchObject([
      {
        workerName: "tmp-alchemy-v2",
        workerTag: WORKER_TAG,
        rootDirectory: "/",
        origin: "setup_stack",
      },
    ]);
    expect(rows.projects).toMatchObject([
      { projectId: PROJECT_ID, convexConfigPath: "convex.json", origin: "setup_stack" },
    ]);
    expect(await apply()).toMatchObject({ state: "unchanged", source });
  });

  it("names the claim that Cloudflare does not confirm and attaches nothing", async () => {
    const fixture = await createFixture();
    mockGitHub();
    mockProviders({ workerName: "renamed-in-cloudflare" });

    expect(
      await asOwner(fixture).action(api.repository.setupOutput.apply, {
        repositoryId: fixture.ids.repositoryId,
      }),
    ).toMatchObject({
      state: "refused",
      step: "verify_cloudflare",
      claim: "cloudflare.workers[0].name",
    });
    expect((await readRows(fixture)).workers).toEqual([]);
  });

  it("reports no setup run, and no output when no successful run published one", async () => {
    const empty = await createFixture();
    mockGitHub({ runs: { total_count: 0, workflow_runs: [] } });
    expect(
      await asOwner(empty).action(api.repository.setupOutput.apply, {
        repositoryId: empty.ids.repositoryId,
      }),
    ).toEqual({ state: "no_setup_run" });

    const withoutOutput = await createFixture();
    mockGitHub({ artifacts: { total_count: 0, artifacts: [] } });
    expect(
      await asOwner(withoutOutput).action(api.repository.setupOutput.apply, {
        repositoryId: withoutOutput.ids.repositoryId,
      }),
    ).toMatchObject({ state: "no_output", latestRun: { runId: 37545425944 } });
    // A successful run without an output, before anything is applied, is not a settled status.
    expect(
      await asOwner(withoutOutput).action(api.repository.setupOutput.readStatus, {
        repositoryId: withoutOutput.ids.repositoryId,
      }),
    ).toMatchObject({ applied: null, pending: { state: "no_output" } });
  });

  it("reads the run of an artifact that the run pages do not list", async () => {
    const fixture = await createFixture();
    const [recordedRun] = observedSetupWorkflowRunPage.workflow_runs;
    mockGitHub({
      runs: {
        total_count: 1001,
        workflow_runs: observedSetupWorkflowRunPage.workflow_runs.slice(1),
      },
      runsById: new Map([[recordedRun.id, recordedRun]]),
    });
    mockProviders();

    expect(
      await asOwner(fixture).action(api.repository.setupOutput.apply, {
        repositoryId: fixture.ids.repositoryId,
      }),
    ).toMatchObject({ state: "applied", source });
  });

  it("never replaces the applied output with an older one while the applied run reruns", async () => {
    const fixture = await createFixture();
    await fixture.t.run(async (ctx) => {
      await ctx.db.patch(fixture.ids.planId, {
        setupOutput: {
          state: "applied",
          ...source,
          outputVersion: 1,
          appliedAt: 1,
        },
      });
    });
    const [rerunning, olderRun] = observedSetupWorkflowRunPage.workflow_runs;
    const olderReceipt = {
      ...observedSetupOutputArtifactPage.artifacts[0],
      id: 11443958000,
      created_at: "2026-10-06T21:10:47Z",
      workflow_run: {
        ...observedSetupOutputArtifactPage.artifacts[0].workflow_run,
        id: olderRun.id,
        head_sha: olderRun.head_sha,
      },
    };
    mockGitHub({
      runs: {
        total_count: 3,
        workflow_runs: [
          { ...rerunning, run_attempt: 3, status: "in_progress", conclusion: null },
          ...observedSetupWorkflowRunPage.workflow_runs.slice(1),
        ],
      },
      artifacts: {
        total_count: 2,
        artifacts: [...observedSetupOutputArtifactPage.artifacts, olderReceipt],
      },
    });

    expect(
      await asOwner(fixture).action(api.repository.setupOutput.apply, {
        repositoryId: fixture.ids.repositoryId,
      }),
    ).toMatchObject({
      state: "unchanged",
      latestRun: { runId: rerunning.id, status: "in_progress" },
      source: { artifactId: 11443958000 },
    });
    expect((await readRows(fixture)).plan).toMatchObject({
      setupOutput: { state: "applied", artifactId: source.artifactId },
    });
  });
});

/*
State axes of the first apply and the status, each covered below:
- checkpoint: nothing applied yet, or an output already applied
- first-apply rule: allows the output, or refuses it for a resource older than the app (the other
  rules are setupOutputModel unit tests)
- read: succeeds; a provider read that throws stops at its step; a GitHub read that throws is a
  failed workflow step
*/
describe("setupOutput.applyFirstForCreator and readStatus", () => {
  const applyFirst = (fixture: Fixture) =>
    fixture.t.action(internal.repository.setupOutput.applyFirstForCreator, {
      userId: fixture.ids.ownerId,
      repositoryId: fixture.ids.repositoryId,
    });
  const readStatus = (fixture: Fixture) =>
    asOwner(fixture).action(api.repository.setupOutput.readStatus, {
      repositoryId: fixture.ids.repositoryId,
    });

  it("applies the first output by itself when it names the reserved resources, created after the app", async () => {
    const fixture = await createFixture({ planCreatedAt: APP_CREATED_AT });
    mockGitHub();
    mockProviders();

    expect(await readStatus(fixture)).toMatchObject({
      latestRun: { runId: 37545425944 },
      applied: null,
      pending: {
        state: "deployed",
        source,
        workers: [{ workerName: "tmp-alchemy-v2", rootDirectory: "/" }],
        projects: [{ projectName: "tmp-alchemy-v2", codeLocationPath: "convex.json" }],
        firstApply: { automatic: true },
      },
    });
    expect(await applyFirst(fixture)).toMatchObject({
      state: "applied",
      source,
      workerCount: 1,
      projectCount: 1,
    });
    expect((await readRows(fixture)).workers).toMatchObject([
      { workerName: "tmp-alchemy-v2", origin: "setup_stack" },
    ]);
    expect(await applyFirst(fixture)).toMatchObject({ state: "unchanged", source });
    expect(await readStatus(fixture)).toMatchObject({
      applied: { state: "applied", artifactId: source.artifactId },
      pending: { state: "none" },
    });
  });

  it("waits for a member when the Worker existed before the app, and the status says why", async () => {
    const fixture = await createFixture({ planCreatedAt: APP_CREATED_AT });
    mockGitHub();
    mockProviders({ workerCreatedOn: "2026-10-06T19:59:59Z" });
    const reason = "The Worker tmp-alchemy-v2 existed before Samebase created the app.";

    expect(await applyFirst(fixture)).toMatchObject({ state: "needs_member", source, reason });
    expect((await readRows(fixture)).workers).toEqual([]);
    expect(await readStatus(fixture)).toMatchObject({
      applied: null,
      pending: { state: "deployed", firstApply: { automatic: false, reason } },
    });
    expect(
      await asOwner(fixture).action(api.repository.setupOutput.apply, {
        repositoryId: fixture.ids.repositoryId,
      }),
    ).toMatchObject({ state: "applied", source });
  });

  it("waits for a member when the Convex project existed before the app", async () => {
    const fixture = await createFixture({ planCreatedAt: APP_CREATED_AT });
    mockGitHub();
    mockProviders({ projectCreateTime: APP_CREATED_AT - 1 });

    expect(await applyFirst(fixture)).toMatchObject({
      state: "needs_member",
      reason: "The Convex project tmp-alchemy-v2 existed before Samebase created the app.",
    });
    expect((await readRows(fixture)).projects).toEqual([]);
  });

  it("never applies a later output by itself once an output is applied", async () => {
    const fixture = await createFixture({ planCreatedAt: APP_CREATED_AT });
    await fixture.t.run(async (ctx) => {
      await ctx.db.patch(fixture.ids.planId, {
        setupOutput: {
          state: "applied",
          ...source,
          artifactId: 1,
          artifactCreatedAt: "2026-10-06T21:30:00Z",
          outputVersion: 1,
          appliedAt: 1,
        },
      });
    });
    mockGitHub();
    mockProviders();

    expect(await applyFirst(fixture)).toMatchObject({
      state: "needs_member",
      source,
      reason: "Samebase applied an earlier setup output, so a member applies each later one.",
    });
    expect((await readRows(fixture)).workers).toEqual([]);
    expect(await readStatus(fixture)).toMatchObject({
      applied: { artifactId: 1 },
      pending: { state: "deployed", source },
    });
  });

  it("observes the first output after the setup finishes, and stops once it is applied", async () => {
    const fixture = await createFixture({ planCreatedAt: APP_CREATED_AT });
    mockGitHub();
    mockProviders();
    vi.useFakeTimers();
    try {
      await fixture.t.mutation(
        internal.repository.setupOutputWorkflow.startFirstSetupOutputObserver,
        { userId: fixture.ids.ownerId, repositoryId: fixture.ids.repositoryId },
      );
      await fixture.t.finishAllScheduledFunctions(vi.runAllTimers, 1000);
    } finally {
      vi.useRealTimers();
    }

    expect((await readRows(fixture)).workers).toMatchObject([
      { workerName: "tmp-alchemy-v2", origin: "setup_stack" },
    ]);
    const runListReads = githubMocks.request.mock.calls.filter(
      ([route]) => route === "GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs",
    );
    expect(runListReads).toHaveLength(1);
  });

  it("shows a refused claim in the status and reports a failed read as a result", async () => {
    const refused = await createFixture({ planCreatedAt: APP_CREATED_AT });
    mockGitHub();
    mockProviders({ workerName: "renamed-in-cloudflare" });
    expect(await readStatus(refused)).toMatchObject({
      pending: {
        state: "refused",
        source,
        step: "verify_cloudflare",
        claim: "cloudflare.workers[0].name",
      },
    });

    const unreadable = await createFixture({ planCreatedAt: APP_CREATED_AT });
    cloudflareMocks.getWorker.mockRejectedValue(new Error("Cloudflare is unavailable."));
    expect(await applyFirst(unreadable)).toMatchObject({
      state: "refused",
      step: "verify_cloudflare",
      claim: null,
      reason: "Samebase could not read the Workers from Cloudflare: Cloudflare is unavailable.",
    });

    const failing = await createFixture({ planCreatedAt: APP_CREATED_AT });
    githubMocks.createRepositoryOctokit.mockRejectedValue(new Error("GitHub is unavailable."));
    expect(await applyFirst(failing)).toEqual({
      state: "failed",
      reason: "GitHub is unavailable.",
    });
  });
});
