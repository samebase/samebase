import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const providerMocks = vi.hoisted(() => ({
  listConvexManagementProjects: vi.fn(),
  requestConvexManagementApiOrThrow: vi.fn(),
}));

const githubMocks = vi.hoisted(() => ({
  fetchGitHubConvexCodeLocationDiscovery: vi.fn(),
  resolveGitHubAppAccess: vi.fn(),
}));

const cloudflareMocks = vi.hoisted(() => ({
  requestCloudflareApi: vi.fn(),
  requestCloudflareApiOrThrow: vi.fn(),
}));

vi.mock("../cloudflareApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cloudflareApi/client")>();
  return {
    ...actual,
    requestCloudflareApi: cloudflareMocks.requestCloudflareApi,
    requestCloudflareApiOrThrow: cloudflareMocks.requestCloudflareApiOrThrow,
  };
});

vi.mock("../convexManagementApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../convexManagementApi/client")>();
  return {
    ...actual,
    listConvexManagementProjects: providerMocks.listConvexManagementProjects,
    requestConvexManagementApiOrThrow: providerMocks.requestConvexManagementApiOrThrow,
  };
});

vi.mock("../githubAppAccess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../githubAppAccess")>();
  return {
    ...actual,
    resolveGitHubAppAccess: githubMocks.resolveGitHubAppAccess,
  };
});

vi.mock("../githubRepoApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../githubRepoApi")>();
  return {
    ...actual,
    fetchGitHubConvexCodeLocationDiscovery: githubMocks.fetchGitHubConvexCodeLocationDiscovery,
  };
});

import { api, internal } from "../_generated/api";
import { observedNativeWorkerBuildSettings } from "../cloudflareApi/fixtures/observedWorkerBuildSettings";
import { observedNativePreviewsProductionBuild } from "../cloudflareApi/fixtures/observedWorkerBuilds";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

const convexTeamProject = (id: string, name: string, slug = name) => ({
  createTime: 1,
  id,
  name,
  slug,
  teamId: "convex-team",
  teamSlug: "scout-team",
});

const configLocation = (convexConfigPath: string) => ({
  kind: "config" as const,
  convexConfigPath,
  rootDirectory: "/",
  blobSha: `${convexConfigPath}-sha`,
});

/**
The repository scout-owner/scout with a Worker named scout and a Convex project named scout: the
default creation names, which make a Worker and a Convex project share the repository name.
*/
async function createScoutFixture() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "scout-owner@example.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "scout-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "scout-owner",
      githubOwnerLoginNormalized: "scout-owner",
      githubInstallationId: "scout-installation",
      defaultConvexDeploymentRegion: "aws-eu-west-1",
      convexTeam: { teamId: "convex-team" },
      cloudflareAccount: { accountId: "cloudflare-account", accountName: "Cloudflare account" },
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      convex: {
        auth: { method: "api_key", credential: "convex-token" },
        connectedByUserId: userId,
        updatedAt: 1,
      },
    });
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
      githubRepositoryFullName: "scout-owner/scout",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 1,
      completedAt: 1,
    });
    await ctx.db.replace(repositoryId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      githubRepositoryDatabaseId: "github-repository",
      githubRepositoryName: "scout",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 1,
    });
    const workerId = await ctx.db.insert("repositoryCloudflareWorkers", {
      repositoryId,
      organizationId,
      accountId: "cloudflare-account",
      workerName: "scout",
      workerTag: "scout-tag",
      rootDirectory: "/",
      origin: "selected_existing",
    });
    const convexProjectId = await ctx.db.insert("repositoryConvexProjects", {
      repositoryId,
      organizationId,
      teamId: "convex-team",
      projectId: "scout-project",
      convexConfigPath: "convex.json",
      origin: "selected_existing",
    });
    return { convexProjectId, organizationId, repositoryId, userId, workerId };
  });
  return {
    ...ids,
    t,
    viewer: t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    }),
  };
}

async function readAttachments(fixture: Awaited<ReturnType<typeof createScoutFixture>>) {
  return await fixture.t.run(async (ctx) => ({
    workers: await ctx.db
      .query("repositoryCloudflareWorkers")
      .withIndex("by_repository", (q) => q.eq("repositoryId", fixture.repositoryId))
      .collect(),
    projects: await ctx.db
      .query("repositoryConvexProjects")
      .withIndex("by_repository", (q) => q.eq("repositoryId", fixture.repositoryId))
      .collect(),
    writeLock: await ctx.db
      .query("workflow_repositoryProvisioning_writeLocks")
      .withIndex("by_repository", (q) => q.eq("repositoryId", fixture.repositoryId))
      .unique(),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  cloudflareMocks.requestCloudflareApi.mockReset();
  cloudflareMocks.requestCloudflareApiOrThrow.mockReset();
  githubMocks.resolveGitHubAppAccess.mockResolvedValue({ octokit: {} });
  githubMocks.fetchGitHubConvexCodeLocationDiscovery.mockResolvedValue({
    completeness: "complete",
    defaultBranch: "main",
    commitSha: "commit-sha",
    treeSha: "tree-sha",
    locations: [configLocation("convex.json")],
  });
  providerMocks.listConvexManagementProjects.mockResolvedValue([
    convexTeamProject("scout-project", "scout"),
    convexTeamProject("free-project", "free-app"),
  ]);
  providerMocks.requestConvexManagementApiOrThrow.mockImplementation(
    async (
      _token: string,
      method: string,
      path: string,
      init: { params: { path: { project_id?: string } } },
    ) => {
      if (method === "POST" && path === "/teams/{team_id}/create_project") {
        return { id: "created-project", projectId: "created-project" };
      }
      if (method === "GET" && path === "/projects/{project_id}") {
        const projectId = init.params.path.project_id ?? "missing";
        return convexTeamProject(projectId, projectId === "free-project" ? "free-app" : projectId);
      }
      throw new Error(`Unexpected Convex request: ${method} ${path}`);
    },
  );
});

/** The trusted grant fields that mcp/http.ts adds to a gated tool call. */
const mcpGrant = {
  grantedScopes: ["access_provider_connections"],
  grantId: "grant-1",
  clientId: "client-1",
};

/** Calls a gated MCP tool twice: once for the challenge, then with its token and sentence. */
async function callConfirmedDetach(
  fixture: Awaited<ReturnType<typeof createScoutFixture>>,
  args: { repository: string; kind: "cloudflare_worker" | "convex_project"; resourceName: string },
) {
  const toolArgs = { userId: fixture.userId, ...mcpGrant, ...args };
  const first = await fixture.t.action(
    internal.toolRuntime.runtime.repositoryDetachResourceTool,
    toolArgs,
  );
  if (first.status !== "ok" || first.structuredContent.state !== "needs_confirmation") {
    throw new Error(`Expected a confirmation request: ${JSON.stringify(first)}`);
  }
  const { acknowledgement, token } = first.structuredContent;
  return await fixture.t.action(internal.toolRuntime.runtime.repositoryDetachResourceTool, {
    ...toolArgs,
    confirmation: { token, acknowledgement },
  });
}

describe("repository_detachResource", () => {
  it("detaches only the requested kind when a Worker and a Convex project share a name", async () => {
    const fixture = await createScoutFixture();

    await expect(
      callConfirmedDetach(fixture, {
        repository: "Scout-Owner/Scout",
        kind: "cloudflare_worker",
        resourceName: "scout",
      }),
    ).resolves.toEqual({
      status: "ok",
      text: "Removed the Cloudflare Worker scout from scout-owner/scout in Samebase. It keeps running in its provider account.",
      structuredContent: { state: "detached", kind: "cloudflare_worker", resourceName: "scout" },
    });
    await expect(readAttachments(fixture)).resolves.toMatchObject({
      workers: [],
      projects: [{ projectId: "scout-project" }],
    });

    await expect(
      callConfirmedDetach(fixture, {
        repository: fixture.repositoryId,
        kind: "convex_project",
        resourceName: "scout",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      structuredContent: { state: "detached", kind: "convex_project", resourceName: "scout" },
    });
    await expect(readAttachments(fixture)).resolves.toMatchObject({ workers: [], projects: [] });
  });

  it("names the attached resources when the name matches none", async () => {
    const fixture = await createScoutFixture();

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.repositoryDetachResourceTool, {
        userId: fixture.userId,
        ...mcpGrant,
        repository: "scout-owner/scout",
        kind: "convex_project",
        resourceName: "free-app",
      }),
    ).resolves.toEqual({
      status: "error",
      text: "No attached Convex project of scout-owner/scout has the slug free-app. Attached Convex projects: scout (convex.json). Pass a slug, or the code location of a project whose slug is unavailable.",
    });
    await expect(readAttachments(fixture)).resolves.toMatchObject({
      workers: [{ workerName: "scout" }],
      projects: [{ projectId: "scout-project" }],
    });
  });

  it.each([
    ["was deleted in Convex", () => [convexTeamProject("free-project", "free-app")]],
    [
      "is in an unreadable Convex team",
      () => {
        throw new Error("Convex is unavailable.");
      },
    ],
  ])(
    "detaches a Convex project that %s by its recorded code location",
    async (_state, listProjects) => {
      const fixture = await createScoutFixture();
      providerMocks.listConvexManagementProjects.mockImplementation(async () => listProjects());

      await expect(
        callConfirmedDetach(fixture, {
          repository: "scout-owner/scout",
          kind: "convex_project",
          resourceName: "convex.json",
        }),
      ).resolves.toMatchObject({
        status: "ok",
        structuredContent: { state: "detached", kind: "convex_project" },
      });
      await expect(readAttachments(fixture)).resolves.toMatchObject({ projects: [] });
    },
  );

  it("does not take a code location for a Convex project whose slug is readable", async () => {
    const fixture = await createScoutFixture();

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.repositoryDetachResourceTool, {
        userId: fixture.userId,
        ...mcpGrant,
        repository: "scout-owner/scout",
        kind: "convex_project",
        resourceName: "convex.json",
      }),
    ).resolves.toMatchObject({
      status: "error",
      text: expect.stringContaining("Attached Convex projects: scout (convex.json)."),
    });
  });

  it("detaches one attachment by ID from the dashboard without a provider call", async () => {
    const fixture = await createScoutFixture();
    const args = {
      repositoryId: fixture.repositoryId,
      resource: { kind: "convex_project" as const, convexProjectId: fixture.convexProjectId },
    };
    const challenge = await fixture.viewer.mutation(api.repository.detachResource, args);
    if (challenge === null) {
      throw new Error("Expected a confirmation request.");
    }
    expect(challenge.acknowledgement).toBe(
      "I approve removing the Convex project at convex.json from scout-owner/scout in Samebase",
    );
    await expect(readAttachments(fixture)).resolves.toMatchObject({
      projects: [{ projectId: "scout-project" }],
    });

    await expect(
      fixture.viewer.mutation(api.repository.detachResource, {
        ...args,
        confirmation: { token: challenge.token, acknowledgement: challenge.acknowledgement },
      }),
    ).resolves.toBeNull();
    await expect(
      fixture.t.run(async (ctx) => await ctx.db.query("audit_confirmedActions_events").collect()),
    ).resolves.toMatchObject([
      {
        action: "detach_resource",
        resource: {
          kind: "convex_project",
          teamId: "convex-team",
          projectId: "scout-project",
          codeLocation: "convex.json",
        },
        surface: { kind: "dashboard" },
      },
    ]);

    await expect(readAttachments(fixture)).resolves.toMatchObject({
      workers: [{ workerName: "scout" }],
      projects: [],
    });
    expect(providerMocks.listConvexManagementProjects).not.toHaveBeenCalled();
  });
});

describe("repository_list", () => {
  it("names each attached Convex project with its live Convex name", async () => {
    const fixture = await createScoutFixture();

    const result = await fixture.t.action(internal.toolRuntime.runtime.repositoryListTool, {
      userId: fixture.userId,
      grantedScopes: ["access_dashboard"],
    });

    expect(result).toMatchObject({
      status: "ok",
      structuredContent: {
        repositories: [
          {
            repositoryId: fixture.repositoryId,
            githubRepositoryFullName: "scout-owner/scout",
            cloudflareWorkers: [{ workerName: "scout", rootDirectory: "/" }],
            convexProjects: [
              { projectSlug: "scout", projectName: "scout", codeLocation: "convex.json" },
            ],
          },
        ],
      },
    });
  });

  it("reads the project names of one Convex team once for all of its repositories", async () => {
    const fixture = await createScoutFixture();
    await fixture.t.run(async (ctx) => {
      const repositoryId = await ctx.db.insert("repositories", {
        organizationId: fixture.organizationId,
        convexTeamId: "convex-team",
        deletion: { state: "not_deleting" },
        createdAt: 2,
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId: fixture.organizationId,
        userId: fixture.userId,
        repositoryId,
        githubRepositoryFullName: "scout-owner/free",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 2,
        updatedAt: 2,
        completedAt: 2,
      });
      await ctx.db.replace(repositoryId, {
        organizationId: fixture.organizationId,
        convexTeamId: "convex-team",
        deletion: { state: "not_deleting" },
        createdAt: 2,
        state: "connected",
        githubMode: "connect_existing_repository",
        runId,
        githubRepositoryDatabaseId: "github-repository-free",
        githubRepositoryName: "free",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 2,
      });
      await ctx.db.insert("repositoryConvexProjects", {
        repositoryId,
        organizationId: fixture.organizationId,
        teamId: "convex-team",
        projectId: "free-project",
        convexConfigPath: "convex.json",
        origin: "selected_existing",
      });
    });

    const result = await fixture.t.action(internal.toolRuntime.runtime.repositoryListTool, {
      userId: fixture.userId,
      grantedScopes: ["access_dashboard"],
    });

    expect(result).toMatchObject({
      status: "ok",
      structuredContent: {
        repositories: expect.arrayContaining([
          expect.objectContaining({
            githubRepositoryFullName: "scout-owner/scout",
            convexProjects: [
              { projectSlug: "scout", projectName: "scout", codeLocation: "convex.json" },
            ],
          }),
          expect.objectContaining({
            githubRepositoryFullName: "scout-owner/free",
            convexProjects: [
              { projectSlug: "free-app", projectName: "free-app", codeLocation: "convex.json" },
            ],
          }),
        ]),
      },
    });
    expect(providerMocks.listConvexManagementProjects).toHaveBeenCalledTimes(1);
  });
});

describe("repository_getStatus", () => {
  it("reads the status by repository name and reports unreadable providers as unavailable", async () => {
    const fixture = await createScoutFixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Provider request failed in the test.");
      }),
    );

    const result = await fixture.t.action(internal.toolRuntime.runtime.repositoryGetStatusTool, {
      userId: fixture.userId,
      grantedScopes: ["access_dashboard"],
      repository: "Scout-Owner/Scout",
    });
    const dashboardStatus = await fixture.viewer.action(api.repository.getStatus, {
      repositoryId: fixture.repositoryId,
    });
    vi.unstubAllGlobals();

    expect(result).toEqual({
      status: "ok",
      text: "scout-owner/scout: 1 app, 1 Convex project, pull requests unavailable. Nothing needs attention.",
      structuredContent: {
        repository: "scout-owner/scout",
        defaultBranch: null,
        openPullRequestCount: null,
        apps: [
          {
            workerName: "scout",
            rootDirectory: "/",
            productionBuild: { state: "unavailable" },
            urls: [],
          },
        ],
        convexProjects: [
          {
            codeLocation: "convex.json",
            projectSlug: null,
            productionDeployment: { state: "unavailable" },
          },
        ],
        pullRequests: [],
        attention: [],
      },
    });
    expect(dashboardStatus).toMatchObject({
      workers: [{ state: "failed", workerId: fixture.workerId }],
      convexProjects: [{ convexProjectId: fixture.convexProjectId }],
      pullRequests: { state: "unavailable" },
      pullRequestResources: [],
      attention: [],
    });
  });

  const builtCommit = observedNativePreviewsProductionBuild.build_trigger_metadata.commit_hash;
  const workerTag = observedNativePreviewsProductionBuild.trigger.external_script_id;
  const githubRepositoryId = observedNativePreviewsProductionBuild.trigger.repo_connection.repo_id;

  /**
  The live reads of scout with only its Worker attached. GitHub names `defaultBranch` as the default
  branch and `heads` gives the head commit of each branch. Workers Builds builds `defaultBranch`,
  and its latest production build is of `builtCommit` with `buildOutcome`.
  */
  async function stubLiveStatusReads(
    fixture: Awaited<ReturnType<typeof createScoutFixture>>,
    args: {
      defaultBranch: string;
      heads: Record<string, string>;
      buildOutcome: "success" | "fail";
    },
  ) {
    await fixture.t.run(async (ctx) => {
      await ctx.db.delete(fixture.convexProjectId);
      await ctx.db.patch(fixture.repositoryId, { githubRepositoryDatabaseId: githubRepositoryId });
      await ctx.db.patch(fixture.workerId, { workerTag });
      const credentials = await ctx.db.query("organizationProviderCredentials").unique();
      if (credentials === null) {
        throw new Error("The scout fixture has provider credentials.");
      }
      await ctx.db.patch(credentials._id, {
        cloudflare: {
          auth: { method: "api_key", credential: "cloudflare-token" },
          connectedByUserId: fixture.userId,
          updatedAt: 1,
        },
      });
    });
    const getRepository = vi.fn(async () => ({
      data: {
        id: Number(githubRepositoryId),
        owner: { id: 1 },
        default_branch: args.defaultBranch,
      },
    }));
    const graphql = vi.fn(async (_query: string, variables: { defaultBranchRef: string }) => {
      const branch = variables.defaultBranchRef.replace(/^refs\/heads\//, "");
      const head = args.heads[branch];
      return {
        repository: {
          id: "R_scout",
          databaseId: Number(githubRepositoryId),
          nameWithOwner: "scout-owner/scout",
          defaultBranch: head
            ? {
                name: branch,
                target: {
                  __typename: "Commit",
                  oid: head,
                  messageHeadline: `Head of ${branch}`,
                  committedDate: "2026-09-29T20:45:00Z",
                  url: `https://github.com/scout-owner/scout/commit/${head}`,
                  statusCheckRollup: null,
                },
              }
            : null,
          pullRequests: {
            totalCount: 0,
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [],
          },
        },
      };
    });
    githubMocks.resolveGitHubAppAccess.mockResolvedValue({
      octokit: { rest: { repos: { get: getRepository } }, graphql },
      githubOwnerLogin: "scout-owner",
    });
    cloudflareMocks.requestCloudflareApiOrThrow.mockImplementation(
      async (request: { path: string }) => {
        if (request.path === "/accounts/{account_id}/workers/workers/{worker_id}") {
          return {
            id: workerTag,
            name: "scout",
            references: { domains: [] },
            subdomain: { enabled: false, previews_enabled: false },
          };
        }
        if (request.path === "/accounts/{account_id}/builds/workers/{script_tag}") {
          return {
            ...observedNativeWorkerBuildSettings,
            script_tag: workerTag,
            git_repository: {
              ...observedNativeWorkerBuildSettings.git_repository,
              repo_id: githubRepositoryId,
              branch: args.defaultBranch,
            },
          };
        }
        throw new Error(`Unexpected Cloudflare request: ${request.path}`);
      },
    );
    cloudflareMocks.requestCloudflareApi.mockResolvedValue([
      true,
      [
        {
          ...observedNativePreviewsProductionBuild,
          build_outcome: args.buildOutcome,
          build_trigger_metadata: {
            ...observedNativePreviewsProductionBuild.build_trigger_metadata,
            branch: args.defaultBranch,
          },
        },
      ],
    ]);
    return { getRepository, graphql };
  }

  it("compares the production build with the head of GitHub's current default branch", async () => {
    const fixture = await createScoutFixture();
    // The recorded default branch is still main, which keeps its own head.
    const { getRepository, graphql } = await stubLiveStatusReads(fixture, {
      defaultBranch: "release",
      heads: { main: "0".repeat(40), release: builtCommit },
      buildOutcome: "success",
    });

    const result = await fixture.t.action(internal.toolRuntime.runtime.repositoryGetStatusTool, {
      userId: fixture.userId,
      grantedScopes: ["access_dashboard"],
      repository: "scout-owner/scout",
    });

    expect(result).toMatchObject({
      status: "ok",
      structuredContent: {
        defaultBranch: { name: "release" },
        apps: [{ workerName: "scout", productionBuild: { commit: "matches_head" } }],
      },
    });
    expect(getRepository).toHaveBeenCalledOnce();
    expect(graphql).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ defaultBranchRef: "refs/heads/release" }),
    );
  });
});

describe("Convex project selection for deploy keys", () => {
  async function addAdminProject(fixture: Awaited<ReturnType<typeof createScoutFixture>>) {
    providerMocks.listConvexManagementProjects.mockResolvedValue([
      convexTeamProject("scout-project", "scout"),
      convexTeamProject("admin-project", "admin"),
    ]);
    return await fixture.t.run(
      async (ctx) =>
        await ctx.db.insert("repositoryConvexProjects", {
          repositoryId: fixture.repositoryId,
          organizationId: fixture.organizationId,
          teamId: "convex-team",
          projectId: "admin-project",
          convexConfigPath: "apps/admin/convex.json",
          origin: "selected_existing",
        }),
    );
  }

  it("fails deploy-key rotation closed when several Convex projects are attached and none is named", async () => {
    const fixture = await createScoutFixture();
    await addAdminProject(fixture);

    const result = await fixture.t.action(
      internal.toolRuntime.runtime.cloudflareRotateConvexDeployKeysTool,
      {
        userId: fixture.userId,
        ...mcpGrant,
        repository: "scout-owner/scout",
        workerName: "scout",
      },
    );

    expect(result).toEqual({
      status: "error",
      text: "scout-owner/scout has several attached Convex projects: admin (apps/admin/convex.json), scout (convex.json). Choose the project whose deploy key the Worker gets.",
    });
    await expect(readAttachments(fixture)).resolves.toMatchObject({ writeLock: null });
    expect(providerMocks.requestConvexManagementApiOrThrow).not.toHaveBeenCalled();
  });

  it("selects a Convex project by its exact slug, never by a name that is another project's slug", async () => {
    const fixture = await createScoutFixture();
    // P1 is named admin with the slug site; P2 is named control with the slug admin.
    providerMocks.listConvexManagementProjects.mockResolvedValue([
      convexTeamProject("site-project", "admin", "site"),
      convexTeamProject("control-project", "control", "admin"),
    ]);
    await fixture.t.run(async (ctx) => {
      await ctx.db.delete(fixture.convexProjectId);
      for (const [projectId, convexConfigPath] of [
        ["site-project", "apps/site/convex.json"],
        ["control-project", "apps/admin/convex.json"],
      ] as const) {
        await ctx.db.insert("repositoryConvexProjects", {
          repositoryId: fixture.repositoryId,
          organizationId: fixture.organizationId,
          teamId: "convex-team",
          projectId,
          convexConfigPath,
          origin: "selected_existing",
        });
      }
    });
    const rotate = async (convexProjectSlug: string) =>
      await fixture.t.action(internal.toolRuntime.runtime.cloudflareRotateConvexDeployKeysTool, {
        userId: fixture.userId,
        ...mcpGrant,
        repository: "scout-owner/scout",
        workerName: "scout",
        convexProjectSlug,
      });

    await expect(rotate("admin")).resolves.toMatchObject({
      status: "ok",
      structuredContent: {
        state: "needs_confirmation",
        acknowledgement: expect.stringMatching(
          /the Convex project admin at apps\/admin\/convex\.json$/,
        ),
      },
    });
    await expect(rotate("site")).resolves.toMatchObject({
      status: "ok",
      structuredContent: {
        acknowledgement: expect.stringMatching(
          /the Convex project site at apps\/site\/convex\.json$/,
        ),
      },
    });
    await expect(rotate("control")).resolves.toEqual({
      status: "error",
      text: "No attached Convex project of scout-owner/scout has the slug control. Attached Convex project slugs: admin (apps/admin/convex.json), site (apps/site/convex.json).",
    });
    await expect(
      fixture.t.action(internal.toolRuntime.runtime.repositoryListTool, {
        userId: fixture.userId,
        grantedScopes: ["access_dashboard"],
      }),
    ).resolves.toMatchObject({
      structuredContent: {
        repositories: [
          {
            convexProjects: [
              {
                projectSlug: "admin",
                projectName: "control",
                codeLocation: "apps/admin/convex.json",
              },
              { projectSlug: "site", projectName: "admin", codeLocation: "apps/site/convex.json" },
            ],
          },
        ],
      },
    });
    expect(providerMocks.requestConvexManagementApiOrThrow).not.toHaveBeenCalled();
  });

  it("returns the deploy-key rotation challenge without a provider request or a write lock", async () => {
    const fixture = await createScoutFixture();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await fixture.t.action(
      internal.toolRuntime.runtime.cloudflareRotateConvexDeployKeysTool,
      {
        userId: fixture.userId,
        ...mcpGrant,
        repository: "scout-owner/scout",
        workerName: "scout",
      },
    );
    vi.unstubAllGlobals();

    expect(result).toMatchObject({
      status: "ok",
      text: expect.stringMatching(/^Nothing changed yet\. Samebase revokes the Convex deploy keys/),
      structuredContent: {
        state: "needs_confirmation",
        acknowledgement:
          "I confirm that the user approved revoking and replacing the Convex deploy keys of Worker scout with new keys of the Convex project scout at convex.json",
      },
    });
    await expect(readAttachments(fixture)).resolves.toMatchObject({ writeLock: null });
    expect(fetch).not.toHaveBeenCalled();
    expect(providerMocks.requestConvexManagementApiOrThrow).not.toHaveBeenCalled();
  });

  it("names the Convex project by slug in the challenge when two projects share convex.json", async () => {
    const fixture = await createScoutFixture();
    providerMocks.listConvexManagementProjects.mockResolvedValue([
      convexTeamProject("scout-project", "scout"),
      convexTeamProject("admin-project", "admin"),
    ]);
    const adminProjectId = await fixture.t.run(
      async (ctx) =>
        await ctx.db.insert("repositoryConvexProjects", {
          repositoryId: fixture.repositoryId,
          organizationId: fixture.organizationId,
          teamId: "convex-team",
          projectId: "admin-project",
          convexConfigPath: "convex.json",
          origin: "selected_existing",
        }),
    );
    const challenge = async (convexProjectId: typeof adminProjectId) =>
      await fixture.viewer.action(api.repository.cloudflare.rotateConvexDeployKeys, {
        repositoryId: fixture.repositoryId,
        workerId: fixture.workerId,
        convexProjectId,
      });

    await expect(challenge(adminProjectId)).resolves.toMatchObject({
      acknowledgement:
        "I approve revoking and replacing the Convex deploy keys of Worker scout with new keys of the Convex project admin at convex.json",
    });
    await expect(challenge(fixture.convexProjectId)).resolves.toMatchObject({
      acknowledgement:
        "I approve revoking and replacing the Convex deploy keys of Worker scout with new keys of the Convex project scout at convex.json",
    });
    expect(providerMocks.requestConvexManagementApiOrThrow).not.toHaveBeenCalled();
  });

  it("fails a dashboard Worker create closed when several Convex projects are attached and none is chosen", async () => {
    const fixture = await createScoutFixture();
    await addAdminProject(fixture);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      fixture.viewer.action(api.repository.cloudflare.createWorker, {
        repositoryId: fixture.repositoryId,
        workerName: "scout-site",
        rootDirectory: "/",
        buildTokenUuid: "build-token",
      }),
    ).rejects.toMatchObject({
      name: "ConvexError",
      data: "scout-owner/scout has several attached Convex projects: admin (apps/admin/convex.json), scout (convex.json). Choose the project whose deploy key the Worker gets.",
    });
    await expect(readAttachments(fixture)).resolves.toMatchObject({ writeLock: null });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("uses the pending plan's Convex project only for the planned Worker name and root", async () => {
    const fixture = await createScoutFixture();
    await addAdminProject(fixture);
    // A managed creation without a Workers Builds token: the planned site app, its attached Convex
    // project, and no Worker yet.
    await fixture.t.run(async (ctx) => {
      await ctx.db.delete(fixture.workerId);
      await ctx.db.insert("workflow_repositoryProvisioning_plans", {
        repositoryId: fixture.repositoryId,
        convexConfigPath: "convex.json",
        convex: {
          state: "created",
          projectName: "scout",
          deploymentRegion: "aws-us-east-1",
          projectId: "scout-project",
        },
        cloudflare: {
          state: "planned",
          workerName: "site",
          rootDirectory: "apps/site",
          buildTokenUuid: null,
        },
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const fetch = vi.fn(async () => {
      throw new Error("Provider request failed in the test.");
    });
    vi.stubGlobal("fetch", fetch);
    const createWorker = async (args: { workerName?: string; rootDirectory?: string }) =>
      await fixture.t.action(internal.toolRuntime.runtime.cloudflareCreateWorkerTool, {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: "scout-owner/scout",
        ...args,
      });

    const projectChoiceError = {
      status: "error",
      text: "scout-owner/scout has several attached Convex projects: admin (apps/admin/convex.json), scout (convex.json). Choose the project whose deploy key the Worker gets.",
    };
    await expect(
      createWorker({ workerName: "admin", rootDirectory: "apps/admin" }),
    ).resolves.toEqual(projectChoiceError);
    await expect(
      createWorker({ workerName: "site", rootDirectory: "apps/admin" }),
    ).resolves.toEqual(projectChoiceError);
    expect(fetch).not.toHaveBeenCalled();
    await expect(readAttachments(fixture)).resolves.toMatchObject({ workers: [], writeLock: null });

    // The planned app keeps the plan's project and goes on to the Workers Builds token read.
    await expect(createWorker({})).resolves.toEqual({
      status: "error",
      text: "Cloudflare connection is required.",
    });
    vi.unstubAllGlobals();
  });
});

describe("repository_convex tools", () => {
  it("attaches an attachable project by slug at the only code location", async () => {
    const fixture = await createScoutFixture();

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.convexAttachProjectTool, {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: "scout-owner/scout",
        convexProjectSlug: "free-app",
      }),
    ).resolves.toEqual({
      status: "ok",
      text: "Attached Convex project free-app to scout-owner/scout at convex.json.",
      structuredContent: { projectSlug: "free-app", codeLocation: "convex.json" },
    });
    await expect(readAttachments(fixture)).resolves.toMatchObject({
      projects: expect.arrayContaining([
        expect.objectContaining({ projectId: "free-project", convexConfigPath: "convex.json" }),
      ]),
    });
  });

  it("attaches the project with the exact slug when another project is named like that slug", async () => {
    const fixture = await createScoutFixture();
    providerMocks.listConvexManagementProjects.mockResolvedValue([
      convexTeamProject("scout-project", "scout"),
      convexTeamProject("site-project", "admin", "site"),
      convexTeamProject("control-project", "control", "admin"),
    ]);

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.convexAttachProjectTool, {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: "scout-owner/scout",
        convexProjectSlug: "admin",
      }),
    ).resolves.toMatchObject({ status: "ok", structuredContent: { projectSlug: "admin" } });
    await expect(readAttachments(fixture)).resolves.toMatchObject({
      projects: [{ projectId: "scout-project" }, { projectId: "control-project" }],
    });
  });

  it("says that a project is already attached instead of attaching it again", async () => {
    const fixture = await createScoutFixture();

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.convexAttachProjectTool, {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: "scout-owner/scout",
        convexProjectSlug: "scout",
      }),
    ).resolves.toEqual({
      status: "error",
      text: "Convex project scout is already attached to scout-owner/scout.",
    });
  });

  it("creates a project in the organization default region at the only code location", async () => {
    const fixture = await createScoutFixture();

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.convexCreateProjectTool, {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: "scout-owner/scout",
        projectName: "scout-api",
      }),
    ).resolves.toEqual({
      status: "ok",
      text: "Created Convex project scout-api in aws-eu-west-1 and attached it to scout-owner/scout at convex.json.",
      structuredContent: {
        projectName: "scout-api",
        codeLocation: "convex.json",
        deploymentRegion: "aws-eu-west-1",
      },
    });
    expect(providerMocks.requestConvexManagementApiOrThrow).toHaveBeenCalledWith(
      "convex-token",
      "POST",
      "/teams/{team_id}/create_project",
      {
        params: { path: { team_id: "convex-team" } },
        body: {
          projectName: "scout-api",
          deploymentType: "prod",
          deploymentRegion: "aws-eu-west-1",
        },
      },
    );
  });

  it("lists the code locations instead of guessing when there are several", async () => {
    const fixture = await createScoutFixture();
    githubMocks.fetchGitHubConvexCodeLocationDiscovery.mockResolvedValue({
      completeness: "complete",
      defaultBranch: "main",
      commitSha: "commit-sha",
      treeSha: "tree-sha",
      locations: [configLocation("convex.json"), configLocation("apps/admin/convex.json")],
    });

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.convexCreateProjectTool, {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: "scout-owner/scout",
        projectName: "scout-api",
      }),
    ).resolves.toEqual({
      status: "error",
      text: "scout-owner/scout has several Convex code locations: convex.json, apps/admin/convex.json. Ask the user which one to use, then pass it as codeLocation.",
    });
    expect(providerMocks.requestConvexManagementApiOrThrow).not.toHaveBeenCalled();
  });

  it("attaches nothing without a code location when GitHub returned a partial tree", async () => {
    const fixture = await createScoutFixture();
    githubMocks.fetchGitHubConvexCodeLocationDiscovery.mockResolvedValue({
      completeness: "partial",
      defaultBranch: "main",
      commitSha: "commit-sha",
      treeSha: "tree-sha",
      locations: [configLocation("apps/first/convex.json")],
    });
    const attachmentsBefore = await readAttachments(fixture);

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.convexAttachProjectTool, {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: "scout-owner/scout",
        convexProjectSlug: "free-app",
      }),
    ).resolves.toEqual({
      status: "error",
      text: "GitHub returned only part of the file tree of scout-owner/scout, so another Convex code location can be missing. Visible: apps/first/convex.json. Ask the user which one to use, then pass it as codeLocation.",
    });
    await expect(readAttachments(fixture)).resolves.toEqual(attachmentsBefore);
  });
});

describe("repository_cloudflare_configureBuilds", () => {
  it("keeps the recorded root directory instead of rewriting it", async () => {
    const fixture = await createScoutFixture();

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.cloudflareConfigureBuildsTool, {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: "scout-owner/scout",
        workerName: "scout",
        rootDirectory: "apps/site",
      }),
    ).resolves.toEqual({
      status: "error",
      text: "Worker scout is recorded at root directory /. Omit rootDirectory, or change the recorded root in the Samebase dashboard.",
    });
  });
});
